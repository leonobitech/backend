// ============================================================================
// NODE: Output Main (Node #51)
// ============================================================================
// Description: Renderización final y preparación para Chatwoot/Baserow
// Input: { output (LLM JSON), constraints, last_user_text, ... }
// Output: { body_html, content_whatsapp, chatwoot_messages, lead_id, expect_reply, ... }
//
// Features:
// - Parser robusto/tolerante para JSON truncado o malformado
// - Natural Flow: suprime menú en casos de info-only RAG, soft-close, booking confirm
// - CTA prompt injection condicional (cuando no hay menú pero hay prompt)
// - ACK-only mode: cierre limpio sin bullets/CTAs en confirmaciones de demo
// - Múltiples formatos: WhatsApp text + HTML + input_select
// - Persistencia condicional (profile_for_persist, state_for_persist)
// - Validación y notas de flujo natural
//
// CRITICAL BUGS DETECTED (from AGENT-TESTING-LOG.md):
// - No bugs directos documentados en este nodo
// - Depende de upstream (Master Agent, FlagsAnalyzer) para calidad de output
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

/**
 * Output Main v4.8.3 — Leonobitech (ACK limpio tras booking)
 * - Natural Flow + CTA prompt injection (condicional)
 * - Parser robusto/tolerante (RAG / JSON truncado)
 * - Fuentes (HTML + WhatsApp)
 * - ACK-only en confirmación de demo (sin bullets ni CTAs)
 * - Siempre retorna [{ json: ... }]
 */

const STRICT_PASSTHROUGH = true;
const MAX_CTA_ITEMS = 4;

