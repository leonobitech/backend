// ============================================================================
// NODE: BuildFlagsInput (Node #47)
// ============================================================================
// Description: Prepara input contextualizado para FlagsAnalyzer
// Input: { profile, state, agent_brief, patch, options, meta }
// Output: { lead_id, tz, timing, context, profile, state, flags_base, flags_base_llm, flags_derived, ... }
//
// Features:
// - Integra agent_brief.service_target y cta_menu al contexto
// - Heurística corregida: selección numérica o service_target => "service_selected"
// - No congela counters en selección de servicio
// - Agrega flags_derived para Master/Output (no rompe contratos)
// - TZ-aware calendar_recency (hoy/ayer/esta_semana/anterior)
// - Reengagement style detection
// - Cooldown windows validation
// - Compatibility checks (immutables, patch consistency)
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

// BuildFlagsInput v4.0 — Leonobitech
// - Integra agent_brief.service_target y cta_menu al contexto.
// - Corrige heurística: selección numérica o service_target => on-topic (service_selected).
// - No congela counters en selección de servicio.
// - Agrega flags_derived para Master/Output (no rompe contratos).

const j = $json || {};

// ---------- helpers ----------
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
function parseIso(s){
  if (isBlank(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
function msSince(iso, ref){ const d = parseIso(iso); return d ? (ref - d) : null; }

function bucketByAge(ms){
  if (ms == null) return "unknown";
  if (ms < 30 * 60 * 1000) return "fresh";
  if (ms < 6  * 60 * 60 * 1000) return "warm";
  if (ms < 24 * 60 * 60 * 1000) return "stale";
  return "dormant";
}

// TZ-aware YYYY-MM-DD
function localYMDStamp(date, tz){
  if (!(date instanceof Date)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const y = parts.find(p=>p.type==='year')?.value;
    const m = parts.find(p=>p.type==='month')?.value;
    const d = parts.find(p=>p.type==='day')?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
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

// dot-path utils
function get(o,p){ return p.split(".").reduce((a,k)=> (a && a[k] !== undefined) ? a[k] : undefined, o); }
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

// ---------- inputs base ----------
const profile = j.profile || {};
const state   = j.state   || {};
const agent   = j.agent_brief || {};
const patch   = j.patch   || {};
const options = j.options || {};

const lastIncoming = agent.last_incoming || {};
const last_user_text = String(pick(j.last_user_text, lastIncoming.text, "") || "").trim();

// reduced history / summary
const reduced_history = pick(
  j.context?.reduced_history,
  j.older_history_compact,
  agent.history_summary,
  null
);

// timing y TZ
const tz = pick(j.tz, profile.tz, state.tz, "-03:00");
const nowRef = parseIso(j.meta?.now_ts) || new Date();
const last_seen_iso = pick(j.timing?.last_seen_iso, lastIncoming.ts, null);
const seenRef = parseIso(last_seen_iso) || nowRef;

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
if (recency_bucket === "fresh" || recency_bucket === "warm") reengagement_style = "continuation";
else if (recency_bucket === "stale" || calendar_recency === "esta_semana") reengagement_style = "recap";
else reengagement_style = "reactivation";

let opening_hint = "";
if (calendar_recency === "hoy") opening_hint = "Sigamos donde quedamos hoy.";
else if (calendar_recency === "ayer") opening_hint = "Ayer hablamos; retomo desde ahí si te parece.";
else if (calendar_recency === "esta_semana") opening_hint = "A principios de semana comentaste algo; puedo hacer un breve recap.";
else if (calendar_recency === "anterior") opening_hint = "Hace tiempo que no hablamos; te hago un recap breve si querés.";

// ---------- counters / cooldowns (STATE) ----------
const counters = state.counters || {};
const cd = state.cooldowns || {};
const emailAskAgoMs     = msSince(cd.email_ask_ts, nowRef);
const addresseeAskAgoMs = msSince(cd.addressee_ask_ts, nowRef);

const CD_EMAIL_H = 6;
const CD_ADDR_H  = 12;
function windowOk(agoMs, hoursWin){ if (agoMs == null) return true; return agoMs > (hoursWin * 3600000); }

const email_cooldown_ok     = windowOk(emailAskAgoMs, CD_EMAIL_H);
const addressee_cooldown_ok = windowOk(addresseeAskAgoMs, CD_ADDR_H);

// Política (desde reask_decision del analyst)
const reask = agent.reask_decision || {};
const policy_can_ask_email_now     = (typeof reask.can_ask_email_now === "boolean") ? !!reask.can_ask_email_now : true;
const policy_can_ask_addressee_now = (typeof reask.can_ask_addressee_now === "boolean") ? !!reask.can_ask_addressee_now : true;

// ---------- on/off-topic heuristic (refactor) ----------
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

// NUEVO: si hay service_target o selección numérica → es selección de servicio
const serviceTarget = agent?.service_target || null;
const serviceCanonical = serviceTarget?.canonical || null;
const selectionIsNumeric = /^\s*\d+\s*$/.test(textLc);
const service_selected = Boolean(serviceCanonical) || selectionIsNumeric;

// Derivación de intent_hint
if (service_selected) {
  intent_hint = "service_selected";
  freeze_counters = false;
  // enriquecer matched_terms con tokens del canonical/hints
  const toks = [
    ...tokenizeLc(serviceCanonical || ""),
    ...(Array.isArray(serviceTarget?.rag_hints) ? serviceTarget.rag_hints.flatMap(tokenizeLc) : [])
  ];
  matched_terms = Array.from(new Set([...(matched_terms||[]), ...toks].filter(Boolean)));
} else {
  if (!textLc) intent_hint = intent_hint || "neutral";
  else if (matched_terms.length === 0 && !hasNeutral(textLc)) {
    intent_hint = "offtopic";
    freeze_counters = true;
  } else if (!intent_hint) {
    intent_hint = (matched_terms.length > 0) ? "ontopic" : "neutral";
  }
}

// override: greeting/contact_share o frases de nombre NUNCA offtopic
const intentNorm = String(agent?.intent || "").toLowerCase().trim();
const GREET_SET = new Set(["greeting","greet_only","contact_share"]);
const NAME_PROVIDED_RX = /\b(me llamo|mi nombre es|^\s*soy\s+)/i;
if (GREET_SET.has(intentNorm) || NAME_PROVIDED_RX.test(last_user_text)) {
  if (!service_selected) intent_hint = "neutral";
  freeze_counters = false;
}

// ---- PATCH LLM → detectar qué actualizó (anidado) ----
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

// ---------- compat-checks (ligeros) ----------
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
      for (const key of Object.keys(node)){
        const path = `${root}.${key}`;
        const pval = node[key];
        const sval = get(state, path);
        const equal = Array.isArray(pval) && Array.isArray(sval) ? arraysEqual(pval, sval) : (pval === sval);
        if (!equal){
          patch_mismatches.push({ path, patch_value: pval, state_value: sval });
        }
      }
    } else {
      const pval = node;
      const sval = get(state, root);
      const equal = Array.isArray(pval) && Array.isArray(sval) ? arraysEqual(pval, sval) : (pval === sval);
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

// ---------- flags_base (compat) ----------
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

  intent_hint,            // ← corregido (service_selected / ontopic / neutral / offtopic)
  freeze_counters,        // ← no se congela en selección
  matched_terms,

  last_user_text
};

// ---------- flags_base_llm (compat) ----------
const flags_base_llm = {
  counters_already_updated,
  cooldowns_already_updated
};

// ---------- flags derivados para aguas abajo ----------
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

// ---------- extras para FlagsAnalyzer / Output Main ----------
const STATE_ECHO = {
  stage: state?.stage ?? "explore",
  counters: state?.counters ?? { services_seen:0, prices_asked:0, deep_interest:0 }
};
const can_ask_email_now = agent?.reask_decision?.can_ask_email_now === true;
const intent_normalized = String(agent?.intent || "").toLowerCase().trim();

// ---------- salida ----------
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
      service_target: agent.service_target || null,   // NUEVO: pasa service_target
      cta_menu: agent.cta_menu || null,               // NUEVO: pasa cta_menu
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
    flags_derived,                                       // NUEVO

    // para FlagsAnalyzer / Output Main
    STATE_ECHO,
    can_ask_email_now,
    intent_normalized,

    // diagnóstico
    compat_report,
    options: options || null,
    meta: j.meta || null,
    patch_meta: j.patch_meta || null
  }
}];
