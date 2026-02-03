// ============================================================================
// NODE: Chat History Filter (Node #38)
// ============================================================================
// Description: Get Chat History from Lead (Odoo → limpio, sin mensajes "system", con lead_id)
// Input: items con registros de mail.message de Odoo (cada uno tiene model/res_id/body/preview/...)
// Output: [{ json: { history:[{role,text,ts}], lead_id:Number|null, ...(event?) } }]
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

const items = $input.all();

// 1) Intenta recuperar {event} si ya venía mergeado
let event = null;
for (const it of items) {
  if (it.json && it.json.event) { event = it.json.event; break; }
}

// Helpers
function cleanHtmlKeepStrong(s){
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?!strong\b)\w+[^>]*>/g, "") // deja <strong>, quita el resto
    .replace(/\s+/g, " ")
    .trim();
}
function stripPrefixes(text, role){
  let t = String(text || "").trim();
  if (role === "user") {
    t = t.replace(/^<strong>\s*cliente:\s*<\/strong>\s*/i, "")
         .replace(/^cliente:\s*/i, "");
  } else if (role === "assistant") {
    t = t.replace(/^<strong>\s*🤖?\s*leonobit:?\s*<\/strong>\s*/i, "")
         .replace(/^🤖?\s*leonobit:?\s*/i, "");
  }
  return t.trim();
}
function inferRole(mm){
  const messageType = String(mm.message_type || "").toLowerCase();
  const isInternal  = Boolean(mm.is_internal);
  const preview = String(mm.preview || "");
  const body = String(mm.body || "");
  if (messageType === "notification" || isInternal) return "system";
  if (/^<\s*strong>\s*cliente\s*:\s*<\/\s*strong>/i.test(body) || /^cliente\s*:/i.test(preview)) return "user";
  if (/leonobit/i.test(body+preview) || /🤖/.test(body+preview)) return "assistant";
  if (messageType === "comment") return "assistant";
  return "assistant";
}
function toIso(d){
  try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); }
}
function minuteBucket(iso){
  const d = new Date(iso);
  return isNaN(d) ? "0" : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
}

// 2) Mapear Odoo → history crudo (con id para dedupe) y recolectar posibles lead_ids (res_id)
//    Filtra AQUÍ los 'system' para que no entren al historial.
const candidateLeadIds = [];
let raw = items.map(it => {
  const mm = it.json || {};
  if (mm && mm.model === 'crm.lead' && mm.res_id != null) {
    const n = Number(mm.res_id);
    if (Number.isFinite(n)) candidateLeadIds.push(n);
  }
  const role = inferRole(mm);
  const textHtml = cleanHtmlKeepStrong(mm.body || mm.preview || "");
  const text = stripPrefixes(textHtml, role);
  const ts = toIso(mm.date || mm.create_date || new Date().toISOString());
  return { role, text, ts, _id: mm.id || null };
})
.filter(h => h.text && h.role !== "system"); // <— elimina system aquí

// 3) Deducción robusta de lead_id
let lead_id = null;
if (candidateLeadIds.length) {
  const freq = new Map();
  for (const id of candidateLeadIds) freq.set(id, (freq.get(id) || 0) + 1);
  lead_id = [...freq.entries()].sort((a,b) => b[1]-a[1])[0][0];
} else if (event && event.lead_id != null) {
  const ev = Number(event.lead_id);
  lead_id = Number.isFinite(ev) ? ev : null;
}

// 4) Si no hay nada, usa el mensaje actual del evento (si existe)
if (raw.length === 0 && event) {
  const lastText = event?.message?.clean_text || event?.message?.text || "";
  if (lastText.trim()) {
    raw.push({ role: "user", text: lastText.trim(), ts: event.ts_utc || new Date().toISOString() });
  }
}

// 5) Deduplicar (prioridad por id; si no hay id, usa hash por (role+text+minuto))
const seen = new Set();
const out = [];
for (const h of raw) {
  const key = h._id ? `id:${h._id}` : `h:${h.role}:${h.text}:${minuteBucket(h.ts)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(h);
}

// 6) Ordenar, filtrar system (doble seguro) y recortar
const onlyHuman = out.filter(h => h.role !== "system");
onlyHuman.sort((a,b) => Date.parse(a.ts) - Date.parse(b.ts));
const history = onlyHuman.slice(-200).map(h => ({ role: h.role, text: h.text, ts: h.ts }));

// 7) Salida: history + lead_id (+ event si venía)
const payload = event ? { event, history, lead_id } : { history, lead_id };
return [{ json: payload }];
