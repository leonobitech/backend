# Nodo 42: Chat History Processor (LLM Analyst)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | Chat History Processor |
| **Tipo** | AI Agent (OpenAI Chat Model) |
| **Función principal** | Analizar conversación completa y generar recomendaciones para Master Agent con state actualizado |
| **Input previo** | Smart Input (Node 41) → `{ history, profile, state, options, rules, meta }` |
| **Modo ejecución** | Batch Processing |
| **Model** | GPT-3.5-turbo (OpenAI) |
| **Salidas** | 1 salida → `{ agent_brief, state }` (JSON minificado) |
| **Token limit** | Output ≤1800 caracteres (~450 tokens) |

---

## Descripción

El nodo **Chat History Processor** es el **LLM Analyst** del sistema. Su función es **analizar la conversación completa** (history) en contexto con profile, state, options y rules, y generar un **análisis estructurado** que incluye:

1. **agent_brief:** Resumen de la conversación, intent detectado, stage actual, service_target, CTA menu, recommendation para el Master, y decisión sobre reask (email/addressee)
2. **state actualizado:** Transiciones de stage, actualización de counters, normalización de interests, actualización de cooldowns

Este nodo es el **"cerebro analítico"** del workflow. Toma decisiones sobre:
- ¿Qué intent tiene el usuario? (greeting, service_info, price, request_proposal, etc.)
- ¿En qué stage del funnel está? (explore → match → price → qualify → proposal_ready)
- ¿Qué servicio le interesa? (canonical name, bundle, RAG hints)
- ¿Qué CTA mostrar? (4 opciones contextuales)
- ¿Puedo pedir email ahora? (basado en email_gating_policy con 7 condiciones)
- ¿Qué debe hacer el Master? (recommendation técnica ≤280 chars)

**Importancia crítica:** Este nodo implementa las **11 políticas de negocio** definidas en Smart Input (Node 41) mediante un LLM que interpreta reglas en lenguaje natural.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: AI Agent (OpenAI Chat Model)
Model: gpt-3.5-turbo
Temperature: 0.7
Max Tokens: 512 (output)
Batch Processing: No Properties
```

### Source for Prompt (User Message)

**Prompt completo:**

```xml
<role>Eres Analista Conversacional de Leonobitech.</role>

<task>
Debes devolver SOLO un JSON minificado, en UNA línea, ≤1800 caracteres, sin markdown ni texto extra, con EXACTAMENTE estas dos claves top-level y en este orden:
{"agent_brief":{...},"state":{...}}

Pipeline:
1) Analiza <history> ascendente.
2) Determina intent y ACTUALIZA <state>:
   - Transiciones de stage sin regresión (options.stage_allowed + rules.stage_policy).
   - Counters (máx +1 por tipo).
   - Normaliza interests (options.services_aliases → options.interests_allowed; sin duplicados).
   - Mantén inmutables: lead_id, chatwoot_id, phone_number, country, tz, channel.
3) Construye agent_brief y luego reask_decision con base en el state ACTUALIZADO.

Respeta System v3.3 (CTA=4 ítems; rag_hints máx 5–6; recommendation ≤280; privacidad; no menú general si stage≥match). Aplica "Recortes Seguros" antes que cortar el JSON. Nunca devuelvas JSON dentro de un string ni dentro de un array.
</task>

<options>{{JSON.stringify($json.options)}}</options>
<rules>{{JSON.stringify($json.rules)}}</rules>
<meta>{{JSON.stringify($json.meta)}}</meta>
<history>{{JSON.stringify($json.history)}}</history>
<profile>{{JSON.stringify($json.profile)}}</profile>
<state>{{JSON.stringify($json.state)}}</state>
```

**Breakdown del prompt:**

1. **Role definition:** "Analista Conversacional de Leonobitech"
2. **Output constraint:** JSON minificado, 1 línea, ≤1800 caracteres, 2 claves top-level (`agent_brief` y `state`)
3. **Pipeline:** 3 pasos (analizar history → actualizar state → construir agent_brief)
4. **Rules reference:** Respeta System v3.3 (definido en System Message)
5. **Context injection:** Inyecta options, rules, meta, history, profile, state vía `JSON.stringify()`

**Técnica:** Usa `{{...}}` de n8n para interpolar variables desde Smart Input (Node 41).

---

### System Message (v3.3 Filter-Output Compatible)

**System prompt completo:**

```
🛡️ System — Leonobitech / Analyst v3.3 (Filter-Output Compatible)

ROL/OBJETIVO
Devuelves EXCLUSIVAMENTE un objeto JSON válido con EXACTAMENTE estas dos claves top-level y en este orden:
{"agent_brief":{...},"state":{...}}
Sin texto extra, sin markdown, sin bloques de código, sin arrays, sin envolver en string. JSON minificado, 1 línea, ≤1800 caracteres. El shape de "state" debe ser EXACTO al de entrada (solo actualiza campos permitidos).

ENTRADAS
<history> ascendente, <profile>, <state> (shape inmutable), <options>, <rules>, <meta>.

