# Nodo 49: AgentInput+Flags+InputMain

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del Nodo** | AgentInput+Flags+InputMain |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Preparar input completo para Master Agent con task structure, contracts y user prompt |
| **Input** | Output de FlagsAnalyzer (Node 48) + contexto completo |
| **Modo** | Run Once for All Items |
| **Zona** | ETAPA 5 - Master Agent Preparation |
| **Outputs** | 1 salida → Master Agent (LLM GPT-4) |
| **Versión** | v5.3 (full task structure + fallbacks dinámicos) |

---

## Descripción

**AgentInput+Flags+InputMain** es el **último nodo de preparación** antes del Master Agent (LLM final). Su función es consolidar TODO el contexto acumulado (flags, decisions, profile, state, history) y generar:

1. **master_task** (v3.0): Objeto estructurado que define routing, purpose, RAG usage, guardrails
2. **contracts**: Schema esperado del output del Master Agent
3. **userPrompt**: Prompt con formato `<TAGS>` para compatibilidad legacy
4. **Fallbacks dinámicos**: Beneficios por servicio (principal + alternativas)
5. **Alt services detection**: Servicios alternativos detectados desde interests, matched_terms y texto

### ¿Por qué es crítico?

Este nodo es el **traductor final** entre:
- FLAGS ZONE (decisiones, gates, cooldowns) → **master_task structure**
- LLM Analyst output (agent_brief, recommendations) → **user prompt con tags**
- FlagsAnalyzer decisions → **routing strategy y guardrails**

Sin este nodo, el Master Agent recibiría datos dispersos sin estructura clara.

### Cambios en v5.3

1. ✅ **Soporte para flujos sin menú**: `cta_menu` puede ser `null`
2. ✅ **Fallbacks dinámicos por servicio**: Mapeo de beneficios según `service_canonical`
3. ✅ **Alt services detection**: Detecta servicios alternativos desde múltiples fuentes
4. ✅ **Guardrails consolidados**: Unifica gates (email, business_name) en prohibitions
5. ✅ **Contracts condicionales**: Schema de output varía según presencia de menú
6. ✅ **Email extraction multi-source**: Consolida email desde 4 fuentes diferentes

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

### 1. Helper Functions

#### safeParse()
```javascript
function safeParse(o, fallback = {}) {
  if (o == null) return fallback;
  if (typeof o === "object") return o;
  try {
    const s = String(o);
    const m = s.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : s);
  } catch { return fallback; }
}
```

**Propósito**: Parse robusto de JSON (tolera strings mal formados).

**Casos**:
```javascript
safeParse('{"a":1}')        // → {a: 1}
safeParse(null)             // → {}
safeParse('garbage{a:1}')   // → {a: 1} (extrae JSON)
safeParse('bad')            // → {} (fallback)
```

---

#### Normalization Helpers

```javascript
function clamp(s,n){
  s = String(s||"");
  return s.length>n ? s.slice(0,n) + "…" : s;
}

function title(s){
  return String(s||"").toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(De|La|El|Los|Las|Y|Del|Al)\b/g, m => m.toLowerCase())
    .trim();
}

function firstToken(s){
  const t = String(s||"").trim().split(/\s+/)[0];
  return t || null;
}
```

**Propósito**:
- `clamp`: Truncar strings con "…"
- `title`: Title case (ej: "felix figueroa" → "Felix Figueroa")
- `firstToken`: Primer palabra (ej: "Felix Figueroa" → "Felix")

---

#### stripDiacritics() - Service Normalization

```javascript
function stripDiacritics(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\w\s/()-]/g,"")
    .toLowerCase().trim();
}
```

**Propósito**: Normalizar texto para matching de servicios (sin acentos, lowercase).

**Ejemplos**:
```javascript
stripDiacritics("WhatsApp Chatbot")         // → "whatsapp chatbot"
stripDiacritics("Análitica & Reportes")     // → "analitica  reportes"
stripDiacritics("Bot de WhatsApp")          // → "bot de whatsapp"
```

---

### 2. Catálogo de Servicios

```javascript
const services_catalog = {
  allowed: [
    "WhatsApp Chatbot",
    "Voice Assistant (IVR)",
    "Knowledge Base Agent",
    "Process Automation (Odoo/ERP)",
    "Lead Capture & Follow-ups",
    "Analytics & Reporting",
    "Smart Reservations",
    "Knowledge Intake Pipeline",
    "Webhook Guard",
    "Website Knowledge Chat",
    "Data Sync Hub",
    "Leonobitech Platform Core"
  ],
  aliases: {
    "whatsapp": "WhatsApp Chatbot",
    "chatbot": "WhatsApp Chatbot",
    "bot de whatsapp": "WhatsApp Chatbot",
    "ivr": "Voice Assistant (IVR)",
    "asistente de voz": "Voice Assistant (IVR)",
    // ... 30+ alias mappings
  }
};
```

**Total**: 12 servicios canónicos, 40+ aliases.

**Normalización**:
```javascript
const ALLOWED_CANONICAL = new Set(services_catalog.allowed);
const ALIAS_MAP = Object.fromEntries(
  Object.entries(services_catalog.aliases).map(([k,v]) => [stripDiacritics(k), v])
);
const CANONICAL_MAP = Object.fromEntries(
  services_catalog.allowed.map(c => [stripDiacritics(c), c])
);
```

