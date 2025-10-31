# Nodo 45: HydrateStateAndContext

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | HydrateStateAndContext |
| **Tipo** | Merge (n8n native) |
| **Función principal** | Unir análisis del LLM (Filter Output) con snapshot baseline (FLAGS ZONE) |
| **Input 1** | Filter Output (Node 43) → `{ ok, merge_key, agent_brief, state }` |
| **Input 2** | SnapshotBaseline (Node 44) → `{ profile, state, state_base, state_base_meta, merge_key }` |
| **Modo** | Combine |
| **Combine By** | All Possible Combinations |
| **Salidas** | 1 salida → `{ profile, state, state_base, state_base_meta, merge_key, agent_brief, ok, history, options, rules }` |

---

## Descripción

El nodo **HydrateStateAndContext** es el **punto de convergencia** de los dos flujos paralelos del workflow:

1. **Flujo A (Analysis)**: Smart Input → LLM Analyst → Filter Output
   - Contiene: `agent_brief` (análisis + recommendation) y `state` actualizado
2. **Flujo B (FLAGS ZONE)**: LoadProfileAndState → SnapshotBaseline
   - Contiene: `state_base` (snapshot inmutable) y `profile` completo

**¿Por qué es crítico este merge?**

Este nodo combina:
- **El análisis del LLM** (qué debe hacer el Master Agent)
- **El estado actualizado** (stage, counters, interests modificados por Analyst)
- **El estado baseline** (snapshot original antes del análisis)
- **El profile completo** (datos del lead desde Baserow)
- **El contexto** (history, options, rules - vacíos en este caso)

**Resultado:** Un objeto completo que contiene **TODO** lo necesario para que el Master Agent genere la respuesta final:
- ✅ Qué decir (agent_brief.recommendation)
- ✅ Qué CTAs mostrar (agent_brief.cta_menu)
- ✅ Qué RAG consultar (agent_brief.service_target.rag_hints)
- ✅ Estado actual del lead (state)
- ✅ Estado original del lead (state_base - para auditoría)
- ✅ Datos del lead (profile)

**Patrón arquitectónico:** **Fork-Join Pattern** - Dos flujos paralelos se ejecutan independientemente y luego se unen.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: Merge (n8n native node)
Mode: Combine
Combine By: All Possible Combinations
```

### Clash Handling

```yaml
When Field Values Clash: Prefer Input 1 Version
```

**Propósito:** Si ambos inputs tienen el mismo campo (ej: `merge_key`), usar el valor de Input 1 (Filter Output).

**Casos de clash:**
- `merge_key`: Ambos inputs lo tienen → usa el de Filter Output (Input 1)
- `state`: Ambos inputs lo tienen → usa el de Filter Output (Input 1) - **CRÍTICO**

**¿Por qué preferir Input 1?**

El `state` de Filter Output es el **estado actualizado** por el Analyst (con stage transitions, counters incrementados, interests añadidos). El `state` de SnapshotBaseline es el **estado original** que ya fue copiado a `state_base`.

---

### Merging Nested Fields

```yaml
Merging Nested Fields: Deep Merge
```

**Propósito:** Cuando hay objetos anidados (ej: `state.counters`), hacer merge profundo en lugar de reemplazar completamente.

**Ejemplo:**
```javascript
// Input 1 (Filter Output):
{ state: { counters: { services_seen: 1 } } }

// Input 2 (SnapshotBaseline):
{ state: { counters: { services_seen: 0, prices_asked: 0 } } }

// Shallow merge (reemplazar completamente):
{ state: { counters: { services_seen: 1 } } } // ❌ Pierde prices_asked