CONTRATO DE SALIDA
{
  "agent_brief":{
    "history_summary":"≤120 palabras, factual, SIN PII (usar "el usuario")",
    "last_incoming":{"role":"user","text":"string","ts":"ISO-8601"},
    "intent":"greeting|service_info|price|request_proposal|demo_request|contact_share|schedule_request|negotiation|support|off_topic|unclear",
    "stage":"explore|match|price|qualify|proposal_ready",
    "service_target":{"canonical":"string","bundle":["..."],"rag_hints":["..."]},
    "cta_menu":{"prompt":"¿Cómo querés avanzar?","kind":"service","items":["Ver precios","Beneficios e integraciones","Agendar demo","Solicitar propuesta"],"max_picks":1},
    "recommendation":"INSTRUCCIONES PARA MASTER: ... (≤280 caracteres, técnico, contextual, sin PII/emojis)",
    "reask_decision":{"can_ask_email_now":true|false,"can_ask_addressee_now":true|false,"reason":"string breve sin PII"}
  },
  "state":{...mismo shape que entrada; actualizar solo stage/interests/counters/cooldowns/proposal_offer_done/last_proposal_offer_ts...}
}

REGLAS CLAVE
1) JSON-only, minificado, 1 línea, ≤1800 chars. Nunca doble-encode ni fences.
2) Transiciones sin regresión; counters máx +1; interests ⊆ options.interests_allowed (normalizar aliases).
3) service_target: si existe canonical, completar bundle/rag_hints desde options.service_defaults[canonical]. rag_hints máx 5–6, bundle máx 3 si hace falta recortar.
4) No reiniciar menú general si stage≥match. CTA siempre 4 ítems (en price puedes cambiar "Beneficios e integraciones" por "Calcular presupuesto").
5) Privacidad: summary/reason sin PII; last_incoming literal.
6) reask_decision.reason basado en el state YA actualizado.

RECORTES SEGUROS (si te acercas a 1800)
1) recommendation ≤280; 2) rag_hints ≤5; 3) bundle ≤3; 4) history_summary ≤90 palabras.

CHECKLIST ANTES DE EMITIR
- JSON válido, 1 línea, sin texto extra.
- agent_brief y state presentes.
- service_target completo si hay servicio.
- reask_decision.reason coherente con el state.
- Sin PII en summary/reason; sin menú general si stage≥match.
```

**Breakdown del system prompt:**

1. **ROL/OBJETIVO:** Define el output format estricto (JSON minificado, 1 línea, ≤1800 chars)
2. **ENTRADAS:** Lista las 6 fuentes de contexto (history, profile, state, options, rules, meta)
3. **CONTRATO DE SALIDA:** Schema completo del JSON con tipos y constraints
4. **REGLAS CLAVE:** 6 reglas críticas:
   - JSON-only sin markdown
   - Transiciones secuenciales, counters +1 máx, interests normalizados
   - service_target completo con bundle/rag_hints
   - No menú general si stage≥match, CTA siempre 4 items
   - Privacidad: no PII en summary/reason
   - reask_decision coherente con state actualizado
5. **RECORTES SEGUROS:** Estrategia para reducir tamaño si se acerca a 1800 chars
6. **CHECKLIST:** 5 validaciones antes de emitir respuesta

**Técnica:** System prompt actúa como **"compilador de políticas"** - traduce las 11 reglas de negocio (en `rules`) a instrucciones específicas para el LLM.

---

### Enable Fallback Model

**Configuración:**
- ✅ **Habilitado**

**Propósito:** Si GPT-3.5-turbo falla (rate limit, timeout, error), el sistema puede hacer fallback a otro modelo (probablemente GPT-4 o GPT-3.5-turbo-16k).

---

### Require Specific Output Format

**Configuración:**
- ✅ **Habilitado**

**Propósito:** Fuerza al LLM a devolver JSON válido. Si la respuesta no es JSON, n8n rechaza el output y potencialmente reintenta.

---

## Output Schema (JSON Structure)

### agent_brief Object

```typescript
interface AgentBrief {
  history_summary: string;          // ≤120 palabras, SIN PII
  last_incoming: {
    role: "user" | "assistant" | "system";
    text: string;
    ts: string;                     // ISO-8601
  };
  intent:
    | "greeting"
    | "service_info"
    | "price"
    | "request_proposal"
    | "demo_request"
    | "contact_share"
    | "schedule_request"
    | "negotiation"
    | "support"
    | "off_topic"
    | "unclear";
  stage: "explore" | "match" | "price" | "qualify" | "proposal_ready";
  service_target: {
    canonical?: string;             // "WhatsApp Chatbot"
    bundle?: string[];              // ["WhatsApp Chatbot", "AI Automation", "CRM Integration"]
    rag_hints?: string[];           // ["beneficios de chatbot", "casos de uso whatsapp"]
  };
  cta_menu: {
    prompt: string;                 // "¿Cómo querés avanzar?"
    kind: "service" | "action";
    items: string[];                // 4 items
    max_picks: number;              // 1
  };
  recommendation: string;           // ≤280 caracteres, técnico
  reask_decision: {
    can_ask_email_now: boolean;
    can_ask_addressee_now: boolean;
    reason: string;                 // Breve, SIN PII
  };
}
```

### state Object (mismo shape que input)

```typescript
interface State {
  // Immutable fields (NEVER change)
  lead_id: number;
  chatwoot_id: number;
  phone_number: string;
  country: string;
  tz: string;
  channel: string;