// ---------- utils ----------
function deepClone(x){ try { return JSON.parse(JSON.stringify(x)); } catch { return x; } }
function esc(s){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function mdToText(md){
  return String(md || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function mdToHtml(md){
  const lines = String(md || "").split(/\r?\n/);
  let html = "", inOl=false, inUl=false;
  const flushOl=()=>{ if(inOl){ html+="</ol>"; inOl=false; } };
  const flushUl=()=>{ if(inUl){ html+="</ul>"; inUl=false; } };
  for (const raw of lines){
    const line = raw.trim();
    const mNum = line.match(/^\d+[.)]\s+(.*)$/);
    if (mNum){ flushUl(); if(!inOl){ html += "<ol>"; inOl=true; } html += `<li>${esc(mNum[1])}</li>`; continue; }
    const mBul = line.match(/^[-*]\s+(.*)$/);
    if (mBul){ flushUl(); if(!inUl){ html += "<ul>"; inUl=true; } html += `<li>${esc(mBul[1])}</li>`; continue; }
    if (!line){ flushOl(); flushUl(); continue; }
    flushOl(); flushUl();
    html += `<p>${esc(line)}</p>`;
  }
  flushOl(); flushUl();
  return html;
}
function sanitizeText(s, limit=3500){
  if (s == null) return "";
  let out = String(s);
  try { out = out.normalize('NFC'); } catch {}
  out = out.replace(/\r\n?/g,"\n")
           .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
           .replace(/[\u200B-\u200D\u2060\uFEFF]/g,"")
           .split("\n").map(l=>l.replace(/[ \t]+$/g,"")).join("\n")
           .replace(/\n{3,}/g,"\n\n");
  if (out.length>limit) out = out.slice(0,limit-1)+"…";
  return out.trim();
}
function coalesceLeadId(){
  try { const v=$node["UpdateLeadWithLead_Id"]?.json?.lead_id; if (v!=null) return v; } catch {}
  const cur = $input.first()?.json ?? {};
  if (cur.lead_id!=null) return cur.lead_id;
  if (cur.context?.lead_id!=null) return cur.context.lead_id;
  const CANDS=["adjustFirstInteractionToLocalTime","LeadResolver","FlagsAnalyzer","EmailExtractor","AgentInput+Flags+InputMain","Output Main"];
  for (const name of CANDS){
    try {
      const n=$node[name]?.json;
      if (n?.lead_id!=null) return n.lead_id;
      if (n?.context?.lead_id!=null) return n.context.lead_id;
    } catch {}
  }
  return null;
}
function coalesceProfile(){
  const cands=[
    $node["AgentInput+Flags+InputMain"]?.json?.profile_echo,
    $node["FlagsAnalyzer"]?.json?.passthrough?.profile,
    $node["LoadProfileAndState"]?.json?.profile,
    $node["ComposeProfile"]?.json?.profile,
  ];
  for (const x of cands) if (x && typeof x==="object") return deepClone(x);
  return null;
}
function coalesceStateBase(){
  const cands=[
    $node["BuildStatePatch"]?.json?.state,
    $node["AgentInput+Flags+InputMain"]?.json?.state_echo,
    $node["FlagsAnalyzer"]?.json?.passthrough?.state,
  ];
  for (const x of cands) if (x && typeof x==="object") return deepClone(x);
  return null;
}

// --- robust parsing ---
function stripCodeFences(s){
  s = String(s || "");
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}
function tryParseBalancedObject(s){
  s = String(s || "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let i = start; i < s.length; i++){
    const ch = s[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0){ end = i; break; }
    }
  }
  if (end > start){
    const sub = s.slice(start, end + 1);
    try { return JSON.parse(sub); } catch {}
  }
  return null;
}
function parseOutRobust(raw){
  if (!raw) return null;
  if (typeof raw === "object") return raw;

  let s = stripCodeFences(String(raw));

  // 1) parse directo
  try {
    const v = JSON.parse(s);
    if (typeof v === "string"){
      try { return JSON.parse(stripCodeFences(v)); } catch { return { answer_md: v }; }
    }
    return v;
  } catch {}

  // 2) objeto balanceado
  const balanced = tryParseBalancedObject(s);
  if (balanced) return balanced;

  // 3) extracción tolerante
  const out = { no_reply:false, purpose:null, service:null, rag_used:false, answer_md:"", bullets:[], cta:[], sources:[] };

  const decodeJsonString = (m)=>{
    try { return JSON.parse(`"${m.replace(/"/g,'\\"')}"`); } catch { return m; }
  };

  // answer_md
  const mAns = s.match(/"answer_md"\s*:\s*"([\s\S]*?)"\s*(?:,|\n|\})/);
  if (mAns) out.answer_md = decodeJsonString(mAns[1]);

  // bullets
  const mBul = s.match(/"bullets"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\n|\})/);
  if (mBul){ try { out.bullets = JSON.parse(mBul[1]); } catch {} }

  // purpose/service/rag/no_reply
  const mPur = s.match(/"purpose"\s*:\s*"([^"]*)"/); if (mPur) out.purpose = mPur[1] || null;
  const mSrv = s.match(/"service"\s*:\s*"([^"]*)"/);  if (mSrv) out.service  = mSrv[1] || null;
  const mRag = s.match(/"rag_used"\s*:\s*(true|false)/); if (mRag) out.rag_used = mRag[1] === "true";
  const mNR  = s.match(/"no_reply"\s*:\s*(true|false)/); if (mNR)  out.no_reply = mNR[1] === "true";

  // cta_menu
  let ctaMenuObj = null;
  const mMenu = s.match(/"cta_menu"\s*:\s*(\{[\s\S]*?\})\s*(?:,|\n|\})/);
  if (mMenu){ try { ctaMenuObj = JSON.parse(mMenu[1]); } catch {} }
  if (!ctaMenuObj){
    const mPromptLoose = s.match(/"cta_menu"\s*:\s*\{[\s\S]*?"prompt"\s*:\s*"([\s\S]*?)"\s*(?:,|\n|\})/);
    if (mPromptLoose){ ctaMenuObj = { prompt: decodeJsonString(mPromptLoose[1]) }; }
  }
  if (ctaMenuObj) out.cta_menu = ctaMenuObj;

  // sources
  const mSrc = s.match(/"sources"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\n|\})/);
  if (mSrc){ try { out.sources = JSON.parse(mSrc[1]); } catch {} }

  // si answer_md es un objeto stringificado
  if (/^\s*\{[\s\S]*\}\s*$/.test(out.answer_md)){
    try {
      const inner = JSON.parse(out.answer_md);
      if (inner && typeof inner === "object") return inner;
    } catch {}
  }
  if (!out.answer_md){
    const parts = [];
    if (out.service) parts.push(`Servicio: ${out.service}`);
    if (out.purpose) parts.push(`Propósito: ${out.purpose}`);
    out.answer_md = parts.join(" — ") || "Aquí van los detalles del servicio.";
  }
  return out;
}

