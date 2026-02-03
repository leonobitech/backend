// ============================================================================
// NODE: FlagsAnalyzer (Node #48)
// ============================================================================
// Description: Motor de decisiones - analiza flags y determina acciones/guardrails
// Input: { flags_base, flags_derived, context, state, profile, timing, ... }
// Output: { actions, counters_patch, stage_patch, reasons, decision, ... }
//
// Features:
// - Integra BuildFlagsInput v4.0 (flags_derived con service_selected, rag_hints, bundle)
// - Heurística corregida: selección numérica o service_target => "service_selected"
// - Anti-loop: NO reiniciar menú si hay servicio seleccionado
// - Purpose detection: benefits_cta vs price_cta
// - Email/business_name gating con cooldowns
// - Counter increment logic
// - Stage transitions
// - Guardrails para Master Agent
//
// CRITICAL BUGS DETECTED (from AGENT-TESTING-LOG.md):
// - FALLA #9, #16, #19: Counter logic bugs (50% mensajes)
//   - Incrementa prices_asked sin usuario mencionar precio
//   - Necesita keywords más estrictos
//
// - FALLA #10, #15, #20: Purpose misclassification (50% mensajes)
//   - Bias hacia "price_cta" por defecto
//   - Debería usar "benefits_cta" o "qualification" cuando apropiado
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

/**
 * FlagsAnalyzer v3.0 — Leonobitech (merged & compatible)
 *
 * Compat:
 *  - Mantiene salida v2.5: { actions, counters_patch, stage_patch, reasons, has_llm_patch,
 *    has_funnel_changes, changed_keys_funnel, should_persist, debug, passthrough }
 *  - Integra BuildFlagsInput v4.0: usa flags_derived.{service_selected, rag_hints, bundle},
 *    context.service_target y context.cta_menu.
 *  - Corrige heurística: selección numérica o service_target => on-topic (service_selected).
 *  - Anti-loop: NO reiniciar menú si hay servicio seleccionado; prioriza beneficios/CTAs.
 */