**Función de normalización**:
```javascript
function normalizeServiceToken(token){
  const key = stripDiacritics(token);
  if (!key) return null;
  if (ALIAS_MAP[key]) return ALIAS_MAP[key];
  if (CANONICAL_MAP[key]) return CANONICAL_MAP[key];
  return null;
}
```

**Ejemplos**:
```javascript
normalizeServiceToken("chatbot")           // → "WhatsApp Chatbot"
normalizeServiceToken("Bot de WhatsApp")   // → "WhatsApp Chatbot"
normalizeServiceToken("IVR")               // → "Voice Assistant (IVR)"
normalizeServiceToken("garbage")           // → null
```

---

### 3. Input Parsing

```javascript
const root = $json || {};
const pth  = safeParse(root.passthrough, {});
const prof = safeParse(pth.profile || root.profile, {});
const st   = safeParse(pth.state   || root.state,   {});
const ctx  = safeParse(pth.context || root.context, {});
const tim  = safeParse(pth.timing  || root.timing,  {});
const dbg  = safeParse(root.debug, {});

const decision = safeParse(root.decision, {});
const reasons  = Array.isArray(root.reasons) ? root.reasons : [];
```

**Fuentes de datos**:
- `root`: Input directo del nodo anterior (FlagsAnalyzer)
- `passthrough`: Contexto propagado desde nodos previos
- `profile`: Datos del lead (Baserow)
- `state`: Estado del funnel
- `context`: Análisis del LLM Analyst
- `timing`: Recency analytics
- `debug`: Metadata de FlagsAnalyzer
- `decision`: Decision object de FlagsAnalyzer

---

### 4. Último Texto del Usuario (Multi-Source)

```javascript
const last_user_text_candidates = [
  root.last_user_text,
  pth.last_user_text,
  root.debug?.last_user_text,
  pth.context?.agent_brief?.last_incoming?.text,
  ctx.last_user_text
].filter(v => typeof v === "string" && v.trim() !== "");

let last_user_text = last_user_text_candidates.length
  ? String(last_user_text_candidates[0]).trim()
  : "";
```

**Fallback cascade**: Intenta 5 fuentes diferentes hasta encontrar texto válido.

**Inferencia de "opción N"** (si sigue vacío):
```javascript
function inferOptionDigit(s){
  if (!s) return null;
  const m = /opci[oó]n\s+(\d+)/i.exec(String(s));
  return m ? m[1] : null;
}

if (!last_user_text) {
  last_user_text = inferOptionDigit(summary) ||
                   inferOptionDigit(reduced_history_raw) ||
                   "";
}
```

**Propósito**: Si el usuario solo envió "2" pero el summary dice "opción 2", extraer "2".

---

### 5. Nombre Conversacional (Runtime Extraction)

```javascript
const NAME_RE = /\b(?:me\s+llamo|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ\s]{1,40})\b/i;

let conversationalName = null;
const m1 = last_user_text.match(NAME_RE);
if (m1 && m1[1]) conversationalName = m1[1].trim();

if (!conversationalName && reduced_history_raw){
  const m2 = reduced_history_raw.match(NAME_RE);
  if (m2 && m2[1]) conversationalName = m2[1].trim();
}

const profileName  = (prof.full_name || "").trim() || null;
const runtime_name = conversationalName ? title(conversationalName) : null;
const display_name = runtime_name || (profileName ? title(firstToken(profileName)) : "allí");
```

**Extracción**:
1. Buscar "me llamo X" o "soy X" en último mensaje
2. Si no, buscar en historial reducido
3. Fallback a profile.full_name
4. Fallback final: "allí" (neutro)

**Ejemplos**:
```
User: "Me llamo felix"
→ runtime_name = "Felix"
→ display_name = "Felix"

User: "Hola"
Profile: { full_name: "Felix Figueroa" }
→ runtime_name = null
→ display_name = "Felix" (firstToken)

User: "Hola"
Profile: { full_name: null }
→ display_name = "allí"
```

---

### 6. Email Consolidation (Multi-Source)

```javascript
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/i;

const injectedEmail  = String(root.extracted_email || "").trim().toLowerCase();
const detected_email = String(root.detected_email || "").trim().toLowerCase();
const emailProfState = String(prof.email || st.email || "").trim().toLowerCase();
const emailFromLast  = (last_user_text.match(EMAIL_RE) || [null])[0]?.toLowerCase() || "";

const finalEmail = (detected_email || injectedEmail || emailProfState || emailFromLast || "") || null;
```

**Prioridad**:
1. `detected_email` (nodo previo de detección)
2. `extracted_email` (injected)
3. `prof.email` o `st.email` (Baserow/state)
4. Regex en `last_user_text`
5. `null` si ninguno

---

### 7. Slots Object (Proposal Metadata)

```javascript
const slotsIn = safeParse(root.slots, {});
const captured_iso   = slotsIn.proposal?.captured_at_iso || (finalEmail ? new Date().toISOString() : null);
const captured_local = slotsIn.proposal?.captured_at_local || (captured_iso ? toLocalISO(captured_iso, tz) : null);
const business_name_up = (prof.business_name || st.business_name || slotsIn.business_name || "").trim() || null;

const slots = {
  ...slotsIn,
  proposal: {
    ...(slotsIn.proposal || {}),
    email: finalEmail,
    captured_at_iso: captured_iso,
    captured_at_local: captured_local,
    source: slotsIn.proposal?.source || (finalEmail ? "detected_or_profile" : null),
    lead_id: lead_id ?? null,
    tz,
    self_name: runtime_name || (profileName ? title(firstToken(profileName)) : null),
    business_name: slotsIn.proposal?.business_name || (business_name_up ? title(business_name_up) : null)
  },
  self_name: runtime_name || (profileName ? title(firstToken(profileName)) : null),
  business_name: business_name_up ? title(business_name_up) : null
};
```