// --- visuals helpers ---
function looksEnumerated(s){ return /^\s*\d+\s*[.)\-–]?\s+/.test(String(s||"")); }
function stripEnumLead(s){ return String(s||"").replace(/^\s*\d+[.)]\s+/, ""); }
function isEnumeratedArray(arr){
  if (!Array.isArray(arr)) return false;
  let hits = 0;
  for (const it of arr){ if (looksEnumerated(it)) hits++; }
  return hits >= Math.max(2, Math.floor(arr.length/2));
}
function formatBulletLineForText(s){
  const t = String(s||"").trim();
  if (t.startsWith("• ")) return t;
  if (looksEnumerated(t)) return t;
  return `• ${t}`;
}

try {
  // ---------- Input ----------
  const input = $input.first()?.json ?? {};
  const rawOut = parseOutRobust(input.output) || {};

  const constraintsIn = input?.constraints || rawOut?.constraints || null;
  const ui = constraintsIn?.ui_policy || null;
  const FORCE_ACK_ONLY = ui?.render === "ack_only";

  // LLM fields
  let answerMd = rawOut.answer_md || rawOut.text || rawOut.message || "";
  if (/^\s*\{[\s\S]*"purpose"\s*:/.test(answerMd)) {
    try {
      const inner = JSON.parse(stripCodeFences(answerMd));
      if (inner && typeof inner === "object" && inner.answer_md) {
        answerMd = inner.answer_md;
      }
    } catch {}
  }
  const bullets  = Array.isArray(rawOut.bullets) ? rawOut.bullets : [];
  const purpose  = rawOut.purpose ?? null;
  const service  = rawOut.service ?? null;
  const rag_used = !!rawOut.rag_used;
  const sources  = Array.isArray(rawOut.sources) ? rawOut.sources : [];
  const no_reply = FORCE_ACK_ONLY ? true : !!rawOut.no_reply;

  // Fallback si answer_md vacío + bullets
  if (!answerMd && bullets.length){
    answerMd = service
      ? `Aquí algunos beneficios de ${service}:`
      : "Aquí algunos puntos clave:";
  }

  // ----- Política de menú natural -----
  let cta_menu = (rawOut && rawOut.cta_menu && typeof rawOut.cta_menu === "object")
    ? deepClone(rawOut.cta_menu)
    : null;

  const purposeKey = String(purpose || "").toLowerCase();
  const hasServiceContext = Boolean(service) || purposeKey === "service_info";

  const isInfoOnlyRag =
    rag_used &&
    hasServiceContext &&
    !rawOut.cta_menu &&
    bullets.length >= 3 &&
    !/[?¿]/.test(answerMd);

  const lastUser = String(input?.last_user_text || "").trim().toLowerCase();
  const SOFT_CLOSE_RX = /^(no( gracias)?|gracias|ok|listo|ya( está)?)\b/;
  const isSoftCloseUser = SOFT_CLOSE_RX.test(lastUser);

  const masterNoMenu = rawOut.no_cta === true || constraintsIn?.ui_policy?.show_menu === false;

  // --- detectar confirmación de demo / ack final ---
  const CONFIRM_ACK_RX = /(quedamos\s+agendad[oa]s?|agendad[oa]|nos\s+vemos\s+en\s+la\s+demo|demo\s+(confirmad[oa]|agendada))/i;
  const isBookingConfirm = CONFIRM_ACK_RX.test(String(rawOut.answer_md || answerMd || ""));

  // --- decisión global de suprimir menú ---
  const SUPPRESS_MENU = FORCE_ACK_ONLY || masterNoMenu || isSoftCloseUser || isInfoOnlyRag || isBookingConfirm;

  if (!cta_menu && hasServiceContext && !SUPPRESS_MENU) {
    const svc = String(service || "Process Automation (Odoo/ERP)");
    const key = svc.toLowerCase().includes("odoo") ? "odoo" : "service";
    cta_menu = {
      prompt: `¿Cómo querés avanzar con ${svc}?`,
      kind: "actions",
      items: [
        { title: "Ver precios",                value: `ask_price:${key}` },
        { title: "Beneficios e integraciones", value: `info_services:${key}` },
        { title: "Agendar demo",               value: `demo_request:${key}` },
        { title: "Solicitar propuesta",        value: `proposal_request:${key}` },
      ],
      max_picks: 1,
      _auto: true
    };
  }

  // --- Validación / notas ---
  const validation = { notes: [], warnings: [], errors: [] };
  if (STRICT_PASSTHROUGH && service && cta_menu?.kind === "services") {
    validation.warnings.push("services-catalog suprimido: ya hay un servicio seleccionado.");
  }
  if (SUPPRESS_MENU){
    validation.notes.push(
      isInfoOnlyRag ? "natural_flow:suppress_menu(info_only_rag)" :
      isSoftCloseUser ? "natural_flow:suppress_menu(soft_close_user)" :
      masterNoMenu ? "natural_flow:suppress_menu(master_flag)" :
      isBookingConfirm ? "natural_flow:suppress_menu(booking_confirm)" :
      FORCE_ACK_ONLY ? "natural_flow:suppress_menu(ack_only)" :
      "natural_flow:suppress_menu(other)"
    );
  }

  const menuItems = Array.isArray(cta_menu?.items) ? cta_menu.items.slice(0, MAX_CTA_ITEMS) : [];
  let showMenu = false;
  let optionTitles = [];
  let optionValues = [];

  if (!SUPPRESS_MENU && cta_menu?.kind === "actions" && menuItems.length){
    showMenu = true;
    optionTitles = menuItems.map(it => String(it?.title || it?.value || "")).filter(Boolean);
    optionValues = menuItems.map(it => String(it?.value || it?.title || "")).filter(Boolean);
  }
  if (!SUPPRESS_MENU && !service && cta_menu?.kind === "services" && menuItems.length){
    showMenu = true;
    optionTitles = menuItems.map(it => String(it?.title || it?.value || "")).filter(Boolean);
    optionValues = menuItems.map(it => String(it?.value || it?.title || "")).filter(Boolean);
  }

  // --- Render WhatsApp/Text ---
  const PURPOSE_LABELS_ES = {
    options:"Opciones", service:"Servicio", services:"Servicios", service_info:"Servicio",
    info:"Información", information:"Información", price:"Precios", pricing:"Precios",
    price_info:"Precios", proposal_ready:"Propuesta", clarify:"Aclaración",
    followup:"Seguimiento", greeting:"Saludo", default:"Mensaje",
  };
  const TAG = FORCE_ACK_ONLY ? "Cierre" : (PURPOSE_LABELS_ES[String(purpose || "").toLowerCase()] || PURPOSE_LABELS_ES.default);

  let text = mdToText(answerMd);
  if (!FORCE_ACK_ONLY && !isBookingConfirm && bullets.length){
    const bulletsText = bullets.map(formatBulletLineForText).join("\n");
    text += (text ? "\n\n" : "") + bulletsText;
  }
  if (!FORCE_ACK_ONLY && !isBookingConfirm && showMenu && optionTitles.length){
    const optsText = optionTitles.map((t) => looksEnumerated(t) ? String(t) : `• ${t}`).join("\n");
    text += `\n\n*Opciones:*\n${optsText}`;
  }
  if (!FORCE_ACK_ONLY){
    text = `Leonobit 🤖 *[${TAG}]*:\n${text}`.trim();
  }

  // HTML
  const header_html = FORCE_ACK_ONLY ? "" : `<p><strong>🤖 Leonobit [${esc(TAG)}]</strong></p>`;
  let body_html = mdToHtml(answerMd);
  if (!FORCE_ACK_ONLY && !isBookingConfirm && bullets.length){
    body_html += `<ul>${bullets.map(b=>`<li>${esc(String(b))}</li>`).join("")}</ul>`;
  }
  if (!FORCE_ACK_ONLY && !isBookingConfirm && showMenu && optionTitles.length){
    body_html += `<p><strong>Opciones:</strong></p><ul>${optionTitles.map(t=>`<li>${esc(String(t))}</li>`).join("")}</ul>`;
  }

  // --- CTA prompt como pregunta potencial ---
  const ctaPrompt = String(cta_menu?.prompt || "").trim();
  const hasCtaPrompt = ctaPrompt.length > 0;
  const ctaPromptLooksQuestion = hasCtaPrompt && /[?¿]\s*$/.test(ctaPrompt);

  // FIX: NO inyectar prompt cuando suprimimos menú (incluye confirmación)
  const shouldInjectPrompt = hasCtaPrompt && !showMenu && !SUPPRESS_MENU;

  if (shouldInjectPrompt) {
    const q = ctaPromptLooksQuestion ? ctaPrompt : `${ctaPrompt}?`;
    const spacer = text && !text.endsWith("\n") ? "\n\n" : (text ? "" : "");
    if (q && !text.includes(q)) text += `${spacer}${q}`;
    if (q && !body_html.includes(esc(q))) body_html += `<p>${esc(q)}</p>`;
    validation.notes.push("natural_flow:cta_prompt_injected(no_menu_items)");
  }

  // --- Render Fuentes (si hay) ---
  if (!FORCE_ACK_ONLY && !isBookingConfirm && sources.length){
    body_html += `<p><strong>Fuentes:</strong></p><ul>${
      sources.slice(0,5).map(s=>`<li>${esc(s.title || s.url || "Fuente")}</li>`).join("")
    }</ul>`;
    const srcTxt = sources.slice(0,5).map((s,i)=>`• ${s.title || s.url || "Fuente " + (i+1)}`).join("\n");
    const w = text.endsWith("\n") ? "" : "\n\n";
    text += `${w}*Fuentes:*\n${sanitizeText(srcTxt)}`;
  }

  body_html = header_html + body_html;

  // --- Persistencia / Meta ---
  const lead_id = coalesceLeadId();
  const shouldPersist = !FORCE_ACK_ONLY;
  const profile_for_persist = shouldPersist ? coalesceProfile() : null;
  let state_for_persist = shouldPersist ? coalesceStateBase() : null;

  // Expect reply natural (considera answer_md + cta_prompt), y también si no hay menú
  const purposeLc = String(purpose || "").toLowerCase();
  const hasSlogan = /Leonobitech — Haz que tu negocio hable contigo/.test(String(answerMd||""));
  const isHardClosure = FORCE_ACK_ONLY || (purposeLc === "handoff" && !showMenu) || hasSlogan;

  const combinedQuestionText = `${(answerMd || "").trim()} ${ctaPrompt}`.trim();
  const looksLikeQuestion = /[?¿]\s*/.test(combinedQuestionText);
  const menuSuppressedOrAbsent = SUPPRESS_MENU || !showMenu;

  const naturalExpectReply = isHardClosure
    ? false
    : (menuSuppressedOrAbsent ? (looksLikeQuestion ? true : !!(hasCtaPrompt && !SUPPRESS_MENU)) : !no_reply);

  const content_whatsapp = {
    content: sanitizeText(text),
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {}
  };

  const chatwoot_messages = (!FORCE_ACK_ONLY && !isBookingConfirm && showMenu && optionTitles.length && cta_menu?.kind)
    ? [content_whatsapp, {
        content: cta_menu?.prompt || "Elegí una opción:",
        message_type: "outgoing",
        content_type: "input_select",
        content_attributes: {
          items: optionTitles.map((t,i) => ({
            title: stripEnumLead(String(t)),
            value: optionValues[i] || String(t)
          }))
        }
      }]
    : [content_whatsapp];

  const chatwoot_input_select = (!isBookingConfirm && chatwoot_messages.length > 1) ? chatwoot_messages[1] : null;

  const meta = {
    no_reply: no_reply,
    purpose,
    service,
    rag_used,
    sources,
    validation,
    raw_out: deepClone(rawOut),
    menu_fallback_used: Boolean(cta_menu?._auto),
    cta_prompt_used_in_text: Boolean(shouldInjectPrompt),
    natural_flow: { SUPPRESS_MENU, isInfoOnlyRag, isSoftCloseUser, masterNoMenu, FORCE_ACK_ONLY, isBookingConfirm }
  };

  const output = {
    body_html,
    content_whatsapp,
    chatwoot_input_select,
    chatwoot_messages,
    lead_id,
    structured_cta: (!isBookingConfirm && showMenu) ? optionValues : [],
    expect_reply: naturalExpectReply && !isBookingConfirm,
    message_kind: (isBookingConfirm ? "ack" : (FORCE_ACK_ONLY ? "closing" : (String(purpose || "").toLowerCase() || "text"))),
    meta,
    constraints: FORCE_ACK_ONLY
      ? { ui_policy: { render: "ack_only", show_menu: false, show_cta: false, max_picks: 0 } }
      : (constraintsIn || undefined),
    profile_for_persist: shouldPersist ? profile_for_persist : null,
    state_for_persist:  shouldPersist ? state_for_persist  : null
  };

  return [{ json: output }];

} catch (err) {
  return [{
    json: {
      body_html: "<p><strong>🤖 Leonobit [Mensaje]</strong></p><p>Error formateando salida.</p>",
      content_whatsapp: {
        content: "Leonobit 🤖 *[Mensaje]*:\nError formateando salida.",
        message_type: "outgoing",
        content_type: "text",
        content_attributes: {}
      },
      chatwoot_messages: [],
      lead_id: null,
      structured_cta: [],
      expect_reply: false,
      message_kind: "text",
      meta: { errors: [String(err && err.message || err)], node: "Output Main v4.8.3" }
    }
  }];
}
