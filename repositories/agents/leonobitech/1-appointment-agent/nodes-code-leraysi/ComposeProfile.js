// ============================================================================
// COMPOSE PROFILE - Transforma row de Baserow a objeto profile
// ============================================================================
// Tabla: LeadsLeraysi
// Recibe: Row de Baserow (results[0] o row directo)
// Output: { profile: {...} }
// ============================================================================

const inJson = $json;

// Intenta detectar una "row"
let row = null;
if (Array.isArray(inJson?.results) && inJson.results[0]?.id) {
  row = inJson.results[0];
} else if (Array.isArray(inJson) && inJson[0]?.id) {
  row = inJson[0];
} else if (inJson?.id) {
  row = inJson;
} else if (inJson?.row) {
  row = inJson.row;
}
row = row || {};

const pickVal = (x) =>
  x && typeof x === "object" && "value" in x ? x.value : (x ?? null);
const toNum = (x) => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const toInt0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/**
 * Parsea image_analysis de forma segura (puede venir como string o objeto)
 */
function parseImageAnalysis(data) {
  if (!data) return null;
  if (typeof data === "object") return data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Construir description para Odoo
const channel = pickVal(row.channel);
const chatwootId = toNum(row.chatwoot_id);
const inboxId = toNum(row.chatwoot_inbox_id);
const convId = toNum(row.conversation_id);
const tz = row.tz || "-03:00";
const lastMsg = (row.last_message || "").slice(0, 180);

const parts = [];
if (channel) parts.push(`Canal: ${channel}`);
if (chatwootId != null) parts.push(`Chatwoot: ${chatwootId}`);
if (inboxId != null) parts.push(`Inbox: ${inboxId}`);
if (convId != null) parts.push(`Conv: ${convId}`);
if (tz) parts.push(`TZ: ${tz}`);
if (lastMsg) parts.push(`Último: ${lastMsg}`);
const description = parts.join(" • ");

const profile = {
  row_id: row.id ?? null,

  // Identidad / contacto
  nick_name: row.nick_name || null,
  full_name: row.full_name || null,
  phone: row.phone_number || null,
  email: row.email || null,

  // Contexto
  channel: channel,
  country: pickVal(row.country),
  tz: tz,
  stage: pickVal(row.stage) || "explore",
  priority: pickVal(row.priority) || "normal",

  // Servicio de interés
  servicio_interes: row.servicio_interes || null,
  interests: Array.isArray(row.interests)
    ? row.interests.map(pickVal).filter(Boolean)
    : [],

  // Flags del salón
  foto_recibida: !!row.foto_recibida,
  presupuesto_dado: !!row.presupuesto_dado,
  turno_agendado: !!row.turno_agendado,
  turno_fecha: row.turno_fecha || null,
  sena_pagada: !!row.sena_pagada,
  waiting_image: !!row.waiting_image,

  // Contadores
  services_seen: toInt0(row.services_seen),
  prices_asked: toInt0(row.prices_asked),
  deep_interest: toInt0(row.deep_interest),

  // IDs y últimos eventos
  lead_id: toNum(row.lead_id),
  chatwoot_id: chatwootId,
  chatwoot_inbox_id: inboxId,
  conversation_id: convId,
  last_message: row.last_message || null,
  last_message_id: row.last_message_id || null,
  last_activity_iso: row.last_activity_iso || null,

  // Cooldowns
  email_ask_ts: row.email_ask_ts || null,
  fullname_ask_ts: row.fullname_ask_ts || null,

  // Image Analysis (nuevo)
  image_analysis: parseImageAnalysis(row.image_analysis),

  // Para Odoo
  description: description,
};

return [{ json: { profile } }];
