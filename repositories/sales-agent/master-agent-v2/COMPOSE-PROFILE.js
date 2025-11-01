// ============================================================================
// COMPOSE PROFILE - Transforma row de Baserow a objeto profile
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de Baserow Get/Update/Create Row
//
// Recibe: Row de Baserow (results[0] o row directo)
// Output: { profile: {...} }
// ============================================================================

// ComposeProfile — a partir de la fila devuelta por Baserow (update/create) arma "profile"
const inJson = $json;

// intenta detectar una "row"
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

const pickVal = (x) => (x && typeof x === 'object' && 'value' in x) ? x.value : (x ?? null);
const toNum   = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const toInt0  = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;

const profile = {
  row_id: row.id ?? null,

  // identidad / contacto
  full_name: row.full_name || null,
  phone: row.phone_number || null,
  email: row.email || null,

  // contexto
  channel: pickVal(row.channel),
  country: pickVal(row.country),
  tz: row.tz || "-03:00",
  stage: pickVal(row.stage) || "explore",
  priority: pickVal(row.priority) || "normal",

  // contadores/flags
  services_seen: toInt0(row.services_seen),
  prices_asked:  toInt0(row.prices_asked),
  deep_interest: toInt0(row.deep_interest),
  proposal_offer_done: !!row.proposal_offer_done,
  interests: Array.isArray(row.interests) ? row.interests.map(pickVal).filter(Boolean) : [],

  // ids y últimos eventos
  lead_id: toNum(row.lead_id),
  chatwoot_id: toNum(row.chatwoot_id),
  chatwoot_inbox_id: toNum(row.chatwoot_inbox_id),
  conversation_id: toNum(row.conversation_id),
  last_message: row.last_message || null,
  last_message_id: row.last_message_id || null,
  last_activity_iso: row.last_activity_iso || null,

  // cooldowns (🔥 añadido para evitar perder valores de DB)
  email_ask_ts: row.email_ask_ts || null,
  addressee_ask_ts: row.addressee_ask_ts || null,
};

return [{ json: { profile } }];
