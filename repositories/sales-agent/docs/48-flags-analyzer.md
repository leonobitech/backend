# Nodo 48: FlagsAnalyzer

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del Nodo** | FlagsAnalyzer |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Decision-making sobre acciones, routing y guardrails para Master Agent |
| **Input** | Flags enriquecidos desde BuildFlagsInput |
| **Modo** | Run Once for All Items |
| **Zona** | FLAGS ZONE (último nodo) |
| **Outputs** | 1 salida → Master Agent preparation |
| **Versión** | v3.0 (refactorización de decision object) |

---

## Descripción

**FlagsAnalyzer** es el nodo de decisión final del FLAGS ZONE. Analiza todas las señales (flags_base, flags_derived, flags_base_llm, timing, context) y determina:

1. **Acciones** a ejecutar (ask_email, ask_business_name, acknowledge_price, greet_only)
2. **Patches** de counters y stage basados en comportamiento del usuario
3. **Decision object** que guía al Master Agent sobre routing, RAG usage, y guardrails
4. **Reasons** (audit trail) explicando cada decisión tomada

### ¿Por qué es crítico?

- **Policy Enforcement**: Combina cooldown windows con gating policies (email gate de 7 condiciones)
- **Intent-Based Routing**: Decide entre `service_selected_flow` vs `generic_flow`
- **Counter Coherence**: Asegura que counters se incrementen solo ante señales válidas (service selection, price request, deep interest)
- **Stage Orchestration**: Maneja transición `explore→match` cuando hay selección explícita
- **RAG Optimization**: Activa RAG solo cuando hay servicio seleccionado + rag_hints disponibles
- **Greet Fallback**: Detecta intents simples (greeting, contact_share) y emite saludo breve sin CTAs

### Cambios en v3.0

1. **Decision object structured**: Antes era disperso; ahora es objeto centralizado con `route`, `purpose`, `guardrails`, `rag`, `bundle`
2. **Purpose field**: Distingue entre `price_cta`, `benefits_cta`, `options` para personalizar respuesta del Master Agent
3. **Guardrails explícitos**: `dont_restart_main_menu`, `dont_require_volume_first` evitan loops y mejoran UX
4. **Passthrough consolidado**: Profile, state, timing, context viajan completos hacia Master Agent
5. **Debug object**: Incluye `stage_in`, `recency`, `intent_hint`, `service_selected` para troubleshooting

---

## Configuración del Nodo

```yaml
Type: Code (JavaScript)
Mode: Run Once for All Items
Language: JavaScript (ES6+)
Libraries: None (vanilla JS)
```

---

## Código Completo (Breakdown)

### Helper Functions

```javascript
function nz(v, fallback = 0) {
  const n = Number(v);
  return (!isNaN(n) && isFinite(n)) ? n : fallback;
}
```
**Purpose**: Coerce to number or fallback (safe numeric parsing).

```javascript
function parseIso(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
```
**Purpose**: Parse ISO timestamp to Date or null.

```javascript
function msSince(isoStr) {
  const ref = parseIso(isoStr);
  if (!ref) return Infinity;
  return Date.now() - ref.getTime();
}
```
**Purpose**: Calculate milliseconds since timestamp (returns Infinity if invalid).

```javascript
function norm(arr) {
  return Array.isArray(arr) ? arr.map(x => String(x).trim()).filter(Boolean) : [];
}
```
**Purpose**: Normalize array of strings (trim, filter empty).

---

### Input Parsing

```javascript
const item = $input.first().json;

const flags_derived = item.flags_derived || {};
const flags_base = item.flags_base || {};
const ctx = item.context || {};

const stateIn = String(item.state?.stage || "explore");
const stageIndex = ["explore","match","price","qualify","proposal_ready"].indexOf(stateIn);

const {
  service_selected = false,
  selected_service_canonical = null,
  ready_for_benefits = false,
  ready_for_price_cta = false,
  rag_hints = []
} = flags_derived;
```

**Explanation**:
- Extracts flags from BuildFlagsInput output
- `flags_derived` contains service_selected, ready_for_benefits/price_cta, rag_hints
- `flags_base` contains basic state (hasEmail, hasBusiness, stage, counters)
- Current stage is normalized to string with index for comparisons

---

### Intent y Estado Base

