# Nodo 47: BuildFlagsInput

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | BuildFlagsInput |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Preparar flags, contexto enriquecido, recency analytics y compatibility checks para Master Agent |
| **Input previo** | BuildStatePatch (Node 46) → `{ profile, state, agent_brief, patch, patch_meta, ... }` |
| **Modo ejecución** | Run Once for All Items |
| **Zona** | **FLAGS ZONE** (último nodo antes del Master Agent) |
| **Salidas** | 1 salida → `{ lead_id, tz, timing, context, profile, state, flags_base, flags_base_llm, flags_derived, STATE_ECHO, compat_report, ... }` |
| **Versión** | v4.0 (integra service_target + cta_menu + flags_derived + heurística corregida) |

---

## Descripción

El nodo **BuildFlagsInput** es el **último nodo de la FLAGS ZONE** y el más complejo de esta sección (~370 líneas). Su función es preparar un **contexto completamente enriquecido** que el Master Agent usará para generar la respuesta final.

**Funciones principales:**

1. **Recency Analytics:**
   - Calcula antigüedad del último mensaje (ms, hours, days)
   - Clasifica en buckets: fresh (<30min), warm (<6h), stale (<24h), dormant (>24h)
   - Calcula recency calendar-aware (hoy, ayer, esta_semana, anterior) usando TZ del lead
   - Determina estilo de reenganche: continuation, recap, reactivation
   - Genera opening hints contextuales

2. **Intent Heuristics (refactored v4.0):**
   - Detecta service selection (numeric input "1" o service_target presente)
   - Clasifica intents: service_selected, ontopic, neutral, offtopic
   - Identifica keywords fuertes (whatsapp, chatbot, odoo, crm, etc.)
   - Override para greetings/contact_share (nunca offtopic)
   - **Ya no congela counters en service selection** (fix v4.0)

3. **Cooldown Management:**
   - Valida ventanas de cooldown (email: 6h, addressee: 12h)
   - Combina con policy del Analyst (can_ask_email_now, can_ask_addressee_now)
   - Genera flags: email_cooldown_ok, addressee_cooldown_ok

4. **Flags Derivados (NEW v4.0):**
   - service_selected: Boolean si usuario seleccionó servicio
   - selected_service_canonical: Nombre del servicio seleccionado
   - rag_hints, bundle: Desde agent_brief.service_target
   - should_render_ctas: Si hay CTAs disponibles
   - ready_for_benefits/price_cta/demo_cta: Flags de readiness por stage

5. **Compatibility Checks:**
   - Valida que inmutables (lead_id, phone, country, tz) sean consistentes entre profile y state
   - Detecta mismatches entre patch y state (si patch no se aplicó correctamente)
   - Genera compat_report con errores detallados

6. **Context Enrichment:**
   - Pasa service_target y cta_menu al contexto (NEW v4.0)
   - Incluye reduced_history (summary), agent_recommendation
   - Reengagement_style y opening_hint para Master

**Patrón arquitectónico:** **Context Enrichment Pattern** - Agrega metadata, flags y analytics al contexto base para decision-making downstream.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: Code
Lenguaje: JavaScript
Mode: Run Once for All Items
```

### Code Structure (Breakdown)

#### 1. Helper Functions (Líneas 1-100)

##### Basic Helpers

```javascript
function n(v){ const x = Number(v); return Number.isFinite(x) ? x : null; }

function isBlank(x){
  return x === undefined || x === null ||
         (typeof x === 'string' && (x.trim() === '' || x.trim().toLowerCase() === 'null' || x.trim().toLowerCase() === 'undefined'));
}

