// ============================================================================
// LOAD PROFILE AND STATE (v2) - Robusto con fallbacks múltiples
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de ComposeProfile o UpdateLeadWithRow_Id
//
// Recibe: Profile de ComposeProfile o row de UpdateLeadWithRow_Id
// Output: { profile: {...}, state: {...} }
//
// Estrategia de fallbacks (3 tiers):
// 1. ComposeProfile → profile ya transformado
// 2. UpdateLeadWithRow_Id → raw Baserow row (requiere mapeo)
// 3. $json.profile → fallback del input actual
// ============================================================================

// Helper functions
function num(x, d=0){ const n = Number(x); return Number.isFinite(n) ? n : d; }
function nul(x){ return (x === '' || x === undefined) ? null : x; }
function val(v){ return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }

/**
 * Mapea una row raw de Baserow a formato profile
 * @param {Object} r - Row de Baserow
 * @returns {Object} - Profile object
 */
function mapBaserowRow(r){
  if (!r) return null;
  return {
    row_id: r.id ?? null,
    full_name: nul(r.full_name),
    phone: nul(r.phone_number),
    email: nul(r.email),
    channel: val(r.channel) || 'whatsapp',
    country: val(r.country) || null,
    tz: r.tz ?? '-03:00',
    stage: val(r.stage) || 'explore',
    priority: val(r.priority) || 'normal',

    services_seen: num(r.services_seen, 0),
    prices_asked:  num(r.prices_asked, 0),
    deep_interest: num(r.deep_interest, 0),
    proposal_offer_done: Boolean(r.proposal_offer_done),

    interests: Array.isArray(r.interests) ? r.interests : [],

    lead_id: r.lead_id ? Number(r.lead_id) : null,
    chatwoot_id: r.chatwoot_id ? Number(r.chatwoot_id) : null,
    chatwoot_inbox_id: r.chatwoot_inbox_id ? Number(r.chatwoot_inbox_id) : null,
    conversation_id: r.conversation_id ? Number(r.conversation_id) : null,

    last_message: nul(r.last_message),
    last_message_id: nul(r.last_message_id),
    last_activity_iso: nul(r.last_activity_iso),

    email_ask_ts: nul(r.email_ask_ts),
    addressee_ask_ts: nul(r.addressee_ask_ts),
  };
}

// ============================================================================
// ESTRATEGIA DE OBTENCIÓN DE PROFILE (3 tiers)
// ============================================================================

// 1) Intentar desde ComposeProfile (perfecto, ya transformado)
const fromCompose = $items('ComposeProfile', 0, 0)?.json?.profile;

// 2) Si no, desde UpdateLeadWithRow_Id (row completo de Baserow)
const fromUpdateRow = $items('UpdateLeadWithRow_Id', 0, 0)?.json;
const mappedFromUpdate = mapBaserowRow(fromUpdateRow);

// 3) Si no, usa lo que venga en este item
const fromCurrent = ($json.profile && Object.keys($json.profile).length) ? $json.profile : null;

// Seleccionar el profile (prioridad: ComposeProfile > UpdateLeadWithRow_Id > current)
const profile = fromCompose || mappedFromUpdate || fromCurrent || {};

// ============================================================================
// CONSTRUIR STATE A PARTIR DE PROFILE
// ============================================================================

const state = {
  // IDs
  lead_id: profile.lead_id ?? null,
  chatwoot_id: profile.chatwoot_id ?? null,

  // Identidad
  full_name: profile.full_name ?? null,
  business_name: profile.business_name ?? null,  // Extraído en conversación
  email: profile.email ?? null,
  phone_number: profile.phone ?? profile.phone_number ?? null,

  // Contexto
  country: profile.country ?? null,
  tz: profile.tz ?? "-03:00",
  channel: profile.channel ?? "whatsapp",

  // Funnel
  stage: profile.stage || "explore",
  interests: Array.isArray(profile.interests) ? profile.interests : [],
  last_proposal_offer_ts: profile.last_proposal_offer_ts ?? null,

  // Counters (monotonic)
  counters: {
    services_seen: num(profile.services_seen ?? profile.counters?.services_seen, 0),
    prices_asked:  num(profile.prices_asked  ?? profile.counters?.prices_asked, 0),
    deep_interest: num(profile.deep_interest ?? profile.counters?.deep_interest, 0),
  },

  // Cooldowns (timestamps)
  cooldowns: {
    email_ask_ts:     profile.email_ask_ts     ?? profile.cooldowns?.email_ask_ts ?? null,
    addressee_ask_ts: profile.addressee_ask_ts ?? profile.cooldowns?.addressee_ask_ts ?? null,
  },

  // Flags
  proposal_offer_done: Boolean(profile.proposal_offer_done),
};

// ============================================================================
// OUTPUT
// ============================================================================

return [{ json: { ...$json, profile, state } }];