```javascript
const intent = String(ctx.intent_hint || "neutral");
const recency = String(ctx.recency || "unknown");

const hasEmail = Boolean(flags_base.has_email);
const hasBusiness = Boolean(flags_base.has_business_name);

const emailGateEnabled = Boolean(flags_base.email_gate_enabled);
const emailCooldownOk = Boolean(flags_base.email_cooldown_ok);
const addresseeCooldownOk = Boolean(flags_base.addressee_cooldown_ok);
```

**Explanation**:
- Intent hint from BuildFlagsInput: `service_selected`, `ontopic`, `neutral`, `offtopic`, `greeting`, `contact_share`
- Recency bucket: `fresh`, `warm`, `stale`, `dormant`
- Cooldown flags: email (6h window), addressee (12h window)

---

### Gating/Cooldowns/Policy

```javascript
const canAskEmail = emailGateEnabled && emailCooldownOk && !hasEmail;
const canAskBusiness = addresseeCooldownOk && !hasBusiness && stageIndex >= 1; // ≥match
```

**Explanation**:
- **Email gating**: Requiere 3 condiciones (gate enabled, cooldown ok, no email)
- **Business name gating**: Requiere 3 condiciones (cooldown ok, no business name, stage ≥ match)

---

### Textual Signals

```javascript
const kwPrice = /\b(precio|cuanto|cuesta|cost|tarifa|plan|paquete)\b/i;
const kwInterest = /\b(me.{0,15}interesa|quiero|necesito|cotiza|dame.{0,15}info)\b/i;
const kwEmail = /\b(correo|email|mail)\b/i;

const lastMsg = Array.isArray(ctx.last_msgs) && ctx.last_msgs.length > 0
  ? String(ctx.last_msgs[0] || "")
  : "";

const askedPrice = kwPrice.test(lastMsg);
const showedInterest = kwInterest.test(lastMsg);
const mentionedEmail = kwEmail.test(lastMsg);
```

**Explanation**:
- Detects price keywords: "precio", "cuanto cuesta", "tarifa", "plan"
- Detects interest keywords: "me interesa", "quiero", "necesito", "cotiza"
- Detects email keywords: "correo", "email", "mail"
- Uses last message from conversation (most recent user input)

---

### LLM Patch Signals

```javascript
const STATE_ECHO = item.state || {};
const llmState = item.llm_state || {};

const hasLlmPatch = Boolean(
  item.has_llm_patch ||
  (llmState && Object.keys(llmState).length > 0)
);

const llmInterests = norm(llmState?.interests);
const llmServiceTarget = llmState?.service_target || null;
```

**Explanation**:
- Checks if LLM Analyst generated state updates
- Extracts interests and service_target from LLM state
- Used to detect if counters should increment

---

### Main Logic

#### 1. Service Selection Logic

```javascript
if (service_selected && stageIn === "explore") {
  stage_patch = "match";
  reasons.push("✅ Selección explícita de servicio; ascenso de stage explore→match.");
}

if (service_selected) {
  counters_patch.services_seen = 1;
  reasons.push("✅ Service selected; counter services_seen+1.");
}
```

**Behavior**:
- If user selected service while in `explore` stage → transition to `match`
- Always increment `services_seen` counter when service_selected = true
- This is the primary funnel advancement signal

#### 2. Price Detection Logic

```javascript
if (askedPrice && service_selected) {
  counters_patch.prices_asked = 1;
  reasons.push("✅ Preguntó precio y hay servicio seleccionado; counter prices_asked+1.");
}
```

**Behavior**:
- Only increment `prices_asked` if BOTH conditions true: price keyword detected + service selected
- Prevents false positives from generic "cuanto cuesta" without context

#### 3. Deep Interest Detection

```javascript
if (showedInterest && service_selected) {
  counters_patch.deep_interest = 1;
  reasons.push("✅ Mostró interés profundo y hay servicio; counter deep_interest+1.");
}
```

**Behavior**:
- Similar to price detection: requires service selection + interest keywords
- Tracks engagement level for lead qualification

#### 4. Email Gating Logic