function pick(...vals){
  for (const v of vals){
    if (isBlank(v)) continue;
    return (typeof v === 'string') ? v.trim() : v;
  }
  return null;
}
```

**Propósito:**
- `n()`: Coerce a number or null
- `isBlank()`: Detecta valores vacíos (null, undefined, "", "null", "undefined")
- `pick()`: Retorna primer valor no-blank (similar a `??` pero más robusto)

---

##### Timestamp Helpers

```javascript
function parseIso(s){
  if (isBlank(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function msSince(iso, ref){
  const d = parseIso(iso);
  return d ? (ref - d) : null;
}

function bucketByAge(ms){
  if (ms == null) return "unknown";
  if (ms < 30 * 60 * 1000) return "fresh";      // <30min
  if (ms < 6  * 60 * 60 * 1000) return "warm";   // <6h
  if (ms < 24 * 60 * 60 * 1000) return "stale";  // <24h
  return "dormant";                               // >24h
}
```

**Propósito:**
- `parseIso()`: Parse ISO string a Date (robust)
- `msSince()`: Calcula ms transcurridos desde timestamp
- `bucketByAge()`: Clasifica recency en 4 buckets (fresh/warm/stale/dormant)

---

##### TZ-Aware Date Helpers

```javascript
// TZ-aware YYYY-MM-DD
function localYMDStamp(date, tz){
  if (!(date instanceof Date)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const y = parts.find(p=>p.type==='year')?.value;
    const m = parts.find(p=>p.type==='month')?.value;
    const d = parts.find(p=>p.type==='day')?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
    // Fallback UTC
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth()+1).padStart(2,'0');
    const d = String(date.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
}

function daysBetweenLocal(aDate, bDate, tz){
  const a = localYMDStamp(aDate, tz);
  const b = localYMDStamp(bDate, tz);
  if (!a || !b) return null;
  const [ay,am,ad] = a.split('-').map(Number);
  const [by,bm,bd] = b.split('-').map(Number);
  const aUTC = Date.UTC(ay, am-1, ad);
  const bUTC = Date.UTC(by, bm-1, bd);
  return Math.floor((aUTC - bUTC) / (24*60*60*1000));
}
```

**Propósito:**
- `localYMDStamp()`: Convierte Date a "YYYY-MM-DD" en timezone del lead (TZ-aware)
- `daysBetweenLocal()`: Calcula días entre dos fechas considerando timezone local

**Importancia:** Sin TZ-aware, un mensaje a las 23:59 en Argentina (-03:00) podría ser "ayer" en UTC (02:59 del día siguiente).

**Ejemplo:**
```javascript
const now = new Date("2025-10-31T23:59:00-03:00"); // 31 oct 23:59 Argentina
const yesterday = new Date("2025-10-30T10:00:00-03:00"); // 30 oct 10:00

// Sin TZ (UTC):
daysBetween(now, yesterday); // → 0 (ambos son día 1 en UTC)

// Con TZ (Argentina -03:00):
daysBetweenLocal(now, yesterday, "-03:00"); // → 1 ✅ (31 oct - 30 oct = 1 día)
```

---

##### Path & Array Helpers

```javascript
function get(o,p){
  return p.split(".").reduce((a,k)=> (a && a[k] !== undefined) ? a[k] : undefined, o);
}

function set(o,p,v){
  const ks = p.split(".");
  let cur = o;
  for (let i=0;i<ks.length-1;i++){
    const k = ks[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[ks[ks.length-1]] = v;
}

function arraysEqual(a,b){
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i=0;i<a.length;i++){ if (a[i] !== b[i]) return false; }
  return true;
}

function tokenizeLc(s){
  return String(s||"").toLowerCase().split(/[^a-z0-9áéíóúüñ]+/).filter(Boolean);
}
```

**Propósito:**
- `get()/set()`: Acceso a nested properties con dot notation
- `arraysEqual()`: Comparación estricta de arrays
- `tokenizeLc()`: Tokeniza string a lowercase words (útil para keyword matching)

---

#### 2. Input Parsing (Líneas 101-140)

```javascript
const j = $json || {};

// Base inputs
const profile = j.profile || {};
const state   = j.state   || {};
const agent   = j.agent_brief || {};
const patch   = j.patch   || {};
const options = j.options || {};

const lastIncoming = agent.last_incoming || {};
const last_user_text = String(pick(j.last_user_text, lastIncoming.text, "") || "").trim();

// Reduced history / summary
const reduced_history = pick(
  j.context?.reduced_history,
  j.older_history_compact,
  agent.history_summary,
  null
);

// Timing y TZ
const tz = pick(j.tz, profile.tz, state.tz, "-03:00");
const nowRef = parseIso(j.meta?.now_ts) || new Date();
const last_seen_iso = pick(j.timing?.last_seen_iso, lastIncoming.ts, null);
const seenRef = parseIso(last_seen_iso) || nowRef;
```

**Lógica:**
1. Extrae campos base (profile, state, agent_brief, patch, options)
2. **last_user_text**: Texto del último mensaje del usuario (desde agent_brief.last_incoming o j.last_user_text)
3. **reduced_history**: Summary de conversación (desde agent_brief.history_summary o context)
4. **Timing setup:**
   - `tz`: Timezone del lead (fallback: "-03:00" Argentina)
   - `nowRef`: Timestamp actual (desde meta.now_ts o Date.now())
   - `seenRef`: Timestamp del último mensaje del usuario

---

#### 3. Recency Analytics (Líneas 141-175)

```javascript
const ageMs = nowRef - seenRef;
const recency_bucket = bucketByAge(ageMs);
const is_fresh = recency_bucket === "fresh";

// Recencia humana (tz-aware)
const hours_since_last_seen = ageMs >= 0 ? Math.floor(ageMs / (60*60*1000)) : null;
const days_since_last_seen  = daysBetweenLocal(nowRef, seenRef, tz);

let calendar_recency = "unknown";
if (days_since_last_seen != null) {
  if (days_since_last_seen === 0) calendar_recency = "hoy";
  else if (days_since_last_seen === 1) calendar_recency = "ayer";
  else if (days_since_last_seen <= 6) calendar_recency = "esta_semana";
  else calendar_recency = "anterior";
}

let reengagement_style = "continuation";
if (recency_bucket === "fresh" || recency_bucket === "warm") {
  reengagement_style = "continuation";
} else if (recency_bucket === "stale" || calendar_recency === "esta_semana") {
  reengagement_style = "recap";
} else {
  reengagement_style = "reactivation";
}

let opening_hint = "";
if (calendar_recency === "hoy") {
  opening_hint = "Sigamos donde quedamos hoy.";
} else if (calendar_recency === "ayer") {
  opening_hint = "Ayer hablamos; retomo desde ahí si te parece.";
} else if (calendar_recency === "esta_semana") {
  opening_hint = "A principios de semana comentaste algo; puedo hacer un breve recap.";
} else if (calendar_recency === "anterior") {
  opening_hint = "Hace tiempo que no hablamos; te hago un recap breve si querés.";
}
```

**Lógica:**

1. **ageMs**: Milisegundos desde último mensaje
2. **recency_bucket**: Clasificación (fresh <30min, warm <6h, stale <24h, dormant >24h)
3. **hours_since_last_seen**: Horas transcurridas (entero)
4. **days_since_last_seen**: Días transcurridos **TZ-aware** (considera timezone local)
5. **calendar_recency**: Clasificación humana (hoy, ayer, esta_semana, anterior)
6. **reengagement_style**: Estrategia de respuesta:
   - `continuation`: Conversación continua (fresh/warm)
   - `recap`: Breve resumen (stale/esta_semana)
   - `reactivation`: Reactivación con contexto (dormant/anterior)
7. **opening_hint**: Sugerencia de apertura para Master Agent

**Ejemplo:**
```javascript
// Mensaje hace 3 horas (tz: -03:00)
ageMs = 3 * 60 * 60 * 1000; // 10,800,000 ms
recency_bucket = "warm"; // <6h
hours_since_last_seen = 3;
days_since_last_seen = 0; // Mismo día local
calendar_recency = "hoy";
reengagement_style = "continuation";
opening_hint = "Sigamos donde quedamos hoy.";
```

---

#### 4. Cooldown Management (Líneas 176-195)

```javascript
const counters = state.counters || {};
const cd = state.cooldowns || {};

const emailAskAgoMs     = msSince(cd.email_ask_ts, nowRef);
const addresseeAskAgoMs = msSince(cd.addressee_ask_ts, nowRef);

const CD_EMAIL_H = 6;
const CD_ADDR_H  = 12;

function windowOk(agoMs, hoursWin){
  if (agoMs == null) return true; // Never asked → OK
  return agoMs > (hoursWin * 3600000);
}

const email_cooldown_ok     = windowOk(emailAskAgoMs, CD_EMAIL_H);
const addressee_cooldown_ok = windowOk(addresseeAskAgoMs, CD_ADDR_H);

// Policy desde Analyst
const reask = agent.reask_decision || {};
const policy_can_ask_email_now     = (typeof reask.can_ask_email_now === "boolean") ? !!reask.can_ask_email_now : true;
const policy_can_ask_addressee_now = (typeof reask.can_ask_addressee_now === "boolean") ? !!reask.can_ask_addressee_now : true;
```

**Lógica:**

1. **Cooldown windows:**
   - Email: 6 horas (CD_EMAIL_H = 6)
   - Addressee: 12 horas (CD_ADDR_H = 12)

2. **windowOk()**:
   - Si nunca se preguntó (null) → `true` (OK preguntar)
   - Si hace más de N horas → `true` (OK preguntar)
   - Si hace menos de N horas → `false` (cooldown activo)

3. **Policy from Analyst:**
   - `policy_can_ask_email_now`: Desde agent_brief.reask_decision (email gating policy)
   - `policy_can_ask_addressee_now`: Desde agent_brief.reask_decision

**Decisión final:** Master Agent debe combinar ambos:
```javascript
can_ask_email_final = email_cooldown_ok && policy_can_ask_email_now;
```

**Ejemplo:**
```javascript
// Preguntamos email hace 3 horas
cd.email_ask_ts = "2025-10-31T15:00:00Z";
nowRef = new Date("2025-10-31T18:00:00Z");

emailAskAgoMs = 3 * 60 * 60 * 1000; // 3 horas
email_cooldown_ok = windowOk(10800000, 6); // 3h < 6h → false ❌

policy_can_ask_email_now = true; // Analyst dice OK

// Decisión final:
can_ask_email_final = false && true = false; // ❌ Cooldown bloquea
```

---

#### 5. Intent Heuristics (Líneas 196-245) - **REFACTORED v4.0**

```javascript
const textLc = last_user_text.toLowerCase();

const NEUTRAL = ["hola","buenas","qué tal","que tal","como estas","cómo estás","gracias","ok","dale"];
const STRONG_KEYWORDS = [
  "whatsapp","chatbot","voice","ivr","odoo","erp","crm",
  "reservas","pedido","knowledge base","kb",
  "automatización","automatiza","sincronización",
  "n8n","chatwoot","qdrant"
];

function hasNeutral(s){ return NEUTRAL.some(g => s.includes(g)); }
function strongMatches(s){ return STRONG_KEYWORDS.filter(k => s.includes(k)); }

let intent_hint = String(agent.intent || "").toLowerCase().trim() || null;
let freeze_counters = false;
let matched_terms = strongMatches(textLc);

// NUEVO v4.0: Detectar selección de servicio
const serviceTarget = agent?.service_target || null;
const serviceCanonical = serviceTarget?.canonical || null;
const selectionIsNumeric = /^\s*\d+\s*$/.test(textLc);
const service_selected = Boolean(serviceCanonical) || selectionIsNumeric;

if (service_selected) {
  intent_hint = "service_selected";
  freeze_counters = false; // ✅ FIX v4.0: NO congelar counters en selección

  // Enriquecer matched_terms con tokens del servicio
  const toks = [
    ...tokenizeLc(serviceCanonical || ""),
    ...(Array.isArray(serviceTarget?.rag_hints) ? serviceTarget.rag_hints.flatMap(tokenizeLc) : [])
  ];
  matched_terms = Array.from(new Set([...(matched_terms||[]), ...toks].filter(Boolean)));
} else {
  if (!textLc) {
    intent_hint = intent_hint || "neutral";
  } else if (matched_terms.length === 0 && !hasNeutral(textLc)) {
    intent_hint = "offtopic";
    freeze_counters = true; // ✅ Solo congelar en offtopic
  } else if (!intent_hint) {
    intent_hint = (matched_terms.length > 0) ? "ontopic" : "neutral";
  }
}

// Override: greeting/contact_share NUNCA offtopic
const intentNorm = String(agent?.intent || "").toLowerCase().trim();
const GREET_SET = new Set(["greeting","greet_only","contact_share"]);
const NAME_PROVIDED_RX = /\b(me llamo|mi nombre es|^\s*soy\s+)/i;

if (GREET_SET.has(intentNorm) || NAME_PROVIDED_RX.test(last_user_text)) {
  if (!service_selected) intent_hint = "neutral";
  freeze_counters = false;
}
```

**Cambios v4.0:**

1. **service_selected detection:**
   - Si `agent_brief.service_target.canonical` existe → `service_selected = true`
   - Si mensaje es numérico ("1", "2", etc.) → `service_selected = true`

2. **NO congelar counters en service selection:**
   - **Antes (v3.x)**: Selección de servicio congelaba counters ❌
   - **Ahora (v4.0)**: Solo offtopic congela counters ✅

3. **Enriquecer matched_terms:**
   - Si hay service_target, extrae tokens de canonical + rag_hints
   - Añade a matched_terms para mejor contexto

4. **Intent classification:**
   - `service_selected`: Usuario seleccionó servicio (numérico o service_target presente)
   - `ontopic`: Mensaje contiene keywords fuertes
   - `neutral`: Saludos o mensajes genéricos
   - `offtopic`: No contiene keywords ni es neutral (fuera de tema)

5. **Override para greetings:**
   - Si intent es greeting/contact_share → forzar `neutral` (nunca offtopic)
   - Si texto contiene "me llamo", "mi nombre es" → forzar `neutral`

**Ejemplo:**
```javascript
// Caso 1: Selección numérica
last_user_text = "1";
selectionIsNumeric = true;
service_selected = true;
intent_hint = "service_selected";
freeze_counters = false; // ✅

// Caso 2: Service target presente
serviceTarget = { canonical: "WhatsApp Chatbot", rag_hints: ["beneficios chatbot"] };
service_selected = true;
intent_hint = "service_selected";
matched_terms = ["whatsapp", "chatbot", "beneficios"]; // Enriquecido

// Caso 3: Offtopic
last_user_text = "me gusta el fútbol";
matched_terms = []; // Sin keywords
hasNeutral("me gusta el fútbol") = false;
intent_hint = "offtopic";
freeze_counters = true; // ✅

// Caso 4: Greeting con nombre
last_user_text = "Hola, me llamo Felix";
intent_norm = "contact_share";
→ Override: intent_hint = "neutral", freeze_counters = false; // ✅
```

---

#### 6. Patch Analysis (Líneas 246-260)

```javascript
const counters_already_updated = {
  services_seen: Number.isFinite(get(patch,"counters.services_seen")),
  prices_asked:  Number.isFinite(get(patch,"counters.prices_asked")),
  deep_interest: Number.isFinite(get(patch,"counters.deep_interest")),
};

const cooldowns_already_updated =
  !!(patch?.cooldowns && (
      Object.prototype.hasOwnProperty.call(patch.cooldowns, "addressee_ask_ts") ||
      Object.prototype.hasOwnProperty.call(patch.cooldowns, "email_ask_ts")
  ));
```

**Propósito:** Detecta si el LLM/BuildStatePatch ya actualizó counters o cooldowns.

**Uso:** Evitar duplicar updates en nodos posteriores.

**Ejemplo:**
```javascript
// patch = { "cooldowns": { "addressee_ask_ts": "2025-10-31T14:16:42Z" } }

counters_already_updated = {
  services_seen: false, // No está en patch
  prices_asked: false,
  deep_interest: false
};

cooldowns_already_updated = true; // ✅ addressee_ask_ts está en patch
```

---

#### 7. Compatibility Checks (Líneas 261-300)

```javascript
const IMMUTABLES = ["lead_id","chatwoot_id","phone_number","country","tz","channel"];

const immutables_ok = IMMUTABLES.every(k => {
  const pv = profile?.[k];
  const sv = state?.[k];
  return (pv === undefined) || (sv === undefined) || (pv === sv);
});

const patch_mismatches = [];
if (patch && typeof patch === "object"){
  const paths = Object.keys(patch);
  for (const root of paths){
    const node = patch[root];
    if (node && typeof node === "object" && !Array.isArray(node)){
      // Nested (e.g., cooldowns.email_ask_ts)
      for (const key of Object.keys(node)){
        const path = `${root}.${key}`;
        const pval = node[key];
        const sval = get(state, path);
        const equal = Array.isArray(pval) && Array.isArray(sval)
          ? arraysEqual(pval, sval)
          : (pval === sval);
        if (!equal){
          patch_mismatches.push({ path, patch_value: pval, state_value: sval });
        }
      }
    } else {
      // Top-level (e.g., stage)
      const pval = node;
      const sval = get(state, root);
      const equal = Array.isArray(pval) && Array.isArray(sval)
        ? arraysEqual(pval, sval)
        : (pval === sval);
      if (!equal){
        patch_mismatches.push({ path: root, patch_value: pval, state_value: sval });
      }
    }
  }
}

const compat_report = {
  immutables_ok,
  patch_applied_ok: patch_mismatches.length === 0,
  patch_mismatches
};
```

**Propósito:**

1. **Immutables check:**
   - Verifica que campos inmutables (lead_id, phone, country, tz, channel) sean iguales en profile y state
   - Si difieren → `immutables_ok: false` (problema de sincronización)

2. **Patch application check:**
   - Verifica que valores en `patch` coincidan con valores en `state`
   - Si difieren → patch no se aplicó correctamente
   - Registra mismatches para debugging

**Ejemplo:**
```javascript
// profile.lead_id = 33
// state.lead_id = 33
→ immutables_ok = true ✅

// patch = { "cooldowns": { "addressee_ask_ts": "2025-10-31T14:16:42Z" } }
// state.cooldowns.addressee_ask_ts = "2025-10-31T14:16:42Z"
→ patch_applied_ok = true ✅

// Caso de error:
// patch.stage = "match"
// state.stage = "explore"
→ patch_mismatches = [{ path: "stage", patch_value: "match", state_value: "explore" }]
→ patch_applied_ok = false ❌
```

---

#### 8. Flags Assembly (Líneas 301-360)

##### flags_base (compat con versiones anteriores)

```javascript
const flags_base = {
  recency_bucket,
  is_fresh,
  has_email: !!pick(state.email, profile.email),
  has_phone: !!pick(state.phone_number, profile.phone),
  stage: pick(state.stage, profile.stage, "explore"),
  priority: pick(profile.priority, "normal"),
  services_seen: Number(counters.services_seen || 0),
  prices_asked:  Number(counters.prices_asked  || 0),
  deep_interest: Number(counters.deep_interest || 0),
  email_cooldown_ok,
  addressee_cooldown_ok,
  policy_can_ask_email_now,
  policy_can_ask_addressee_now,
  intent_hint,
  freeze_counters,
  matched_terms,
  last_user_text
};
```

**Propósito:** Flags básicos para backward compatibility.

---

##### flags_base_llm

```javascript
const flags_base_llm = {
  counters_already_updated,
  cooldowns_already_updated
};
```

**Propósito:** Indica si LLM ya actualizó counters/cooldowns (evita duplicados).

---

##### flags_derived (NEW v4.0)

```javascript
const has_cta_menu = Array.isArray(agent?.cta_menu?.items) && agent.cta_menu.items.length > 0;

const flags_derived = {
  service_selected,
  selected_service_canonical: serviceCanonical || null,
  rag_hints: Array.isArray(serviceTarget?.rag_hints) ? serviceTarget.rag_hints : [],
  bundle: Array.isArray(serviceTarget?.bundle) ? serviceTarget.bundle : [],
  should_render_ctas: has_cta_menu,
  ready_for_benefits: (state?.stage === "match" && service_selected),
  ready_for_price_cta: (["match","price"].includes(state?.stage) && service_selected),
  ready_for_demo_cta: (["match","price","qualify"].includes(state?.stage) && service_selected),
};
```

**Propósito:** Flags derivados (NEW v4.0) para Master Agent.

**Campos:**
- `service_selected`: Si usuario seleccionó servicio
- `selected_service_canonical`: Nombre del servicio ("WhatsApp Chatbot")
- `rag_hints`: Hints para consultar RAG
- `bundle`: Servicios complementarios
- `should_render_ctas`: Si hay CTAs disponibles para renderizar
- `ready_for_benefits`: Si debe mostrar beneficios (stage=match + service selected)
- `ready_for_price_cta`: Si debe mostrar CTA de precios
- `ready_for_demo_cta`: Si debe mostrar CTA de demo

---

#### 9. Output Assembly (Líneas 361-END)

```javascript
const STATE_ECHO = {
  stage: state?.stage ?? "explore",
  counters: state?.counters ?? { services_seen:0, prices_asked:0, deep_interest:0 }
};

const can_ask_email_now = agent?.reask_decision?.can_ask_email_now === true;
const intent_normalized = String(agent?.intent || "").toLowerCase().trim();

return [{
  json: {
    lead_id: n(j.lead_id) ?? n(profile.lead_id) ?? n(state.lead_id),
    tz,
    timing: {
      last_seen_iso: parseIso(last_seen_iso)?.toISOString() || null,
      recency_bucket,
      hours_since_last_seen,
      days_since_last_seen,
      calendar_recency
    },
    context: {
      reduced_history,
      agent_intent: agent.intent || null,
      agent_stage: agent.stage || null,
      agent_recommendation: agent.recommendation || null,
      service_target: agent.service_target || null,   // NEW v4.0
      cta_menu: agent.cta_menu || null,               // NEW v4.0
      reask_decision: agent.reask_decision || null,
      reengagement_style,
      opening_hint
    },
    profile: {
      row_id:    pick(profile.row_id, state?.row_id),
      full_name: pick(state.full_name, profile.full_name, ""),
      email:     pick(state.email, profile.email),
      phone:     pick(state.phone_number, profile.phone),
      country:   pick(state.country, profile.country),
      stage:     pick(state.stage, profile.stage, "explore"),
      priority:  pick(profile.priority, "normal"),
      interests: Array.isArray(state.interests) ? state.interests
                : (Array.isArray(profile.interests) ? profile.interests : [])
    },
    state,
    last_user_text,
    older_history_compact: reduced_history,

    flags_base,
    flags_base_llm,
    flags_derived,              // NEW v4.0

    STATE_ECHO,
    can_ask_email_now,
    intent_normalized,

    compat_report,
    options: options || null,
    meta: j.meta || null,
    patch_meta: j.patch_meta || null
  }
}];
```

**Output structure:**
- `lead_id`, `tz`: Identificación + timezone
- `timing`: Recency analytics (bucket, hours, days, calendar)
- `context`: Contexto enriquecido (reduced_history, agent_recommendation, service_target, cta_menu, reengagement_style, opening_hint)
- `profile`: Profile simplificado (row_id, full_name, email, phone, stage, priority, interests)
- `state`: State completo
- `flags_base`: Flags básicos (recency, cooldowns, counters, intent_hint)
- `flags_base_llm`: Flags de actualización LLM
- `flags_derived`: **NEW v4.0** (service_selected, rag_hints, ready_for_* flags)
- `STATE_ECHO`: Echo simplificado de state (stage + counters)
- `compat_report`: Compatibility checks (immutables, patch application)
- `options`, `meta`, `patch_meta`: Metadata original

---

## Input

Input desde **BuildStatePatch (Node 46)**:

```json
{
  "profile": { "lead_id": 33, "full_name": "Felix Figueroa", "tz": "-03:00", ... },
  "state": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
    "cooldowns": { "email_ask_ts": null, "addressee_ask_ts": "2025-10-31T14:16:42.000Z" }
  },
  "agent_brief": {
    "intent": "contact_share",
    "stage": "explore",
    "service_target": {},
    "cta_menu": { "items": ["Ver precios", "Beneficios e integraciones", "Agendar demo", "Solicitar propuesta"] },
    "last_incoming": { "role": "user", "text": "Si, claro me llamo Felix", "ts": "2025-10-31T18:59:47.000Z" }
  },
  "patch": {
    "cooldowns": { "addressee_ask_ts": "2025-10-31T14:16:42.000Z" }
  },
  "patch_meta": { ... },
  "meta": { "now_ts": "2025-10-31T19:26:45.093Z" }
}
```

---

## Output

(Continuaré con el output completo, casos de uso, comparaciones y mejoras en el siguiente mensaje debido al límite de longitud)
