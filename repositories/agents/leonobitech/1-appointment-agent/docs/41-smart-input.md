# Nodo 41: Smart Input v2

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | Smart Input |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Preparar contexto completo para LLM Analyst/Master con history normalizado, profile, state, options (catálogos), rules (políticas de negocio) y meta |
| **Input previo** | HydrateForHistory (Node 40) → `{ history, lead_id, profile, state }` |
| **Modo ejecución** | Run Once for All Items |
| **Salidas** | 1 salida → `{ history, profile, state, options, rules, meta }` |

---

## Descripción

El nodo **Smart Input v2** es uno de los más complejos del workflow (~300 líneas de JavaScript). Su propósito es **preparar el contexto completo** que será enviado al Agente Analyst/Master (LLM) para analizar la conversación y generar recomendaciones.

**Funciones principales:**

1. **Normalizar history:** Limitar a 60 mensajes máximo, ordenar cronológicamente (ASC), coercer estructura `{role, text, ts}`
2. **Crear objeto `options`:** Catálogos de servicios, aliases (~40 mapeos), stages permitidos, intents, CTAs, service_defaults
3. **Crear objeto `rules`:** 11 políticas de negocio que gobiernan el comportamiento del agente (stage transitions, counters, cooldowns, RAG-first, anti-loop, email gating, etc.)
4. **Crear objeto `meta`:** Metadata sobre el procesamiento (history_len, truncated, locale, channel, country, timezone, version)

Este nodo es el **"cerebro de configuración"** del sistema: define qué puede hacer el agente, cómo debe comportarse y qué restricciones debe respetar.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: Code
Lenguaje: JavaScript
Mode: Run Once for All Items
```

### Code Completo (con Breakdown)

#### 1. Helper Functions (Líneas 1-34)

```javascript
// ============================================================================
// 1) Helpers
// ============================================================================

function num(x, fallback = 0) {
  const n = Number(x);
  return (isNaN(n) || !isFinite(n)) ? fallback : n;
}

function str(x, fallback = "") {
  return (x == null) ? fallback : String(x);
}

function arr(x, fallback = []) {
  return Array.isArray(x) ? x : fallback;
}

function obj(x, fallback = {}) {
  return (x && typeof x === "object" && !Array.isArray(x)) ? x : fallback;
}

function bool(x, fallback = false) {
  if (typeof x === "boolean") return x;
  if (x == null) return fallback;
  if (typeof x === "string") {
    const low = x.toLowerCase().trim();
    if (low === "true" || low === "1") return true;
    if (low === "false" || low === "0") return false;
  }
  return fallback;
}

function clamp(arr, max) {
  return arr.slice(0, max);
}

function sortByTsAsc(msgs) {
  return msgs.slice().sort((a, b) => num(a.ts) - num(b.ts));
}

function coerceMsg(m) {
  return {
    role: str(m.role, "user"),
    text: str(m.text, ""),
    ts: num(m.ts, 0)
  };
}
```

**Propósito:**
- `num()`, `str()`, `arr()`, `obj()`, `bool()`: Coerción segura de tipos con fallbacks
- `clamp()`: Limita array a N elementos
- `sortByTsAsc()`: Ordena mensajes por timestamp ascendente (cronológico)
- `coerceMsg()`: Normaliza mensaje a estructura `{role, text, ts}`

**Patrón:** Mismo patrón de helpers usado en nodos anteriores (38, 39) para robustez.

---

#### 2. Input Parsing (Líneas 35-51)

```javascript
// ============================================================================
// 2) Parse input
// ============================================================================

const rawInput = $input.all();
if (!rawInput || rawInput.length === 0) {
  throw new Error("[SmartInput] No input items");
}

const item = rawInput[0].json;
const historyRaw = arr(item.history, []);
const profileRaw = obj(item.profile, {});
const stateRaw = obj(item.state, {});

// Normalize history: limit to MAX_MSGS, sort chronologically
const MAX_MSGS = 60;
const history = clamp(sortByTsAsc(historyRaw.map(coerceMsg)), MAX_MSGS);
```

**Breakdown:**
- Recibe input desde HydrateForHistory (Node 40)
- Extrae `history`, `profile`, `state` del primer item
- **Normaliza history:** mapea con `coerceMsg()`, ordena ASC por timestamp, limita a 60 mensajes máximo
- Si hay más de 60 mensajes, los más antiguos se descartan

**Ejemplo:**
```javascript
// Input: 85 mensajes desordenados
// Output: 60 mensajes más recientes, ordenados ASC
```

---

#### 3. Options Object (Líneas 52-152)

```javascript
// ============================================================================
// 3) Build "options" object
// ============================================================================

