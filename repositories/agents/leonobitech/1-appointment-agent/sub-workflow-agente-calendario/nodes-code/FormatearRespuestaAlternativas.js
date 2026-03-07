// ============================================================================
// FORMATEAR RESPUESTA ALTERNATIVAS - Agente Calendario Leraysi
// ============================================================================
// Devuelve al Master Agent cuando no hay disponibilidad en la fecha solicitada
// ============================================================================
// NODO: FormatearRespuestaAlternativas (Code)
// INPUT: IF_Agendar (False Branch) - viene directo de ParseAgentResponse
// OUTPUT: Respuesta estructurada para Return
// ============================================================================

const data = $input.first().json;

// ============================================================================
// OUTPUT PARA MASTER AGENT
// ============================================================================
return [{
  json: {
    success: false,
    accion: data.accion || 'sin_disponibilidad',
    mensaje_para_clienta: data.mensaje_para_clienta,
    alternativas: data.alternativas || [],
    lead_row_id: data.lead_row_id
  }
}];
