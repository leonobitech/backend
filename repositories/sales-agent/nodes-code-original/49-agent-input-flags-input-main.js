// ============================================================================
// NODE: AgentInput+Flags+InputMain (Node #49)
// ============================================================================
// Description: Prepara input final estructurado para Master AI Agent
// Input: { passthrough (from FlagsAnalyzer), decision, actions, counters_patch, debug, ... }
// Output: { master_task, contracts, routing, ui, meta, userPrompt, ... }
//
// Features:
// - Soporta flujos sin opciones (cta_menu = null)
// - Fallbacks por servicio (dinámico según canonical)
// - Detección y eco de alt_services desde matched_terms, interests y texto
// - Prompts con <TAGS> estructurados
// - Guardrails completos
// - RAG hints integration
// - Contracts condicionales según presencia de menú
// - Compatible con master_task@3.0
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

/**
 * AgentInput+Flags+InputMain v5.3 — Leonobitech (full)
 * - NEW: Soporta flujos sin opciones (cta_menu = null).
 * - NEW: Fallbacks por servicio (dinámico según canonical).
 * - NEW: Detección y eco de alt_services desde matched_terms, interests y texto.
 * - Mantiene: prompts <TAGS>, guardrails, RAG hints, contracts condicionales, compat master_task@3.0.
 */

//////////////////////////////
// Helpers
function safeParse(o, fallback = {}) {
  if (o == null) return fallback;
  if (typeof o === "object") return o;
  try {
    const s = String(o);
    const m = s.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : s);
  } catch { return fallback; }
}
function clamp(s,n){ s = String(s||""); return s.length>n ? s.slice(0,n) + "…" : s; }
function title(s){
  return String(s||"").toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(De|La|El|Los|Las|Y|Del|Al)\b/g, m => m.toLowerCase())
    .trim();
}
function firstToken(s){ const t = String(s||"").trim().split(/\s+/)[0]; return t || null; }
function safeNum(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function toLocalISO(dateIso, tzOff){
  if (!dateIso) return null;
  const d = new Date(dateIso); if (isNaN(d.getTime())) return null;
  const sign = String(tzOff||"").startsWith("-") ? -1 : 1;
  const [h,m] = String(tzOff||"+00:00").slice(1).split(":").map(Number);
  const offMin = sign * (h*60 + m);
  const shifted = new Date(d.getTime() + offMin*60000);
  const pad = (x)=>String(x).padStart(2,"0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth()+1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}.${String(shifted.getUTCMilliseconds()).padStart(3,"0")}${tzOff}`;
}
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/i;
const NAME_RE  = /\b(?:me\s+llamo|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ\s]{1,40})\b/i;
function deep(x){ return JSON.parse(JSON.stringify(x)); }

// --------- Catálogo y normalización (para alt_services y mapping fallbacks)
function stripDiacritics(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\w\s/()-]/g,"")
    .toLowerCase().trim();
}

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
    "llamadas": "Voice Assistant (IVR)",
    "base de conocimiento": "Knowledge Base Agent",
    "faq": "Knowledge Base Agent",
    "odoo": "Process Automation (Odoo/ERP)",
    "erp": "Process Automation (Odoo/ERP)",
    "automatizacion de procesos": "Process Automation (Odoo/ERP)",
    "automatización de procesos": "Process Automation (Odoo/ERP)",
    "captura de leads": "Lead Capture & Follow-ups",
    "seguimientos": "Lead Capture & Follow-ups",
    "reportes": "Analytics & Reporting",
    "analitica": "Analytics & Reporting",
    "analítica": "Analytics & Reporting",
    "reservas": "Smart Reservations",
    "bookings": "Smart Reservations",
    "ingesta": "Knowledge Intake Pipeline",
    "webhook": "Webhook Guard",
    "website chat": "Website Knowledge Chat",
    "chat web": "Website Knowledge Chat",
    "sync": "Data Sync Hub",
    "integracion de datos": "Data Sync Hub",
    "integración de datos": "Data Sync Hub",
    "plataforma": "Leonobitech Platform Core",
    "core": "Leonobitech Platform Core"
  }
};
const ALLOWED_CANONICAL = new Set(services_catalog.allowed);
const ALIAS_MAP = Object.fromEntries(
  Object.entries(services_catalog.aliases).map(([k,v]) => [stripDiacritics(k), v])
);
const CANONICAL_MAP = Object.fromEntries(
  services_catalog.allowed.map(c => [stripDiacritics(c), c])
);
function normalizeServiceToken(token){
  const key = stripDiacritics(token);
  if (!key) return null;
  if (ALIAS_MAP[key]) return ALIAS_MAP[key];
  if (CANONICAL_MAP[key]) return CANONICAL_MAP[key];
  return null;
}

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
// Heurística: inferir "opción N" si faltara <LAST_USER>
function inferOptionDigit(s){
  if (!s) return null;
  const m = /opci[oó]n\s+(\d+)/i.exec(String(s));
  return m ? m[1] : null;
}