const options = {
  // Interests allowed (normalized)
  interests_allowed: [
    "Odoo",
    "WhatsApp",
    "CRM"
  ],

  // Canonical service names
  services_allowed: [
    "WhatsApp Chatbot",
    "Landing Page",
    "Mobile App",
    "Custom Software",
    "AI Automation",
    "IoT Integration",
    "CRM Integration",
    "Consulting & Support",
    "Website Development",
    "E-commerce Platform",
    "Process Automation",
    "Smart Dashboard"
  ],

  // Service aliases: 40+ mappings
  services_aliases: {
    // WhatsApp variations
    "whatsapp": "WhatsApp Chatbot",
    "chatbot": "WhatsApp Chatbot",
    "whatsapp chatbot": "WhatsApp Chatbot",
    "whatsapp bot": "WhatsApp Chatbot",
    "bot de whatsapp": "WhatsApp Chatbot",
    "chatbot de whatsapp": "WhatsApp Chatbot",

    // Landing Page variations
    "landing": "Landing Page",
    "landing page": "Landing Page",
    "página de aterrizaje": "Landing Page",
    "pagina de aterrizaje": "Landing Page",

    // Mobile App variations
    "app": "Mobile App",
    "app movil": "Mobile App",
    "aplicación móvil": "Mobile App",
    "aplicacion movil": "Mobile App",

    // Custom Software variations
    "software": "Custom Software",
    "software personalizado": "Custom Software",
    "desarrollo a medida": "Custom Software",

    // AI Automation variations
    "ia": "AI Automation",
    "inteligencia artificial": "AI Automation",
    "automatizacion con ia": "AI Automation",
    "automatización con ia": "AI Automation",

    // IoT Integration variations
    "iot": "IoT Integration",
    "internet de las cosas": "IoT Integration",
    "integracion iot": "IoT Integration",

    // CRM Integration variations
    "crm": "CRM Integration",
    "integracion crm": "CRM Integration",
    "integración crm": "CRM Integration",

    // Consulting variations
    "consultoria": "Consulting & Support",
    "consultoría": "Consulting & Support",
    "soporte": "Consulting & Support",

    // Website variations
    "sitio web": "Website Development",
    "pagina web": "Website Development",
    "página web": "Website Development",
    "website": "Website Development",

    // E-commerce variations
    "tienda online": "E-commerce Platform",
    "ecommerce": "E-commerce Platform",
    "comercio electronico": "E-commerce Platform",

    // Process Automation variations
    "automatizacion": "Process Automation",
    "automatización": "Process Automation",
    "automatizacion de procesos": "Process Automation",

    // Dashboard variations
    "dashboard": "Smart Dashboard",
    "tablero": "Smart Dashboard",
    "panel de control": "Smart Dashboard"
  },

  // Numeric service mapping (for menu selection)
  services_number_map: {
    "1": "WhatsApp Chatbot",
    "2": "Landing Page",
    "3": "Mobile App",
    "4": "Custom Software",
    "5": "AI Automation",
    "6": "IoT Integration",
    "7": "CRM Integration",
    "8": "Consulting & Support",
    "9": "Website Development",
    "10": "E-commerce Platform",
    "11": "Process Automation",
    "12": "Smart Dashboard"
  },

  // Stage transitions allowed
  stage_allowed: [
    "explore",
    "match",
    "price",
    "qualify",
    "proposal_ready"
  ],

  // Service defaults (bundle + RAG hints + interests)
  service_defaults: {
    "WhatsApp Chatbot": {
      bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
      rag_hints: ["beneficios de chatbot", "casos de uso whatsapp"],
      interests: ["WhatsApp", "CRM"]
    },
    "Landing Page": {
      bundle: ["Landing Page", "Website Development"],
      rag_hints: ["beneficios landing page", "conversión web"],
      interests: ["Odoo"]
    },
    "Mobile App": {
      bundle: ["Mobile App", "Custom Software"],
      rag_hints: ["ventajas app móvil", "experiencia usuario"],
      interests: ["WhatsApp"]
    },
    // ... más servicios
  },

  // Default CTA menu structure
  cta_menu_default: {
    title: "¿Qué te gustaría hacer?",
    options: [
      { num: 1, text: "Ver más servicios", action: "show_services" },
      { num: 2, text: "Solicitar cotización", action: "request_quote" },
      { num: 3, text: "Hablar con un asesor", action: "contact_advisor" },
      { num: 4, text: "Conocer casos de éxito", action: "show_cases" }
    ]
  },

  // Canonical intents
  intents_allowed: [
    "request_info",
    "request_price",
    "request_quote",
    "show_services",
    "contact_advisor",
    "schedule_call",
    "show_cases",
    "provide_contact",
    "confirm_interest",
    "decline_interest",
    "unknown"
  ]
};
```

**Breakdown:**
- **interests_allowed:** Solo 3 intereses permitidos (Odoo, WhatsApp, CRM)
- **services_allowed:** 12 servicios canónicos
- **services_aliases:** ~40 mapeos de variaciones lingüísticas → nombres canónicos (ej: "chatbot" → "WhatsApp Chatbot")
- **services_number_map:** Mapeo 1-12 para selección por menú numérico
- **stage_allowed:** 5 stages del funnel (explore → match → price → qualify → proposal_ready)
- **service_defaults:** Para cada servicio define bundle (servicios complementarios), rag_hints (queries RAG), interests (intereses asociados)
- **cta_menu_default:** Estructura de menú por defecto con 4 opciones
- **intents_allowed:** 11 intents canónicos que el LLM puede detectar

**Propósito:** Este objeto es el **catálogo** del sistema. Define vocabulario, opciones y estructura de datos permitida.

---

#### 4. Rules Object (Líneas 153-310)

```javascript
// ============================================================================
// 4) Build "rules" object (business policies)
// ============================================================================