**Propósito**: Metadata para generar propuestas (email, nombre, business_name, timestamps).

---

### 8. Service Target + RAG Hints

```javascript
const service_canonical =
  String(decision.service_canonical || ctx.service_target?.canonical || "").trim() || null;

const bundle = Array.isArray(decision.bundle) ? decision.bundle
  : (Array.isArray(ctx.service_target?.bundle) ? ctx.service_target.bundle : []);

const rag_hints = Array.isArray(decision.rag?.hints) ? decision.rag.hints
  : (Array.isArray(ctx.service_target?.rag_hints) ? ctx.service_target.rag_hints : []);

const service_target = service_canonical
  ? { canonical: service_canonical, bundle, rag_hints }
  : null;
```

**Fuentes**:
1. `decision.service_canonical` (FlagsAnalyzer)
2. `ctx.service_target.canonical` (LLM Analyst)

**Output**:
```json
{
  "canonical": "WhatsApp Chatbot",
  "bundle": ["🤖 Bot", "📊 Analytics", "🔗 Integración CRM"],
  "rag_hints": ["chatbot features", "automation benefits"]
}
```

---

### 9. CTA Menu Sanitization

```javascript
function sanitizeMenu(menu){
  if (!menu || !Array.isArray(menu.items)) return null;
  const items = menu.items
    .map(it => {
      if (!it) return null;
      if (typeof it === "string") return { title: it.trim(), key: it.trim().toLowerCase() };
      const title = String(it.title || it).trim();
      const key = String(it.key || title.toLowerCase()).trim();
      return title ? { title, key } : null;
    })
    .filter(Boolean);
  if (!items.length) return null;
  return {
    prompt: String(menu.prompt || "¿Cómo querés avanzar?").trim(),
    items,
    max_picks: Number(menu.max_picks || 1)
  };
}

const cta_menu_raw = decision.cta_menu || ctx.cta_menu || null;
const cta_menu = sanitizeMenu(cta_menu_raw) || null;
const hasMenu = !!cta_menu;
```

**Normalización**:
- Convierte strings a objetos `{title, key}`
- Filtra nulls/vacíos
- Devuelve `null` si no hay items válidos

**Ejemplo**:
```javascript
// Input:
{ prompt: "Elige:", items: ["Opción 1", {title:"Opción 2", key:"opt2"}] }

// Output:
{
  prompt: "Elige:",
  items: [
    { title: "Opción 1", key: "opción 1" },
    { title: "Opción 2", key: "opt2" }
  ],
  max_picks: 1
}
```

---

### 10. Alt Services Detection

```javascript
function detectAltServices(){
  const pool = new Set();

  // 1) Contexto previo
  (Array.isArray(ctx.alt_services) ? ctx.alt_services : []).forEach(x => pool.add(String(x)));
  (Array.isArray(root.alt_services) ? root.alt_services : []).forEach(x => pool.add(String(x)));

  // 2) Interests de perfil/estado
  (Array.isArray(prof.interests) ? prof.interests : []).forEach(x => pool.add(String(x)));
  (Array.isArray(st.interests) ? st.interests : []).forEach(x => pool.add(String(x)));

  // 3) Matched terms del analyzer
  (Array.isArray(dbg.matched_terms) ? dbg.matched_terms : []).forEach(x => pool.add(String(x)));

  // 4) Tokens del último texto
  String(last_user_text || "").split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9/()-]+/).forEach(x => x && pool.add(x));

  // Normalizar → canonical
  const canonSet = new Set();
  for (const raw of pool){
    const c = normalizeServiceToken(raw);
    if (c && (!service_canonical || c !== service_canonical)) canonSet.add(c);
  }
  // Limitar ruido
  return Array.from(canonSet).slice(0, 4);
}

const alt_services = detectAltServices();
```

**Fuentes de detección**:
1. `ctx.alt_services` (previo)
2. `prof.interests` (Baserow)
3. `st.interests` (state)
4. `debug.matched_terms` (FlagsAnalyzer)
5. Tokens del último mensaje del usuario

**Normalización**: Convierte aliases a canónicos.

**Limit**: Máximo 4 servicios alternativos (evitar payload enorme).

---

### 11. Fallbacks Dinámicos por Servicio

```javascript
const FALLBACKS_MAP = {
  "WhatsApp Chatbot": [
    "Flujos conversacionales con botones, medios y plantillas oficiales",
    "Captura de leads y triaje automático a equipos",
    "Handoff a agente humano vía Chatwoot",
    "Integración con Odoo/CRM para alta de oportunidades",
    "Métricas de sesión, CSAT y transcripción"
  ],
  "Voice Assistant (IVR)": [
    "Recepción de llamadas con reconocimiento de voz (ASR)",
    "Ruteo inteligente por intenciones y horarios",
    // ...
  ],
  // ... 12 servicios con 5 beneficios cada uno
};

function fallbackBenefitsFor(canonical){
  if (canonical && FALLBACKS_MAP[canonical]) return FALLBACKS_MAP[canonical];
  // Genérico si no se pudo normalizar
  return [
    "Automatización de tareas repetitivas",
    "Integración con herramientas existentes",
    "Métricas y visibilidad operativa",
    "Escalabilidad por etapas",
    "Acompañamiento en la adopción"
  ];
}

const fallbacks_primary  = fallbackBenefitsFor(service_canonical);
const fallbacks_by_alt   = Object.fromEntries(alt_services.map(s => [s, fallbackBenefitsFor(s)]));
```

