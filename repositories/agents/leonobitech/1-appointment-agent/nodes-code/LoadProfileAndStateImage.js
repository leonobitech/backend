// ============================================================================
// LOAD PROFILE (Image Flow) - v3 SIN DUPLICACIÓN
// ============================================================================
// Recibe: Output de ParseVisionResponse + Datos originales de Baserow
// Output: { profile: {...con image_analysis...}, lead_id, row_id }
// ============================================================================

// Helper functions
function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}
function nul(x) {
  return x === "" || x === undefined ? null : x;
}

// Obtener datos de ParseVisionResponse (último input)
const input = $input.first().json;
const imageAnalysis = input.image_analysis;

// 🛡️ CRÍTICO: Obtener datos originales de Baserow
const baserowData = $("Baserow List Rows").first().json;

console.log("[LoadProfile-Image] Usando contadores de Baserow:", {
  services_seen: baserowData.services_seen,
  prices_asked: baserowData.prices_asked,
});

// ============================================================================
// NORMALIZAR DATOS DE BASEROW
// ============================================================================

const country =
  typeof baserowData.country === "object" && baserowData.country && baserowData.country.value
    ? baserowData.country.value
    : baserowData.country || "Argentina";

const channel =
  typeof baserowData.channel === "object" && baserowData.channel && baserowData.channel.value
    ? baserowData.channel.value
    : baserowData.channel || "whatsapp";

const stage =
  typeof baserowData.stage === "object" && baserowData.stage && baserowData.stage.value
    ? baserowData.stage.value
    : baserowData.stage || "consulta";

const priority =
  typeof baserowData.priority === "object" && baserowData.priority && baserowData.priority.value
    ? baserowData.priority.value
    : baserowData.priority || "normal";

// Normalizar interests array
let interests = [];
if (Array.isArray(baserowData.interests)) {
  interests = baserowData.interests.map((i) =>
    typeof i === "object" && i.value ? i.value : i,
  );
}

// ============================================================================
// CONSTRUIR PROFILE (estructura única, igual que ComposeProfile.js)
// ============================================================================

const profile = {
  // IDs (protegidos)
  row_id: input.row_id,
  lead_id: Number(baserowData.lead_id),
  channel_user_id: baserowData.channel_user_id || null,
  conversation_id: Number(baserowData.conversation_id),

  // Identidad
  nick_name: nul(baserowData.nick_name),
  full_name: nul(baserowData.full_name),
  phone: nul(baserowData.phone_number),
  email: nul(baserowData.email),

  // Contexto
  channel: channel,
  country: country,
  tz: baserowData.tz || "-03:00",

  // Funnel
  stage: stage,
  priority: priority,
  servicio_interes: nul(baserowData.servicio_interes),
  interests: interests,

  // Flags del salón (actualizados por imagen)
  foto_recibida: true, // ← Actualizado: recibimos foto
  presupuesto_dado: Boolean(baserowData.presupuesto_dado),
  turno_agendado: Boolean(baserowData.turno_agendado),
  turno_fecha: nul(baserowData.turno_fecha),
  sena_pagada: Boolean(baserowData.sena_pagada),
  waiting_image: false, // ← Actualizado: ya no esperamos

  // Contadores (PLANOS, no anidados)
  services_seen: num(baserowData.services_seen, 0),
  prices_asked: num(baserowData.prices_asked, 0),
  deep_interest: num(baserowData.deep_interest, 0),

  // Últimos eventos
  last_message: "[Foto de cabello enviada]",
  last_message_id: null,
  last_activity_iso: new Date().toISOString(),

  // Cooldowns
  email_ask_ts: nul(baserowData.email_ask_ts),
  fullname_ask_ts: nul(baserowData.fullname_ask_ts),

  // Análisis de imagen (incluido en profile)
  image_analysis: imageAnalysis,
};

console.log("[LoadProfile-Image] ✅ Profile con image_analysis listo");

// ============================================================================
// OUTPUT (sin duplicación - solo profile)
// ============================================================================

return [
  {
    json: {
      profile,
      lead_id: profile.lead_id,
      row_id: profile.row_id,
    },
  },
];
