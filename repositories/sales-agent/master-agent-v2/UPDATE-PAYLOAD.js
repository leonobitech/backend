// ============================================================================
// UPDATE PAYLOAD - Limpia y normaliza payload de webhook
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de Webhook (primer nodo del workflow)
//
// Recibe: Payload del webhook de Chatwoot con row_id y row_always
// Output: { row_id: Number, ...campos_limpios }
//
// Función:
// - Toma row_id del input
// - Toma row_always del input (objeto con campos de Baserow)
// - Filtra valores null y undefined
// - Retorna objeto limpio con row_id en el root
//
// Ejemplo Input:
// {
//   row_id: 198,
//   row_always: {
//     channel: "whatsapp",
//     last_message: "Hola",
//     empty_field: null,
//     undefined_field: undefined
//   }
// }
//
// Ejemplo Output:
// {
//   row_id: 198,
//   channel: "whatsapp",
//   last_message: "Hola"
// }
// ============================================================================

// UpdatePayload — usa row_id + row_always al root (sin nulos)
const out = Object.fromEntries(
  Object.entries($json.row_always || {}).filter(([k,v]) => v !== null && v !== undefined)
);

return [{ json: { row_id: $json.row_id, ...out } }];
