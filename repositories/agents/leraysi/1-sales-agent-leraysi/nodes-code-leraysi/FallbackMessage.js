const retryInfo = $input.first().json;
const inputMainData = $("Input Main").first().json;
const originalState = inputMainData.state;

const fallbackText =
  "⋆˚🧝‍♀️ Disculpá mi amor, estoy teniendo un problemita técnico 😅 Podrías escribirme de nuevo en unos minutitos? Así te respondo como correspondé 💕";

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
      baserow_update: Object.assign({}, originalState, {
        notes: "Error técnico - fallback enviado",
      }),
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