//////////////////////////////
// Entrada raíz
const root = $json || {};
const pth  = safeParse(root.passthrough, {});
const prof = safeParse(pth.profile || root.profile, {});
const st   = safeParse(pth.state   || root.state,   {});
const ctx  = safeParse(pth.context || root.context, {});
const tim  = safeParse(pth.timing  || root.timing,  {});
const dbg  = safeParse(root.debug, {});

// FlagsAnalyzer / decisión previa
const decision        = safeParse(root.decision, {});
const reasons         = Array.isArray(root.reasons) ? root.reasons : [];
const should_persist  = !!root.should_persist;
const changed_keys_funnel = Array.isArray(root.changed_keys_funnel) ? root.changed_keys_funnel : [];

// Texto / history
const last_user_text_candidates = [
  root.last_user_text,
  pth.last_user_text,
  root.debug?.last_user_text,
  pth.context?.agent_brief?.last_incoming?.text,
  ctx.last_user_text
].filter(v => typeof v === "string" && v.trim() !== "");
let last_user_text = last_user_text_candidates.length ? String(last_user_text_candidates[0]).trim() : "";

// Si sigue vacío, inferir "opción N" desde summary/history
const reduced_history_raw = String(ctx.reduced_history || root.reduced_history || "").replace(/\\n/g, "\n").trim();
let summary = String(ctx.summary || root.summary || "").trim();
if (!summary && reduced_history_raw) summary = clamp(reduced_history_raw.replace(/\s+/g, " ").trim(), 300);
if (!last_user_text) last_user_text = inferOptionDigit(summary) || inferOptionDigit(reduced_history_raw) || "";

// Nombre conversacional (runtime)
let conversationalName = null;
const m1 = last_user_text.match(NAME_RE); if (m1 && m1[1]) conversationalName = m1[1].trim();
if (!conversationalName && reduced_history_raw){
  const m2 = reduced_history_raw.match(NAME_RE); if (m2 && m2[1]) conversationalName = m2[1].trim();
}
const profileName  = (prof.full_name || "").trim() || null;
const runtime_name = conversationalName ? title(conversationalName) : null;
const display_name = runtime_name || (profileName ? title(firstToken(profileName)) : "allí");

// TZ / lead id
const tz = (()=>{
  const v = pth.tz || prof.tz || st.tz || root.tz;
  return typeof v === "string" && /^[+-]\d{2}:\d{2}$/.test(v) ? v : "-03:00";
})();
const lead_id =
  safeNum(pth.lead_id) ??
  safeNum(prof.lead_id) ??
  safeNum(st.lead_id) ??
  safeNum(root.lead_id);

// Email consolidado
const injectedEmail  = String(root.extracted_email || "").trim().toLowerCase();
const detected_email = String(root.detected_email || "").trim().toLowerCase();
const emailProfState = String(prof.email || st.email || "").trim().toLowerCase();
const emailFromLast  = (last_user_text.match(EMAIL_RE) || [null])[0]?.toLowerCase() || "";
const finalEmail     = (detected_email || injectedEmail || emailProfState || emailFromLast || "") || null;