// Deep merge:
{ state: { counters: { services_seen: 1, prices_asked: 0 } } } // ✅ Preserva todo
```

**Nota:** En este caso específico, como ambos inputs tienen `state` completo (no parcial), el deep merge no es crítico, pero es buena práctica.

---

### Minimize Empty Fields

```yaml
Minimize Empty Fields: Disabled
```

**Propósito:** NO eliminar campos vacíos (null, [], {}).

**¿Por qué deshabilitado?**

Campos como `history: []`, `options: {}`, `rules: {}` están vacíos en este punto, pero son necesarios para mantener el schema consistente. El Master Agent espera que estos campos existan (aunque sean vacíos).

---

### Fuzzy Compare

```yaml
Fuzzy Compare: Enabled
```

**Propósito:** Al hacer merge por key, usar comparación fuzzy (tolerante a diferencias mínimas en tipos).

**Ejemplo:**
```javascript
// Input 1: merge_key = 33 (number)
// Input 2: merge_key = "33" (string)
// Fuzzy compare: considera que son iguales → merge OK ✅
```

---

## Arquitectura Fork-Join

### Diagrama Completo

```
Node 35: ComposeProfile (2 outputs)
├─ Salida A: History Flow
│  ├─ Node 36: Register incoming message
│  ├─ Node 37: Get Chat History
│  ├─ Node 38: Chat History Filter
│  └─ Node 40: HydrateForHistory (Merge con Salida B-A)
│     └─ ETAPA 4B: Analysis of History
│        ├─ Node 41: Smart Input
│        ├─ Node 42: Chat History Processor (LLM Analyst)
│        └─ Node 43: Filter Output ────────┐
│                                           │
└─ Salida B: Profile Flow                  │
   └─ Node 39: LoadProfileAndState (2 outputs) │
      ├─ Salida A → Node 40 (ya merged)    │
      └─ Salida B → FLAGS ZONE              │
         └─ Node 44: SnapshotBaseline ──────┤
                                             │
                                             ▼
                              Node 45: HydrateStateAndContext ✅ (MERGE)
                                             │
                                             ▼
                                   [Master Agent + RAG]
```

### Timing

**Ejecución paralela:**
- **Flujo A (Analysis)**: ~2000-3000ms (incluye llamada LLM)
- **Flujo B (FLAGS)**: ~10-20ms (solo snapshot)

**Flujo B termina primero** (~2980ms antes), esperando en el Merge node hasta que Flujo A complete.

**Ventaja:** Sin el paralelismo, el tiempo total sería: Analysis (3000ms) + FLAGS (20ms) = 3020ms.
Con paralelismo: max(3000ms, 20ms) = 3000ms → **ahorro de 20ms** (marginal pero gratuito).

---

## Inputs

### Input 1: Filter Output (Node 43)

```json
{
  "ok": true,
  "merge_key": 33,
  "agent_brief": {
    "history_summary": "El usuario inició la conversación con un saludo y respondió afirmativamente al pedido de nombre, proporcionando su nombre.",
    "last_incoming": {
      "role": "user",
      "text": "Si, claro me llamo Felix",
      "ts": "2025-10-31T18:59:47.000Z"
    },
    "intent": "contact_share",
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
      "reason": "Faltan criterios para propuesta: stage insuficiente, sin interés consolidado, no ha visto servicios, no preguntó precios, sin interés profundo, sin nombre de negocio, sin confirmación de propuesta."
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
      "addressee_ask_ts": "2025-10-31T14:16:42.000Z"
    },
    "proposal_offer_done": false
  }
}
```

**Campos clave:**
- `ok`: Flag de éxito (true)
- `merge_key`: 33 (lead_id para merge)
- `agent_brief`: Análisis completo del LLM (intent, stage, recommendation, CTAs)
- `state`: Estado actualizado (con cooldowns.addressee_ask_ts corregido por Filter Output)

---

### Input 2: SnapshotBaseline (Node 44)

```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": null,
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "explore",
    "priority": "normal",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "lead_id": 33,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null
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
  },
  "state_base": {
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
  },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",
    "source": "SnapshotBaseline"
  },
  "merge_key": 33,
  "history": [],
  "options": {},
  "rules": {}
}
```

**Campos clave:**
- `profile`: Profile completo desde Baserow (con row_id, conversation_id, etc.)
- `state`: Estado original (SIN cooldowns.addressee_ask_ts)
- `state_base`: Snapshot inmutable (idéntico a state en este punto)
- `state_base_meta`: Metadata del snapshot
- `merge_key`: 33 (mismo que Input 1)
- `history`, `options`, `rules`: Vacíos (inicializados en SnapshotBaseline)

---

## Output

Output del merge (combinación de ambos inputs):

```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": null,
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "explore",
    "priority": "normal",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "lead_id": 33,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null
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
      "addressee_ask_ts": "2025-10-31T14:16:42.000Z"
    },
    "proposal_offer_done": false
  },
  "state_base": {
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
  },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",
    "source": "SnapshotBaseline"
  },
  "merge_key": 33,
  "history": [],
  "options": {},
  "rules": {},
  "ok": true,
  "agent_brief": {
    "history_summary": "El usuario inició la conversación con un saludo y respondió afirmativamente al pedido de nombre, proporcionando su nombre.",
    "last_incoming": {
      "role": "user",
      "text": "Si, claro me llamo Felix",
      "ts": "2025-10-31T18:59:47.000Z"
    },
    "intent": "contact_share",
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
      "reason": "Faltan criterios para propuesta: stage insuficiente, sin interés consolidado, no ha visto servicios, no preguntó precios, sin interés profundo, sin nombre de negocio, sin confirmación de propuesta."
    }
  }
}
```

### Análisis del Output

**Campos desde Input 2 (SnapshotBaseline):**
- ✅ `profile`: Profile completo con todos los campos Baserow
- ✅ `state_base`: Snapshot inmutable del estado original
- ✅ `state_base_meta`: Metadata del snapshot
- ✅ `history`, `options`, `rules`: Contexto vacío

**Campos desde Input 1 (Filter Output) - PREFER Input 1:**
- ✅ `ok`: Flag de éxito
- ✅ `agent_brief`: Análisis completo del LLM
- ✅ `state`: Estado actualizado con cooldowns corregidos
- ✅ `merge_key`: 33 (ambos lo tienen, se usa el de Input 1)

**Diferencia clave state vs state_base:**
```javascript
// state (desde Filter Output):
state.cooldowns.addressee_ask_ts = "2025-10-31T14:16:42.000Z" // ✅ Corregido