const rules = {
  timing_and_chronology: `
    - Process messages in chronological order (oldest to newest)
    - Use timestamp (ts) from history items for temporal context
    - Never reverse chronology in analysis
  `,

  interests_policy: `
    - Only add interests if there is EXPLICIT or strong IMPLICIT intent
    - Normalize to options.interests_allowed: ["Odoo", "WhatsApp", "CRM"]
    - Never duplicate interests in state.interests array
    - If user shows interest in a service, infer related interest:
      * WhatsApp Chatbot → interests: ["WhatsApp", "CRM"]
      * Landing Page → interests: ["Odoo"]
      * CRM Integration → interests: ["CRM", "Odoo"]
  `,

  stage_policy: `
    - Stage transitions follow strict funnel: explore → match → price → qualify → proposal_ready
    - explore: Initial contact, no service selected yet
    - match: User has chosen a service (update service_target)
    - price: User has asked for price/quote (increment prices_asked counter)
    - qualify: Business details captured (business_name, volume, etc.)
    - proposal_ready: All gating conditions met (see email_gating_policy)
    - NEVER skip stages or go backwards
    - Only update stage if there is clear evidence in conversation
  `,

  counters_policy: `
    - Increment counters by +1 per type per iteration when condition is met:
      * services_seen: +1 when user sees/asks about a NEW service
      * prices_asked: +1 when user explicitly asks "¿cuánto cuesta?" or similar
      * deep_interest: +1 when user shows strong interest (asks multiple questions, requests quote, etc.)
    - Counters are cumulative (never decrease)
    - If user asks about multiple services in one message, increment services_seen by number of NEW services
  `,

  cooldowns_policy: `
    - Only update cooldown timestamp when assistant EXPLICITLY ASKS the question
    - email_ask_ts: Update when assistant asks "¿Cuál es tu email?"
    - addressee_ask_ts: Update when assistant asks "¿A nombre de quién?" or similar
    - DO NOT update cooldown if user volunteers information without being asked
    - Format: ISO 8601 timestamp
  `,

  recommendation_format_policy: `
    - Output MUST start with: "INSTRUCCIONES PARA MASTER:"
    - Structure:
      1. ANÁLISIS: Current stage, detected intent, conversation context
      2. ACCIÓN: What assistant should do (ask question, provide info, transition stage)
      3. DATOS: Specific updates to profile/state (service_target, stage, counters, interests, etc.)
      4. SIGUIENTE PASO: What to expect from user next
    - Be concise but specific
    - Use structured format for data updates (JSON-like)
  `,

  rag_first_policy: `
    - ALWAYS prioritize RAG benefits over direct answers when user shows interest
    - When user asks about a service, FIRST fetch benefits from RAG using rag_hints from service_defaults
    - After RAG response, include CTA menu (not the general services menu)
    - NEVER restart general services menu if service_target is already set
    - If user says "otro servicio", update service_target and fetch NEW service RAG
  `,

  anti_loop_policy: `
    - If assistant asked for specific information (email, name, volume) in last 5 minutes, DO NOT ask again
    - Check cooldowns.email_ask_ts and cooldowns.addressee_ask_ts
    - If (now - cooldown_ts) < 5 minutes AND user hasn't provided info → SKIP question, move forward
    - If user provided partial info, acknowledge and continue
    - 5-minute window defined in meta.anti_loop_window_min
  `,

  email_gating_policy: `
    - Only recommend collecting email if ALL these conditions are met:
      1. stage is "qualify" or later
      2. interests array has at least 1 item
      3. counters.services_seen >= 1
      4. counters.deep_interest >= 1
      5. state.business_name is NOT empty
      6. profile.proposal_intent is true OR counters.prices_asked >= 1
      7. (now - cooldowns.email_ask_ts) > 5 minutes OR cooldowns.email_ask_ts is null
    - If conditions not met, DO NOT ask for email yet
    - This prevents premature contact capture
  `,

  privacy_policy: `
    - Never include PII (email, phone, business_name, addressee) in ANÁLISIS section
    - Only reference these fields in DATOS section for updates
    - In logs, use placeholders like "email_provided: true" instead of actual email
  `,

  menu_guard_policy: `
    - If service_target is already set (not null/empty), DO NOT show general services menu again
    - Instead, use CTA menu (cta_menu_default) with specific actions
    - General services menu only for stage "explore" with no service_target
    - If user says "otro servicio", update service_target to new service and show its RAG
  `,

  self_check_policy: `
    - Before finalizing recommendation, validate:
      * Stage transition is sequential (no skips)
      * Counters only increase (never decrease or reset)
      * Cooldowns only updated when assistant asks
      * No PII in ANÁLISIS section
      * RAG query included if recommending service benefits
      * CTA menu included after RAG (not general menu)
    - If validation fails, revise recommendation
  `
};
```

**Breakdown:**

Estas son las **11 políticas de negocio** que gobiernan el comportamiento del agente. Cada una define restricciones y reglas específicas:

1. **timing_and_chronology:** Procesar mensajes cronológicamente (ASC), usar timestamp de history
2. **interests_policy:** Solo agregar intereses explícitos/implícitos, normalizar, no duplicar
3. **stage_policy:** Transiciones secuenciales explore→match→price→qualify→proposal_ready, nunca retroceder
4. **counters_policy:** +1 por tipo por iteración (services_seen, prices_asked, deep_interest)
5. **cooldowns_policy:** Solo actualizar cuando assistant PREGUNTA explícitamente (email_ask_ts, addressee_ask_ts)
6. **recommendation_format_policy:** Output debe empezar con "INSTRUCCIONES PARA MASTER:" y seguir estructura ANÁLISIS→ACCIÓN→DATOS→SIGUIENTE PASO
7. **rag_first_policy:** SIEMPRE priorizar beneficios (RAG) antes que respuestas directas, no reiniciar menú general si service_target existe
8. **anti_loop_policy:** Ventana de 5 minutos para no repetir preguntas (usa cooldowns)
9. **email_gating_policy:** 7 condiciones para recomendar captura de email (stage qualify+, interests≥1, services_seen≥1, deep_interest≥1, business_name presente, proposal_intent o prices_asked≥1, cooldown>5min)
10. **privacy_policy:** No incluir PII en sección ANÁLISIS, solo en DATOS
11. **menu_guard_policy:** No mostrar menú general si service_target ya está definido, usar CTA menu
12. **self_check_policy:** Validación pre-envío (stage secuencial, counters crecientes, cooldowns correctos, no PII, RAG incluido, CTA correcto)

**Propósito:** Estas reglas son el **"manual de operación"** del agente. El LLM Analyst las usa para generar recomendaciones que respeten las políticas de negocio.

**Ejemplo - email_gating_policy:**
```javascript
// Gating conditions (7 checks):
if (
  stage in ["qualify", "proposal_ready"] &&
  interests.length >= 1 &&
  counters.services_seen >= 1 &&
  counters.deep_interest >= 1 &&
  state.business_name !== "" &&
  (profile.proposal_intent === true || counters.prices_asked >= 1) &&
  ((now - cooldowns.email_ask_ts) > 5*60*1000 || cooldowns.email_ask_ts === null)
) {
  // OK to ask for email
}
```

---

#### 5. Meta Object (Líneas 311-330)

```javascript
// ============================================================================
// 5) Build "meta" object
// ============================================================================