**Propósito**: Si RAG falla o no hay hints, usar fallbacks hardcoded.

**Estructura**:
```json
{
  "fallbacks": {
    "benefits": ["benefit 1", "benefit 2", ...],  // para servicio principal
    "by_service": {
      "Voice Assistant (IVR)": ["benefit 1", ...],
      "Analytics & Reporting": ["benefit 1", ...]
    }
  }
}
```

---

### 12. Guardrails Consolidados

```javascript
const reask = safeParse(ctx.reask_decision, {
  can_ask_email_now:false,
  can_ask_addressee_now:false,
  reason:null
});

const guardrails = {
  dont_restart_main_menu: !!(decision.guardrails?.dont_restart_main_menu),
  dont_require_volume_first: !!(decision.guardrails?.dont_require_volume_first),
  respect_agent_recommendation: !!(decision.guardrails?.respect_agent_recommendation),
  ask_email_gate_blocked: !(reask.can_ask_email_now === true),
  request_business_name_gate_blocked: !(reask.can_ask_addressee_now === true)
};
```

**Gates**:
- `ask_email_gate_blocked`: Si `true`, NO pedir email (cooldown/policy)
- `request_business_name_gate_blocked`: Si `true`, NO pedir business_name

---

### 13. Master Task Structure (v3.0)

```javascript
const purpose = decision.purpose || "benefits_cta";
const message_kind = decision.message_kind || (purpose === "price_cta" ? "price_intro" : "service_intro");

const master_task = {
  version: "master_task@3.0",
  route: decision.route || "service_selected_flow",
  purpose,
  message_kind,
  service: service_target ? { canonical: service_target.canonical, bundle: service_target.bundle } : null,
  rag: {
    use: decision.rag?.use === true,
    hints: rag_hints,
    benefits_max: Number(decision.copy_hints?.bullets || 5)
  },
  copy_hints: {
    tone: decision.copy_hints?.tone || "friendly_concise",
    bullets: Number(decision.copy_hints?.bullets || 5),
    include_bundle: !!decision.copy_hints?.include_bundle,
    opening_hint: String(decision.copy_hints?.opening_hint || ctx.opening_hint || "").trim() || ""
  },
  ui: hasMenu ? { cta_menu } : {},
  guardrails: {
    ...guardrails,
    request_email: guardrails.ask_email_gate_blocked === true,
    request_business_name: guardrails.request_business_name_gate_blocked === true
  },
  context: {
    opening_hint: String(ctx.opening_hint || "").trim() || null,
    reduced_history: reduced_history_raw || null,
    alt_services
  },
  fallbacks: {
    benefits: fallbacks_primary,
    by_service: fallbacks_by_alt
  },
  pricing_policy: {
    show_base_or_range_if_available: purpose === "price_cta",
    avoid_committing_if_unsure: true
  },
  prohibitions: {
    restart_main_menu: guardrails.dont_restart_main_menu === true,
    ask_volume_first:  guardrails.dont_require_volume_first === true,
    request_email:     guardrails.ask_email_gate_blocked === true,
    request_business_name: guardrails.request_business_name_gate_blocked === true
  }
};
```

**Campos clave**:

- **route**: `service_selected_flow` (tiene servicio) vs `generic_flow` (exploración)
- **purpose**: `price_cta`, `benefits_cta`, `options`
- **message_kind**: `price_intro`, `service_intro`, `options`
- **service**: Servicio seleccionado + bundle
- **rag.use**: Boolean para consultar Qdrant
- **rag.hints**: Keywords para RAG search
- **ui.cta_menu**: Menu de opciones (puede estar vacío si `hasMenu = false`)
- **fallbacks**: Beneficios hardcoded por servicio
- **prohibitions**: Restricciones para Master Agent

---

### 14. Contracts (Expected Output Schema)

```javascript
const chatwootInput = hasMenu ? {
  content: cta_menu?.prompt || "¿Cómo querés avanzar?",
  message_type: "outgoing",
  content_type: "input_select",
  content_attributes: {
    items: (cta_menu?.items || []).map(it => ({ title: it.title, value: it.key })),
    max_picks: cta_menu?.max_picks || 1
  }
} : undefined;

const contracts = {
  expected_master_output: {
    body_html: "string",
    content_whatsapp: {
      content: "string",
      message_type: "outgoing",
      content_type: "text",
      content_attributes: {}
    },
    ...(hasMenu ? { chatwoot_input_select: chatwootInput } : {}),
    expect_reply: true,
    message_kind,
    purpose,
    structured_cta: hasMenu ? (cta_menu.items || []).map(it => it.key) : [],
    rag_used: decision.rag?.use === true
  }
};
```

**Condicional**: `chatwoot_input_select` solo si `hasMenu = true`.

**Propósito**: Validar que Master Agent devuelva estructura esperada.

---

### 15. User Prompt con <TAGS> (Legacy Compatibility)