// state_base (desde SnapshotBaseline):
state_base.cooldowns.addressee_ask_ts = null // ⚓ Original

// Diferencia detectada:
// El Filter Output corrigió el cooldown (repair logic cuando assistant preguntó por nombre)
```

**Tamaño total:** ~3-4 KB (profile + state + state_base + agent_brief).

---

## Comparación state vs state_base

### En este ejemplo (greeting + nombre)

| Campo | state (actualizado) | state_base (original) | Cambió? |
|-------|---------------------|------------------------|---------|
| `stage` | "explore" | "explore" | ❌ No |
| `counters.services_seen` | 0 | 0 | ❌ No |
| `counters.prices_asked` | 0 | 0 | ❌ No |
| `counters.deep_interest` | 0 | 0 | ❌ No |
| `interests` | [] | [] | ❌ No |
| `cooldowns.email_ask_ts` | null | null | ❌ No |
| `cooldowns.addressee_ask_ts` | "2025-10-31T14:16:42Z" | null | ✅ **Sí** |

**Único cambio:** `addressee_ask_ts` fue actualizado por Filter Output (repair logic).

---

### Ejemplo con cambios significativos

Si el usuario hubiera preguntado por un servicio:

**Input:**
```
User: "Quiero info del chatbot de WhatsApp"
```

**state (después del Analyst):**
```json
{
  "stage": "match",  // ✅ Cambió (explore → match)
  "counters": {
    "services_seen": 1,  // ✅ +1
    "prices_asked": 0,
    "deep_interest": 1   // ✅ +1
  },
  "interests": ["WhatsApp", "CRM"]  // ✅ Añadidos
}
```

**state_base (snapshot original):**
```json
{
  "stage": "explore",  // ⚓ Original
  "counters": {
    "services_seen": 0,  // ⚓ Original
    "prices_asked": 0,
    "deep_interest": 0   // ⚓ Original
  },
  "interests": []  // ⚓ Original
}
```

**Diff calculation:**
```javascript
{
  stage_transition: "explore → match",
  counters_delta: { services_seen: +1, deep_interest: +1 },
  interests_added: ["WhatsApp", "CRM"]
}
```

---

## Casos de Uso

### 1. Greeting Simple (este caso)

**Escenario:** Usuario saluda y da nombre, no hay cambios significativos de state.

**Resultado del merge:**
- `profile`: Completo (desde SnapshotBaseline)
- `state`: Con cooldown corregido (desde Filter Output)
- `state_base`: Original sin cooldown (desde SnapshotBaseline)
- `agent_brief`: Recommendation exploratorio (desde Filter Output)

**Uso:** Master Agent genera respuesta exploratoria sin consultar RAG (no hay service_target).

---

### 2. Service Selection

**Escenario:** Usuario selecciona servicio "chatbot".

**state actualizado (Filter Output):**
```json
{
  "stage": "match",
  "counters": { "services_seen": 1, "deep_interest": 1 },
  "interests": ["WhatsApp", "CRM"]
}
```

**agent_brief (Filter Output):**
```json
{
  "service_target": {
    "canonical": "WhatsApp Chatbot",
    "bundle": ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
    "rag_hints": ["beneficios de chatbot", "casos de uso whatsapp", ...]
  },
  "recommendation": "INSTRUCCIONES PARA MASTER: Consultar RAG con rag_hints..."
}
```

**Resultado del merge:**
- `state.stage`: "match" (cambió)
- `state_base.stage`: "explore" (original)
- `agent_brief.service_target`: Con rag_hints para consultar RAG
- `agent_brief.recommendation`: Instrucción para Master de consultar RAG

**Uso:** Master Agent consulta RAG con rag_hints, genera respuesta con beneficios del servicio.

---

### 3. Price Request

**Escenario:** Usuario pregunta por precio después de seleccionar servicio.

**state actualizado:**
```json
{
  "stage": "price",
  "counters": { "services_seen": 1, "prices_asked": 1, "deep_interest": 2 }
}
```

**agent_brief:**
```json
{
  "cta_menu": {
    "items": ["Ver precios", "Calcular presupuesto", "Agendar demo", "Solicitar propuesta"]
  }
}
```

**Resultado del merge:**
- `state.stage`: "price" (cambió de match → price)
- `state.counters.prices_asked`: 1 (incrementó)
- `agent_brief.cta_menu`: Con "Calcular presupuesto" en lugar de "Beneficios"

**Uso:** Master Agent genera respuesta con información de precios y CTA para calcular presupuesto.

---

### 4. Auditoría de Cambios

**Escenario:** Post-merge, calcular diff para logging/analytics.

**Code (en nodo posterior):**
```javascript
function calculateDiff(state, state_base) {
  return {
    stage_changed: state.stage !== state_base.stage,
    stage_transition: state.stage !== state_base.stage ? `${state_base.stage} → ${state.stage}` : null,
    counters_delta: {
      services_seen: state.counters.services_seen - state_base.counters.services_seen,
      prices_asked: state.counters.prices_asked - state_base.counters.prices_asked,
      deep_interest: state.counters.deep_interest - state_base.counters.deep_interest
    },
    interests_added: state.interests.filter(i => !state_base.interests.includes(i)),
    interests_removed: state_base.interests.filter(i => !state.interests.includes(i))
  };
}

