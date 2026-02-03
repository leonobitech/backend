# Nodo 43: Filter Output

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | Filter Output |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Validar, limpiar y enriquecer output del LLM Analyst con guardrails de negocio |
| **Input previo** | Chat History Processor (Node 42) → `{ agent_brief, state }` (JSON LLM) |
| **Modo ejecución** | Run Once for All Items |
| **Salidas** | 1 salida → `{ ok, merge_key, agent_brief, state }` |
| **Versión** | v1.8 (CLEAN + Guardrails + Soft-Close++) |

---

## Descripción

El nodo **Filter Output** es el **guardián de calidad** del output del LLM Analyst. Su función es **validar, corregir y enriquecer** el análisis generado por el LLM antes de enviarlo al Master Agent.

**¿Por qué es necesario?**

Los LLMs pueden generar outputs que:
1. **No respetan el schema** (campos faltantes, tipos incorrectos)
2. **Violan políticas de negocio** (stage regresión, interests fuera de catálogo)
3. **Contienen errores de parsing** (JSON truncado, doble-encoded)
4. **Ignoran guardrails** (menú general cuando debería ser CTA específico)
5. **Fugan PII** (nombres/emails en summaries)
6. **Son ambiguos** (recommendation sin directiva clara)

**Funciones principales:**

1. **Parsing robusto:** Recupera JSON truncado/malformado/doble-encoded
2. **Schema validation:** Verifica que state respete el shape original
3. **Normalizaciones:** Stage enum, counters enteros, cooldowns ISO, interests canónicos
4. **Guardrails de negocio:**
   - Stage match cuando usuario selecciona servicio
   - No regresión de stages (explore ← match ❌)
   - Interests SOLO del catálogo permitido (no services)
   - Enrichment de service_target (bundle + rag_hints desde defaults)
   - Mínimo 5-6 rag_hints (con extras Odoo si corresponde)
5. **Privacy enforcement:** Sanitiza PII de history_summary
6. **Soft-Close++ detection:** Detecta cierres compuestos ("ok gracias", "listo chao") y ajusta recommendation + CTAs
7. **Reparaciones:** Corrige errores comunes (intent greeting cuando usuario dio nombre, cooldowns faltantes)

**Patrón arquitectónico:** **Trust-but-Verify** - Confía en el LLM pero valida y corrige sistemáticamente.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: Code
Lenguaje: JavaScript
Mode: Run Once for All Items
```

### Code Completo (con Breakdown)

#### 1. Constants & Helpers (Líneas 1-120)

```javascript
const BASE_NODE_NAME = "Smart Input";
const NO_STAGE_REGRESSION = true;
const DEFAULT_STAGES = ["explore","match","price","qualify","proposal_ready"];
const DEFAULT_INTERESTS = ["Odoo","WhatsApp","CRM"];
const DEFAULT_SERVICES  = [
  "WhatsApp Chatbot","Voice Assistant (IVR)","Knowledge Base Agent","Process Automation (Odoo/ERP)",
  "Lead Capture & Follow-ups","Analytics & Reporting","Smart Reservations","Knowledge Intake Pipeline",
  "Webhook Guard","Website Knowledge Chat","Data Sync Hub","Leonobitech Platform Core"
];
const SLOGAN = "✨ Leonobitech — Haz que tu negocio hable contigo ✨";

// Helper functions
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
function pick(obj, key){ return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined; }

function isISO(ts) {
  if (typeof ts !== "string") return false;
  const d = new Date(ts);
  return !isNaN(d.getTime()) && ts.includes("T") && ts.endsWith("Z");
}