function nz(v){ return v !== null && v !== undefined; }
function parseIso(s){
  if (s == null || (typeof s === "string" && s.trim() === "")) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
function msSince(iso, ref){ const d = parseIso(iso); return d ? (ref - d) : null; }
const norm = s => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ---------- entrada ----------
const i   = $json || {};
const fd  = i.flags_derived || {};
const fb  = i.flags_base || {};
const ctx = i.context || {};
const STATE_ECHO = i.STATE_ECHO || { stage:"explore", counters:{ services_seen:0, prices_asked:0, deep_interest:0 } };

const lastText = String(i.last_user_text || "");
const last = norm(lastText);
const reduced = norm(i.context?.reduced_history);
const txt = last + " || " + reduced;

// ---------- intents/estado base ----------
const intentNorm = String(i.intent_normalized || i.context?.agent_intent || "").toLowerCase().trim();
let intentHint   = fb.intent_hint || "neutral";   // puede venir "service_selected", "ontopic", "neutral", "offtopic"
let freezeCounters = !!fb.freeze_counters;

const GREET_SET = new Set(["greeting","greet_only","contact_share"]);
if (GREET_SET.has(intentNorm) && intentHint === "offtopic") {
  intentHint = "neutral";
  freezeCounters = false;
}

// Selección de servicio (nuevo pipeline)
const service_selected = !!fd.service_selected || intentHint === "service_selected";
const service = ctx.service_target || {};
const serviceCanonical = service.canonical || fd.selected_service_canonical || null;

// ---------- gating / cooldowns / política ----------
const hasEmail        = !!fb.has_email;
const cooldownEmailOk = !!fb.email_cooldown_ok;        // tiempo real
const cooldownNameOk  = !!fb.addressee_cooldown_ok;    // tiempo real
const policyAskEmail  = fb.policy_can_ask_email_now !== false;
const policyAskName   = fb.policy_can_ask_addressee_now !== false;

const canAskEmail     = cooldownEmailOk && policyAskEmail && (i.can_ask_email_now === true);
const canAskAddressee = cooldownNameOk  && policyAskName;

// ---------- señales textuales ----------
const kwPrice    = /(precio|costo|cu[aá]nto (sale|vale)|licencia|tarifa|cuotas|mensual|suscrip|abono|usd|\$)/i;
const kwInterest = /(quiero|necesito|busco|me interesa|me gustar[ií]a|implement|integrar|probar|demo|agendar|agenda|reuni[oó]n)/i;
const kwEmail    = /(mail|email|correo|contacto)/i;

const mentionPlan = /\bplan(es)?\b/i.test(txt) && Array.isArray(fb.matched_terms) && fb.matched_terms.length > 0;
const askedPrice     = kwPrice.test(txt) || mentionPlan || new Set(["ack_price","price"]).has(intentNorm);
const showedInterest = kwInterest.test(txt) || new Set(["probe_need","qualify"]).has(intentNorm);
const mentionedEmail = kwEmail.test(txt);

// ---------- LLM patch signals (para no doble-contar) ----------
const llmFlags = i.flags_base_llm || {};
const already  = llmFlags.counters_already_updated || {};
const cooldownsAlreadyUpdated = !!llmFlags.cooldowns_already_updated;

const has_llm_patch =
  !!(i.has_llm_patch) ||
  cooldownsAlreadyUpdated ||
  !!already.services_seen ||
  !!already.prices_asked ||
  !!already.deep_interest ||
  !!llmFlags.stage_already_updated ||
  !!llmFlags.email_already_updated ||
  !!llmFlags.business_name_already_updated;

// ---------- acumuladores (MISMO SHAPE histórico) ----------
const actions = { ask_email:false, ask_business_name:false, acknowledge_price:false, greet_only:false };
const counters_patch = { services_seen: 0, prices_asked: 0, deep_interest: 0 };
let stage_patch = null;
const reasons = [];

// ---------- lógica principal ----------
const stageIn = String(STATE_ECHO?.stage || i.state?.stage || i.profile?.stage || "explore");

// 0) Si el intent fue marcado off-topic y no hay servicio seleccionado, minimizamos acción
if (intentHint === "offtopic" && !service_selected) {
  actions.greet_only = true;
  reasons.push("Intent off-topic sin servicio seleccionado; no se modifica funnel.");
} else {
  // 1) Si seleccionó servicio y venimos de explore → subir a match (por seguridad)
  if (service_selected && stageIn === "explore") {
    stage_patch = "match";
    reasons.push("Selección explícita de servicio; ascenso de stage explore→match.");
  }

  // 2) Precio detectado
  if (!freezeCounters && askedPrice && !already.prices_asked) {
    counters_patch.prices_asked += 1;
    actions.acknowledge_price = true;
    reasons.push("Detectado interés por precio/tarifa.");
    if (!stage_patch && stageIn === "explore") stage_patch = "price";
  }

  // 3) Interés explícito (demo / quiero / necesito / etc.)
  if (!freezeCounters && showedInterest && !already.deep_interest) {
    counters_patch.deep_interest += 1;
    reasons.push("Frases de intención fuerte (demo/quiere/necesita).");
    if (!stage_patch && stageIn === "explore") stage_patch = "match";
  }

  // 4) Email gating combinado (política ∧ cooldown ∧ can_ask_email_now)
  const isFresh = !!fb.is_fresh;
  if (!hasEmail && canAskEmail && (showedInterest || askedPrice || mentionedEmail || isFresh)) {
    actions.ask_email = true;
    reasons.push("No hay email y gate habilitado (política+cooldown+can_ask_email_now).");
  } else if (!hasEmail && !canAskEmail) {
    reasons.push("Email gate bloquea pedir correo (política/cooldown/can_ask_email_now).");
  }

  // 5) business_name (razón social)
  const hasBusiness = nz(i.state?.business_name) && String(i.state.business_name).trim() !== "";
  if (!hasBusiness && canAskAddressee && (isFresh || askedPrice || showedInterest)) {
    actions.ask_business_name = true;
    reasons.push("Falta business_name y gate habilita solicitarlo.");
  } else if (!hasBusiness && !canAskAddressee) {
    reasons.push("Gate de nombre bloquea momento de pedir business_name.");
  }

  // 6) Greet fallback: sólo si no hay acciones duras y tampoco servicio seleccionado
  const hasHardAction = actions.ask_email || actions.ask_business_name || actions.acknowledge_price;
  const hasRecommendation = !!i.context?.agent_recommendation;
  if (!hasHardAction) {
    if (service_selected && hasRecommendation) {
      actions.greet_only = false;
      reasons.push("Respetar agent_recommendation y profundizar servicio elegido.");
    } else if (GREET_SET.has(intentNorm)) {
      actions.greet_only = true;
      reasons.push("Intent greeting/contact_share; saludo breve.");
    }
  }
}

// ---------- trazabilidad de cooldown ----------
const ref = parseIso(i.timing?.last_seen_iso) || new Date();
const addrAgo = msSince(i.state?.cooldowns?.addressee_ask_ts, ref);
const emailAgo = msSince(i.state?.cooldowns?.email_ask_ts, ref);
if (addrAgo != null && addrAgo < 12*3600000) reasons.push("Cooldown de nombre activo (reciente).");
if (emailAgo != null && emailAgo < 6*3600000)  reasons.push("Cooldown de email activo (reciente).");

// ---------- persistencia funnel ----------
const changed_keys_funnel = [];
if (stage_patch) changed_keys_funnel.push("stage");
if (Number(counters_patch.services_seen || 0) > 0) changed_keys_funnel.push("services_seen");
if (Number(counters_patch.prices_asked  || 0) > 0) changed_keys_funnel.push("prices_asked");
if (Number(counters_patch.deep_interest || 0) > 0) changed_keys_funnel.push("deep_interest");

const has_funnel_changes =
  !!stage_patch ||
  Number(counters_patch.services_seen || 0) > 0 ||
  Number(counters_patch.prices_asked  || 0) > 0 ||
  Number(counters_patch.deep_interest || 0) > 0;

const should_persist = has_llm_patch || has_funnel_changes;

// ---------- decisión extendida (para Input Main / Output) ----------
function normalizeCtas(menu){
  if (!menu || !Array.isArray(menu.items)) return null;
  const map = {
    "ver precios": "price",
    "beneficios e integraciones": "benefits",
    "agendar demo": "demo",
    "solicitar propuesta": "proposal"
  };
  const items = menu.items.map(t => {
    const title = String(t || "").trim();
    const key = map[title.toLowerCase()] || title.toLowerCase();
    return { title, key };
  });
  return { prompt: menu.prompt || "¿Cómo querés avanzar?", items, max_picks: menu.max_picks || 1 };
}

let purpose = "options";
if (service_selected) {
  // Si el usuario ya habló de precio, priorizamos price_cta; si no, benefits_cta
  purpose = askedPrice ? "price_cta" : "benefits_cta";
}

const decision = {
  route: service_selected ? "service_selected_flow" : "generic_flow",
  purpose,                                           // "benefits_cta" | "price_cta" | "options"
  service_canonical: serviceCanonical,
  bundle: Array.isArray(fd.bundle) ? fd.bundle : [],
  rag: { use: service_selected, hints: Array.isArray(fd.rag_hints) ? fd.rag_hints : [] },
  cta_menu: normalizeCtas(ctx.cta_menu),
  ask_case_one_liner: (purpose === "benefits_cta"), // preguntar opcional el caso en 1 línea
  expect_reply: true,
  message_kind: (purpose === "benefits_cta") ? "service_intro" : (purpose === "price_cta" ? "price_intro" : "options"),
  guardrails: {
    dont_restart_main_menu: service_selected,       // clave: no reiniciar menú si ya eligió
    dont_require_volume_first: true,
    respect_agent_recommendation: true
  },
  copy_hints: {
    tone: "friendly_concise",
    bullets: (purpose === "benefits_cta") ? 5 : 0,
    include_bundle: Array.isArray(fd.bundle) && fd.bundle.length > 0,
    opening_hint: ctx.opening_hint || ""
  }
};

// ---------- salida ----------
return {
  actions,
  counters_patch,
  stage_patch,
  reasons,
  has_llm_patch,
  has_funnel_changes,
  changed_keys_funnel,
  should_persist,

  // NUEVO (no rompe contrato):
  decision,
  purpose,
  service: serviceCanonical,
  rag_used: decision.rag.use === true,

  debug: {
    last_user_text: i.last_user_text,
    stage_in: stageIn,
    recency: fb.recency_bucket || "unknown",
    agent_recommendation: i.context?.agent_recommendation || null,
    intent_hint: intentHint,
    freeze_counters: freezeCounters,
    matched_terms: Array.isArray(fb.matched_terms) ? fb.matched_terms : [],
    intent_normalized: intentNorm,
    service_selected
  },
  passthrough: {
    lead_id: i.lead_id,
    tz: i.tz,
    profile: i.profile,
    state: i.state,
    timing: i.timing,
    context: i.context
  }
};

// ============================================================================
// CRITICAL BUGS DOCUMENTED
// ============================================================================

/*
BUGS DETECTADOS EN TESTING (AGENT-TESTING-LOG.md):

1. FALLA #9, #16, #19: Counter Logic Bugs (50% mensajes) 🟡 MEDIA

   Problema:
   - Incrementa prices_asked cuando usuario NO menciona precio
   - Ejemplos:
     * Msg 2: "Interesante, y cuanto cuesta?" → ✅ correcto
     * Msg 5: "Soy dueño de un restaurante pequeño" → ❌ incrementó prices_asked
     * Msg 6: "Tengo 10 empleados, necesito gestionar mejor el equipo" → ❌ incrementó prices_asked

   Root cause:
   - kwPrice regex demasiado permisivo
   - mentionPlan condition puede activarse sin contexto de precio

   Fix sugerido:
   - Hacer kwPrice más estricto
   - Requiere keywords explícitos: "precio", "costo", "cuanto", "$", "USD"
   - NO incrementar si solo menciona volumen/empleados/negocio

2. FALLA #10, #15, #20: Purpose Misclassification (50% mensajes) 🟡 MEDIA

   Problema:
   - Bias hacia "price_cta" por defecto
   - Ejemplos:
     * Msg 2: "Interesante, y cuanto cuesta?" → purpose: "price_cta" ✅
     * Msg 5: "Soy dueño de un restaurante pequeño" → purpose: "price_cta" ❌
     * Msg 6: "Tengo 10 empleados, necesito gestionar mejor el equipo" → purpose: "price_cta" ❌

   Root cause:
   - Línea 191-194: purpose = askedPrice ? "price_cta" : "benefits_cta"
   - Si askedPrice está mal detectado → purpose incorrecto

   Fix sugerido:
   - Agregar nueva categoría: "qualification"
   - Lógica:
     if (service_selected && askedPrice) purpose = "price_cta";
     else if (service_selected && showedInterest) purpose = "benefits_cta";
     else if (service_selected) purpose = "benefits_cta"; // default cuando eligió servicio
     else if (showedQualificationInfo) purpose = "qualification"; // NEW
     else purpose = "options";

MEJORAS PROPUESTAS:

MEJORA #10 (Nueva): FlagsAnalyzer Purpose Classification Fix
- Agregar type Purpose = "price_cta" | "benefits_cta" | "qualification" | "options"
- Keywords para qualification:
  * Volumen: "empleados", "personas", "usuarios", "clientes", "pedidos"
  * Industry: "restaurante", "tienda", "negocio", "empresa"
  * Pain points: "gestionar", "organizar", "controlar", "mejorar"
  * Business info: "dueño", "propietario", "encargado"

MEJORA #11 (Nueva): Counter Logic Strictness
- kwPrice más estricto:
  * Solo incrementar si EXPLÍCITAMENTE menciona: precio, costo, cuanto (sale/vale/cuesta), $, USD
  * NO incrementar por: "empleados", "restaurante", "negocio", "gestionar", "equipo"
- showedInterest más estricto:
  * Solo incrementar con: "demo", "agendar", "quiero", "necesito", "me interesa"
  * Incluir volumen/pain points requiere keywords adicionales
*/