```javascript
const userPrompt = [
  "<SUMMARY>",
  clamp(summary || "(vacío)", 300),
  "</SUMMARY>",
  "",
  "<DIALOGUE>",
  clamp(reduced_history_raw || "(vacío)", 1600),
  "</DIALOGUE>",
  "",
  "<LAST_USER>",
  clamp(String(last_user_text || ""), 240),
  "</LAST_USER>",
  "",
  "<AGENT_RECO>",
  agent_reco ? String(agent_reco) : "(vacío)",
  "</AGENT_RECO>",
  "",
  "<TIMING>",
  JSON.stringify(timing),
  "</TIMING>",
  "",
  "<FLAGS>",
  JSON.stringify(flags),
  "</FLAGS>",
  "",
  "<SLOTS>",
  JSON.stringify(slots),
  "</SLOTS>",
  "",
  "<PROFILE_ECHO>",
  JSON.stringify({...}),
  "</PROFILE_ECHO>",
  "",
  "<STATE_ECHO>",
  JSON.stringify(state_echo),
  "</STATE_ECHO>",
  "",
  "<CONTEXT_ECHO>",
  JSON.stringify({...cta_menu, service_target, alt_services}),
  "</CONTEXT_ECHO>",
  "",
  "<META>",
  JSON.stringify({ lead_id, tz }),
  "</META>",
  "",
  "<NOW>",
  JSON.stringify({ iso_utc: new Date().toISOString(), tz }),
  "</NOW>",
  "",
  "<CONSTRAINTS>",
  JSON.stringify(constraints_for_tags),
  "</CONSTRAINTS>",
  "",
  "<CTA_MENU>",
  JSON.stringify(cta_menu),
  "</CTA_MENU>",
  "",
  "<SERVICE_TARGET>",
  JSON.stringify(service_target),
  "</SERVICE_TARGET>"
].join("\n");
```

**Propósito**: Formato estructurado para LLMs que esperan tags XML-like.

**Secciones**:
- `<SUMMARY>`: Resumen corto de conversación (≤300 chars)
- `<DIALOGUE>`: Historial reducido (≤1600 chars)
- `<LAST_USER>`: Último mensaje del usuario (≤240 chars)
- `<AGENT_RECO>`: Recommendation del LLM Analyst
- `<FLAGS>`: Eco de flags (intent, actions, stage)
- `<SLOTS>`: Proposal metadata (email, nombre, business_name)
- `<PROFILE_ECHO>`: Datos del lead
- `<STATE_ECHO>`: Estado del funnel
- `<CONTEXT_ECHO>`: Contexto completo (menú, service_target, alt_services)
- `<CONSTRAINTS>`: Guardrails y gates
- `<CTA_MENU>`: Menú de opciones (puede ser null)
- `<SERVICE_TARGET>`: Servicio seleccionado

---

### 16. Output Final

```javascript
return {
  master_task,
  contracts,
  routing,
  ui: hasMenu ? { cta_menu } : {},
  meta,
  guardrails,
  reasons,
  persist_hint: { should_persist, changed_keys_funnel },

  userPrompt,

  timing,
  flags,
  slots,
  context: {
    summary,
    reduced_history: reduced_history_raw,
    agent_recommendation: agent_reco,
    cta_menu,
    service_target,
    alt_services
  },
  last_user_text,
  lead_id,
  tz,
  has_email: Boolean(finalEmail),
  extracted_email: finalEmail || null,

  profile_echo: {...},
  state_echo: {...},
  context_echo: {...},
  debug_echo: {...}
};
```

**Estructura**:
- ✅ `master_task`: Task structure v3.0
- ✅ `contracts`: Expected output schema
- ✅ `userPrompt`: Prompt con tags
- ✅ `ui`: CTA menu (condicional)
- ✅ `fallbacks`: Beneficios por servicio
- ✅ `alt_services`: Servicios alternativos detectados
- ✅ `guardrails`: Gates y restricciones
- ✅ `slots`: Proposal metadata
- ✅ Ecos de profile, state, context para debugging

---

## Input (desde FlagsAnalyzer)

```json
{
  "decision": {
    "route": "generic_flow",
    "purpose": "options",
    "service_canonical": null,
    "rag": { "use": false, "hints": [] },
    "cta_menu": {
      "prompt": "¿Cómo querés avanzar?",
      "items": ["Ver precios", "Beneficios e integraciones", "Agendar demo", "Solicitar propuesta"]
    },
    "guardrails": { "dont_restart_main_menu": false }
  },
  "actions": { "greet_only": true },
  "reasons": ["Email gate bloquea...", "Intent greeting/contact_share..."],
  "passthrough": {
    "profile": { "lead_id": 33, "full_name": "Felix Figueroa", "email": null },
    "state": { "stage": "explore", "counters": { "services_seen": 0 } },
    "context": {
      "reduced_history": "El usuario inició...",
      "agent_recommendation": "INSTRUCCIONES PARA MASTER: ...",
      "reask_decision": { "can_ask_email_now": false }
    },
    "timing": { "recency_bucket": "fresh" }
  }
}
```

---

## Output

### master_task (v3.0)