  // Mutable fields (can be updated)
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  stage: "explore" | "match" | "price" | "qualify" | "proposal_ready";
  interests: string[];              // ["Odoo", "WhatsApp", "CRM"]

  counters: {
    services_seen: number;          // +1 per new service
    prices_asked: number;           // +1 per price question
    deep_interest: number;          // +1 per strong interest signal
  };

  cooldowns: {
    email_ask_ts: string | null;    // ISO-8601 or null
    addressee_ask_ts: string | null;
  };

  proposal_offer_done: boolean;
  last_proposal_offer_ts: string | null;
}
```

---

## Input

Input desde **Smart Input (Node 41)**:

```json
{
  "history": [
    {"role": "assistant", "text": "¡Hola! Soy Leonobit 🤖, tu asistente virtual. ¿En qué puedo ayudarte hoy?", "ts": "2025-10-31T18:59:35.000Z"},
    {"role": "user", "text": "Hola!", "ts": "2025-10-31T18:59:40.000Z"},
    {"role": "assistant", "text": "¡Hola! ¿Cómo estás? ¿Cuál es tu nombre?", "ts": "2025-10-31T18:59:42.000Z"},
    {"role": "user", "text": "Si, claro me llamo Felix", "ts": "2025-10-31T18:59:47.000Z"}
  ],
  "profile": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": null,
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "proposal_intent": false
  },
  "state": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": null,
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": false
  },
  "options": {
    "interests_allowed": ["Odoo", "WhatsApp", "CRM"],
    "services_allowed": ["WhatsApp Chatbot", "Landing Page", "Mobile App", "..."],
    "services_aliases": {"chatbot": "WhatsApp Chatbot", "...": "..."},
    "stage_allowed": ["explore", "match", "price", "qualify", "proposal_ready"]
  },
  "rules": {
    "timing_and_chronology": "...",
    "interests_policy": "...",
    "stage_policy": "...",
    "counters_policy": "...",
    "cooldowns_policy": "...",
    "recommendation_format_policy": "...",
    "rag_first_policy": "...",
    "anti_loop_policy": "...",
    "email_gating_policy": "...",
    "privacy_policy": "...",
    "menu_guard_policy": "...",
    "self_check_policy": "..."
  },
  "meta": {
    "history_len": 4,
    "truncated": false,
    "locale_hint": "es-AR",
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "now_ts": 1730399987000,
    "anti_loop_window_min": 5,
    "version": "smart-input@2"
  }
}
```

**Tamaño:** ~12-15 KB (completo contexto).

---

## Output

Output del nodo (análisis + state actualizado):

```json
{
  "agent_brief": {
    "history_summary": "El usuario inició la conversación con un saludo y respondió afirmativamente al pedido de nombre, proporcionando su nombre.",
    "last_incoming": {
      "role": "user",
      "text": "Si, claro me llamo Felix",
      "ts": "2025-10-31T18:59:47.000Z"
    },
    "intent": "greeting",
    "stage": "explore",
    "service_target": {},
    "cta_menu": {
      "prompt": "¿Cómo querés avanzar?",
      "kind": "service",
      "items": [
        "Ver precios",
        "Beneficios e integraciones",
        "Agendar demo",
        "Solicitar propuesta"
      ],
      "max_picks": 1
    },
    "recommendation": "INSTRUCCIONES PARA MASTER: Mantener el diálogo exploratorio; solicitar información sobre necesidades o intereses específicos; preparar para transición a etapa de match cuando el usuario exprese interés en servicios; no solicitar datos personales adicionales aún.",
    "reask_decision": {
      "can_ask_email_now": false,
      "can_ask_addressee_now": false,
      "reason": "stage insuficiente; intereses vacíos; counters insuficientes"
    }
  },
  "state": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": false
  }
}
```

**Análisis del output:**

1. **history_summary:** Resumen conciso (25 palabras), SIN PII (no menciona "Felix")
2. **last_incoming:** Último mensaje del usuario (literal)
3. **intent:** "greeting" (saludo + proporciona nombre)
4. **stage:** "explore" (sin cambio, aún no hay interés en servicio)
5. **service_target:** Vacío (no hay servicio seleccionado)
6. **cta_menu:** 4 opciones genéricas para stage explore
7. **recommendation:** Instrucción técnica para Master (271 caracteres)
8. **reask_decision:** No pedir email/addressee (3 razones: stage, interests, counters)
9. **state.full_name:** **Actualizado** a "Felix Figueroa" (inferido de "me llamo Felix")
10. **state.counters:** Sin cambios (0, 0, 0)

**Tamaño:** ~1200 caracteres (JSON minificado).

---

## Casos de Uso

### 1. Greeting Stage (saludo inicial)

**Escenario:** Usuario saluda, proporciona nombre.

**Input:**
- history: 4 mensajes (saludo + nombre)
- stage: "explore"
- counters: 0/0/0

**Output:**
- intent: "greeting"
- stage: "explore" (sin cambio)
- service_target: vacío
- cta_menu: 4 opciones genéricas
- reask_decision: false/false (stage insuficiente)
- state.full_name: **"Felix Figueroa"** (extraído de conversación)

**Recommendation:**
> "Mantener el diálogo exploratorio; solicitar información sobre necesidades o intereses específicos; preparar para transición a etapa de match cuando el usuario exprese interés en servicios; no solicitar datos personales adicionales aún."

---

### 2. Service Interest (pregunta por servicio)

**Escenario:** Usuario pregunta "Quiero info del chatbot".

**Input:**
- history: 6 mensajes (saludo + pregunta)
- stage: "explore"
- last_message: "Quiero info del chatbot"

**Output:**
- intent: "service_info"
- stage: **"match"** (transición explore → match)
- service_target:
  - canonical: "WhatsApp Chatbot"
  - bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"]
  - rag_hints: ["beneficios de chatbot", "casos de uso whatsapp"]
- cta_menu: 4 opciones (sin menú general)
- reask_decision: false/false (aún no califica para email)
- state.interests: **["WhatsApp", "CRM"]** (inferido de servicio)
- state.counters.services_seen: **+1** (0 → 1)

**Recommendation:**
> "INSTRUCCIONES PARA MASTER: Consultar RAG con hints ['beneficios de chatbot', 'casos de uso whatsapp']; presentar beneficios clave; incluir CTA menu con 4 opciones; NO mostrar menú general de servicios; preparar para transición a stage price si pregunta por costo."

---

### 3. Price Request (pregunta por precio)

**Escenario:** Usuario pregunta "¿Cuánto cuesta el chatbot?".

**Input:**
- history: 8 mensajes
- stage: "match"
- service_target: "WhatsApp Chatbot"
- counters: services_seen=1, prices_asked=0

**Output:**
- intent: "price"
- stage: **"price"** (transición match → price)
- service_target: (sin cambios)
- cta_menu:
  - items: ["Ver precios", **"Calcular presupuesto"**, "Agendar demo", "Solicitar propuesta"]
  - (nota: "Beneficios e integraciones" reemplazado por "Calcular presupuesto")
- reask_decision: false/false (aún no califica)
- state.counters.prices_asked: **+1** (0 → 1)
- state.counters.deep_interest: **+1** (señal de interés fuerte)

**Recommendation:**
> "INSTRUCCIONES PARA MASTER: Preguntar por volumen/mes de mensajes para calcular presupuesto; mencionar que precio depende de features; ofrecer consultoría gratuita para cotización personalizada; incluir CTA con opción 'Calcular presupuesto'."

---

### 4. Business Details (proporciona nombre empresa)

**Escenario:** Usuario dice "Es para mi empresa Acme Corp".

**Input:**
- history: 10 mensajes
- stage: "price"
- business_name: null
- counters: services_seen=1, prices_asked=1, deep_interest=1

**Output:**
- intent: "contact_share"
- stage: **"qualify"** (transición price → qualify)
- service_target: (sin cambios)
- reask_decision: false/false (aún falta 1 condición para email - ver email_gating_policy)
- state.business_name: **"Acme Corp"** (extraído)
- state.counters.deep_interest: **+1** (1 → 2)

**Recommendation:**
> "INSTRUCCIONES PARA MASTER: Reconocer empresa Acme Corp; preguntar por volumen estimado o casos de uso específicos; preparar para solicitar email (falta solo proposal_intent o 1 precio más); mantener CTA con opción 'Solicitar propuesta'."

---

### 5. Email Gating (solicita cotización - 7 condiciones cumplidas)

**Escenario:** Usuario dice "Quiero una cotización formal".

**Input:**
- history: 12 mensajes
- stage: "qualify"
- interests: ["WhatsApp", "CRM"]
- counters: services_seen=1, prices_asked=1, deep_interest=2
- business_name: "Acme Corp"
- proposal_intent: false
- cooldowns.email_ask_ts: null

**Output:**
- intent: "request_proposal"
- stage: "qualify" (sin cambio, pero ahora califica para email)
- reask_decision:
  - can_ask_email_now: **true** ✅
  - can_ask_addressee_now: **false** (falta cooldown)
  - reason: "stage qualify; intereses≥1; services_seen≥1; deep_interest≥2; business_name presente; proposal_intent detectado; cooldown email null"
- state.proposal_intent: **true** (actualizado por "cotización formal")

**Validación de 7 condiciones (email_gating_policy):**
```javascript
✅ 1. stage in ["qualify", "proposal_ready"]       // stage = "qualify"
✅ 2. interests.length >= 1                        // interests = ["WhatsApp", "CRM"]
✅ 3. counters.services_seen >= 1                  // services_seen = 1
✅ 4. counters.deep_interest >= 1                  // deep_interest = 2
✅ 5. state.business_name !== ""                   // business_name = "Acme Corp"
✅ 6. proposal_intent === true OR prices_asked >= 1 // proposal_intent = true
✅ 7. (now - email_ask_ts) > 5min OR email_ask_ts === null // email_ask_ts = null

