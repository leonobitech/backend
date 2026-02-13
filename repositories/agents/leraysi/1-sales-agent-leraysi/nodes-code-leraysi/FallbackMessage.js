const retryInfo = $input.first().json;
const inputMainData = $("Input Main").first().json;
const originalState = inputMainData.state;

const fallbackText =
  "⋆˚🧝‍♀️ Disculpá mi amor, estoy teniendo un problemita técnico 😅 Podrías escribirme de nuevo en unos minutitos? Así te respondo como correspondé 💕";

// Construir baserow_update con tipos correctos (igual que Output Main)
const baserowUpdate = {
  row_id: originalState.row_id,
  full_name: originalState.full_name || null,
  email: originalState.email || null,
  stage: originalState.stage,
  priority: originalState.priority || "normal",
  servicio_interes: originalState.servicio_interes || null,
  interests: Array.isArray(originalState.interests) ? originalState.interests : [],
  foto_recibida: Boolean(originalState.foto_recibida),
  presupuesto_dado: Boolean(originalState.presupuesto_dado),
  turno_agendado: Boolean(originalState.turno_agendado),
  turno_fecha: originalState.turno_fecha || null,
  sena_pagada: Boolean(originalState.sena_pagada),
  waiting_image: Boolean(originalState.waiting_image),
  services_seen: originalState.services_seen ?? 0,
  prices_asked: originalState.prices_asked ?? 0,
  deep_interest: originalState.deep_interest ?? 0,
  email_ask_ts: typeof originalState.email_ask_ts === 'string' ? originalState.email_ask_ts : null,
  fullname_ask_ts: typeof originalState.fullname_ask_ts === 'string' ? originalState.fullname_ask_ts : null,
  notes: "Error técnico - fallback enviado",
  image_analysis: originalState.image_analysis
    ? JSON.stringify(originalState.image_analysis)
    : null,
};

return [
  {
    json: {
      content_whatsapp: {
        content: fallbackText,
        message_type: "outgoing",
        content_type: "text",
      },
      body_html: "<p>" + fallbackText + "</p>",
      lead_id: originalState.lead_id,
      row_id: originalState.row_id,
      baserow_update: baserowUpdate,
      state: originalState,
      meta: {
        timestamp: new Date().toISOString(),
        fallback: true,
        retryAttempts: retryInfo.maxAttempts,
        lastError: retryInfo.errorMessage,
      },
    },
  },
];