const meta = {
  history_len: history.length,
  truncated: historyRaw.length > MAX_MSGS,
  locale_hint: str(profileRaw.locale, "es-MX"),
  channel: str(profileRaw.channel, "whatsapp"),
  country: str(profileRaw.country, "MX"),
  tz: str(profileRaw.tz, "America/Mexico_City"),
  now_ts: Date.now(),
  anti_loop_window_min: 5,
  version: "smart-input@2"
};
```

**Breakdown:**
- **history_len:** Número de mensajes en history (después de normalización, max 60)
- **truncated:** `true` si se descartaron mensajes (historyRaw > 60)
- **locale_hint:** Idioma/región del lead (default: "es-MX")
- **channel:** Canal de comunicación (default: "whatsapp")
- **country:** País del lead (default: "MX")
- **tz:** Timezone del lead (default: "America/Mexico_City")
- **now_ts:** Timestamp actual en milisegundos (para cálculos de cooldown)
- **anti_loop_window_min:** Ventana anti-loop en minutos (5)
- **version:** Versión del Smart Input ("smart-input@2")

**Propósito:** Metadata sobre el procesamiento actual. Útil para debugging, auditoría y cálculos temporales.

---

#### 6. Output Assembly (Líneas 331-342)

```javascript
// ============================================================================
// 6) Assemble output
// ============================================================================