→ ALL CONDITIONS MET → can_ask_email_now = true
```

**Recommendation:**
> "INSTRUCCIONES PARA MASTER: Solicitar email para enviar cotización formal; mencionar que se enviará propuesta personalizada; actualizar cooldowns.email_ask_ts al timestamp actual; NO preguntar por addressee aún (falta cooldown); incluir CTA 'Recibir propuesta por email'."

---

### 6. Anti-Loop Protection (preguntó email hace 2 min)

**Escenario:** Assistant preguntó email hace 2 minutos, usuario no respondió, volvió a preguntar otra cosa.

**Input:**
- history: 15 mensajes
- cooldowns.email_ask_ts: "2025-10-31T18:57:47Z" (hace 2 min)
- meta.now_ts: 1730399987000 (ahora)
- meta.anti_loop_window_min: 5

**Output:**
- reask_decision:
  - can_ask_email_now: **false** ❌
  - reason: "cooldown email activo; última pregunta hace 2min; esperar 3min más"

**Validación:**
```javascript
const elapsed_min = (meta.now_ts - Date.parse(cooldowns.email_ask_ts)) / 60000;
// elapsed_min = 2 minutes

if (elapsed_min < meta.anti_loop_window_min) {
  can_ask_email_now = false; // WAIT
}
```

**Recommendation:**
> "INSTRUCCIONES PARA MASTER: NO preguntar por email nuevamente; continuar conversación sobre servicio; ofrecer CTA alternativo ('Agendar demo', 'Ver casos de éxito'); esperar 3 minutos más o hasta que usuario mencione email voluntariamente."

---

## Comparación con Nodos Previos

| Aspecto | Node 41 (Smart Input) | Node 42 (Chat History Processor) |
|---------|------------------------|-----------------------------------|
| **Función** | Preparar contexto completo | Analizar conversación y decidir acciones |
| **Input** | HydrateForHistory (history+profile+state) | Smart Input (history+profile+state+options+rules+meta) |
| **Output** | `{history, profile, state, options, rules, meta}` | `{agent_brief, state}` |
| **Tipo** | Code (JavaScript) | AI Agent (LLM) |
| **Complejidad** | Alta (~300 líneas código) | Alta (LLM con 1800+ char system prompt) |
| **Business logic** | Define políticas (rules) | **Ejecuta** políticas |
| **State mutation** | No (solo pass-through) | Sí (actualiza stage, counters, interests, cooldowns) |
| **Decision making** | No | Sí (intent, reask_decision, recommendation) |
| **Token usage** | 0 (no LLM) | ~1500-2000 tokens input + ~450 tokens output |

**Progresión de datos:**

1. **Node 41:** Prepara contexto → añade options, rules, meta
2. **Node 42:** **Analiza contexto** → genera agent_brief + actualiza state → decisiones para Master

---

## Intent Detection

El LLM Analyst detecta **11 intents canónicos**:

| Intent | Descripción | Ejemplo |
|--------|-------------|---------|
| **greeting** | Saludo o presentación | "Hola", "Buenos días", "Me llamo Felix" |
| **service_info** | Pregunta por servicio | "Quiero info del chatbot", "¿Qué es Landing Page?" |
| **price** | Pregunta por precio | "¿Cuánto cuesta?", "¿Precio del chatbot?" |
| **request_proposal** | Solicita cotización/propuesta | "Quiero una cotización", "Envíame propuesta" |
| **demo_request** | Solicita demo/prueba | "¿Puedo ver un demo?", "Quiero probar" |
| **contact_share** | Comparte datos de contacto | "Mi email es...", "Es para Acme Corp" |
| **schedule_request** | Quiere agendar llamada/reunión | "¿Podemos hablar mañana?", "Agendar llamada" |
| **negotiation** | Negocia precio/términos | "¿Hay descuento?", "Es muy caro" |
| **support** | Pregunta técnica/soporte | "¿Cómo se instala?", "Tengo un problema" |
| **off_topic** | Fuera de tema | "¿Dónde queda la oficina?", "¿Venden café?" |
| **unclear** | No se puede determinar | Mensaje ambiguo o incompleto |

**Técnica:** El LLM usa contexto completo (history + last_message + profile + state) para clasificar intent.

---

## Stage Transitions

El LLM Analyst maneja **5 stages** con transiciones secuenciales:

```
explore → match → price → qualify → proposal_ready
```

**Reglas:**
1. **NUNCA retroceder** (no puede ir de price → match)
2. **Solo avanzar con evidencia clara** en la conversación
3. **Máximo +1 stage por iteración** (no puede saltar de explore → price)

**Tabla de transiciones:**

| Desde | Hacia | Condición |
|-------|-------|-----------|
| explore | match | Usuario muestra interés en servicio específico |
| match | price | Usuario pregunta por precio/costo |
| price | qualify | Usuario proporciona business_name o pide cotización |
| qualify | proposal_ready | Se cumplen 7 condiciones de email_gating_policy Y se solicita email |

**Implementación:**
- Definido en `rules.stage_policy` (texto)
- Validado por LLM en cada iteración
- Reforzado en system prompt: "Transiciones sin regresión"

---

## Counters Policy

El LLM actualiza 3 counters con política de **máx +1 por tipo por iteración**:

| Counter | Incrementa cuando | Max por iteración |
|---------|-------------------|-------------------|
| **services_seen** | Usuario ve/pregunta por un **NUEVO** servicio | +1 (si pregunta por 3 servicios a la vez, +3) |
| **prices_asked** | Usuario pregunta explícitamente por precio | +1 |
| **deep_interest** | Usuario muestra interés fuerte (múltiples preguntas, solicita cotización, etc.) | +1 |

**Reglas:**
- Counters son **acumulativos** (nunca disminuyen)
- Si usuario pregunta por **múltiples servicios nuevos** en un mensaje → `+N` en services_seen
- Si usuario pregunta por precio **del mismo servicio 2 veces** → solo `+1` en prices_asked (no duplicar)

**Ejemplo:**
```javascript
// Usuario: "Quiero info del chatbot y landing page"
services_seen: 0 → 2  // +2 (dos servicios nuevos)
deep_interest: 0 → 1  // +1 (muestra interés)

