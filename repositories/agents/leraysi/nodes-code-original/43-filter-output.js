// ============================================================================
// NODE: Filter Output (Node #43)
// ============================================================================
// Description: Post-procesamiento y validación del output del LLM Analyst
// Input: { agent_brief, state } (from Chat History Processor)
// Output: { ok, merge_key, agent_brief, state }
//
// Features:
// - Parser robusto: recupera JSON truncado/doble-encodado
// - Guardrails: stage=match al elegir servicio, no reiniciar menú
// - Enrichment: service_target con RAG hints (5-6 items)
// - Normalization: interests, counters, cooldowns, stage anti-regression
// - Soft-Close++: detecta cierres compuestos y evita falsos positivos
// - Privacy: sanitiza PII en history_summary
// - Email gating validation
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

/**
 * Filter Output — Leonobitech (CLEAN + Guardrails + Soft-Close++) — v1.8
 * - PASSTHROUGH de recommendation.
 * - Guardrails: stage=match al elegir servicio, directiva interna,
 *   no reiniciar menú, enriquecer service_target, 5–6 rag_hints,
 *   intereses canónicos, privacidad, gating coherente.
 * - Parser robusto: recupera JSON truncado / doble-encodado.
 * - Soft-Close++: detecta cierres compuestos ("ok gracias", "listo gracias chao")
 *   y evita falsos positivos si el usuario reabre (precio, demo, propuesta, etc.).
 * - Entrega SOLO: { ok, merge_key, agent_brief, state }
 */

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

// ---------------- Helpers ----------------
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

function stripFences(s){
  return String(s||"")
    .replace(/```(?:json|JSON)?/g, "```")
    .replace(/^```|```$/g, "")
    .trim();
}

// -------- Parser robusto (recupera truncados/doble-encoding) --------
function safeJsonParseMaybeRecover(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok:false, err:"empty", val:null };
  try { return { ok:true, val: JSON.parse(s) }; } catch {}
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try { return safeJsonParseMaybeRecover(JSON.parse(s)); } catch {}
  }
  const cut = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (cut > 0) {
    const candidate = s.slice(0, cut + 1);
    try { return { ok:true, val: JSON.parse(candidate) }; } catch {}
  }
  try {
    const arrTry = JSON.parse("[" + s + "]");
    if (Array.isArray(arrTry) && arrTry[0] && typeof arrTry[0] === "object") {
      return { ok:true, val: arrTry[0] };
    }
  } catch {}
  return { ok:false, err:"unparsable", val:null };
}

function getFromLLM(json) {
  const candidates = [json, json?.json, json?.data, json?.output, json?.response, json?.result];
  for (const c of candidates) {
    if (c && typeof c === "object" && (c.agent_brief || c.state || c.payload)) return c;
  }
  const text =
    json?.text ??
    json?.output_text ??
    json?.choices?.[0]?.message?.content ??
    json?.message ??
    null;
  if (!text || typeof text !== "string") return null;
  const stripped = stripFences(text);
  const r = safeJsonParseMaybeRecover(stripped);
  if (r.ok && r.val && typeof r.val === "object") return r.val;
  const r2 = safeJsonParseMaybeRecover("[" + stripped + "]");
  if (r2.ok && Array.isArray(r2.val) && r2.val[0] && typeof r2.val[0] === "object") return r2.val[0];
  return null;
}

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

// -------- History helpers --------
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

// -------- Detection helpers --------
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