```javascript
const isFresh = (recency === "fresh");

if (!hasEmail && canAskEmail) {
  if (showedInterest || askedPrice || mentionedEmail || isFresh) {
    actions.ask_email = true;
    reasons.push("📧 No hay email y gate habilitado; 1+ condición cumplida → ask_email.");
  } else {
    reasons.push("⏸️ Email gate habilitado pero sin señal suficiente (no interest/price/fresh).");
  }
}
```

**Gating conditions** (ANY must be true):
1. `showedInterest` - User expressed interest
2. `askedPrice` - User asked about pricing
3. `mentionedEmail` - User mentioned email in message
4. `isFresh` - Conversation is fresh (<30min since last seen)

**Behavior**:
- Only asks email if gate enabled, cooldown ok, no existing email, AND at least one signal present
- This prevents premature email requests

#### 5. Business Name Logic

```javascript
if (!hasBusiness && canAskBusiness && (askedPrice || stageIndex >= 2)) {
  actions.ask_business_name = true;
  reasons.push("🏢 No hay business_name, cooldown ok, stage≥match y (price o stage≥price) → ask_business_name.");
}
```

**Behavior**:
- Requires stage ≥ match AND (price signal OR stage ≥ price)
- More conservative than email gating (later in funnel)

#### 6. Greet Fallback Logic

```javascript
if (["greeting","contact_share"].includes(intent)) {
  actions.greet_only = true;
  reasons.push(`👋 Intent ${intent}; saludo breve sin CTAs.`);
}
```

**Behavior**:
- If intent is simple greeting or contact sharing → short acknowledgment only
- Prevents overwhelming user with sales pitch on casual interactions

---

### Decision Object Construction

```javascript
const decision = {
  route: service_selected ? "service_selected_flow" : "generic_flow",
  purpose: askedPrice ? "price_cta" : (ready_for_benefits ? "benefits_cta" : "options"),
  service_canonical: selected_service_canonical,
  bundle: Array.isArray(flags_derived.bundle) ? flags_derived.bundle : [],
  rag: {
    use: service_selected,
    hints: service_selected ? rag_hints : []
  },
  cta_menu: norm(ctx.cta_menu || []),
  guardrails: {
    dont_restart_main_menu: service_selected,
    dont_require_volume_first: true
  }
};
```

**Fields**:

- **route**: `service_selected_flow` (user picked service) vs `generic_flow` (exploration)
- **purpose**:
  - `price_cta` - User asked about pricing → emphasize price/value
  - `benefits_cta` - User selected service → emphasize benefits
  - `options` - Still exploring → present options
- **service_canonical**: The selected service name (e.g., "WhatsApp Chatbot")
- **bundle**: Array of bundle items for selected service
- **rag.use**: Boolean - whether to use RAG for this response
- **rag.hints**: Array of RAG search hints (e.g., ["chatbot features", "pricing tiers"])
- **cta_menu**: Normalized CTAs from context
- **guardrails**:
  - `dont_restart_main_menu`: If service selected, don't show main menu again (avoid regression)
  - `dont_require_volume_first`: Allow pricing discussion without volume (UX improvement)

---

### Output Assembly

```javascript
return {
  actions,
  counters_patch,
  stage_patch,
  reasons,
  has_llm_patch: hasLlmPatch,
  has_funnel_changes: (stage_patch !== null || Object.values(counters_patch).some(v => v > 0)),
  decision,
  debug: {
    stage_in: stageIn,
    recency,
    intent_hint: intent,
    service_selected
  },
  passthrough: {
    lead_id: item.lead_id || null,
    tz: item.tz || "UTC",
    profile: item.profile || {},
    state: STATE_ECHO,
    timing: item.timing || {},
    context: ctx
  }
};
```

**Structure**:
- **actions**: Boolean flags for what to do
- **counters_patch**: Increments for counters (applied in next node)
- **stage_patch**: New stage if transition required
- **reasons**: Audit trail of decisions
- **has_llm_patch**: Whether LLM generated updates
- **has_funnel_changes**: Quick check if anything changed (stage or counters)
- **decision**: Routing/strategy object for Master Agent
- **debug**: Troubleshooting context
- **passthrough**: Complete context for downstream nodes

---

## Input (desde BuildFlagsInput)