const diff = calculateDiff($json.state, $json.state_base);
// → { stage_changed: false, counters_delta: {...}, interests_added: [] }
```

**Uso:** Analytics, validación de políticas (counters solo +1, no regresión).

---

## Comparación con Nodos Previos

| Aspecto | Node 40 (HydrateForHistory) | Node 45 (HydrateStateAndContext) |
|---------|------------------------------|-----------------------------------|
| **Función** | Merge history + profile/state | Merge análisis LLM + snapshot baseline |
| **Input 1** | Chat History Filter | Filter Output (análisis LLM) |
| **Input 2** | LoadProfileAndState Salida A | SnapshotBaseline (FLAGS ZONE) |
| **Output** | `{history, lead_id, profile, state}` | `{profile, state, state_base, agent_brief, ok, ...}` |
| **Propósito** | Preparar contexto para Analyst | Preparar contexto para Master Agent |
| **Timing** | Temprano (antes de Analyst) | Tarde (después de Analyst) |
| **Complejidad** | Simple (2 inputs, similar estructura) | Compleja (2 inputs, diferentes estructuras) |

**Progresión de merges:**

1. **Node 40 (HydrateForHistory):** Merge history + profile/state → para Analyst
2. **Node 45 (HydrateStateAndContext):** Merge análisis + snapshot → para Master Agent

---

## Performance

### Métricas Estimadas

| Métrica | Valor |
|---------|-------|
| **Execution time** | ~5-10ms (merge nativo n8n) |
| **Input 1 size** | ~1.5-2 KB (agent_brief + state) |
| **Input 2 size** | ~2-3 KB (profile + state + state_base) |
| **Output size** | ~3-4 KB (combinación) |
| **Memory usage** | Bajo (~3 MB) |
| **Waiting time** | ~2980ms (espera que Flujo A termine) |

**Breakdown:**
- Merge operation: 5-10ms (copia campos, deep merge)
- No hay lógica custom (solo merge nativo)

**Optimización:**
- Merge es O(n) donde n = número de campos totales (~30-40 campos)
- Deep merge recursivo agrega complejidad pero es manejable

---

## Mejoras Propuestas

### 1. Diff Calculation Automático

**Problema:** Diff entre state y state_base debe calcularse en nodo posterior.

**Solución:** Agregar nodo Code post-merge que calcula diff:

```javascript
// Diff Calculator node
const diff = {
  stage_transition: $json.state.stage !== $json.state_base.stage ? `${$json.state_base.stage} → ${$json.state.stage}` : null,
  counters_delta: {
    services_seen: $json.state.counters.services_seen - $json.state_base.counters.services_seen,
    prices_asked: $json.state.counters.prices_asked - $json.state_base.counters.prices_asked,
    deep_interest: $json.state.counters.deep_interest - $json.state_base.counters.deep_interest
  },
  interests_added: $json.state.interests.filter(i => !$json.state_base.interests.includes(i))
};