// ---- Soft-Close++ helpers ----
function parseISO(ts){ try { return new Date(ts); } catch { return null; } }
function minutesBetween(aISO, bISO){
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b || isNaN(a) || isNaN(b)) return Infinity;
  return Math.abs((b - a) / 60000);
}
// Acepta múltiples tokens de cierre combinados: "ok gracias", "listo gracias chao", etc.
const SOFT_CLOSE_ANY_RX = /\b(no\s*,?\s*gracias|ok(?:ay)?(?:\s+gracias)?|vale(?:\s+gracias)?|okey(?:\s+gracias)?|listo(?:\s+gracias)?|perfecto(?:\s+gracias)?|de\s+acuerdo|gracias(?:\s+(chau|chao|ad(i|í)os|hasta\s+(luego|pronto|mañana)))?|saludos|nos\s+(vemos|hablamos)|hasta\s+(luego|pronto|mañana)|chau|chao|ad(i|í)os)\b/i;
// Evita falsos positivos si el usuario pide algo nuevo
const NEGATE_REENGAGE_RX = /\b(precio|precios|cotiza(ci[oó]n)?|propu(e|o)sta|demo|reuni[oó]n|agenda(r)?|duda|consulta|ayuda|necesito|quiero|env[ií]a|m[uú]estr|ver|calcular)\b/i;
// Compat exacta (una sola palabra)
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
  if (NEGATE_REENGAGE_RX.test(txt)) return false;           // pide algo nuevo → no cerrar
  if (SOFT_CLOSE_RX.test(txt)) return true;                  // exacto simple
  if (SOFT_CLOSE_ANY_RX.test(txt) && txt.length <= 80) return true; // combos cortos
  // Heurística: ≥2 términos de cierre en mensaje corto
  const closeTerms = ["gracias","ok","okay","okey","vale","listo","perfecto","de acuerdo","saludos","chau","chao","adios","adiós","hasta luego","hasta pronto","nos vemos","nos hablamos","no gracias"];
  const lc = txt.toLowerCase();
  let hits = 0; for (const t of closeTerms) if (lc.includes(t)) hits++;
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
  const lastMenu = lastAssistantMenuTs(history);
  if (!lastMenu) return true; // cierre sin menú previo
  const gap = minutesBetween(lastMenu, lastUser.ts);
  return gap <= Math.max(antiLoopWindowMin, 5);
}

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
  return missing.length ? `Faltan criterios para propuesta: ${missing.join(", ")}.` : "Listo para solicitar email.";
}

// Servicio seleccionado por número/alias (para guardrail de stage=match)
function detectServiceSelection(history, options) {
  if (!Array.isArray(history) || !history.length) return null;
  const last = history[history.length - 1];
  if (last.role !== 'user' || !last.text) return null;
  const txt = String(last.text || "").trim().toLowerCase();

  const nmap = options?.services_number_map || {};
  if (nmap[txt]) return nmap[txt];

  const aliases = options?.services_aliases || {};
  if (aliases[txt]) return aliases[txt];

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

function sanitizeSummary(summary, state, profile){
  let s = String(summary || "");
  const names = [state?.full_name, profile?.full_name].filter(Boolean);
  for (const n of names){
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(esc, "gi"), "el usuario");
  }
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  s = s.replace(/\+?\d[\d\s().-]{6,}/g, "[dato]");
  const words = s.trim().split(/\s+/);
  if (words.length > 120) s = words.slice(0,120).join(" ");
  return s;
}

function ensureDirectiveRecommendation(rec){
  const baseDirective = "INSTRUCCIONES PARA MASTER: 1) Consultar RAG con rag_hints; 2) Renderizar confirmación de servicio + 3–5 beneficios concretos; 3) Mostrar CTAs (precios | beneficios e integraciones | demo | solicitar propuesta); 4) Añadir invitación opcional a compartir caso en 1 línea; 5) No reiniciar menú ni pedir volumen como requisito.";
  if (typeof rec !== "string" || !rec.trim()) return baseDirective;
  const trimmed = rec.trim();
  if (!/^INSTRUCCIONES PARA MASTER:/i.test(trimmed)) return baseDirective;
  return trimmed;
}

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

// --- Mínimo 5–6 rag_hints con extra Odoo ---
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
  if (st.canonical === "Process Automation (Odoo/ERP)") {
    const extra = "pipeline de propuestas y facturación en Odoo";
    if (!merged.map(x=>x.toLowerCase()).includes(extra.toLowerCase())) merged.push(extra);
  }
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
  merged = merged.slice(0, MAX);
  return { ...st, rag_hints: merged };
}

// ---------------- Main ----------------
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

const llmRaw = getFromLLM($json);
if (!llmRaw) return [{ json: { ok: false, error: "No pude parsear la salida de la LLM" } }];

// Contratos soportados
let agentBrief = llmRaw.agent_brief || null;
let llmState = llmRaw.state || (Array.isArray(llmRaw.payload) && llmRaw.payload[0]?.state) || null;
if (!agentBrief || !llmState) {
  return [{ json: { ok: false, error: "La salida de la LLM no contiene agent_brief y/o state.", raw: llmRaw } }];
}

// Validar shape del state
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