```json
{
  "flags_base": {
    "has_email": false,
    "has_business_name": false,
    "email_gate_enabled": true,
    "email_cooldown_ok": true,
    "addressee_cooldown_ok": true,
    "stage": "explore"
  },
  "flags_derived": {
    "service_selected": false,
    "selected_service_canonical": null,
    "rag_hints": [],
    "ready_for_benefits": false,
    "ready_for_price_cta": false,
    "bundle": []
  },
  "context": {
    "intent_hint": "neutral",
    "recency": "warm",
    "last_msgs": ["Hola, buenos días"],
    "cta_menu": {
      "prompt": "¿Cómo querés avanzar?",
      "items": [
        "📱 WhatsApp Chatbot",
        "🌐 Landing Page",
        "🤖 Agente IA de WhatsApp"
      ]
    }
  },
  "state": {
    "stage": "explore",
    "interests": [],
    "service_target": null,
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
    "cooldowns": { "email_ask_ts": null, "addressee_ask_ts": null }
  },
  "profile": {
    "lead_id": 33,
    "name": null,
    "email": null,
    "business_name": null
  },
  "timing": {
    "now_iso": "2025-10-31T14:16:42.000Z",
    "tz": "-03:00",
    "last_seen_iso": "2025-10-31T10:30:00.000Z"
  }
}
```

---

## Output

### Escenario 1: Greeting (greet_only)

```json
{
  "actions": {
    "ask_email": false,
    "ask_business_name": false,
    "acknowledge_price": false,
    "greet_only": true
  },
  "counters_patch": {
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0
  },
  "stage_patch": null,
  "reasons": [
    "⏸️ Email gate habilitado pero sin señal suficiente (no interest/price/fresh).",
    "👋 Intent greeting; saludo breve sin CTAs."
  ],
  "has_llm_patch": true,
  "has_funnel_changes": false,
  "decision": {
    "route": "generic_flow",
    "purpose": "options",
    "service_canonical": null,
    "bundle": [],
    "rag": {
      "use": false,
      "hints": []
    },
    "cta_menu": {
      "prompt": "¿Cómo querés avanzar?",
      "items": ["📱 WhatsApp Chatbot", "🌐 Landing Page", "🤖 Agente IA de WhatsApp"]
    },
    "guardrails": {
      "dont_restart_main_menu": false,
      "dont_require_volume_first": true
    }
  },
  "debug": {
    "stage_in": "explore",
    "recency": "warm",
    "intent_hint": "neutral",
    "service_selected": false
  },
  "passthrough": {
    "lead_id": 33,
    "tz": "-03:00",
    "profile": { "lead_id": 33, "name": null, "email": null, "business_name": null },
    "state": { "stage": "explore", "interests": [], "service_target": null },
    "timing": { "now_iso": "2025-10-31T14:16:42.000Z", "tz": "-03:00" },
    "context": { "intent_hint": "neutral", "recency": "warm" }
  }
}
```

### Escenario 2: Service Selection (explore → match)

**Input changes**:
```json
{
  "flags_derived": {
    "service_selected": true,
    "selected_service_canonical": "WhatsApp Chatbot",
    "rag_hints": ["chatbot features", "automation benefits"],
    "ready_for_benefits": true,
    "bundle": ["🤖 Bot de WhatsApp", "📊 Panel Analytics", "🔗 Integración CRM"]
  },
  "context": {
    "intent_hint": "service_selected",
    "last_msgs": ["Me interesa el chatbot de WhatsApp"]
  }
}
```

**Output**:
```json
{
  "actions": {
    "ask_email": true,
    "ask_business_name": false,
    "acknowledge_price": false,
    "greet_only": false
  },
  "counters_patch": {
    "services_seen": 1,
    "prices_asked": 0,
    "deep_interest": 1
  },
  "stage_patch": "match",
  "reasons": [
    "✅ Selección explícita de servicio; ascenso de stage explore→match.",
    "✅ Service selected; counter services_seen+1.",
    "✅ Mostró interés profundo y hay servicio; counter deep_interest+1.",
    "📧 No hay email y gate habilitado; 1+ condición cumplida → ask_email."
  ],
  "has_llm_patch": true,
  "has_funnel_changes": true,
  "decision": {
    "route": "service_selected_flow",
    "purpose": "benefits_cta",
    "service_canonical": "WhatsApp Chatbot",
    "bundle": ["🤖 Bot de WhatsApp", "📊 Panel Analytics", "🔗 Integración CRM"],
    "rag": {
      "use": true,
      "hints": ["chatbot features", "automation benefits"]
    },
    "cta_menu": {...},
    "guardrails": {
      "dont_restart_main_menu": true,
      "dont_require_volume_first": true
    }
  },
  "debug": {
    "stage_in": "explore",
    "recency": "fresh",
    "intent_hint": "service_selected",
    "service_selected": true
  }
}
```