const output = {
  history: history,
  profile: profileRaw,
  state: stateRaw,
  options: options,
  rules: rules,
  meta: meta
};

return [{ json: output }];
```

**Breakdown:**
- Ensambla objeto final con 6 campos principales
- `history`: Array normalizado (max 60 mensajes, ASC, `{role, text, ts}`)
- `profile`: Objeto profile original (Baserow structure)
- `state`: Objeto state original (semantic structure con counters/cooldowns)
- `options`: Catálogos y configuración (servicios, aliases, stages, intents, CTAs)
- `rules`: 11 políticas de negocio en texto plano (para prompt del LLM)
- `meta`: Metadata del procesamiento

**Output:** Array con 1 item conteniendo el objeto completo.

---

## Input

Input desde **HydrateForHistory (Node 40)**:

```json
{
  "history": [
    {"role": "user", "text": "Hola", "ts": 1736889710000},
    {"role": "assistant", "text": "¡Hola! ¿En qué puedo ayudarte?", "ts": 1736889715000},
    {"role": "user", "text": "Quiero info del chatbot", "ts": 1736889720000}
  ],
  "lead_id": 33,
  "profile": {
    "lead_id": 33,
    "phone": "+524421234567",
    "channel": "whatsapp",
    "last_message": "Quiero info del chatbot",
    "last_message_id": "wamid.ABC123",
    "last_activity_iso": "2025-01-14T16:42:00Z",
    "locale": "es-MX",
    "country": "MX",
    "tz": "America/Mexico_City",
    "first_interaction": "2025-01-14T16:41:50Z",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "email_ask_ts": null,
    "addressee_ask_ts": null,
    "stage": "explore",
    "interests": [],
    "service_target": "",
    "business_name": "",
    "proposal_intent": false
  },
  "state": {
    "lead_id": 33,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "stage": "explore",
    "interests": [],
    "service_target": "",
    "business_name": "",
    "proposal_intent": false
  }
}
```

**Campos principales:**
- `history`: 3 mensajes de conversación
- `lead_id`: ID 33
- `profile`: Estructura Baserow con todos los campos
- `state`: Estructura semántica con counters, cooldowns, stage

---

## Output

Output del nodo (contexto completo para LLM Analyst):

```json
{
  "history": [
    {"role": "user", "text": "Hola", "ts": 1736889710000},
    {"role": "assistant", "text": "¡Hola! ¿En qué puedo ayudarte?", "ts": 1736889715000},
    {"role": "user", "text": "Quiero info del chatbot", "ts": 1736889720000}
  ],
  "profile": {
    "lead_id": 33,
    "phone": "+524421234567",
    "channel": "whatsapp",
    "last_message": "Quiero info del chatbot",
    "stage": "explore",
    "interests": [],
    "service_target": "",
    "business_name": "",
    "proposal_intent": false
  },
  "state": {
    "lead_id": 33,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "stage": "explore",
    "interests": [],
    "service_target": "",
    "business_name": "",
    "proposal_intent": false
  },
  "options": {
    "interests_allowed": ["Odoo", "WhatsApp", "CRM"],
    "services_allowed": [
      "WhatsApp Chatbot",
      "Landing Page",
      "Mobile App",
      "Custom Software",
      "AI Automation",
      "IoT Integration",
      "CRM Integration",
      "Consulting & Support",
      "Website Development",
      "E-commerce Platform",
      "Process Automation",
      "Smart Dashboard"
    ],
    "services_aliases": {
      "whatsapp": "WhatsApp Chatbot",
      "chatbot": "WhatsApp Chatbot",
      "landing": "Landing Page",
      "app": "Mobile App",
      "software": "Custom Software",
      "ia": "AI Automation",
      "iot": "IoT Integration",
      "crm": "CRM Integration"
    },
    "services_number_map": {
      "1": "WhatsApp Chatbot",
      "2": "Landing Page",
      "3": "Mobile App",
      "4": "Custom Software",
      "5": "AI Automation",
      "6": "IoT Integration",
      "7": "CRM Integration",
      "8": "Consulting & Support",
      "9": "Website Development",
      "10": "E-commerce Platform",
      "11": "Process Automation",
      "12": "Smart Dashboard"
    },
    "stage_allowed": ["explore", "match", "price", "qualify", "proposal_ready"],
    "service_defaults": {
      "WhatsApp Chatbot": {
        "bundle": ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
        "rag_hints": ["beneficios de chatbot", "casos de uso whatsapp"],
        "interests": ["WhatsApp", "CRM"]
      }
    },
    "cta_menu_default": {
      "title": "¿Qué te gustaría hacer?",
      "options": [
        {"num": 1, "text": "Ver más servicios", "action": "show_services"},
        {"num": 2, "text": "Solicitar cotización", "action": "request_quote"},
        {"num": 3, "text": "Hablar con un asesor", "action": "contact_advisor"},
        {"num": 4, "text": "Conocer casos de éxito", "action": "show_cases"}
      ]
    },
    "intents_allowed": [
      "request_info",
      "request_price",
      "request_quote",
      "show_services",
      "contact_advisor",
      "schedule_call",
      "show_cases",
      "provide_contact",
      "confirm_interest",
      "decline_interest",
      "unknown"
    ]
  },
  "rules": {
    "timing_and_chronology": "- Process messages in chronological order...",
    "interests_policy": "- Only add interests if EXPLICIT or IMPLICIT...",
    "stage_policy": "- Stage transitions follow strict funnel...",
    "counters_policy": "- Increment counters by +1 per type...",
    "cooldowns_policy": "- Only update cooldown timestamp when assistant ASKS...",
    "recommendation_format_policy": "- Output MUST start with: INSTRUCCIONES PARA MASTER...",
    "rag_first_policy": "- ALWAYS prioritize RAG benefits...",
    "anti_loop_policy": "- If assistant asked in last 5 minutes, DO NOT ask again...",
    "email_gating_policy": "- Only collect email if ALL 7 conditions met...",
    "privacy_policy": "- Never include PII in ANÁLISIS section...",
    "menu_guard_policy": "- If service_target set, DO NOT show general menu...",
    "self_check_policy": "- Validate stage, counters, cooldowns before sending..."
  },
  "meta": {
    "history_len": 3,
    "truncated": false,
    "locale_hint": "es-MX",
    "channel": "whatsapp",
    "country": "MX",
    "tz": "America/Mexico_City",
    "now_ts": 1736889720123,
    "anti_loop_window_min": 5,
    "version": "smart-input@2"
  }
}
```

**Tamaño:** ~8-12 KB dependiendo del número de mensajes en history.

**Campos principales:**
- `history`: 3 mensajes (normalizado, max 60)
- `profile`: Profile completo
- `state`: State con counters/cooldowns
- `options`: Catálogo completo (servicios, aliases, stages, intents, CTAs)
- `rules`: 11 políticas de negocio (texto plano para prompt)
- `meta`: Metadata (history_len=3, truncated=false, now_ts, version)

---

## Comparación con Nodos Previos

| Aspecto | Node 40 (HydrateForHistory) | Node 41 (Smart Input) |
|---------|------------------------------|------------------------|
| **Función** | Merge de history + profile/state | Preparar contexto completo para LLM |
| **Input** | 2 flujos paralelos (A y B) | 1 flujo merged |
| **Output** | `{history, lead_id, profile, state}` | `{history, profile, state, options, rules, meta}` |
| **Complejidad** | Simple (Merge node) | Complejo (~300 líneas JS) |
| **History processing** | Solo merge | Normalización + limit + sort |
| **Business logic** | No | Sí (11 políticas en `rules`) |
| **Catálogos** | No | Sí (`options` con servicios, aliases, stages) |
| **Metadata** | No | Sí (`meta` con version, timestamps, locale) |

**Progresión de datos:**

1. **Node 38:** History raw → History limpio (3 campos: role, text, ts)
2. **Node 39:** Profile → State (counters, cooldowns)
3. **Node 40:** Merge history + profile/state
4. **Node 41:** + Options (catálogos) + Rules (políticas) + Meta (metadata) → **Contexto completo para LLM**

---

## Casos de Uso

### 1. Conversación Nueva (3 mensajes)

**Escenario:** Lead nuevo, 3 mensajes de saludo.

**Input:**
- history: 3 mensajes
- stage: "explore"
- counters: todos en 0

**Output:**
- history normalizado (3 mensajes, ASC)
- options con 12 servicios + aliases
- rules con 11 políticas
- meta.truncated: false

**Uso:** LLM Analyst recibe contexto mínimo para iniciar conversación.

---

### 2. Conversación Larga (85 mensajes)

**Escenario:** Lead con historial extenso.

**Input:**
- history: 85 mensajes (raw)
- stage: "qualify"
- counters: services_seen=3, prices_asked=1, deep_interest=2

**Output:**
- history normalizado (60 mensajes más recientes, ASC)
- meta.truncated: **true**
- meta.history_len: 60

**Beneficio:** Limita tamaño del contexto para no exceder límite de tokens del LLM.

---

### 3. Service Selection (chatbot)

**Escenario:** Usuario pregunta por chatbot.

**Input:**
- last_message: "Quiero info del chatbot"
- service_target: ""
- stage: "explore"

**Output:**
- options.services_aliases: {"chatbot": "WhatsApp Chatbot"}
- options.service_defaults["WhatsApp Chatbot"]:
  - bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"]
  - rag_hints: ["beneficios de chatbot", "casos de uso whatsapp"]
  - interests: ["WhatsApp", "CRM"]
- rules.rag_first_policy: "ALWAYS prioritize RAG benefits..."

**Uso:** LLM Analyst detecta alias "chatbot", normaliza a "WhatsApp Chatbot", consulta RAG con hints, actualiza service_target a "WhatsApp Chatbot", incrementa services_seen+1, transiciona stage a "match", agrega interests ["WhatsApp", "CRM"].

---

### 4. Email Gating (7 condiciones)

**Escenario:** Lead calificado, listo para captura de email.

**Input:**
- stage: "qualify"
- interests: ["WhatsApp", "CRM"]
- counters: services_seen=2, prices_asked=1, deep_interest=2
- business_name: "Acme Corp"
- proposal_intent: true
- email_ask_ts: null

**Output:**
- rules.email_gating_policy: "Only collect email if ALL 7 conditions met..."
- meta.now_ts: 1736889720123
- meta.anti_loop_window_min: 5

**Validación (en LLM Analyst):**
```javascript
// Check 7 conditions:
✅ stage in ["qualify", "proposal_ready"]
✅ interests.length >= 1 (2 items)
✅ counters.services_seen >= 1 (2)
✅ counters.deep_interest >= 1 (2)
✅ business_name !== "" ("Acme Corp")
✅ proposal_intent === true
✅ email_ask_ts === null OR (now - email_ask_ts) > 5min