// Usuario (mismo mensaje): "¿Cuánto cuestan?"
prices_asked: 0 → 1   // +1 (una sola pregunta de precio)
```

---

## Cooldowns Policy

El LLM actualiza 2 cooldowns con política de **solo cuando assistant PREGUNTA explícitamente**:

| Cooldown | Actualiza cuando | NO actualizar si |
|----------|------------------|------------------|
| **email_ask_ts** | Assistant pregunta "¿Cuál es tu email?" | Usuario menciona email voluntariamente |
| **addressee_ask_ts** | Assistant pregunta "¿A nombre de quién?" | Usuario menciona nombre voluntariamente |

**Reglas:**
- Solo actualizar cuando **assistant hace la pregunta**
- NO actualizar si usuario **ofrece información sin ser preguntado**
- Formato: ISO 8601 timestamp (`"2025-10-31T18:59:47.000Z"`)
- Usado para **anti-loop**: si (now - cooldown) < 5 min → NO preguntar nuevamente

**Ejemplo:**
```javascript
// Assistant: "¿Cuál es tu email?"
→ email_ask_ts: null → "2025-10-31T18:59:47Z"  // ✅ Actualizar

// Usuario (voluntariamente): "Mi email es felix@example.com"
→ email_ask_ts: null → null  // ❌ NO actualizar (no fue preguntado)