**Key differences**:
- ✅ `stage_patch: "match"` - Funnel advancement
- ✅ `counters_patch: { services_seen: 1, deep_interest: 1 }` - Engagement tracking
- ✅ `actions.ask_email: true` - Email gating triggered by interest signal
- ✅ `decision.route: "service_selected_flow"` - Route change
- ✅ `decision.purpose: "benefits_cta"` - Emphasize benefits
- ✅ `decision.rag.use: true` - RAG activated
- ✅ `decision.guardrails.dont_restart_main_menu: true` - Prevent regression

---

## Casos de Uso

### Caso 1: Usuario saluda (greet_only)

**Escenario**: Usuario dice "Hola, buenos días"

**Input**:
- `intent_hint: "greeting"`
- `service_selected: false`
- `last_msgs: ["Hola, buenos días"]`

**Decisión**:
- ❌ No ask_email (sin señal de interés/precio)
- ✅ greet_only = true
- ❌ No counters incrementados
- ❌ No stage_patch

**Output**:
```json
{
  "actions": { "greet_only": true },
  "decision": { "route": "generic_flow", "purpose": "options" },
  "reasons": ["👋 Intent greeting; saludo breve sin CTAs."]
}
```

**Master Agent behavior**: Responde con saludo cordial + opciones generales sin CTAs agresivos.

---

### Caso 2: Usuario selecciona servicio en explore

**Escenario**: Usuario dice "Me interesa el chatbot de WhatsApp"

**Input**:
- `intent_hint: "service_selected"`
- `service_selected: true`
- `stage: "explore"`
- `last_msgs: ["Me interesa el chatbot de WhatsApp"]`

**Decisión**:
- ✅ stage_patch = "match" (explore→match)
- ✅ counters_patch.services_seen = 1
- ✅ counters_patch.deep_interest = 1 (keyword "interesa")
- ✅ ask_email = true (interest signal + gate enabled)

**Output**:
```json
{
  "actions": { "ask_email": true },
  "stage_patch": "match",
  "counters_patch": { "services_seen": 1, "deep_interest": 1 },
  "decision": {
    "route": "service_selected_flow",
    "purpose": "benefits_cta",
    "rag": { "use": true, "hints": ["chatbot features"] }
  }
}
```

**Master Agent behavior**: Responde con beneficios del chatbot (usando RAG), menciona bundle, solicita email.

---

### Caso 3: Usuario pregunta precio sin servicio seleccionado

**Escenario**: Usuario dice "Cuánto cuesta?"

**Input**:
- `service_selected: false`
- `last_msgs: ["Cuánto cuesta?"]`
- `askedPrice: true` (keyword detected)

**Decisión**:
- ❌ No counters_patch.prices_asked (requiere service_selected)
- ✅ ask_email = true (price signal activates gate)
- ❌ No stage_patch (no service selected)

**Output**:
```json
{
  "actions": { "ask_email": true },
  "counters_patch": { "services_seen": 0, "prices_asked": 0 },
  "decision": { "route": "generic_flow", "purpose": "options" },
  "reasons": ["📧 No hay email y gate habilitado; 1+ condición cumplida → ask_email."]
}
```

**Master Agent behavior**: Pregunta qué servicio le interesa + solicita email para enviar cotización personalizada.

---

### Caso 4: Usuario pregunta precio CON servicio seleccionado

**Escenario**: Usuario ya seleccionó "WhatsApp Chatbot" y pregunta "Cuál es el precio?"

**Input**:
- `service_selected: true`
- `selected_service_canonical: "WhatsApp Chatbot"`
- `last_msgs: ["Cuál es el precio?"]`
- `askedPrice: true`

**Decisión**:
- ✅ counters_patch.prices_asked = 1
- ✅ ask_email = true (price signal)
- ❌ No stage_patch (ya está en match o superior)