// Slots
const slotsIn        = safeParse(root.slots, {});
const captured_iso   = slotsIn.proposal?.captured_at_iso || (finalEmail ? new Date().toISOString() : null);
const captured_local = slotsIn.proposal?.captured_at_local || (captured_iso ? toLocalISO(captured_iso, tz) : null);
const business_name_up  = (prof.business_name || st.business_name || slotsIn.business_name || "").trim() || null;

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

// Timing
const now_utc   = new Date().toISOString();
const now_local = toLocalISO(now_utc, tz);
const timing = {
  last_seen_iso: tim.last_seen_iso || null,
  recency_bucket: tim.recency_bucket || root.recency_bucket || "unknown",
  iso_utc: tim.iso_utc || now_utc,
  local: tim.local || now_local,
  gap_any_human: tim.gap_any_human || null
};

// ===============================
// 1) SERVICE TARGET + RAG HINTS
// ===============================
const service_canonical =
  String(decision.service_canonical || ctx.service_target?.canonical || "").trim() || null;
const bundle = Array.isArray(decision.bundle) ? decision.bundle
              : (Array.isArray(ctx.service_target?.bundle) ? ctx.service_target.bundle : []);
const rag_hints = Array.isArray(decision.rag?.hints) ? decision.rag.hints
                : (Array.isArray(ctx.service_target?.rag_hints) ? ctx.service_target.rag_hints : []);
const service_target = service_canonical ? { canonical: service_canonical, bundle, rag_hints } : null;

// ===============================
// 2) CTA MENU (sanitizado; puede quedar null)
// ===============================
const cta_menu_raw = decision.cta_menu || ctx.cta_menu || null;
const cta_menu = sanitizeMenu(cta_menu_raw) || null;
const hasMenu = !!cta_menu;

// ===============================
// 3) Detección de ALT SERVICES
// ===============================
function detectAltServices(){
  const pool = new Set();

  // 1) de contexto previo
  (Array.isArray(ctx.alt_services) ? ctx.alt_services : []).forEach(x => pool.add(String(x)));
  (Array.isArray(root.alt_services) ? root.alt_services : []).forEach(x => pool.add(String(x)));

  // 2) interests de perfil / estado
  (Array.isArray(prof.interests) ? prof.interests : []).forEach(x => pool.add(String(x)));
  (Array.isArray(st.interests) ? st.interests : []).forEach(x => pool.add(String(x)));

  // 3) matched_terms del analyzer/debug
  (Array.isArray(dbg.matched_terms) ? dbg.matched_terms : []).forEach(x => pool.add(String(x)));

  // 4) tokens del último texto
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

// ===============================
// 4) Fallbacks por servicio (dinámicos)
// ===============================
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
    "Recordings y transcripciones con búsqueda",
    "Integración con agendas y reservas",
    "Conexión a Odoo/CRM para tickets y casos"
  ],
  "Knowledge Base Agent": [
    "Ingesta de PDF/Docs/URLs y vectorización (RAG)",
    "Respuestas con citas, tono configurable",
    "Fallback a humano si baja confianza",
    "Control de colección, versionado y auditoría",
    "Analítica de preguntas frecuentes"
  ],
  "Process Automation (Odoo/ERP)": [
    "CRM en Odoo con pipeline y recordatorios automáticos",
    "Disparadores n8n: presupuestos→facturas y tareas operativas",
    "Integración WhatsApp↔Odoo para leads y seguimiento",
    "Reportes y tableros operativos por área",
    "Sincronización segura y webhooks para integraciones"
  ],
  "Lead Capture & Follow-ups": [
    "Formularios web/WA con validaciones",
    "Enriquecimiento y scoring de leads",
    "Secuencias de nurturing multicanal",
    "Alertas y recordatorios al equipo",
    "Dashboards de conversión"
  ],
  "Analytics & Reporting": [
    "Tableros unificados por rol/área",
    "Extracción de fuentes (Odoo, WA, webhooks)",
    "Alertas por umbrales y tendencias",
    "Cohortes y segmentación dinámica",
    "Exportaciones programadas"
  ],
  "Smart Reservations": [
    "Flujos de reserva por chat/voz/web",
    "Sincronización de calendario y stock",
    "Recordatorios y reducción de no-shows",
    "Pagos/Señas y políticas flexibles",
    "Panel de gestión y reportes"
  ],
  "Knowledge Intake Pipeline": [
    "Ingesta desde email, Drive, S3 y APIs",
    "Parsers y normalización de metadatos",
    "Etiquetado, revisión humana y QA",
    "Entrega a KB o data lake",
    "Monitoreo y alertas de roturas"
  ],
  "Webhook Guard": [
    "Validación de firma y origen",
    "Retries con backoff y DLQ",
    "Rate-limiting y cuarentena",
    "Transformaciones livianas",
    "Alertas y trazabilidad end-to-end"
  ],
  "Website Knowledge Chat": [
    "Widget embebible con contexto de página",
    "RAG con crawling controlado",
    "Captura de correo/lead opcional",
    "Tematización y analítica de uso",
    "Fallback a humano con transcript"
  ],
  "Data Sync Hub": [
    "Conectores estándar y jobs programados",
    "De-dupe y mapeos de campos",
    "Monitoreo de latencia y errores",
    "Reprocesos y reintentos",
    "Export a Odoo/BI/almacenes"
  ],
  "Leonobitech Platform Core": [
    "Autenticación/RBAC y auditoría",
    "Entornos (dev/stage/prod) y feature flags",
    "Observabilidad y tracing",
    "Key management y secretos",
    "Cost control y cuotas por servicio"
  ]
};
function fallbackBenefitsFor(canonical){
  if (canonical && FALLBACKS_MAP[canonical]) return FALLBACKS_MAP[canonical];
  // genérico si no se pudo normalizar
  return [
    "Automatización de tareas repetitivas",
    "Integración con herramientas existentes",
    "Métricas y visibilidad operativa",
    "Escalabilidad por etapas",
    "Acompañamiento en la adopción"
  ];
}
// Fallbacks para la opción principal y para alternativas (solo las presentes para evitar payload enorme)
const fallbacks_primary  = fallbackBenefitsFor(service_canonical);
const fallbacks_by_alt   = Object.fromEntries(alt_services.map(s => [s, fallbackBenefitsFor(s)]));