// -------- Normalizaciones/Guardrails --------
// 0) STAGE GUARDRAIL: si el último mensaje es selección de servicio y no hay precio/demo/volumen ⇒ stage=match
const selCanonical = detectServiceSelection(history, options);
const recentUser = lastKUserMessages(history, 3);
const askedPrice = recentUser.some(m => containsAny(m.text, [/precio|usd|\$/i]));
const askedDemo  = recentUser.some(m => containsAny(m.text, [/demo|agendar|agenda|reuni[oó]n|llamada/i]));
const gaveVolume = recentUser.some(m => containsAny(m.text, [/volumen|clientes|pedidos|tickets|mesas|interacciones/i]));
const shouldBeMatch = Boolean(selCanonical && !askedPrice && !askedDemo && !gaveVolume);

// 1) Stage enum + anti-regresión
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
// Forzar match si corresponde (y alinear agent_brief.stage SIEMPRE)
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

// 2) Interests SOLO contra catálogo de intereses (no services)
llmState.interests = normalizeInterests(llmState.interests, interestsAllowed);

// 3) Inmutables
for (const key of ["lead_id","chatwoot_id","phone_number","country","tz","channel"]) {
  if (key in baseState) llmState[key] = baseState[key];
}

// 4) Counters enteros
if (llmState.counters && typeof llmState.counters === "object") {
  llmState.counters.services_seen = sanitizeCounter(llmState.counters.services_seen);
  llmState.counters.prices_asked  = sanitizeCounter(llmState.counters.prices_asked);
  llmState.counters.deep_interest = sanitizeCounter(llmState.counters.deep_interest);
} else {
  llmState.counters = deepClone(baseState.counters);
}

// 5) Cooldowns ISO o null
if (llmState.cooldowns && typeof llmState.cooldowns === "object") {
  llmState.cooldowns.email_ask_ts     = toISOorNull(llmState.cooldowns.email_ask_ts);
  llmState.cooldowns.addressee_ask_ts = toISOorNull(llmState.cooldowns.addressee_ask_ts);
} else {
  llmState.cooldowns = deepClone(baseState.cooldowns);
}

// 6) Flags/ts
llmState.proposal_offer_done = Boolean(llmState.proposal_offer_done);
llmState.last_proposal_offer_ts =
  llmState.last_proposal_offer_ts == null ? null : toISOorNull(llmState.last_proposal_offer_ts);

// -------- Reparaciones mínimas (trust-but-verify) --------
if (!agentBrief.intent || /^(greeting|saludo)$/i.test(String(agentBrief.intent))) {
  if (userProvidedName(history)) agentBrief.intent = 'contact_share';
}
agentBrief.intent = String(agentBrief.intent || '').toLowerCase();

if (llmState?.cooldowns && !llmState.cooldowns.addressee_ask_ts) {
  const askTs = lastAssistantAskNameTs(history);
  if (askTs) llmState.cooldowns.addressee_ask_ts = askTs;
}

if (!agentBrief.reask_decision || typeof agentBrief.reask_decision !== 'object') {
  agentBrief.reask_decision = { can_ask_email_now: false, can_ask_addressee_now: false, reason: "" };
}
if (agentBrief.reask_decision.can_ask_email_now === false) {
  agentBrief.reask_decision.reason = buildEmailGateReason(llmState);
}

// -------- Enrichment / Guardrails --------
let rec = typeof agentBrief.recommendation === "string" ? agentBrief.recommendation.trim() : "";
const recMenuReset = detectMenuReset(rec);
if (recMenuReset || !/^INSTRUCCIONES PARA MASTER:/i.test(rec)) {
  rec = ensureDirectiveRecommendation(rec);
}
agentBrief.recommendation = rec;

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

// E) privacy
if (agentBrief.history_summary) {
  agentBrief.history_summary = sanitizeSummary(agentBrief.history_summary, llmState, profile);
}

// -------- F) Soft-Close Enforcement --------
if (shouldSoftClose(history, antiLoopWindowMin)) {
  agentBrief.cta_menu = null; // sin CTAs
  agentBrief.recommendation = "INSTRUCCIONES PARA MASTER: emitir cierre breve (ack-only) con slogan; sin CTAs.";
  agentBrief.reask_decision = {
    can_ask_email_now: false,
    can_ask_addressee_now: false,
    reason: "cierre conversacional detectado"
  };
}

// -------- Salida CLEAN --------
const mergeKey = baseState?.lead_id ?? null;

return [{
  json: {
    ok: true,
    merge_key: mergeKey,
    agent_brief: deepClone(agentBrief),
    state: deepClone(llmState)
  }
}];