```json
{
  "version": "master_task@3.0",
  "route": "generic_flow",
  "purpose": "options",
  "message_kind": "options",
  "service": null,
  "rag": {
    "use": false,
    "hints": [],
    "benefits_max": 5
  },
  "copy_hints": {
    "tone": "friendly_concise",
    "bullets": 5,
    "include_bundle": false,
    "opening_hint": "Sigamos donde quedamos hoy."
  },
  "ui": {
    "cta_menu": {
      "prompt": "¿Cómo querés avanzar?",
      "items": [
        { "title": "Ver precios", "key": "price" },
        { "title": "Beneficios e integraciones", "key": "benefits" },
        { "title": "Agendar demo", "key": "demo" },
        { "title": "Solicitar propuesta", "key": "proposal" }
      ],
      "max_picks": 1
    }
  },
  "guardrails": {
    "dont_restart_main_menu": false,
    "dont_require_volume_first": true,
    "ask_email_gate_blocked": true,
    "request_business_name_gate_blocked": true,
    "request_email": true,
    "request_business_name": true
  },
  "context": {
    "opening_hint": "Sigamos donde quedamos hoy.",
    "reduced_history": "El usuario inició la conversación con un saludo...",
    "alt_services": []
  },
  "fallbacks": {
    "benefits": [
      "Automatización de tareas repetitivas",
      "Integración con herramientas existentes",
      "Métricas y visibilidad operativa",
      "Escalabilidad por etapas",
      "Acompañamiento en la adopción"
    ],
    "by_service": {}
  },
  "pricing_policy": {
    "show_base_or_range_if_available": false,
    "avoid_committing_if_unsure": true
  },
  "prohibitions": {
    "restart_main_menu": false,
    "ask_volume_first": true,
    "request_email": true,
    "request_business_name": true
  }
}
```

### contracts

```json
{
  "expected_master_output": {
    "body_html": "string",
    "content_whatsapp": {
      "content": "string",
      "message_type": "outgoing",
      "content_type": "text",
      "content_attributes": {}
    },
    "chatwoot_input_select": {
      "content": "¿Cómo querés avanzar?",
      "message_type": "outgoing",
      "content_type": "input_select",
      "content_attributes": {
        "items": [
          { "title": "Ver precios", "value": "price" },
          { "title": "Beneficios e integraciones", "value": "benefits" },
          { "title": "Agendar demo", "value": "demo" },
          { "title": "Solicitar propuesta", "value": "proposal" }
        ],
        "max_picks": 1
      }
    },
    "expect_reply": true,
    "message_kind": "options",
    "purpose": "options",
    "structured_cta": ["price", "benefits", "demo", "proposal"],
    "rag_used": false
  }
}
```

### userPrompt (extract)

```
<SUMMARY>
El usuario inició la conversación con un saludo y luego proporcionó su nombre.
</SUMMARY>

<DIALOGUE>
El usuario inició la conversación con un saludo y luego proporcionó su nombre.
</DIALOGUE>

<LAST_USER>
Si, claro me llamo Felix
</LAST_USER>

<AGENT_RECO>
INSTRUCCIONES PARA MASTER: Confirmar interés del usuario y solicitar información sobre necesidades específicas...
</AGENT_RECO>

<FLAGS>
{"intent":"service_selected","actions":{"greet_only":true},"stage_in":"explore",...}
</FLAGS>

<SLOTS>
{"proposal":{"email":null,"self_name":"Felix","business_name":null},...}
</SLOTS>

<CTA_MENU>
{"prompt":"¿Cómo querés avanzar?","items":[{"title":"Ver precios","key":"price"},...]}
</CTA_MENU>

<SERVICE_TARGET>
null
</SERVICE_TARGET>
```

---

## Casos de Uso

### Caso 1: Flujo sin servicio (exploration)

**Input**:
```json
{
  "decision": {
    "route": "generic_flow",
    "purpose": "options",
    "service_canonical": null,
    "rag": { "use": false }
  }
}
```

**Output**:
```json
{
  "master_task": {
    "route": "generic_flow",
    "purpose": "options",
    "service": null,
    "rag": { "use": false, "hints": [] },
    "fallbacks": {
      "benefits": ["Automatización...", "Integración...", ...]
    }
  }
}
```

**Master Agent behavior**: Presenta opciones generales, usa fallbacks genéricos.

---

### Caso 2: Servicio seleccionado (service_selected_flow)

**Input**:
```json
{
  "decision": {
    "route": "service_selected_flow",
    "purpose": "benefits_cta",
    "service_canonical": "WhatsApp Chatbot",
    "bundle": ["🤖 Bot", "📊 Analytics"],
    "rag": { "use": true, "hints": ["chatbot features"] }
  }
}
```

**Output**:
```json
{
  "master_task": {
    "route": "service_selected_flow",
    "purpose": "benefits_cta",
    "service": {
      "canonical": "WhatsApp Chatbot",
      "bundle": ["🤖 Bot", "📊 Analytics"]
    },
    "rag": { "use": true, "hints": ["chatbot features"], "benefits_max": 5 },
    "fallbacks": {
      "benefits": [
        "Flujos conversacionales con botones...",
        "Captura de leads y triaje automático...",
        "Handoff a agente humano vía Chatwoot...",
        "Integración con Odoo/CRM...",
        "Métricas de sesión, CSAT..."
      ]
    }
  }
}
```

**Master Agent behavior**:
1. Consulta RAG con hint "chatbot features"
2. Si RAG falla, usa fallbacks hardcoded
3. Presenta beneficios del servicio

---

### Caso 3: Price request

**Input**:
```json
{
  "decision": {
    "route": "service_selected_flow",
    "purpose": "price_cta",
    "service_canonical": "WhatsApp Chatbot"
  }
}
```

**Output**:
```json
{
  "master_task": {
    "purpose": "price_cta",
    "message_kind": "price_intro",
    "pricing_policy": {
      "show_base_or_range_if_available": true,
      "avoid_committing_if_unsure": true
    }
  }
}
```