// ===============================
// 5) GUARDRAILS / CONSTRAINTS
// ===============================
const reask = safeParse(ctx.reask_decision, { can_ask_email_now:false, can_ask_addressee_now:false, reason:null });
const guardrails = {
  dont_restart_main_menu: !!(decision.guardrails?.dont_restart_main_menu),
  dont_require_volume_first: !!(decision.guardrails?.dont_require_volume_first),
  respect_agent_recommendation: !!(decision.guardrails?.respect_agent_recommendation),
  ask_email_gate_blocked: !(reask.can_ask_email_now === true),
  request_business_name_gate_blocked: !(reask.can_ask_addressee_now === true)
};
// UI policy (fase "flow"; ya hay servicio)
const constraints = {
  reask_decision: reask,
  ui_policy: {
    phase: "flow",
    render: "auto",
    suppress_bullets: false,
    menu_titles_numbered: false
  },
  guardrails
};

// ===============================
// 6) FLAGS (eco)
const flags = {
  intent: decision.purpose === "price_cta" ? "ask_price" : "service_selected",
  actions: deep(root.actions || { ask_email:false, ask_business_name:false, acknowledge_price:false, greet_only:false }),
  stage_in: String(st.stage || prof.stage || "explore"),
  stage_patch: root.stage_patch ?? null,
  counters_patch: deep(root.counters_patch || { services_seen:0, prices_asked:0, deep_interest:0 }),
  recency_bucket: timing.recency_bucket || "unknown",
  should_persist: !!should_persist,
  has_llm_patch: !!root.has_llm_patch,
  has_funnel_changes: !!root.has_funnel_changes,
  changed_keys_funnel: changed_keys_funnel,
  reasons: reasons,
  agent_intent_hint: ctx.agent_intent || "service_info",
  agent_stage_hint:  ctx.agent_stage  || "match",
  offtopic: false,
  freeze_counters: false,
  matched_terms: Array.isArray(root.debug?.matched_terms) ? root.debug.matched_terms : []
};

