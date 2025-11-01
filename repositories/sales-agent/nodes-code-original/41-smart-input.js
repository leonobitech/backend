// ============================================================================
// NODE: Smart Input (Node #41)
// ============================================================================
// Description: Prepara <history>, <profile>, <state>, <options>, <rules>, <meta> para el Processor
// Input: { history, profile, state }
// Output: [{ json: { history, profile, state, options, rules, meta } }]
//
// Features:
// - Reglas alineadas a Analyst v1.8
// - RAG-first policy
// - Anti-loop de 5 min
// - Stage=match al elegir servicio
// - Email gating policy (7 condiciones)
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

/**
 * Smart Input v2 — Leonobitech
 * - Prepara <history>, <profile>, <state>, <options>, <rules>, <meta> para el Processor.
 * - Reglas alineadas a Analyst v1.8 (RAG-first, no reiniciar menú, anti-loop, stage=match al elegir servicio).
 */

const MAX_MSGS = 60;
const DEFAULT_LOCALE = "es";

// ---------- Helpers ----------
function firstItem(x) { return Array.isArray(x) ? (x[0] ?? {}) : x; }
function isoOrNull(ts) {
  if (!ts || typeof ts !== "string") return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function sortByTsAsc(arr) {
  return [...(arr || [])].sort((a, b) => {
    const at = new Date(a?.ts || 0).getTime();
    const bt = new Date(b?.ts || 0).getTime();
    return at - bt;
  });
}
function clamp(arr, n) { return (arr || []).slice(Math.max(0, (arr || []).length - n)); }
function coerceMsg(m) {
  const role = (m?.role === "user" || m?.role === "assistant") ? m.role : "user";
  const text = (m?.text ?? "");
  const ts = isoOrNull(m?.ts) || m?.ts || ""; // conserva valor original si no es ISO
  return { role, text: String(text), ts };
}

// ---------- Normalize input ----------
const raw = firstItem($json);
const historyRaw = Array.isArray(raw.history) ? raw.history : [];
const historySorted = sortByTsAsc(historyRaw.map(coerceMsg));
const history = clamp(historySorted, MAX_MSGS);

const profile = (raw.profile && typeof raw.profile === "object") ? raw.profile : {};
const state   = (raw.state   && typeof raw.state   === "object") ? raw.state   : {};

const now_ts = history.length ? history[history.length - 1].ts : new Date().toISOString();
const channel = profile?.channel || state?.channel || "";
const country = profile?.country || state?.country || "";
const tz      = profile?.tz      || state?.tz      || "";

// ---------- Options (listas blancas & normalizadores) ----------
const options = {
  // Intereses canónicos (evitar nombres de servicios completos aquí)
  interests_allowed: ["Odoo","WhatsApp","CRM"],

  // Servicios canónicos
  services_allowed: [
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

  // Mapeo de aliases → canónico
  services_aliases: {
    "whatsapp": "WhatsApp Chatbot",
    "whatapp": "WhatsApp Chatbot",
    "chatbot": "WhatsApp Chatbot",
    "bot de whatsapp": "WhatsApp Chatbot",
    "bot": "WhatsApp Chatbot",
    "agente": "WhatsApp Chatbot",
    "asistente": "WhatsApp Chatbot",

    "ivr": "Voice Assistant (IVR)",
    "agente de voz": "Voice Assistant (IVR)",
    "asistente de voz": "Voice Assistant (IVR)",
    "llamadas": "Voice Assistant (IVR)",

    "base de conocimiento": "Knowledge Base Agent",
    "faq": "Knowledge Base Agent",
    "kb": "Knowledge Base Agent",

    "odoo": "Process Automation (Odoo/ERP)",
    "erp": "Process Automation (Odoo/ERP)",
    "automatización de procesos": "Process Automation (Odoo/ERP)",

    "leads": "Lead Capture & Follow-ups",
    "seguimiento": "Lead Capture & Follow-ups",

    "reportes": "Analytics & Reporting",
    "analítica": "Analytics & Reporting",

    "reservas": "Smart Reservations",
    "bookings": "Smart Reservations",

    "ingesta": "Knowledge Intake Pipeline",

    "webhook": "Webhook Guard",

    "website chat": "Website Knowledge Chat",
    "chat web": "Website Knowledge Chat",

    "sync": "Data Sync Hub",
    "integración de datos": "Data Sync Hub",

    "plataforma": "Leonobitech Platform Core",
    "core": "Leonobitech Platform Core"
  },

  // Mapeo numérico por defecto del menú de 4 opciones (si tu UI presenta números)
  services_number_map: {
    "1": "WhatsApp Chatbot",
    "2": "Voice Assistant (IVR)",
    "3": "Knowledge Base Agent",
    "4": "Process Automation (Odoo/ERP)"
  },

  // Etapas válidas (enum)
  stage_allowed: ["explore","match","price","qualify","proposal_ready"],

  // Defaults para enriquecer service_target (útil para la LLM y/o Filter Output)
  service_defaults: {
    "Process Automation (Odoo/ERP)": {
      bundle: ["Odoo CRM","n8n triggers","WhatsApp Chatbot (opcional)"],
      rag_hints: [
        "Odoo CRM para pymes/restaurantes",
        "automatización con n8n (actividades, presupuestos→facturas)",
        "integración WhatsApp (Chatwoot) ↔ Odoo",
        "reportes y tableros operativos"
      ],
      interests: ["Odoo","CRM"]
    }
  },

  // CTA por defecto cuando hay service_target
  cta_menu_default: {
    prompt: "¿Cómo querés avanzar?",
    kind: "service",
    items: ["Ver precios","Beneficios e integraciones","Agendar demo","Solicitar propuesta"],
    max_picks: 1
  },

  // Intents canónicos esperados por el Processor/Master
  intents_allowed: [
    "greeting","service_info","price","request_proposal",
    "demo_request","contact_share","schedule_request",
    "negotiation","support","off_topic","unclear"
  ]
};

// ---------- Rules (políticas estrictas, en texto) ----------
const rules = {
  timing_and_chronology:
    "Procesar el <history> de antiguo a reciente; prevalece el evento más nuevo; usar siempre el ts del historial; no inventar datos.",

  // Intereses: nunca nombres de servicios; solo etiquetas canónicas
  interests_policy:
    "Añadir a state.interests solo ante intención explícita/implícita fuerte; normalizar con options.services_aliases; limitar a options.interests_allowed; sin duplicados; no eliminar salvo rechazo explícito.",

  // Stage policy alineada: al elegir servicio → match (no qualify)
  stage_policy:
    "Transiciones: explore→match (lead define necesidad/canal o elige servicio por número/alias); match→price (pregunta precio); match→qualify (aporta volumen/uso concreto o pide demo); price→qualify (tras precio, si pide demo/volumen); qualify→proposal_ready (solicita propuesta). No retroceder salvo corrección clara del lead.",

  counters_policy:
    "services_seen+1 si el usuario explora/elige un servicio; prices_asked+1 si pregunta precio; deep_interest+1 si pide demo o aporta volumen/uso específico. Máx +1 por tipo en una iteración.",

  cooldowns_policy:
    "email_ask_ts y addressee_ask_ts se actualizan SOLO cuando el assistant lo pide explícitamente; timestamp = ts del mensaje del assistant; conservar el más reciente; no usar mensajes del usuario para estos campos.",

  // Recomendación como directiva interna para el Master
  recommendation_format_policy:
    "agent_brief.recommendation debe comenzar con 'INSTRUCCIONES PARA MASTER:'; tono imperativo/técnico; sin 'vos/tú/te', sin emojis/marketing; listar pasos concisos.",

  // Política RAG-first (no pedir volumen como requisito; no reiniciar menú)
  rag_first_policy:
    "Si el usuario elige servicio o expresa necesidad clara: generar service_target {canonical,bundle,rag_hints}; priorizar beneficios (3–5 vía RAG) + CTAs (precio/beneficios/demo/propuesta). Prohibido reiniciar menú general; pedir volumen solo como invitación opcional (no bloqueante).",

  // Anti-loop: ventana de 5 min para no repetir la misma pregunta de volumen/caso de uso
  anti_loop_policy:
    "Si en los últimos 5 minutos ya se pidió volumen/caso de uso, no repetir; avanzar con beneficios (RAG) + CTAs.",

  // Gating de email (criterios completos)
  email_gating_policy:
    "can_ask_email_now=true solo si: stage ∈ {qualify,proposal_ready} AND interests≠∅ AND services_seen≥1 AND prices_asked≥1 AND deep_interest≥1 AND business_name≠∅ AND proposal_intent_confirmed=true AND email vacío y sin cooldown. Si es false, reason debe listar faltantes y 'stage insuficiente' si stage∉{qualify,proposal_ready}.",

  // Privacidad
  privacy_policy:
    "No incluir PII (nombre, teléfono, email, IDs, país, tz, canal) en history_summary/recommendation/reason; referirse como 'el usuario'.",

  // Guardrail: no reiniciar menú cuando ya hay servicio o stage≥match
  menu_guard_policy:
    "Con service_target presente o stage≥match está prohibido recomendar menú general. Usar CTAs del servicio.",

  // Self-checks (para que la LLM se autovalide)
  self_check_policy:
    "Si el último mensaje es selección de servicio (número/alias) y no hay precio/volumen/demo, stage MUST BE 'match' y services_seen+=1. service_target.bundle y rag_hints no pueden quedar vacíos (3–6 hints). state.interests debe mapearse a options.interests_allowed (p.ej., 'Odoo','CRM')."
};

// ---------- Meta ----------
const meta = {
  history_len: history.length,
  truncated: historySorted.length > history.length,
  locale_hint: DEFAULT_LOCALE,
  channel,
  country,
  tz,
  now_ts,
  // ventana anti-loop (minutos)
  anti_loop_window_min: 5,
  version: "smart-input@2"
};

// ---------- Output ----------
return [
  {
    json: {
      history,
      profile,
      state,
      options,
      rules,
      meta
    }
  }
];
