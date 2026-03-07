// ============================================================================
// FORMATEAR RESPUESTA SIN DISPONIBILIDAD - Agente Calendario Leraysi
// ============================================================================
// Formatea la respuesta cuando no hay disponibilidad para el turno solicitado
// ============================================================================
// NODO: FormatearRespuestaSinDisponibilidad (Code)
// INPUT: ParseAgentResponse via IF_Agendar (False Branch)
// OUTPUT: Respuesta formateada para el workflow principal
// ============================================================================

const data = $input.first().json;

// ============================================================================
// OUTPUT
// ============================================================================

return [{
  json: {
    success: false,
    accion: data.accion || 'sin_disponibilidad',
    mensaje_para_clienta: data.mensaje_para_clienta,
    lead_row_id: data.lead_row_id,
    alternativas: data.alternativas || []
  }
}];