→ ALL conditions met → OK to ask for email
```

**Uso:** LLM Analyst recomienda: "ACCIÓN: Preguntar email. DATOS: update cooldowns.email_ask_ts to now_ts".

---

### 5. Anti-Loop Protection

**Escenario:** Assistant preguntó por email hace 2 minutos, usuario no respondió.

**Input:**
- cooldowns.email_ask_ts: 1736889600000 (hace 2 min)
- meta.now_ts: 1736889720000
- meta.anti_loop_window_min: 5

**Output:**
- rules.anti_loop_policy: "If asked in last 5 minutes, DO NOT ask again..."

**Validación (en LLM Analyst):**
```javascript
const elapsed_min = (meta.now_ts - state.cooldowns.email_ask_ts) / 60000;
// elapsed_min = 2 minutes

if (elapsed_min < meta.anti_loop_window_min) {
  // SKIP question, move forward
  return "ACCIÓN: No preguntar por email nuevamente, ofrecer CTA alternativo";
}
```

**Uso:** Evita repetir pregunta antes de 5 minutos.

---

## Performance

### Métricas Estimadas

| Métrica | Valor |
|---------|-------|
| **Execution time** | ~15-25ms |
| **Input size** | ~3-5 KB (history + profile + state) |
| **Output size** | ~8-12 KB (completo contexto) |
| **Memory usage** | Bajo (~1 MB) |
| **Code complexity** | Alta (~300 líneas, 11 políticas) |

**Breakdown:**
- Helper functions: 1-2ms
- Input parsing: 1-2ms
- Options object assembly: 3-5ms
- Rules object assembly: 5-8ms
- Meta object assembly: 1-2ms
- Output assembly: 1-2ms

**Optimización:**
- Options y rules son **estáticos** → podrían pre-compilarse como JSON y cargarse en lugar de construirse cada vez
- Potencial ahorro: 8-13ms (65% faster)

---

## Mejoras Propuestas

### 1. Pre-compilar Options y Rules

**Problema:** Options y rules se construyen en cada ejecución (~200 líneas de código).

**Solución:** Mover a archivos JSON externos:

```javascript
// smart-input-config.json
{
  "options": { /* ... */ },
  "rules": { /* ... */ }
}