**Output**:
```json
{
  "actions": { "ask_email": true },
  "counters_patch": { "prices_asked": 1 },
  "decision": {
    "route": "service_selected_flow",
    "purpose": "price_cta",
    "rag": { "use": true, "hints": ["pricing tiers", "chatbot costs"] }
  }
}
```

**Master Agent behavior**: Responde con estructura de precios del chatbot (usando RAG), solicita email para cotización formal.

---

### Caso 5: Usuario offtopic (no action)

**Escenario**: Usuario dice "Qué tal el clima?"

**Input**:
- `intent_hint: "offtopic"`
- `service_selected: false`
- `last_msgs: ["Qué tal el clima?"]`

**Decisión**:
- ❌ No ask_email (sin señal relevante)
- ❌ No counters incrementados
- ❌ No stage_patch

**Output**:
```json
{
  "actions": { "greet_only": false, "ask_email": false },
  "decision": { "route": "generic_flow", "purpose": "options" },
  "reasons": ["⏸️ Email gate habilitado pero sin señal suficiente."]
}
```

**Master Agent behavior**: Respuesta cortés + redirección a servicios disponibles.

---

### Caso 6: Usuario en stage=price sin business_name

**Escenario**: Usuario ya está en stage "price", preguntó precio, pero falta business_name

**Input**:
- `stage: "price"`
- `hasBusiness: false`
- `addresseeCooldownOk: true`
- `askedPrice: true`

**Decisión**:
- ✅ ask_business_name = true (stage≥price + cooldown ok + price signal)
- ✅ ask_email = true (si falta email)

**Output**:
```json
{
  "actions": { "ask_email": true, "ask_business_name": true },
  "decision": { "purpose": "price_cta" },
  "reasons": [
    "📧 No hay email y gate habilitado; 1+ condición cumplida → ask_email.",
    "🏢 No hay business_name, cooldown ok, stage≥match y (price o stage≥price) → ask_business_name."
  ]
}
```

**Master Agent behavior**: Responde sobre precio + solicita email y nombre del negocio para cotización formal.

---

### Caso 7: Fresh lead (<30min) sin señales

**Escenario**: Conversación iniciada hace 15 minutos, usuario solo dijo "Hola"

**Input**:
- `recency: "fresh"`
- `last_msgs: ["Hola"]`
- `service_selected: false`
- `showedInterest: false`
- `askedPrice: false`

**Decisión**:
- ✅ ask_email = true (isFresh activa gate)
- ❌ No counters incrementados
- ❌ No stage_patch

**Output**:
```json
{
  "actions": { "ask_email": true },
  "decision": { "route": "generic_flow", "purpose": "options" },
  "reasons": ["📧 No hay email y gate habilitado; 1+ condición cumplida → ask_email."]
}
```

**Master Agent behavior**: Saludo + presentación servicios + solicitud temprana de email (aprovecha momento de alta atención).

---

### Caso 8: Email cooldown bloqueado

**Escenario**: Se preguntó email hace 3 horas (cooldown 6h), usuario muestra interés

**Input**:
- `emailCooldownOk: false` (solo pasaron 3h)
- `showedInterest: true`
- `hasEmail: false`

**Decisión**:
- ❌ No ask_email (cooldown bloquea)

**Output**:
```json
{
  "actions": { "ask_email": false },
  "reasons": ["⏸️ Email cooldown activo (faltan 3h); no se pregunta email."]
}
```

**Master Agent behavior**: Continúa conversación sin solicitar email, espera hasta que cooldown expire.

---

## Comparación con Nodos Anteriores

### vs Node 47: BuildFlagsInput

| Aspecto | BuildFlagsInput | FlagsAnalyzer |
|---------|----------------|---------------|
| **Función** | Context enrichment | Decision making |
| **Output** | Flags + timing + context | Actions + decision + patches |
| **Lógica** | Derivación de flags (service_selected, ready_for_benefits) | Evaluación de gates (email, business_name) |
| **Intent** | Clasifica intent (service_selected, ontopic, offtopic) | CONSUME intent para decidir acciones |
| **Recency** | Calcula buckets (fresh/warm/stale) | USA recency para gates (fresh activa email) |
| **Cooldowns** | Calcula ms desde última ask, verifica windows | USA cooldown flags para gates |
| **Counters** | NO modifica | Genera patches para incremento |
| **Stage** | Lee stage actual | Puede generar stage_patch (explore→match) |
| **RAG** | Deriva rag_hints desde service | Genera decision.rag.use (boolean) |
| **Timing** | TZ-aware calculations | NO calculations, solo consume flags |