return [{ json: { ...$json, state_diff: diff } }];
```

**Beneficio:** Centraliza cálculo de diff, facilita auditoría.

---

### 2. Validation Post-Merge

**Problema:** No valida que merge fue exitoso (ambos inputs presentes).

**Solución:** Agregar validación:

```javascript
// Post-merge validation
if (!$json.agent_brief) {
  throw new Error("[HydrateStateAndContext] Missing agent_brief from Filter Output");
}
if (!$json.state_base) {
  throw new Error("[HydrateStateAndContext] Missing state_base from SnapshotBaseline");
}
if (!$json.profile) {
  throw new Error("[HydrateStateAndContext] Missing profile from SnapshotBaseline");
}
```

**Beneficio:** Detecta errores tempranos si algún flujo falló.

---

### 3. Merge Metadata

**Problema:** No hay visibilidad sobre qué vino de cada input.

**Solución:** Agregar metadata:

```javascript
return [{
  json: {
    ...$json,
    _merge_meta: {
      input1_source: "Filter Output (Node 43)",
      input2_source: "SnapshotBaseline (Node 44)",
      merged_at: new Date().toISOString(),
      fields_from_input1: ["ok", "agent_brief", "state"],
      fields_from_input2: ["profile", "state_base", "state_base_meta", "history", "options", "rules"]
    }
  }
}];
```

**Beneficio:** Debugging, auditoría.

---

### 4. Schema Validation Post-Merge

**Problema:** Output puede tener campos faltantes si merge falló.

**Solución:** Usar Zod para validar schema:

```javascript
const outputSchema = z.object({
  profile: z.object({ lead_id: z.number() }),
  state: z.object({ stage: z.string(), counters: z.object({}) }),
  state_base: z.object({ stage: z.string() }),
  agent_brief: z.object({ recommendation: z.string() }),
  ok: z.boolean()
});