// ===============================
// 7) MASTER TASK (estructurado)
// ===============================
const purpose = decision.purpose || "benefits_cta";
const message_kind = decision.message_kind || (purpose === "price_cta" ? "price_intro" : "service_intro");
const uiSection = {
  ...(hasMenu ? { cta_menu } : {}),
  ...(decision.ask_case_one_liner ? { ask_case_one_liner: true } : {})
};

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
  ui: uiSection,
  guardrails: {
    ...guardrails,
    request_email: guardrails.ask_email_gate_blocked === true,
    request_business_name: guardrails.request_business_name_gate_blocked === true
  },
  context: {
    opening_hint: String(ctx.opening_hint || "").trim() || null,
    reduced_history: reduced_history_raw || null,
    alt_services // ← detectados dinámicamente
  },
  fallbacks: {
    // fallback principal según el servicio elegido
    benefits: fallbacks_primary,
    // fallbacks por otras opciones presentes (para flujos donde el usuario muestre interés múltiple)
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

// ===============================
// 8) CONTRACTS (condicionales al menú)
// ===============================
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

// Routing/meta
const routing = { expect_reply: true, message_kind, purpose };
const meta = {
  lead_id: pth.lead_id || prof.lead_id || st.lead_id || null,
  tz,
  service: service_canonical,
  stage_snapshot: st.stage || prof.stage || "match",
  recency: timing.recency_bucket || "unknown",
  rag_used: decision.rag?.use === true,
  alt_services
};

// ===============================
// 9) USER PROMPT con <TAGS> (compat)
// ===============================
const agent_reco = ctx.agent_recommendation || root.agent_recommendation || null;
const state_echo = deep(st); delete state_echo.conversational_name;
const constraints_for_tags = { ...constraints };

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
  JSON.stringify({
    row_id: prof.row_id ?? null,
    full_name: prof.full_name ?? null,
    email: prof.email ?? null,
    phone: prof.phone ?? null,
    country: prof.country ?? null,
    stage: prof.stage ?? (st.stage || null),
    priority: prof.priority ?? "normal",
    interests: Array.isArray(prof.interests) ? prof.interests : []
  }),
  "</PROFILE_ECHO>",
  "",
  "<STATE_ECHO>",
  JSON.stringify(state_echo),
  "</STATE_ECHO>",
  "",
  "<CONTEXT_ECHO>",
  JSON.stringify({
    ...ctx,
    cta_menu,          // puede ser null
    service_target,    // eco del servicio
    alt_services       // eco de alternativas detectadas
  }),
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
  JSON.stringify(cta_menu), // puede ser null
  "</CTA_MENU>",
  "",
  "<SERVICE_TARGET>",
  JSON.stringify(service_target),
  "</SERVICE_TARGET>"
].join("\n");

// ===============================
// 10) Salida final
// ===============================
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
    agent_intent: ctx.agent_intent || null,
    agent_stage: ctx.agent_stage || null,
    reask_decision: reask,
    opening_hint: ctx.opening_hint || null,
    cta_menu,         // puede ser null
    service_target,
    alt_services
  },
  last_user_text,
  lead_id,
  tz,
  has_email: Boolean(finalEmail),
  extracted_email: finalEmail || null,

  profile_echo: {
    row_id: prof.row_id ?? null,
    full_name: prof.full_name ?? null,
    email: prof.email ?? null,
    phone: prof.phone ?? null,
    country: prof.country ?? null,
    stage: prof.stage ?? (st.stage || null),
    priority: prof.priority ?? "normal",
    interests: Array.isArray(prof.interests) ? prof.interests : []
  },
  state_echo,
  context_echo: {
    ...ctx,
    cta_menu,
    service_target,
    alt_services
  },

  // Debug
  debug_echo: {
    stage_in: flags.stage_in,
    recency: flags.recency_bucket,
    should_persist,
    has_llm_patch: flags.has_llm_patch,
    has_funnel_changes: flags.has_funnel_changes,
    changed_keys_funnel
  },

  // Legacy conservados
  cta_menu,
  service_target,
  alt_services
};