**Master Agent behavior**: Enfoca respuesta en pricing, evita comprometer precios exactos sin contexto.

---

### Caso 4: Alt services detectados

**Input**:
```json
{
  "passthrough": {
    "profile": { "interests": ["WhatsApp", "CRM"] },
    "debug": { "matched_terms": ["ivr", "reportes"] }
  }
}
```

**Processing**:
```javascript
detectAltServices()
// Pool: ["WhatsApp", "CRM", "ivr", "reportes"]
// Normalized: ["WhatsApp Chatbot", "Process Automation (Odoo/ERP)", "Voice Assistant (IVR)", "Analytics & Reporting"]
// Limited: ["WhatsApp Chatbot", "Process Automation (Odoo/ERP)", "Voice Assistant (IVR)", "Analytics & Reporting"]
```

**Output**:
```json
{
  "master_task": {
    "context": {
      "alt_services": [
        "WhatsApp Chatbot",
        "Process Automation (Odoo/ERP)",
        "Voice Assistant (IVR)",
        "Analytics & Reporting"
      ]
    }
  },
  "fallbacks": {
    "by_service": {
      "WhatsApp Chatbot": ["Flujos conversacionales...", ...],
      "Process Automation (Odoo/ERP)": ["CRM en Odoo...", ...],
      "Voice Assistant (IVR)": ["Recepción de llamadas...", ...],
      "Analytics & Reporting": ["Tableros unificados...", ...]
    }
  }
}
```

**Master Agent behavior**: Puede mencionar servicios relacionados si el usuario muestra interés múltiple.

---

### Caso 5: Flujo sin menú (greet_only)

**Input**:
```json
{
  "decision": {
    "cta_menu": null
  },
  "actions": { "greet_only": true }
}
```

**Output**:
```json
{
  "master_task": {
    "ui": {}  // vacío
  },
  "contracts": {
    "expected_master_output": {
      // NO incluye chatwoot_input_select
      "structured_cta": []
    }
  }
}
```

**Master Agent behavior**: Saludo breve sin CTAs (no spam).

---

## Comparación con Nodos Previos

### vs Node 48: FlagsAnalyzer

| Aspecto | FlagsAnalyzer | AgentInput+Flags+InputMain |
|---------|---------------|----------------------------|
| **Función** | Decision making | Task structure preparation |
| **Input** | Flags + context | Decision object + context |
| **Output** | `decision` object | `master_task` + `userPrompt` |
| **Lógica** | Gates, cooldowns, routing | Consolidation, normalization |
| **Alt services** | NO detecta | SÍ detecta (desde 4 fuentes) |
| **Fallbacks** | NO genera | SÍ genera (por servicio) |
| **Email** | NO consolida | SÍ consolida (4 fuentes) |
| **Contracts** | NO genera | SÍ genera (schema validation) |
| **User prompt** | NO genera | SÍ genera (tags XML-like) |

**Relación**: FlagsAnalyzer DECIDE; AgentInput PREPARA el input para LLM.

---

### vs Node 41: Smart Input

| Aspecto | Smart Input | AgentInput+Flags+InputMain |
|---------|-------------|----------------------------|
| **Destino** | LLM Analyst (GPT-3.5) | Master Agent (GPT-4) |
| **Contexto** | History + options + rules + policies | master_task + contracts + userPrompt |
| **Estructura** | Flat object con arrays | Nested object (task structure) |
| **Guardrails** | Policy definitions (text) | Guardrails structure (boolean flags) |
| **Service info** | `service_defaults` (catalog) | `service_target` + fallbacks dinámicos |
| **Email** | NO consolida | SÍ consolida |
| **Menú** | Options array | `cta_menu` sanitizado |

**Relación**: Ambos preparan input para LLMs, pero Smart Input es para análisis; AgentInput es para generación de respuesta.

---

## Métricas de Performance

### Complejidad Temporal

- **safeParse**: O(n) donde n = longitud del JSON string (~1-2 KB)
- **detectAltServices**: O(m) donde m = total tokens en interests + matched_terms + last_user_text (~50-200 tokens)
- **normalizeServiceToken**: O(1) (Map lookup)
- **sanitizeMenu**: O(k) donde k = número de items en menú (~4-10 items)
- **fallbackBenefitsFor**: O(1) (Map lookup)
- **userPrompt construction**: O(n) donde n = longitud del summary + history (~2000 chars)

**Total**: O(n + m + k) ≈ O(n) dominado por JSON parsing y string concatenation.

**Typical execution time**: ~10-30ms

---

### Complejidad Espacial

- **Input size**: ~5-8 KB (passthrough + decision + flags)
- **Intermediate structures**: ~3-5 KB (maps, sets, arrays)
- **Output size**: ~10-15 KB (master_task + contracts + userPrompt + ecos)
- **Memory peak**: ~20-25 KB

**Total**: O(n) donde n = input size.

---

### Escalabilidad

- ✅ **Stateless**: Sin side effects, puede ejecutarse en paralelo
- ✅ **Deterministic**: Mismo input → mismo output
- ✅ **No external calls**: No I/O, solo CPU
- ⚠️ **Catalog size**: 12 servicios × 5 fallbacks = 60 strings (~3 KB). Escala linealmente con catálogo.

---

## Mejoras Propuestas

### 1. **Cache de fallbacks por servicio**

**Problema**: Se reconstruye `fallbacks_by_alt` en cada ejecución.