// 2 minutos después, usuario pregunta otra cosa
→ can_ask_email_now: false  // Anti-loop: hace 2min < 5min
```

---

## Email Gating Policy (7 Condiciones)

El LLM valida **7 condiciones** antes de recomendar solicitar email:

```javascript
can_ask_email_now = (
  1. stage in ["qualify", "proposal_ready"] &&
  2. interests.length >= 1 &&
  3. counters.services_seen >= 1 &&
  4. counters.deep_interest >= 1 &&
  5. state.business_name !== "" &&
  6. (profile.proposal_intent === true || counters.prices_asked >= 1) &&
  7. ((now - cooldowns.email_ask_ts) > 5*60*1000 || cooldowns.email_ask_ts === null)
);
```

**Checklist:**

| # | Condición | Propósito |
|---|-----------|-----------|
| 1 | stage ≥ qualify | Lead calificado (no pedir email en explore/match) |
| 2 | interests ≥ 1 | Lead tiene al menos 1 interés identificado |
| 3 | services_seen ≥ 1 | Lead vio al menos 1 servicio |
| 4 | deep_interest ≥ 1 | Lead mostró interés fuerte (no casual) |
| 5 | business_name presente | Lead proporcionó nombre de empresa |
| 6 | proposal_intent o prices_asked | Lead pidió propuesta O preguntó por precio |
| 7 | cooldown > 5min o null | No preguntamos por email en últimos 5 min |

**Reason strings (ejemplos):**

```javascript
// Todas las condiciones cumplidas:
"stage qualify; intereses≥1; services_seen≥1; deep_interest≥2; business_name presente; proposal_intent detectado; cooldown email null"