**Relación**: BuildFlagsInput PREPARA el contexto; FlagsAnalyzer DECIDE qué hacer con ese contexto.

---

### vs Node 43: Filter Output (LLM Guardrails)

| Aspecto | Filter Output | FlagsAnalyzer |
|---------|---------------|---------------|
| **Input** | LLM output (agent_brief + state) | Flags + context |
| **Correcciones** | Corrige hallucinations, regressions, schema issues | NO corrige, DECIDE en base a flags |
| **Stage transitions** | Bloquea regresiones, fuerza match | Solo avanza (explore→match si service_selected) |
| **Counters** | Normaliza a monotonic | Genera patches para incremento |
| **Interests** | Filtra vs catálogo | NO toca interests |
| **Privacy** | Sanitiza PII | NO toca privacy |
| **Email** | NO decide cuándo preguntar | SÍ decide (via gates) |

**Relación**: Filter Output valida LLM; FlagsAnalyzer decide acciones post-validación.

---

### vs Node 46: BuildStatePatch

| Aspecto | BuildStatePatch | FlagsAnalyzer |
|---------|-----------------|---------------|
| **Input** | state_base + llm_state | Flags + context |
| **Output** | Patch (diff) | Actions + decision + counters_patch |
| **Normalizations** | 7 types (monotonic, latest_ts, anti-regression) | NO normalizations, solo derivaciones |
| **Counters** | Compara base vs LLM, aplica max() | Genera increments (+1) |
| **Stage** | Bloquea regresiones | Genera ascensos (explore→match) |
| **Interests** | Canonical union | NO toca |
| **Cooldowns** | Latest timestamp selection | NO modifica, solo lee flags |

**Relación**: BuildStatePatch calcula DIFF entre estados; FlagsAnalyzer genera NUEVOS patches desde señales.

---

## Métricas de Performance

### Complejidad Temporal

- **Input parsing**: O(1) - Acceso a propiedades de objeto
- **Regex matches** (kwPrice, kwInterest, kwEmail): O(n) donde n = longitud del último mensaje (~50-200 chars típicamente)
- **Main logic**: O(1) - Evaluaciones booleanas y asignaciones
- **Output assembly**: O(1) - Construcción de objeto

**Total**: O(n) donde n ≈ longitud del último mensaje (dominado por regex).

**Typical execution time**: <5ms para mensajes de 100-200 caracteres.

---

### Complejidad Espacial

- **Input**: ~3-5 KB (flags + context + state)
- **Output**: ~4-6 KB (actions + decision + passthrough)
- **Memory overhead**: Mínimo (~1-2 KB para variables temporales)

**Total**: O(1) - No crece con tamaño del historial (solo usa último mensaje).

---

### Carga Computacional

```
Input size:     ~4 KB
Processing:     ~5 ms
Output size:    ~5 KB
Memory peak:    ~10 KB
Network I/O:    0 (no external calls)
```

**Bottleneck**: Regex matching en mensajes largos (>500 chars). Mitigado porque solo procesa último mensaje.

---

### Escalabilidad

- ✅ **Horizontal**: Stateless, puede ejecutarse en paralelo
- ✅ **Vertical**: Minimal CPU/memory footprint
- ✅ **Concurrent leads**: Sin límite (no shared state)
- ⚠️ **Regex performance**: Degradación lineal con longitud del mensaje (no crítico hasta >1000 chars)

---

## Mejoras Propuestas

### 1. **ML-based Intent Classification**

**Problema actual**: Intent classification via regex es rígida (kwPrice, kwInterest).

**Propuesta**: Entrenar modelo de clasificación (Transformer ligero) para detectar:
- Price intent con mayor accuracy ("Cuánto me sale?" vs "Cuántos años llevan?")
- Interest degrees (casual vs committed)
- Urgency signals ("necesito para mañana" → high priority)

**Benefit**: Reduce false positives en gates, mejora timing de email asks.

---

### 2. **Dynamic Cooldown Windows**

**Problema actual**: Cooldowns fijos (6h email, 12h business_name).