// En el nodo:
const config = $vars.smartInputConfig; // Pre-loaded from JSON
const options = config.options;
const rules = config.rules;
```

**Beneficio:** Reduce execution time de 20ms → 7ms (65% faster), mejora maintainability.

---

### 2. Validación de Rules en Output

**Problema:** Rules son texto plano sin validación. Si el LLM Analyst ignora una regla, no hay forma de detectarlo.

**Solución:** Agregar nodo de validación post-Analyst:

```javascript
// Validate Analyst Output node
function validateAnalystOutput(output) {
  const errors = [];

  // Check stage transition
  if (output.stage_new && !isValidTransition(output.stage_old, output.stage_new)) {
    errors.push("Invalid stage transition");
  }

  // Check counters only increase
  if (output.counters_new.services_seen < output.counters_old.services_seen) {
    errors.push("Counters cannot decrease");
  }

  // Check PII in analysis
  if (containsPII(output.analysis)) {
    errors.push("PII detected in analysis section");
  }

  return errors;
}
```

**Beneficio:** Garantiza que el LLM respeta las políticas, permite retry o fallback si hay errores.

---

### 3. Agregar Tracing a Meta

**Problema:** No hay visibilidad sobre el flujo (cuánto tiempo tomó cada stage).

**Solución:** Agregar timestamps de cada nodo a meta:

```javascript
const meta = {
  // ... existing fields
  tracing: {
    filter_process_start: $items('FilterProcess', 0, 0)?.json?.timestamp,
    buffer_messages_start: $items('BufferMessages', 0, 0)?.json?.timestamp,
    compose_profile_start: $items('ComposeProfile', 0, 0)?.json?.timestamp,
    chat_history_filter_start: $items('ChatHistoryFilter', 0, 0)?.json?.timestamp,
    hydrate_for_history_start: $items('HydrateForHistory', 0, 0)?.json?.timestamp,
    smart_input_start: Date.now()
  }
};
```

**Beneficio:** Permite analytics end-to-end, debugging de performance, identificación de bottlenecks.

---

### 4. Agregar Feature Flags a Options

**Problema:** No hay forma de habilitar/deshabilitar features (A/B testing, gradual rollout).

**Solución:** Agregar `features` object a options:

```javascript
const options = {
  // ... existing fields
  features: {
    rag_enabled: true,
    email_gating_enabled: true,
    anti_loop_enabled: true,
    menu_guard_enabled: true,
    self_check_enabled: true
  }
};
```

**Beneficio:** Permite A/B testing, rollback rápido, configuración por lead/segment.

---

### 5. Internacionalización (i18n) de Rules

**Problema:** Rules están hardcoded en inglés. Si el LLM Analyst usa español, puede haber confusión.

**Solución:** Detectar locale y traducir rules:

```javascript
const locale = str(profileRaw.locale, "es-MX");
const rules = (locale.startsWith("es")) ? rulesES : rulesEN;
```

**Beneficio:** Mejora comprensión del LLM, reduce errores de interpretación.

---

## Referencias

### Nodos Previos
- [Node 38: Chat History Filter](38-chat-history-filter.md) → Provee history limpio
- [Node 39: LoadProfileAndState](39-load-profile-and-state.md) → Provee profile + state
- [Node 40: HydrateForHistory](40-hydrate-for-history.md) → Merge de history + profile/state

### Nodos Siguientes
- **Node 42: LLM Analyst** (pendiente documentación) → Consume este contexto y genera recomendaciones para Master
- **Node 43+: Master Agent + RAG** (pendiente) → Ejecuta recomendaciones y genera respuesta final

### Arquitectura
- [ETAPA 4: Update Flow - Resumen](resumen-etapa-4.md) (pendiente crear)
- [ETAPA 5: Agente Master y RAG](pending) (siguiente stage)

---

## Notas Finales

**Smart Input v2** es el **nodo más complejo del workflow** hasta ahora (~300 líneas de JavaScript). Su propósito es preparar un **contexto completo y estructurado** para el LLM Analyst que incluye:

1. **History normalizado:** Max 60 mensajes, cronológico, formato `{role, text, ts}`
2. **Options:** Catálogos de servicios, aliases, stages, intents, CTAs
3. **Rules:** 11 políticas de negocio que gobiernan el comportamiento
4. **Meta:** Metadata sobre el procesamiento (version, timestamps, locale)

Este nodo es el **"cerebro de configuración"** que define:
- ¿Qué puede hacer el agente? (options.services_allowed, intents_allowed)
- ¿Cómo debe comportarse? (rules con 11 políticas)
- ¿Qué restricciones debe respetar? (email_gating_policy con 7 condiciones, anti_loop_policy con ventana de 5 min)

**Importancia crítica:** Sin este nodo, el LLM Analyst no tendría contexto sobre:
- Qué servicios ofrecer
- Cuándo preguntar por email
- Cómo evitar loops
- Qué formato usar para recomendaciones
- Qué stages son válidos

**Patrón arquitectónico:** **Configuration as Code** - Las reglas de negocio están declaradas como código (no en base de datos ni en prompts hardcoded), lo que permite versionado, testing y auditoría.

**Versión:** `smart-input@2` (indica que hubo una v1 anterior, probablemente con menos políticas o estructura diferente).