// Faltan condiciones:
"stage insuficiente; intereses vacíos; counters insuficientes"
"stage qualify OK; pero falta business_name y proposal_intent"
"cooldown email activo; última pregunta hace 2min; esperar 3min más"
```

**Propósito:** Evitar captura prematura de email (mala UX) y garantizar que el lead está **calificado** antes de pedir datos.

---

## CTA Menu Structure

El LLM siempre genera un **CTA menu con 4 items**:

### Stage: explore (sin servicio seleccionado)

```json
{
  "prompt": "¿Cómo querés avanzar?",
  "kind": "service",
  "items": [
    "Ver precios",
    "Beneficios e integraciones",
    "Agendar demo",
    "Solicitar propuesta"
  ],
  "max_picks": 1
}
```

### Stage: match/price (servicio seleccionado)

```json
{
  "prompt": "¿Cómo querés avanzar?",
  "kind": "service",
  "items": [
    "Ver precios",
    "Calcular presupuesto",      // ← Reemplaza "Beneficios e integraciones"
    "Agendar demo",
    "Solicitar propuesta"
  ],
  "max_picks": 1
}
```

### Stage: qualify/proposal_ready (lead calificado)

```json
{
  "prompt": "¿Cómo querés avanzar?",
  "kind": "action",
  "items": [
    "Recibir propuesta por email",
    "Agendar llamada con asesor",
    "Ver casos de éxito similares",
    "Calcular presupuesto personalizado"
  ],
  "max_picks": 1
}
```

**Reglas:**
- **SIEMPRE 4 items** (no más, no menos)
- En stage ≥ match: **NO mostrar menú general de servicios** (usar CTA específico)
- En stage price: opción "Calcular presupuesto" en lugar de "Beneficios e integraciones"
- `max_picks`: siempre 1 (usuario solo puede elegir 1 opción)

---

## Recommendation Format

El LLM genera una **recommendation técnica** con formato estricto:

**Estructura:**
```
INSTRUCCIONES PARA MASTER: [acción técnica específica] (≤280 caracteres)
```

**Características:**
- Empieza con "INSTRUCCIONES PARA MASTER:"
- ≤280 caracteres (constraint estricto)
- Tono técnico (no conversacional)
- SIN PII (no mencionar email, nombre real, teléfono)
- SIN emojis
- Contexto sobre: qué hacer, cómo hacerlo, qué actualizar

**Ejemplos:**

```
INSTRUCCIONES PARA MASTER: Mantener el diálogo exploratorio; solicitar información sobre necesidades o intereses específicos; preparar para transición a etapa de match cuando el usuario exprese interés en servicios; no solicitar datos personales adicionales aún.
```

```
INSTRUCCIONES PARA MASTER: Consultar RAG con hints ['beneficios de chatbot', 'casos de uso whatsapp']; presentar beneficios clave; incluir CTA menu con 4 opciones; NO mostrar menú general de servicios; preparar para transición a stage price si pregunta por costo.
```

```
INSTRUCCIONES PARA MASTER: Preguntar por volumen/mes de mensajes para calcular presupuesto; mencionar que precio depende de features; ofrecer consultoría gratuita para cotización personalizada; incluir CTA con opción 'Calcular presupuesto'.
```

```
INSTRUCCIONES PARA MASTER: Solicitar email para enviar cotización formal; mencionar que se enviará propuesta personalizada; actualizar cooldowns.email_ask_ts al timestamp actual; NO preguntar por addressee aún (falta cooldown); incluir CTA 'Recibir propuesta por email'.
```

**Propósito:** Guiar al Master Agent sobre qué hacer a continuación (sin ambigüedad).

---

## Performance

### Métricas Estimadas

| Métrica | Valor |
|---------|-------|
| **Execution time** | ~1500-3000ms (llamada API OpenAI) |
| **Input tokens** | ~1500-2000 tokens |
| **Output tokens** | ~300-450 tokens |
| **Cost per call** | ~$0.002-0.003 (GPT-3.5-turbo) |
| **Token limit output** | 1800 caracteres (~450 tokens) |
| **Success rate** | ~95% (con fallback model) |

**Breakdown:**
- API latency: 1000-2500ms (depende de carga OpenAI)
- Parsing input: 50-100ms
- JSON minification: 50-100ms
- Validation: 50-100ms

**Optimización:**
- Usar GPT-3.5-turbo (más rápido y barato que GPT-4)
- Limit output tokens: 512 (reduce latency)
- Enable fallback model (mejora reliability)

---

## Mejoras Propuestas

### 1. Validación Post-LLM (Schema Enforcement)

**Problema:** LLM puede devolver JSON inválido o con campos faltantes.

**Solución:** Agregar nodo de validación Zod/JSON Schema:

```javascript
// Validate Analyst Output node
const schema = z.object({
  agent_brief: z.object({
    history_summary: z.string().max(500),
    last_incoming: z.object({
      role: z.enum(["user", "assistant", "system"]),
      text: z.string(),
      ts: z.string().datetime()
    }),
    intent: z.enum(["greeting", "service_info", "price", "..."]),
    stage: z.enum(["explore", "match", "price", "qualify", "proposal_ready"]),
    // ... más campos
  }),
  state: z.object({
    // ... schema de state
  })
});

const result = schema.safeParse($json);
if (!result.success) {
  throw new Error(`Invalid LLM output: ${result.error}`);
}
```

**Beneficio:** Garantiza schema correcto, permite retry si falla.

---

### 2. Intent Confidence Score

**Problema:** LLM detecta intent pero no indica confianza (puede estar equivocado).

**Solución:** Agregar campo `intent_confidence` (0.0-1.0):

```json
{
  "intent": "price",
  "intent_confidence": 0.85
}
```

**Uso:** Si confidence < 0.7 → marcar como "unclear" y pedir clarificación.

**Beneficio:** Mejora precision, reduce errores de clasificación.

---

### 3. A/B Testing de Prompts

**Problema:** System prompt v3.3 no está optimizado (puede haber mejor versión).

**Solución:** Implementar A/B testing:

```javascript
// Smart Input agrega:
meta.prompt_variant = (lead_id % 2 === 0) ? "v3.3" : "v3.4";