const result = outputSchema.safeParse($json);
if (!result.success) {
  throw new Error(`Invalid merge output: ${result.error}`);
}
```

**Beneficio:** Garantiza que Master Agent recibe datos completos.

---

### 5. Conditional Merge (solo si ok=true)

**Problema:** Si Filter Output falló (ok=false), no debería hacer merge.

**Solución:** Agregar nodo condicional pre-merge:

```yaml
IF node: $json.ok === true
  → Sí: Continuar a HydrateStateAndContext
  → No: Error node (no hacer merge, enviar error a Chatwoot)
```

**Beneficio:** Evita procesar datos inválidos.

---

### 6. Telemetry de Timing

**Problema:** No hay visibilidad sobre cuánto tiempo esperó cada flujo.

**Solución:** Agregar timestamps en cada nodo y calcular deltas:

```javascript
// En cada nodo:
out._timing = {
  node_name: "FilterOutput",
  started_at: Date.now()
};

// Post-merge:
const timing = {
  filter_output_completed: $json._timing_input1?.started_at,
  snapshot_baseline_completed: $json._timing_input2?.started_at,
  merge_started: Date.now(),
  flow_a_duration: merge_started - filter_output_completed,
  flow_b_duration: merge_started - snapshot_baseline_completed
};
```

**Beneficio:** Analytics de performance, identificación de bottlenecks.

---

## Referencias

### Nodos Previos
- [Node 43: Filter Output](43-filter-output.md) → Provee agent_brief + state actualizado (Input 1)
- [Node 44: SnapshotBaseline](44-snapshot-baseline.md) → Provee profile + state_base (Input 2)
- [Node 40: HydrateForHistory](40-hydrate-for-history.md) → Merge similar pero temprano (para Analyst)

### Nodos Siguientes
- **Master Agent Node** (pendiente documentación) → Consume merged context y genera respuesta final
- **RAG Query Node** (pendiente) → Si service_target tiene rag_hints, consulta Qdrant

### Arquitectura
- **FLAGS ZONE** → Node 44 (SnapshotBaseline) es el único nodo documentado de esta zona
- **Fork-Join Pattern** → Dos flujos paralelos (Analysis + FLAGS) se unen aquí
- [ETAPA 4: Update Flow - Resumen](resumen-etapa-4.md) (pendiente crear)

---

## Notas Finales

**HydrateStateAndContext** es el **punto de convergencia crítico** que reúne todo el contexto necesario para el Master Agent:

1. **Análisis del LLM** (agent_brief) → Qué hacer, qué decir
2. **Estado actualizado** (state) → Stage transitions, counters incrementados
3. **Estado baseline** (state_base) → Snapshot original para comparación
4. **Profile completo** (profile) → Datos del lead desde Baserow
5. **Contexto vacío** (history, options, rules) → Placeholder para schema consistency

**Patrón arquitectónico:** **Fork-Join Pattern** - Los dos flujos paralelos (Analysis + FLAGS) se ejecutan independientemente y luego se unen.

**Trade-offs:**
- **Pro:** Paralelismo (FLAGS ZONE se ejecuta mientras Analyst analiza)
- **Pro:** Separación de concerns (Analysis vs Flags/Snapshots)
- **Pro:** state_base disponible para auditoría/rollback
- **Contra:** Complejidad arquitectónica (2 flujos paralelos)
- **Contra:** Waiting time (FLAGS espera ~2980ms a que Analysis termine)

**Importancia crítica:** Sin este merge, el Master Agent NO tendría:
- ❌ El analysis del LLM (agent_brief)
- ❌ El snapshot baseline (state_base)
- ❌ El profile completo (profile)

El output de este nodo es **el contexto completo** que el Master Agent necesita para generar la respuesta final.

**Próximo nodo:** **Master Agent** - consume este merged context, potencialmente consulta RAG si hay service_target.rag_hints, y genera la respuesta final en texto para el usuario.