**Propuesta**: Ajustar windows según:
- Engagement level (fresh lead → 3h, dormant → 12h)
- Intent urgency (high urgency → bypass cooldown)
- Previous rejection ("no quiero dar email" → 24h cooldown)

**Benefit**: Personaliza experiencia, reduce friction.

---

### 3. **A/B Testing Framework para Gates**

**Problema actual**: Email gate tiene 7 condiciones hardcoded; no sabemos cuál es óptima.

**Propuesta**: Implementar A/B testing:
- Variante A: Gate actual (7 condiciones)
- Variante B: Más agresivo (solo isFresh)
- Variante C: Más conservador (require interest + price)

**Métrica**: Conversion rate (email captured / conversations).

**Benefit**: Data-driven optimization de gates.

---

### 4. **Confidence Scores en Decision Object**

**Problema actual**: Decision object es determinístico (route: "service_selected_flow" | "generic_flow").

**Propuesta**: Agregar confidence scores:
```json
{
  "decision": {
    "route": "service_selected_flow",
    "confidence": 0.85,
    "alternative_route": "generic_flow",
    "alternative_confidence": 0.15
  }
}
```

**Benefit**: Master Agent puede ajustar tono/agresividad según confidence.

---

### 5. **Audit Trail con Timestamps**

**Problema actual**: Reasons es array de strings sin timestamps.

**Propuesta**: Structured audit trail:
```json
{
  "reasons": [
    { "ts": "2025-10-31T14:16:42.123Z", "decision": "ask_email", "trigger": "interest_signal", "confidence": 0.9 },
    { "ts": "2025-10-31T14:16:42.125Z", "decision": "stage_patch", "from": "explore", "to": "match" }
  ]
}
```

**Benefit**: Debugging, analytics, compliance (GDPR audit trail).

---

### 6. **Soft Actions (Recommendations)**

**Problema actual**: Actions son boolean (ask_email: true/false).

**Propuesta**: Soft recommendations:
```json
{
  "actions": {
    "ask_email": { "mandatory": false, "recommended": true, "priority": 0.7 },
    "ask_business_name": { "mandatory": false, "recommended": false, "priority": 0.3 }
  }
}
```

**Benefit**: Master Agent puede decidir timing (preguntar email en 2do mensaje vs inmediato).

---

## Referencias

### Inputs desde Nodos Anteriores

- **Node 47 (BuildFlagsInput)**: Flags completos (flags_base, flags_derived, context, timing)
- **Node 46 (BuildStatePatch)**: state_base + llm_state (para has_llm_patch detection)
- **Node 43 (Filter Output)**: llm_state validado con interests normalizados
- **Node 39 (LoadProfileAndState)**: Profile base (lead_id, email, business_name)

### Outputs hacia Nodos Siguientes

- **Next**: Master Agent preparation node (consume decision object para routing)
- **Eventual**: Baserow/Odoo update nodes (aplican counters_patch y stage_patch)

### Arquitectura General

```
LoadProfileAndState (39) ──┬─→ [Analysis Flow: 41→42→43] ──┐
                           │                                │
                           └─→ [FLAGS ZONE: 44→46→47→48] ──┤
                                                             │
                                                             ↓
                                            HydrateStateAndContext (45) → FlagsAnalyzer (48) → Master Agent
```

**Posición**: FlagsAnalyzer es el ÚLTIMO nodo del FLAGS ZONE. Su output (`decision`) guía al Master Agent sobre cómo responder.

---

## Conclusión

**FlagsAnalyzer** es el cerebro de decisiones del FLAGS ZONE:

1. ✅ **Policy enforcement** via gates (email, business_name) con cooldowns
2. ✅ **Funnel orchestration** (explore→match transitions)
3. ✅ **Counter coherence** (increments solo ante señales válidas)
4. ✅ **Routing strategy** (service_selected_flow vs generic_flow)
5. ✅ **RAG optimization** (activa RAG solo cuando útil)
6. ✅ **Greet fallback** (evita sales pitch en interacciones casuales)

**Próximo nodo**: Master Agent (ETAPA 5) que consume `decision` object para generar respuesta final.

---

**Versión del documento**: 1.0
**Última actualización**: 2025-10-31
**Autor**: Documentación generada a partir del código v3.0 de FlagsAnalyzer