**Solución**: Pre-computar fallbacks al inicio del workflow.

```javascript
const PRECOMPUTED_FALLBACKS = Object.fromEntries(
  services_catalog.allowed.map(s => [s, fallbackBenefitsFor(s)])
);
```

**Benefit**: Reduce de O(n) a O(1) construcción de fallbacks.

---

### 2. **Validación de schema con Zod**

**Problema**: No hay validación de que `master_task` cumpla contrato.

**Solución**:
```javascript
const masterTaskSchema = z.object({
  version: z.literal("master_task@3.0"),
  route: z.enum(["service_selected_flow", "generic_flow"]),
  purpose: z.enum(["price_cta", "benefits_cta", "options"]),
  service: z.object({...}).nullable(),
  rag: z.object({ use: z.boolean(), hints: z.array(z.string()) })
});

const validated = masterTaskSchema.parse(master_task);
```

**Benefit**: Catch errors antes de enviar a Master Agent.

---

### 3. **Alt services ranking**

**Problema**: `alt_services` está sin ordenar (orden de detección).

**Solución**: Rankear por frecuencia de aparición.

```javascript
const altServicesCounts = new Map();
for (const raw of pool){
  const c = normalizeServiceToken(raw);
  if (c) altServicesCounts.set(c, (altServicesCounts.get(c) || 0) + 1);
}
const ranked = Array.from(altServicesCounts.entries())
  .sort((a,b) => b[1] - a[1])
  .map(([service]) => service)
  .slice(0, 4);
```

**Benefit**: Prioriza servicios más mencionados.

---

### 4. **Fallbacks desde base de datos**

**Problema**: Fallbacks hardcoded en código (dificil de actualizar).

**Solución**: Cargar desde Baserow/Odoo.

```javascript
// Fetch desde API
const fallbacksDb = await fetch('/api/service-fallbacks').then(r => r.json());
const FALLBACKS_MAP = Object.fromEntries(fallbacksDb.map(row => [row.service, row.benefits]));
```

**Benefit**: Actualización sin redeploy.

---

### 5. **Telemetry de rutas**

**Problema**: No hay visibilidad sobre qué rutas se usan más.

**Solución**: Log analytics.

```javascript
console.log(JSON.stringify({
  event: "master_task_prepared",
  route: master_task.route,
  purpose: master_task.purpose,
  rag_used: master_task.rag.use,
  has_menu: hasMenu,
  alt_services_count: alt_services.length,
  lead_id
}));
```

**Benefit**: Analytics para optimizar flujos.

---

### 6. **Compression del userPrompt**

**Problema**: userPrompt puede ser muy largo (~3-5 KB).

**Solución**: Truncar secciones con prioridad.

```javascript
const MAX_DIALOGUE = 1200; // reducir de 1600
const MAX_SUMMARY = 200;   // reducir de 300

const userPrompt = [
  "<SUMMARY>",
  clamp(summary || "(vacío)", MAX_SUMMARY),
  // ...
  "<DIALOGUE>",
  clamp(reduced_history_raw || "(vacío)", MAX_DIALOGUE),
  // ...
].join("\n");
```

**Benefit**: Reduce tokens → reduce costo LLM.

---

## Referencias

### Inputs desde Nodos Anteriores

- **Node 48 (FlagsAnalyzer)**: `decision` object, `actions`, `reasons`
- **Node 43 (Filter Output)**: `agent_brief`, `state` actualizado
- **Node 47 (BuildFlagsInput)**: `timing`, `context`, `flags_base`
- **Node 39 (LoadProfileAndState)**: `profile`, `state`

### Outputs hacia Nodos Siguientes

- **Next**: Master Agent (LLM GPT-4) - consume `master_task` + `userPrompt`
- **Eventual**: Response formatting nodes - usan `contracts` para validación

### Arquitectura General

```
FlagsAnalyzer (48)
    ↓
AgentInput+Flags+InputMain (49) ✅ [Preparación Master Agent]
    ↓
Master Agent (50) - GPT-4 [Response generation]
    ↓
Response formatting + validation
    ↓
Chatwoot send message
```

**Posición**: Último nodo antes del Master Agent. Consolida TODOS los datos acumulados en el workflow.

---

## Conclusión

**AgentInput+Flags+InputMain** es el **nodo integrador final** que:

1. ✅ Consolida contexto de 10+ fuentes (flags, decision, profile, state, timing, context)
2. ✅ Genera `master_task` structure v3.0 (routing, purpose, RAG, guardrails, fallbacks)
3. ✅ Detecta `alt_services` desde 4 fuentes diferentes
4. ✅ Genera `contracts` para validar output del Master Agent
5. ✅ Construye `userPrompt` con tags XML-like (legacy compatibility)
6. ✅ Consolida `email` desde 4 fuentes con prioridad
7. ✅ Extrae `nombre conversacional` desde texto en runtime
8. ✅ Sanitiza `cta_menu` (soporta null para flujos sin menú)
9. ✅ Genera `fallbacks` dinámicos por servicio (hardcoded map)
10. ✅ Aplica `guardrails` desde gates (email, business_name)

**Próximo nodo**: Master Agent (GPT-4) que consume `master_task`, consulta RAG si `rag.use = true`, y genera respuesta final.

---

**Versión del documento**: 1.0
**Última actualización**: 2025-10-31
**Autor**: Documentación generada a partir del código v5.3 de AgentInput+Flags+InputMain