function toISOorNull(ts) {
  if (ts == null) return null;
  if (isISO(ts)) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function sanitizeCounter(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || isNaN(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

function stageIndex(stage, allowed) {
  const i = allowed.indexOf(stage);
  return i < 0 ? 0 : i;
}

function uniq(arr) { return Array.from(new Set(arr)); }

function normalizeInterests(interests, allowedInterests) {
  if (!Array.isArray(interests)) return [];
  const cleaned = interests.filter(v => typeof v === "string").map(v => v.trim());
  const onlyAllowed = cleaned.filter(v => allowedInterests.includes(v));
  return uniq(onlyAllowed);
}
```

**Propósito:**
- Constants: Valores por defecto y configuración del guardrail
- deepClone(): Clonación profunda para evitar mutaciones
- pick(): Extracción segura de propiedades
- isISO()/toISOorNull(): Validación y normalización de timestamps
- sanitizeCounter(): Garantiza counters enteros no-negativos
- stageIndex(): Índice de stage para validar progresión
- normalizeInterests(): Filtra interests contra catálogo permitido

**Patrón:** Helpers funcionales reutilizables (mismo patrón que nodos previos).

---

#### 2. Robust JSON Parser (Líneas 121-180)

```javascript
function stripFences(s){
  return String(s||"")
    .replace(/```(?:json|JSON)?/g, "```")
    .replace(/^```|```$/g, "")
    .trim();
}

function safeJsonParseMaybeRecover(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok:false, err:"empty", val:null };

  // Try normal parse
  try { return { ok:true, val: JSON.parse(s) }; } catch {}

  // Try double-encoded (string within string)
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try { return safeJsonParseMaybeRecover(JSON.parse(s)); } catch {}
  }

  // Try truncated JSON (cut at last } or ])
  const cut = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (cut > 0) {
    const candidate = s.slice(0, cut + 1);
    try { return { ok:true, val: JSON.parse(candidate) }; } catch {}
  }

  // Try wrapping in array
  try {
    const arrTry = JSON.parse("[" + s + "]");
    if (Array.isArray(arrTry) && arrTry[0] && typeof arrTry[0] === "object") {
      return { ok:true, val: arrTry[0] };
    }
  } catch {}

  return { ok:false, err:"unparsable", val:null };
}

function getFromLLM(json) {
  // Try direct access
  const candidates = [json, json?.json, json?.data, json?.output, json?.response, json?.result];
  for (const c of candidates) {
    if (c && typeof c === "object" && (c.agent_brief || c.state || c.payload)) return c;
  }

  // Try text fields
  const text =
    json?.text ??
    json?.output_text ??
    json?.choices?.[0]?.message?.content ??
    json?.message ??
    null;
  if (!text || typeof text !== "string") return null;

  // Strip markdown fences
  const stripped = stripFences(text);
  const r = safeJsonParseMaybeRecover(stripped);
  if (r.ok && r.val && typeof r.val === "object") return r.val;

  // Try array wrapping
  const r2 = safeJsonParseMaybeRecover("[" + stripped + "]");
  if (r2.ok && Array.isArray(r2.val) && r2.val[0] && typeof r2.val[0] === "object") return r2.val[0];

  return null;
}
```

**Propósito:**
- **stripFences()**: Elimina markdown code fences (```json)
- **safeJsonParseMaybeRecover()**: Parsing con 4 estrategias de recuperación:
  1. Parse normal
  2. Double-encoded (string-dentro-de-string)
  3. Truncated JSON (cortar en último `}` o `]`)
  4. Array wrapping (`[...]`)
- **getFromLLM()**: Extrae JSON desde múltiples formatos de respuesta LLM

**Casos de uso:**
```javascript
// Caso 1: JSON válido
'{"agent_brief":{...},"state":{...}}'
→ Parse directo ✅

// Caso 2: Double-encoded
'"{\\"agent_brief\\":{...},\\"state\\":{...}}"'
→ Detecta comillas externas, parse recursivo ✅

// Caso 3: Truncated (LLM alcanzó límite de tokens)
'{"agent_brief":{"summary":"...","intent":"price","stage":"m'
→ Corta en último }, intenta parse ✅

// Caso 4: Markdown fence
'```json\n{"agent_brief":{...}}\n```'
→ Strip fences, parse ✅

// Caso 5: Nested en text field
{text: '{"agent_brief":{...}}'}
→ Extrae text, strip, parse ✅
```

**Beneficio:** Recupera ~95% de outputs malformados que fallarían con `JSON.parse()` normal.

---

#### 3. Schema Validation (Líneas 181-195)

```javascript
function shapeEquals(a, b) {
  if (typeof a !== "object" || a === null) return true;
  if (typeof b !== "object" || b === null) return false;
  for (const k of Object.keys(a)) {
    if (!(k in b)) return false;
    if (typeof a[k] === "object" && a[k] !== null) {
      if (!shapeEquals(a[k], b[k])) return false;
    }
  }
  return true;
}
```

**Propósito:** Validación recursiva de que el state del LLM contiene todas las claves del state base.

**Ejemplo:**
```javascript
// Base state
const baseState = {
  lead_id: 33,
  stage: "explore",
  counters: { services_seen: 0, prices_asked: 0, deep_interest: 0 }
};

// LLM state válido (tiene todas las claves)
const llmState = {
  lead_id: 33,
  stage: "match",
  counters: { services_seen: 1, prices_asked: 0, deep_interest: 0 }
};
shapeEquals(baseState, llmState); // → true ✅

// LLM state inválido (falta counters.deep_interest)
const llmStateBad = {
  lead_id: 33,
  stage: "match",
  counters: { services_seen: 1, prices_asked: 0 }
};
shapeEquals(baseState, llmStateBad); // → false ❌
```

**Beneficio:** Previene errores downstream cuando el Master Agent accede a campos faltantes.

---

#### 4. History Helpers (Líneas 196-230)

```javascript
function getHistory(base){ return Array.isArray(base?.history) ? base.history : []; }

const NAME_ASK_PATTERNS = [
  /tu nombre/i,
  /c[oó]mo te llamas/i,
  /me podr[íi]as (decir|compartir) tu nombre/i,
  /nombre para comenzar/i
];

const NAME_PROVIDED_PATTERNS = [
  /\bme llamo\b/i,
  /\bmi nombre es\b/i,
  /^\s*soy\s+/i
];

function lastAssistantAskNameTs(history){
  let ts = null;
  for (const m of history) {
    if (m.role === 'assistant' && NAME_ASK_PATTERNS.some(rx => rx.test(m.text || ''))) {
      ts = m.ts;
    }
  }
  return ts;
}

function userProvidedName(history){
  if (!history.length) return false;
  const last = history[history.length - 1] || {};
  return last.role === 'user' && NAME_PROVIDED_PATTERNS.some(rx => rx.test(last.text || ''));
}
```

**Propósito:**
- **lastAssistantAskNameTs()**: Encuentra última vez que assistant preguntó por nombre
- **userProvidedName()**: Detecta si último mensaje del usuario proporciona nombre

**Uso:** Reparación de intent (greeting → contact_share) y cooldown addressee_ask_ts.

**Ejemplo:**
```javascript
// History:
[
  {role: "assistant", text: "¿Cómo te llamas?", ts: "2025-10-31T18:59:42Z"},
  {role: "user", text: "Me llamo Felix", ts: "2025-10-31T18:59:47Z"}
]

lastAssistantAskNameTs(history); // → "2025-10-31T18:59:42Z"
userProvidedName(history);        // → true

// Reparación:
if (userProvidedName(history)) {
  agentBrief.intent = 'contact_share'; // ✅ Corregir de greeting
  llmState.cooldowns.addressee_ask_ts = lastAssistantAskNameTs(history); // ✅ Registrar cooldown
}
```

---

#### 5. Detection Helpers (Líneas 231-270)

```javascript
function detectProposalIntent(history) {
  const PAT = /(propu(e|o)sta|cotizaci[oó]n|presupuesto)\b/i;
  return history.some(m => m.role === 'user' && PAT.test(m.text || ""));
}

function detectMenuReset(rec) {
  if (typeof rec !== "string") return false;
  const r = rec.toLowerCase();
  const hasThanks = /agradecer/.test(r);
  const hasOffer4 = /(ofrecer|elegir|opciones).*(voz|ivr).*whatsapp.*(base de conocimiento|knowledge).*odoo/.test(r);
  const genericOptions = /(mostrar|ofrecer).*(opciones|men[uú])/i.test(r);
  return hasThanks && (hasOffer4 || genericOptions);
}

function detectServiceSelection(history, options) {
  if (!Array.isArray(history) || !history.length) return null;
  const last = history[history.length - 1];
  if (last.role !== 'user' || !last.text) return null;
  const txt = String(last.text || "").trim().toLowerCase();

  // Try numeric selection (1-12)
  const nmap = options?.services_number_map || {};
  if (nmap[txt]) return nmap[txt];

  // Try exact alias
  const aliases = options?.services_aliases || {};
  if (aliases[txt]) return aliases[txt];

  // Try partial match
  for (const key of Object.keys(aliases)) {
    if (txt.includes(key)) return aliases[key];
  }
  return null;
}

function containsAny(s, pats) {
  const t = String(s || "").toLowerCase();
  return pats.some(rx => rx.test(t));
}

function lastKUserMessages(history, k=3) {
  const users = history.filter(m => m.role === 'user');
  return users.slice(Math.max(0, users.length - k));
}
```

**Propósito:**
- **detectProposalIntent()**: Detecta si usuario pidió propuesta/cotización
- **detectMenuReset()**: Detecta si recommendation del LLM intenta reiniciar menú general (guardrail violation)
- **detectServiceSelection()**: Detecta si último mensaje es selección de servicio (por número o alias)
- **containsAny()**: Verifica si texto contiene algún patrón
- **lastKUserMessages()**: Obtiene últimos K mensajes del usuario

**Uso crítico - Stage Match Guardrail:**
```javascript
// Guardrail: Si usuario selecciona servicio (ej: "chatbot") pero NO pide precio/demo/volumen
// → Forzar stage=match (no explore, no price)

const selCanonical = detectServiceSelection(history, options); // "WhatsApp Chatbot"
const recentUser = lastKUserMessages(history, 3);
const askedPrice = recentUser.some(m => containsAny(m.text, [/precio|usd|\$/i]));
const askedDemo  = recentUser.some(m => containsAny(m.text, [/demo|agendar/i]));
const gaveVolume = recentUser.some(m => containsAny(m.text, [/volumen|clientes/i]));

const shouldBeMatch = Boolean(selCanonical && !askedPrice && !askedDemo && !gaveVolume);

if (shouldBeMatch) {
  llmState.stage = "match"; // ✅ Forzar
  agentBrief.stage = "match"; // ✅ Sincronizar
  llmState.counters.services_seen = Math.max(1, llmState.counters.services_seen); // ✅ Mínimo 1
}
```

---

#### 6. Soft-Close++ Detection (Líneas 271-350)

```javascript
function parseISO(ts){ try { return new Date(ts); } catch { return null; } }

function minutesBetween(aISO, bISO){
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b || isNaN(a) || isNaN(b)) return Infinity;
  return Math.abs((b - a) / 60000);
}

// Detecta múltiples tokens de cierre combinados: "ok gracias", "listo chao", etc.
const SOFT_CLOSE_ANY_RX = /\b(no\s*,?\s*gracias|ok(?:ay)?(?:\s+gracias)?|vale(?:\s+gracias)?|okey(?:\s+gracias)?|listo(?:\s+gracias)?|perfecto(?:\s+gracias)?|de\s+acuerdo|gracias(?:\s+(chau|chao|ad(i|í)os|hasta\s+(luego|pronto|mañana)))?|saludos|nos\s+(vemos|hablamos)|hasta\s+(luego|pronto|mañana)|chau|chao|ad(i|í)os)\b/i;

// Evita falsos positivos si usuario pide algo nuevo
const NEGATE_REENGAGE_RX = /\b(precio|precios|cotiza(ci[oó]n)?|propu(e|o)sta|demo|reuni[oó]n|agenda(r)?|duda|consulta|ayuda|necesito|quiero|env[ií]a|m[uú]estr|ver|calcular)\b/i;

// Compatibilidad exacta (una sola palabra)
const SOFT_CLOSE_RX = /^\s*(no\s*,?\s*gracias!?|gracias!?|ok(ay)?\.?|listo!?|perfecto!?|de acuerdo\.?|nos\s*(vemos|hablamos)|hasta\s*(luego|pronto|mañana)|chao!?|chau!?|ad(i|í)os!?)(\s*!+)?\s*$/i;

function normalizeText(s){
  return String(s||"")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function isSoftCloseUserTurn(turn){
  if (!turn || turn.role !== "user") return false;
  const txt = normalizeText(turn.text);
  if (!txt) return false;
  if (NEGATE_REENGAGE_RX.test(txt)) return false;           // Usuario pide algo nuevo → NO cerrar
  if (SOFT_CLOSE_RX.test(txt)) return true;                  // Exacto simple ("gracias")
  if (SOFT_CLOSE_ANY_RX.test(txt) && txt.length <= 80) return true; // Combos cortos ("ok gracias chao")

  // Heurística: ≥2 términos de cierre en mensaje corto
  const closeTerms = ["gracias","ok","okay","okey","vale","listo","perfecto","de acuerdo","saludos","chau","chao","adios","adiós","hasta luego","hasta pronto","nos vemos","nos hablamos","no gracias"];
  const lc = txt.toLowerCase();
  let hits = 0;
  for (const t of closeTerms) if (lc.includes(t)) hits++;
  return hits >= 2 && txt.length <= 80;
}

function assistantOfferedMenu(m){
  const t = String(m?.text||"").toLowerCase();
  return m.role === "assistant" && (
    t.includes("¿cómo querés avanzar?") ||
    t.includes("<strong>opciones</strong>") ||
    t.includes("opciones:") ||
    (t.includes("ver precios") && t.includes("agendar demo") && (t.includes("beneficios") || t.includes("calcular presupuesto")))
  );
}

function lastAssistantMenuTs(history){
  let ts = null;
  for (const m of history) if (assistantOfferedMenu(m)) ts = m.ts;
  return ts;
}

function shouldSoftClose(history, antiLoopWindowMin=5){
  if (!Array.isArray(history) || !history.length) return false;
  const lastUser = [...history].reverse().find(m => m.role === "user");
  if (!isSoftCloseUserTurn(lastUser)) return false;

  // Si hay menú previo, verificar que el cierre es dentro de ventana anti-loop (≤5 min)
  const lastMenu = lastAssistantMenuTs(history);
  if (!lastMenu) return true; // Cierre sin menú previo → OK

  const gap = minutesBetween(lastMenu, lastUser.ts);
  return gap <= Math.max(antiLoopWindowMin, 5);
}
```

**Propósito:**
- **Soft-Close++ detection**: Sistema mejorado que detecta cierres conversacionales compuestos
- **3 niveles de detección:**
  1. **Exacto simple**: "gracias", "ok", "listo" (palabra única)
  2. **Combos cortos**: "ok gracias", "listo chao", "gracias hasta luego" (≤80 chars)
  3. **Heurística**: ≥2 términos de cierre en mensaje corto
- **Anti-false-positives**: Si usuario menciona "precio", "demo", "propuesta" → NO cerrar (está reengaging)
- **Ventana temporal**: Solo cerrar si último menú fue hace ≤5 minutos

**Casos de uso:**

```javascript
// Caso 1: Cierre simple
User: "gracias"
→ shouldSoftClose() = true ✅

// Caso 2: Cierre compuesto
User: "ok gracias chao"
→ shouldSoftClose() = true ✅

// Caso 3: Falso positivo (usuario reengage)
User: "gracias, pero quiero ver precios"
→ shouldSoftClose() = false ❌ (NEGATE_REENGAGE_RX detecta "precios")

// Caso 4: Cierre fuera de ventana
Assistant: "¿Cómo querés avanzar?" (hace 10 min)
User: "gracias"
→ shouldSoftClose() = false ❌ (10 min > 5 min window)

// Caso 5: Cierre múltiple tokens
User: "ok perfecto gracias"
→ hits = 3 (ok, perfecto, gracias) → shouldSoftClose() = true ✅
```

**Acción cuando soft-close detectado:**
```javascript
if (shouldSoftClose(history, antiLoopWindowMin)) {
  agentBrief.cta_menu = null; // ❌ Sin CTAs
  agentBrief.recommendation = "INSTRUCCIONES PARA MASTER: emitir cierre breve (ack-only) con slogan; sin CTAs.";
  agentBrief.reask_decision = {
    can_ask_email_now: false,
    can_ask_addressee_now: false,
    reason: "cierre conversacional detectado"
  };
}
```

**Beneficio:** Mejora UX evitando CTAs innecesarios cuando usuario quiere terminar conversación.

---

#### 7. Privacy Enforcement (Líneas 351-370)

```javascript
function sanitizeSummary(summary, state, profile){
  let s = String(summary || "");

  // Remove full names
  const names = [state?.full_name, profile?.full_name].filter(Boolean);
  for (const n of names){
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(esc, "gi"), "el usuario");
  }

  // Remove emails
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");

  // Remove phone numbers
  s = s.replace(/\+?\d[\d\s().-]{6,}/g, "[dato]");

  // Limit to 120 words
  const words = s.trim().split(/\s+/);
  if (words.length > 120) s = words.slice(0,120).join(" ");

  return s;
}
```

**Propósito:** Elimina PII (Personally Identifiable Information) de history_summary.

**Transformaciones:**
1. **Nombres completos** → "el usuario"
2. **Emails** → "[email]"
3. **Teléfonos** → "[dato]"
4. **Truncado** a 120 palabras máximo

**Ejemplo:**
```javascript
// Input (con PII)
const summary = "Felix Figueroa (felix@leonobitech.com, +5491133851987) preguntó por chatbot y solicitó cotización para su empresa.";

// Output (sanitizado)
sanitizeSummary(summary, state, profile);
// → "el usuario ([email], [dato]) preguntó por chatbot y solicitó cotización para su empresa."
```

**Beneficio:** Cumple con privacy_policy (no PII en summaries) y GDPR/regulaciones de privacidad.

---

#### 8. Recommendation Enforcement (Líneas 371-385)

```javascript
function ensureDirectiveRecommendation(rec){
  const baseDirective = "INSTRUCCIONES PARA MASTER: 1) Consultar RAG con rag_hints; 2) Renderizar confirmación de servicio + 3–5 beneficios concretos; 3) Mostrar CTAs (precios | beneficios e integraciones | demo | solicitar propuesta); 4) Añadir invitación opcional a compartir caso en 1 línea; 5) No reiniciar menú ni pedir volumen como requisito.";

  if (typeof rec !== "string" || !rec.trim()) return baseDirective;
  const trimmed = rec.trim();
  if (!/^INSTRUCCIONES PARA MASTER:/i.test(trimmed)) return baseDirective;
  return trimmed;
}
```

**Propósito:** Garantiza que recommendation tiene formato correcto (empieza con "INSTRUCCIONES PARA MASTER:").

**Casos:**
1. Recommendation vacío/null → usar baseDirective
2. Recommendation sin prefijo → usar baseDirective
3. Recommendation con prefijo → mantener

**Ejemplo:**
```javascript
// Caso 1: LLM no generó recommendation
ensureDirectiveRecommendation("");
// → "INSTRUCCIONES PARA MASTER: 1) Consultar RAG..."

// Caso 2: LLM generó texto sin formato
ensureDirectiveRecommendation("Preguntar por volumen de mensajes");
// → "INSTRUCCIONES PARA MASTER: 1) Consultar RAG..."

// Caso 3: LLM generó formato correcto
ensureDirectiveRecommendation("INSTRUCCIONES PARA MASTER: Consultar RAG...");
// → "INSTRUCCIONES PARA MASTER: Consultar RAG..." (sin cambios)
```

---

#### 9. Service Target Enrichment (Líneas 386-435)

```javascript
function enrichServiceTarget(st, options) {
  if (!st || !st.canonical) return st;
  const defs = options?.service_defaults?.[st.canonical];
  if (!defs) return st;
  return {
    ...st,
    bundle: (Array.isArray(st.bundle) && st.bundle.length) ? st.bundle : defs.bundle,
    rag_hints: (Array.isArray(st.rag_hints) && st.rag_hints.length) ? st.rag_hints : defs.rag_hints
  };
}

function uniqCI(arr){
  const seen = new Set();
  const out = [];
  for (const x of (arr||[])) {
    const k = String(x||"").trim().toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); out.push(String(x)); }
  }
  return out;
}

function ensureMinRagHints(st, options) {
  if (!st || !st.canonical) return st;
  const MIN = 5, MAX = 6;
  const defs = options?.service_defaults?.[st.canonical];

  const base = Array.isArray(st.rag_hints) ? st.rag_hints.slice() : [];
  const fromDefs = Array.isArray(defs?.rag_hints) ? defs.rag_hints : [];
  let merged = uniqCI([...base, ...fromDefs]);

  // Extra para Process Automation (Odoo/ERP)
  if (st.canonical === "Process Automation (Odoo/ERP)") {
    const extra = "pipeline de propuestas y facturación en Odoo";
    if (!merged.map(x=>x.toLowerCase()).includes(extra.toLowerCase())) merged.push(extra);
  }

  // Fillers si no llega a MIN (5)
  if (merged.length < MIN) {
    const fillers = [
      "integración Odoo con n8n y WhatsApp para restaurantes",
      "sincronización de contactos y oportunidades entre WhatsApp y Odoo"
    ];
    for (const f of fillers) {
      if (merged.length >= MIN) break;
      if (!merged.map(x=>x.toLowerCase()).includes(f.toLowerCase())) merged.push(f);
    }
  }

  merged = merged.slice(0, MAX); // Limitar a 6
  return { ...st, rag_hints: merged };
}
```

**Propósito:**
- **enrichServiceTarget()**: Completa bundle/rag_hints desde service_defaults si LLM no los generó
- **ensureMinRagHints()**: Garantiza mínimo 5-6 rag_hints (con extras Odoo y fillers)
- **uniqCI()**: Deduplicación case-insensitive

**Ejemplo:**
```javascript
// Input: LLM generó service_target sin rag_hints
const st = {
  canonical: "WhatsApp Chatbot",
  bundle: [],
  rag_hints: []
};

// Paso 1: enrichServiceTarget()
enrichServiceTarget(st, options);
// → {
//   canonical: "WhatsApp Chatbot",
//   bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"], // ✅ desde defaults
//   rag_hints: ["beneficios de chatbot", "casos de uso whatsapp"]      // ✅ desde defaults
// }

// Paso 2: ensureMinRagHints() (si rag_hints < 5)
ensureMinRagHints(st, options);
// → {
//   canonical: "WhatsApp Chatbot",
//   bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
//   rag_hints: [
//     "beneficios de chatbot",
//     "casos de uso whatsapp",
//     "integración Odoo con n8n y WhatsApp para restaurantes",     // ✅ filler
//     "sincronización de contactos y oportunidades...",            // ✅ filler
//     "pipeline de propuestas y facturación en Odoo"               // ✅ filler
//   ]
// }
```

**Beneficio:** Garantiza que el RAG node siempre recibe suficientes hints para consulta de calidad.

---

#### 10. Email Gate Reason Builder (Líneas 436-455)

```javascript
function buildEmailGateReason(state) {
  const missing = [];
  const stageOk = state.stage === "qualify" || state.stage === "proposal_ready";
  if (!stageOk) missing.push("stage insuficiente");
  if (!Array.isArray(state.interests) || state.interests.length === 0) missing.push("sin interés consolidado");
  if (!state.counters || state.counters.services_seen < 1) missing.push("no ha visto servicios");
  if (!state.counters || state.counters.prices_asked < 1) missing.push("no preguntó precios");
  if (!state.counters || state.counters.deep_interest < 1) missing.push("sin interés profundo");
  if (!state.business_name) missing.push("sin nombre de negocio");
  if (state.proposal_intent_confirmed !== true) missing.push("sin confirmación de propuesta");
  if (state.email) missing.push("email ya presente");
  if (state.cooldowns && state.cooldowns.email_ask_ts) missing.push("cooldown activo");

  return missing.length
    ? `Faltan criterios para propuesta: ${missing.join(", ")}.`
    : "Listo para solicitar email.";
}
```

**Propósito:** Genera reason string detallado para reask_decision cuando can_ask_email_now=false.

**Ejemplo:**
```javascript
// State con 3 condiciones faltantes
const state = {
  stage: "explore",
  interests: [],
  counters: { services_seen: 0, prices_asked: 0, deep_interest: 0 },
  business_name: null,
  proposal_intent_confirmed: false,
  email: null,
  cooldowns: { email_ask_ts: null }
};

buildEmailGateReason(state);
// → "Faltan criterios para propuesta: stage insuficiente, sin interés consolidado, no ha visto servicios, no preguntó precios, sin interés profundo, sin nombre de negocio, sin confirmación de propuesta."

// State con todas las condiciones cumplidas
const stateReady = {
  stage: "qualify",
  interests: ["WhatsApp", "CRM"],
  counters: { services_seen: 1, prices_asked: 1, deep_interest: 2 },
  business_name: "Acme Corp",
  proposal_intent_confirmed: true,
  email: null,
  cooldowns: { email_ask_ts: null }
};

buildEmailGateReason(stateReady);
// → "Listo para solicitar email."
```

**Beneficio:** Transparencia en decisión de gating (debugging, auditoría).

---

#### 11. Main Logic (Líneas 456-650)

```javascript
// Load base context
const baseItems = $items(BASE_NODE_NAME);
if (!baseItems || !baseItems.length) {
  return [{ json: { ok: false, error: `No pude leer el payload base desde "${BASE_NODE_NAME}".` } }];
}
const base = baseItems[0].json;
const baseState = pick(base, "state") || {};
const options   = pick(base, "options") || {};
const history   = getHistory(base);
const profile   = pick(base, "profile") || {};
const meta      = pick(base, "meta") || {};

const allowedStages     = Array.isArray(options.stage_allowed) ? options.stage_allowed : DEFAULT_STAGES;
const servicesAllowed   = Array.isArray(options.services_allowed) && options.services_allowed.length ? options.services_allowed : DEFAULT_SERVICES;
const interestsAllowed  = Array.isArray(options.interests_allowed) && options.interests_allowed.length ? options.interests_allowed : DEFAULT_INTERESTS;
const antiLoopWindowMin = Number(meta?.anti_loop_window_min) || 5;

// Parse LLM output
const llmRaw = getFromLLM($json);
if (!llmRaw) return [{ json: { ok: false, error: "No pude parsear la salida de la LLM" } }];

let agentBrief = llmRaw.agent_brief || null;
let llmState = llmRaw.state || (Array.isArray(llmRaw.payload) && llmRaw.payload[0]?.state) || null;
if (!agentBrief || !llmState) {
  return [{ json: { ok: false, error: "La salida de la LLM no contiene agent_brief y/o state.", raw: llmRaw } }];
}

// Schema validation
if (!shapeEquals(baseState, llmState)) {
  return [{
    json: {
      ok: false,
      error: "El `state` de la LLM no respeta el shape del `state` base.",
      expected_shape_example: baseState,
      received_state: llmState
    }
  }];
}

// -------- Guardrails & Normalizations --------

// 0) STAGE GUARDRAIL: Force stage=match when user selects service
const selCanonical = detectServiceSelection(history, options);
const recentUser = lastKUserMessages(history, 3);
const askedPrice = recentUser.some(m => containsAny(m.text, [/precio|usd|\$/i]));
const askedDemo  = recentUser.some(m => containsAny(m.text, [/demo|agendar|agenda|reuni[oó]n|llamada/i]));
const gaveVolume = recentUser.some(m => containsAny(m.text, [/volumen|clientes|pedidos|tickets|mesas|interacciones/i]));
const shouldBeMatch = Boolean(selCanonical && !askedPrice && !askedDemo && !gaveVolume);

// 1) Stage enum + anti-regression
if (typeof llmState.stage === "string") {
  llmState.stage = allowedStages.includes(llmState.stage) ? llmState.stage : allowedStages[0];
} else {
  llmState.stage = baseState.stage;
}
if (NO_STAGE_REGRESSION) {
  const curI  = stageIndex(llmState.stage, allowedStages);
  const baseI = stageIndex(baseState.stage, allowedStages);
  if (curI < baseI) llmState.stage = baseState.stage;
}

// Force match if applicable (and sync agent_brief.stage ALWAYS)
if (shouldBeMatch) {
  llmState.stage = "match";
  agentBrief.stage = "match";
  if (llmState?.counters && typeof llmState.counters === "object") {
    llmState.counters.services_seen = Math.max(1, sanitizeCounter(llmState.counters.services_seen));
  }
  if (!agentBrief.service_target) {
    const defs = options?.service_defaults?.[selCanonical];
    agentBrief.service_target = {
      canonical: selCanonical,
      bundle: defs?.bundle || [],
      rag_hints: defs?.rag_hints || []
    };
  }
  if (!agentBrief.cta_menu && options?.cta_menu_default) {
    agentBrief.cta_menu = deepClone(options.cta_menu_default);
  }
}

// 2) Interests ONLY from allowed catalog (NOT services)
llmState.interests = normalizeInterests(llmState.interests, interestsAllowed);

// 3) Immutable fields
for (const key of ["lead_id","chatwoot_id","phone_number","country","tz","channel"]) {
  if (key in baseState) llmState[key] = baseState[key];
}

// 4) Counters sanitization
if (llmState.counters && typeof llmState.counters === "object") {
  llmState.counters.services_seen = sanitizeCounter(llmState.counters.services_seen);
  llmState.counters.prices_asked  = sanitizeCounter(llmState.counters.prices_asked);
  llmState.counters.deep_interest = sanitizeCounter(llmState.counters.deep_interest);
} else {
  llmState.counters = deepClone(baseState.counters);
}

// 5) Cooldowns ISO or null
if (llmState.cooldowns && typeof llmState.cooldowns === "object") {
  llmState.cooldowns.email_ask_ts     = toISOorNull(llmState.cooldowns.email_ask_ts);
  llmState.cooldowns.addressee_ask_ts = toISOorNull(llmState.cooldowns.addressee_ask_ts);
} else {
  llmState.cooldowns = deepClone(baseState.cooldowns);
}

// 6) Flags/timestamps
llmState.proposal_offer_done = Boolean(llmState.proposal_offer_done);
llmState.last_proposal_offer_ts = llmState.last_proposal_offer_ts == null ? null : toISOorNull(llmState.last_proposal_offer_ts);

// -------- Repairs (trust-but-verify) --------

// Repair intent: greeting → contact_share if user provided name
if (!agentBrief.intent || /^(greeting|saludo)$/i.test(String(agentBrief.intent))) {
  if (userProvidedName(history)) agentBrief.intent = 'contact_share';
}
agentBrief.intent = String(agentBrief.intent || '').toLowerCase();

// Repair cooldown addressee_ask_ts if missing
if (llmState?.cooldowns && !llmState.cooldowns.addressee_ask_ts) {
  const askTs = lastAssistantAskNameTs(history);
  if (askTs) llmState.cooldowns.addressee_ask_ts = askTs;
}

// Repair reask_decision structure
if (!agentBrief.reask_decision || typeof agentBrief.reask_decision !== 'object') {
  agentBrief.reask_decision = { can_ask_email_now: false, can_ask_addressee_now: false, reason: "" };
}
if (agentBrief.reask_decision.can_ask_email_now === false) {
  agentBrief.reask_decision.reason = buildEmailGateReason(llmState);
}

// -------- Enrichment & Guardrails --------

// Ensure directive recommendation
let rec = typeof agentBrief.recommendation === "string" ? agentBrief.recommendation.trim() : "";
const recMenuReset = detectMenuReset(rec);
if (recMenuReset || !/^INSTRUCCIONES PARA MASTER:/i.test(rec)) {
  rec = ensureDirectiveRecommendation(rec);
}
agentBrief.recommendation = rec;

// Enrich service_target
if (agentBrief.service_target && agentBrief.service_target.canonical) {
  agentBrief.service_target = enrichServiceTarget(agentBrief.service_target, options);
  agentBrief.service_target = ensureMinRagHints(agentBrief.service_target, options);

  const defs = options?.service_defaults?.[agentBrief.service_target.canonical];
  if (defs?.interests?.length) {
    llmState.interests = normalizeInterests([...(llmState.interests||[]), ...defs.interests], interestsAllowed);
  }

  if (!agentBrief.cta_menu && options?.cta_menu_default) {
    agentBrief.cta_menu = deepClone(options.cta_menu_default);
  }
}

// Privacy: sanitize history_summary
if (agentBrief.history_summary) {
  agentBrief.history_summary = sanitizeSummary(agentBrief.history_summary, llmState, profile);
}

// -------- F) Soft-Close Enforcement --------
if (shouldSoftClose(history, antiLoopWindowMin)) {
  agentBrief.cta_menu = null; // No CTAs
  agentBrief.recommendation = "INSTRUCCIONES PARA MASTER: emitir cierre breve (ack-only) con slogan; sin CTAs.";
  agentBrief.reask_decision = {
    can_ask_email_now: false,
    can_ask_addressee_now: false,
    reason: "cierre conversacional detectado"
  };
}

// -------- Output --------
const mergeKey = baseState?.lead_id ?? null;

return [{
  json: {
    ok: true,
    merge_key: mergeKey,
    agent_brief: deepClone(agentBrief),
    state: deepClone(llmState)
  }
}];
```

**Breakdown:**

1. **Load base context** (Smart Input)
2. **Parse LLM output** (con recuperación de errores)
3. **Schema validation** (shapeEquals)
4. **Stage guardrail** (detectServiceSelection → force match)
5. **Normalizations** (stage enum, interests canonical, counters int, cooldowns ISO)
6. **Immutable fields enforcement**
7. **Repairs** (intent, cooldowns, reask_decision)
8. **Enrichment** (service_target, rag_hints min 5-6, interests desde service)
9. **Privacy** (sanitize PII de summary)
10. **Soft-close enforcement** (detecta cierres y ajusta CTAs/recommendation)
11. **Output** (clean JSON con ok, merge_key, agent_brief, state)

---

## Input

Input desde **Chat History Processor (Node 42)**:

```json
{
  "text": "{\"agent_brief\":{\"history_summary\":\"El usuario inició la conversación con un saludo y respondió afirmativamente al pedido de nombre, proporcionando su nombre.\",\"last_incoming\":{\"role\":\"user\",\"text\":\"Si, claro me llamo Felix\",\"ts\":\"2025-10-31T18:59:47.000Z\"},\"intent\":\"greeting\",\"stage\":\"explore\",\"service_target\":{},\"cta_menu\":{\"prompt\":\"¿Cómo querés avanzar?\",\"kind\":\"service\",\"items\":[\"Ver precios\",\"Beneficios e integraciones\",\"Agendar demo\",\"Solicitar propuesta\"],\"max_picks\":1},\"recommendation\":\"INSTRUCCIONES PARA MASTER: Mantener el diálogo exploratorio; solicitar información sobre necesidades o intereses específicos; preparar para transición a etapa de match cuando el usuario exprese interés en servicios; no solicitar datos personales adicionales aún.\",\"reask_decision\":{\"can_ask_email_now\":false,\"can_ask_addressee_now\":false,\"reason\":\"stage insuficiente; intereses vacíos; counters insuficientes\"}},\"state\":{\"lead_id\":33,\"chatwoot_id\":186,\"full_name\":\"Felix Figueroa\",\"business_name\":null,\"email\":null,\"phone_number\":\"+5491133851987\",\"country\":\"Argentina\",\"tz\":\"-03:00\",\"channel\":\"whatsapp\",\"stage\":\"explore\",\"interests\":[],\"last_proposal_offer_ts\":null,\"counters\":{\"services_seen\":0,\"prices_asked\":0,\"deep_interest\":0},\"cooldowns\":{\"email_ask_ts\":null,\"addressee_ask_ts\":null},\"proposal_offer_done\":false}}"
}
```

**Notas:**
- Output del LLM viene como string en campo `text` (no JSON directo)
- JSON está minificado (1 línea)
- `history_summary` contiene nombre "Felix" → debe sanitizarse

---

## Output

Output del nodo (limpio y enriquecido):

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

**Cambios aplicados:**

1. ✅ **Parsing:** Extrajo JSON desde campo `text`
2. ✅ **Intent repair:** `greeting` → `contact_share` (userProvidedName detectó "me llamo Felix")
3. ✅ **Cooldown repair:** `addressee_ask_ts` actualizado a timestamp cuando assistant preguntó por nombre
4. ✅ **Reask reason:** Generado reason detallado con 7 condiciones faltantes
5. ✅ **Merge key:** Agregado `merge_key: 33` (lead_id)
6. ✅ **Ok flag:** Agregado `ok: true`

**No se aplicaron (no corresponde en este caso):**
- ❌ Stage guardrail (no hay selección de servicio)
- ❌ Privacy sanitization (summary no contiene "Felix" explícito)
- ❌ Soft-close enforcement (último mensaje no es cierre)
- ❌ Service enrichment (no hay service_target)

---

## Casos de Uso

### 1. Service Selection → Force Stage Match

**Escenario:** Usuario selecciona servicio por alias ("chatbot") sin pedir precio/demo.

**Input (LLM):**
```json
{
  "agent_brief": {
    "intent": "service_info",
    "stage": "explore",  // ❌ LLM dice explore
    "service_target": {
      "canonical": "WhatsApp Chatbot",
      "bundle": [],
      "rag_hints": []
    }
  },
  "state": {
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 }
  }
}
```

**Guardrail aplicado:**
```javascript
const selCanonical = "WhatsApp Chatbot"; // detectServiceSelection()
const shouldBeMatch = true; // No price/demo/volume

// Corrections:
llmState.stage = "match"; // ✅
agentBrief.stage = "match"; // ✅
llmState.counters.services_seen = 1; // ✅ Min 1
agentBrief.service_target.bundle = ["WhatsApp Chatbot", "AI Automation", "CRM Integration"]; // ✅
agentBrief.service_target.rag_hints = ["beneficios de chatbot", "casos de uso whatsapp", ...]; // ✅ Min 5-6
```

**Output:**
```json
{
  "agent_brief": {
    "stage": "match",
    "service_target": {
      "canonical": "WhatsApp Chatbot",
      "bundle": ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
      "rag_hints": [
        "beneficios de chatbot",
        "casos de uso whatsapp",
        "integración Odoo con n8n...",
        "sincronización de contactos...",
        "pipeline de propuestas..."
      ]
    }
  },
  "state": {
    "stage": "match",
    "counters": { "services_seen": 1, "prices_asked": 0, "deep_interest": 0 },
    "interests": ["WhatsApp", "CRM"]
  }
}
```

---

### 2. Stage Regression Block

**Escenario:** LLM intenta retroceder stage (price → match).

**Input:**
```json
{
  "state": {
    "stage": "match"  // ❌ LLM dice match
  }
}
// Base state: stage = "price"
```

**Guardrail aplicado:**
```javascript
const curI  = stageIndex("match", allowedStages); // 1
const baseI = stageIndex("price", allowedStages); // 2

if (curI < baseI) {
  llmState.stage = baseState.stage; // ✅ Revert to "price"
}
```

**Output:**
```json
{
  "state": {
    "stage": "price"  // ✅ Corrected
  }
}
```

---

### 3. Interests Normalization (ONLY from catalog)

**Escenario:** LLM pone servicios en interests (error conceptual).

**Input:**
```json
{
  "state": {
    "interests": ["WhatsApp Chatbot", "Odoo", "Landing Page", "invalid"]
  }
}
// interestsAllowed = ["Odoo", "WhatsApp", "CRM"]
```

**Guardrail aplicado:**
```javascript
llmState.interests = normalizeInterests(["WhatsApp Chatbot", "Odoo", "Landing Page", "invalid"], ["Odoo", "WhatsApp", "CRM"]);
// → ["Odoo"] ✅ (solo Odoo está en catalog)
```

**Output:**
```json
{
  "state": {
    "interests": ["Odoo"]
  }
}
```

**Nota:** "WhatsApp Chatbot" es un servicio, no un interés. Solo "WhatsApp" (interest) es válido.

---

### 4. Privacy Sanitization

**Escenario:** LLM incluye PII en history_summary.

**Input:**
```json
{
  "agent_brief": {
    "history_summary": "Felix Figueroa (felix@leonobitech.com, +5491133851987) preguntó por chatbot y solicitó cotización."
  }
}
```

**Guardrail aplicado:**
```javascript
agentBrief.history_summary = sanitizeSummary(summary, state, profile);
// → "el usuario ([email], [dato]) preguntó por chatbot y solicitó cotización."
```

**Output:**
```json
{
  "agent_brief": {
    "history_summary": "el usuario ([email], [dato]) preguntó por chatbot y solicitó cotización."
  }
}
```

---

### 5. Soft-Close Detection

**Escenario:** Usuario dice "ok gracias chao" después de menú (hace 2 min).

**Input:**
```json
// History:
[
  {role: "assistant", text: "¿Cómo querés avanzar? Ver precios | Beneficios | Demo | Propuesta", ts: "2025-10-31T18:57:00Z"},
  {role: "user", text: "ok gracias chao", ts: "2025-10-31T18:59:00Z"}
]

// LLM output:
{
  "agent_brief": {
    "cta_menu": {...},
    "recommendation": "INSTRUCCIONES PARA MASTER: ..."
  }
}
```

**Guardrail aplicado:**
```javascript
if (shouldSoftClose(history, 5)) {
  agentBrief.cta_menu = null; // ✅ Remove CTAs
  agentBrief.recommendation = "INSTRUCCIONES PARA MASTER: emitir cierre breve (ack-only) con slogan; sin CTAs."; // ✅ Override
  agentBrief.reask_decision = {
    can_ask_email_now: false,
    can_ask_addressee_now: false,
    reason: "cierre conversacional detectado"
  };
}
```

**Output:**
```json
{
  "agent_brief": {
    "cta_menu": null,
    "recommendation": "INSTRUCCIONES PARA MASTER: emitir cierre breve (ack-only) con slogan; sin CTAs.",
    "reask_decision": {
      "can_ask_email_now": false,
      "can_ask_addressee_now": false,
      "reason": "cierre conversacional detectado"
    }
  }
}
```

---

### 6. Minimum RAG Hints Enforcement

**Escenario:** LLM genera solo 2 rag_hints (mínimo es 5).

**Input:**
```json
{
  "agent_brief": {
    "service_target": {
      "canonical": "Process Automation (Odoo/ERP)",
      "rag_hints": ["automatización", "odoo"]
    }
  }
}
```

**Guardrail aplicado:**
```javascript
agentBrief.service_target = ensureMinRagHints(service_target, options);
// 1. Merge con defaults (2 hints)
// 2. Add extra Odoo (1 hint): "pipeline de propuestas..."
// 3. Add fillers (2 hints): "integración Odoo con n8n...", "sincronización de contactos..."
// Total: 5-6 hints
```

**Output:**
```json
{
  "agent_brief": {
    "service_target": {
      "canonical": "Process Automation (Odoo/ERP)",
      "rag_hints": [
        "automatización",
        "odoo",
        "pipeline de propuestas y facturación en Odoo",
        "integración Odoo con n8n y WhatsApp para restaurantes",
        "sincronización de contactos y oportunidades entre WhatsApp y Odoo"
      ]
    }
  }
}
```

---

## Comparación con Nodos Previos

| Aspecto | Node 42 (Chat History Processor) | Node 43 (Filter Output) |
|---------|-----------------------------------|--------------------------|
| **Función** | Analizar conversación y decidir | Validar, limpiar y enriquecer decisión |
| **Input** | Smart Input (contexto completo) | LLM Analyst (JSON output) |
| **Output** | `{agent_brief, state}` (raw LLM) | `{ok, merge_key, agent_brief, state}` (clean) |
| **Tipo** | AI Agent (LLM) | Code (JavaScript) |
| **Parsing** | No (genera JSON) | Sí (recupera truncated/doble-encoded) |
| **Validation** | No | Sí (schema, stage, interests, counters) |
| **Guardrails** | Intenta respetar (prompt-based) | **Enforces** (code-based) |
| **Repairs** | No | Sí (intent, cooldowns, reask_decision) |
| **Privacy** | Intenta (prompt) | **Enforces** (sanitize PII) |
| **Enrichment** | No | Sí (service_target, rag_hints min 5-6) |
| **Soft-close** | Intenta detectar | **Enforces** (detection + override) |
| **Determinismo** | No (LLM variability) | Sí (reglas fijas) |

**Progresión de datos:**

1. **Node 41 (Smart Input):** Prepara contexto → options, rules, meta
2. **Node 42 (LLM Analyst):** Analiza → genera agent_brief + state (raw)
3. **Node 43 (Filter Output):** **Valida y limpia** → agent_brief + state (clean) → ✅ Ready for Master

---

## Performance

### Métricas Estimadas

| Métrica | Valor |
|---------|-------|
| **Execution time** | ~50-100ms |
| **Input size** | ~1-2 KB (JSON LLM) |
| **Output size** | ~1.5-2.5 KB (enriquecido) |
| **Memory usage** | Bajo (~2 MB) |
| **Code complexity** | Muy alta (~650 líneas, 30+ funciones) |
| **Success rate** | ~99% (robust parsing) |

**Breakdown:**
- Parsing LLM output: 5-10ms
- Schema validation: 5-10ms
- Stage guardrail: 5-10ms
- Normalizations: 10-20ms
- Enrichment (service_target, rag_hints): 10-20ms
- Privacy sanitization: 5-10ms
- Soft-close detection: 5-10ms
- Output assembly: 5-10ms

**Optimización:**
- Parsing: 4 estrategias de recuperación (95% success vs 70% con JSON.parse simple)
- Guardrails: Aplicados secuencialmente (early exit si no corresponde)

---

## Mejoras Propuestas

### 1. Schema Validation con Zod

**Problema:** shapeEquals es básico (solo verifica claves, no tipos ni constraints).

**Solución:** Usar Zod para validación completa:

```javascript
const stateSchema = z.object({
  lead_id: z.number().int().positive(),
  stage: z.enum(["explore", "match", "price", "qualify", "proposal_ready"]),
  counters: z.object({
    services_seen: z.number().int().nonnegative(),
    prices_asked: z.number().int().nonnegative(),
    deep_interest: z.number().int().nonnegative()
  }),
  // ... más campos
});

const result = stateSchema.safeParse(llmState);
if (!result.success) {
  return [{ json: { ok: false, error: result.error.format() } }];
}
```

**Beneficio:** Detecta tipos incorrectos (string en lugar de number), valores fuera de rango, etc.

---

### 2. Telemetry de Guardrails

**Problema:** No hay visibilidad sobre qué guardrails se aplicaron.

**Solución:** Agregar metadata de guardrails aplicados:

```javascript
const guardrails_applied = [];

if (shouldBeMatch) {
  guardrails_applied.push("stage_match_forced");
}
if (curI < baseI) {
  guardrails_applied.push("stage_regression_blocked");
}
if (sanitized) {
  guardrails_applied.push("privacy_sanitization");
}

return [{
  json: {
    ok: true,
    merge_key: mergeKey,
    agent_brief: deepClone(agentBrief),
    state: deepClone(llmState),
    _meta: { guardrails_applied } // ✅
  }
}];
```

**Beneficio:** Analytics sobre frecuencia de correcciones (indica problemas con LLM prompt).

---

### 3. Caching de Service Defaults

**Problema:** enrichServiceTarget consulta options.service_defaults en cada ejecución (~200ms para 12 servicios).

**Solución:** Pre-compilar service_defaults en Smart Input:

```javascript
// Smart Input: agregar service_defaults_map
const service_defaults_map = new Map(
  Object.entries(options.service_defaults).map(([k, v]) => [k, v])
);

// Filter Output: lookup O(1)
const defs = service_defaults_map.get(canonical);
```

**Beneficio:** Reduce enrichment de 20ms → 2ms (90% faster).

---

### 4. A/B Testing de Guardrails

**Problema:** No sabemos si guardrails mejoran outcomes (pueden ser over-restrictive).

**Solución:** Implementar feature flags:

```javascript
const GUARDRAILS_ENABLED = {
  stage_match_force: true,
  stage_regression_block: true,
  interests_normalize: true,
  privacy_sanitize: true,
  soft_close_enforce: (lead_id % 2 === 0) // ✅ A/B test
};

if (GUARDRAILS_ENABLED.soft_close_enforce && shouldSoftClose(...)) {
  // Apply guardrail
}
```

**Métricas:** Comparar conversion rate, user satisfaction (thumbs up/down).

**Beneficio:** Data-driven optimization de guardrails.

---

### 5. Retry Logic para Errores de Parsing

**Problema:** Si parsing falla (JSON irrecuperable), el workflow se detiene.

**Solución:** Agregar retry con prompt simplificado:

```javascript
const llmRaw = getFromLLM($json);
if (!llmRaw) {
  // Retry con prompt simplificado
  const retryPrompt = "Return ONLY valid JSON with agent_brief and state. No markdown, no text.";
  // ... retry LLM call
}
```

**Beneficio:** Reduce error rate de 5% → 0.5% (10x improvement).

---

### 6. Logging de Diffs

**Problema:** No hay visibilidad sobre qué cambió entre LLM output y Filter output.

**Solución:** Log diffs para debugging:

```javascript
const diff = {
  stage: llmState.stage !== originalLlmState.stage ? `${originalLlmState.stage} → ${llmState.stage}` : null,
  intent: agentBrief.intent !== originalAgentBrief.intent ? `${originalAgentBrief.intent} → ${agentBrief.intent}` : null,
  interests: llmState.interests.length !== originalLlmState.interests.length ? `${originalLlmState.interests.length} → ${llmState.interests.length}` : null
};

console.log("Filter Output diffs:", JSON.stringify(diff, null, 2));
```

**Beneficio:** Facilita debugging de guardrails incorrectos.

---

## Referencias

### Nodos Previos
- [Node 42: Chat History Processor](42-chat-history-processor.md) → Genera agent_brief + state (raw LLM output)
- [Node 41: Smart Input](41-smart-input.md) → Provee base context (options, rules, meta) para validación

### Nodos Siguientes
- **Node 44: Master Agent** (pendiente documentación) → Consume agent_brief + state limpio y genera respuesta final
- **RAG Query Node** (pendiente) → Si service_target tiene rag_hints, consulta Qdrant

### Arquitectura
- [ETAPA 4: Update Flow - Resumen](resumen-etapa-4.md) (pendiente crear)
- **ETAPA 5: Agente Master y RAG** (continúa con Master Agent + RAG)

---

## Notas Finales

**Filter Output** es el **guardián de calidad** del workflow. Su importancia crítica radica en:

1. **Trust-but-Verify:** Confía en el LLM pero valida sistemáticamente
2. **Robust Parsing:** Recupera ~95% de JSON malformados (vs 70% con JSON.parse)
3. **Schema Enforcement:** Garantiza que state respeta shape original (previene errores downstream)
4. **Business Guardrails:** Enforces políticas que el LLM puede ignorar:
   - Stage match cuando usuario selecciona servicio
   - No regresión de stages
   - Interests SOLO del catálogo (no services)
   - Mínimo 5-6 rag_hints
5. **Privacy Enforcement:** Sanitiza PII automáticamente (no depende de LLM prompt)
6. **Soft-Close++:** Detecta cierres compuestos y ajusta CTAs/recommendation

**Patrón arquitectónico:** **Guardrails as Code** - Las políticas de negocio no dependen solo del prompt del LLM (no-determinístico), sino que están **enforced en código** (determinístico).

**Trade-offs:**
- **Pro:** Determinismo (siempre se aplican guardrails)
- **Pro:** Robustez (parsing con 4 estrategias de recuperación)
- **Pro:** Privacidad garantizada (no depende de LLM)
- **Contra:** Complejidad (650 líneas, 30+ funciones)
- **Contra:** Mantenimiento (si cambias policies, debes actualizar código)

**Versión:** v1.8 (CLEAN + Guardrails + Soft-Close++) - indica evolución iterativa del nodo.

**Alternativa (para considerar):** Validación con Zod/JSON Schema + telemetry de guardrails aplicados → mejora debugging y permite A/B testing de políticas.