// Chat History Processor usa:
const systemPrompt = (meta.prompt_variant === "v3.4")
  ? SYSTEM_PROMPT_V3_4
  : SYSTEM_PROMPT_V3_3;
```

**Métricas:** Comparar conversion rate, tokens used, error rate.

**Beneficio:** Mejora continua del system prompt basada en datos.

---

### 4. Caching de Options/Rules

**Problema:** Options y rules se envían en cada llamada (~3-5 KB), aumentando tokens.

**Solución:** Usar system prompt con referencia a config:

```
CONFIGURACIÓN
El archivo config@v2.json contiene options y rules. Úsalo como referencia.
```

**Beneficio:** Reduce tokens de 1800 → 1200 (33% menos), reduce costo.

---

### 5. Fine-tuning con Conversaciones Reales

**Problema:** GPT-3.5-turbo es genérico (no especializado en este dominio).

**Solución:** Fine-tune con dataset de 1000+ conversaciones reales:

```jsonl
{"messages": [
  {"role": "system", "content": "System prompt v3.3..."},
  {"role": "user", "content": "<history>...</history><profile>..."},
  {"role": "assistant", "content": "{\"agent_brief\":{...},\"state\":{...}}"}
]}
```

**Beneficio:**
- Mejora precision de intent detection
- Reduce errores de stage transitions
- Reduce tokens necesarios (modelo más eficiente)
- Potencial ahorro de 40-50% en costo

---

### 6. Streaming de Recommendation

**Problema:** Master Agent espera 1.5-3s para recibir recomendación completa.

**Solución:** Usar streaming API de OpenAI:

```javascript
// Recibir tokens incrementalmente:
{agent_brief: {recommendation: "INSTRUCCIONES"...
{agent_brief: {recommendation: "INSTRUCCIONES PARA MASTER: Mantener"...
{agent_brief: {recommendation: "INSTRUCCIONES PARA MASTER: Mantener el diálogo..."...
```

**Beneficio:** Reduce latency percibida de 1500ms → 500ms (TTFB).

---

## Referencias

### Nodos Previos
- [Node 41: Smart Input](41-smart-input.md) → Prepara contexto completo (history + profile + state + options + rules + meta)
- [Node 40: HydrateForHistory](40-hydrate-for-history.md) → Merge de history + profile/state
- [Node 38: Chat History Filter](38-chat-history-filter.md) → Provee history limpio

### Nodos Siguientes
- **Node 43: Master Agent** (pendiente documentación) → Consume agent_brief + state y genera respuesta final para el usuario
- **RAG Query Node** (pendiente) → Si recommendation incluye rag_hints, consulta Qdrant para obtener beneficios
- **Update Profile Node** (pendiente) → Persiste state actualizado en Baserow

### Políticas de Negocio
- Todas las 11 políticas definidas en [Node 41: Smart Input - Rules Object](41-smart-input.md#4-rules-object-líneas-153-310)

### Arquitectura
- [ETAPA 4: Update Flow - Resumen](resumen-etapa-4.md) (pendiente crear)
- **ETAPA 5: Agente Master y RAG** (inicio de esta etapa con Node 42)

---

## Notas Finales

**Chat History Processor (LLM Analyst)** es el **cerebro analítico** del workflow. Su función crítica es:

1. **Interpretar conversación** en contexto (history + profile + state)
2. **Detectar intent** del usuario (11 intents canónicos)
3. **Actualizar state** (stage transitions, counters, interests, cooldowns)
4. **Validar políticas** (email gating con 7 condiciones, anti-loop con ventana de 5 min)
5. **Generar recomendación técnica** para Master Agent (≤280 chars)
6. **Decidir CTAs** (4 opciones contextuales)

**Patrón arquitectónico:** **Policy-as-Prompt** - Las 11 políticas de negocio (definidas en Smart Input) se traducen a instrucciones en lenguaje natural para el LLM. El LLM actúa como **"intérprete de políticas"**.

**Constraints críticos:**
- Output JSON minificado, 1 línea, ≤1800 caracteres
- State shape debe ser EXACTO al input (solo actualizar campos permitidos)
- NO PII en history_summary ni reask_decision.reason
- Transiciones de stage sin regresión
- Counters máx +1 por tipo
- Cooldowns solo cuando assistant pregunta

**Versión:** System v3.3 (Filter-Output Compatible) - indica que output es compatible con filtros downstream.

**Trade-offs:**
- **Pro:** Flexibilidad (LLM interpreta reglas complejas en lenguaje natural)
- **Pro:** Adaptabilidad (puede manejar casos edge sin código adicional)
- **Contra:** Costo (~$0.002-0.003 por llamada)
- **Contra:** Latency (1.5-3s por llamada)
- **Contra:** No determinístico (puede haber variabilidad en outputs)

**Alternativa (para considerar):** Rule engine determinístico (if/else) para casos simples (greeting, service_info) + LLM solo para casos complejos (negotiation, unclear) → reduce costo 60-70%.
