// ============================================================================
// FORMATEAR RESPUESTA EXITO - Agente Calendario Leraysi
// ============================================================================
// Construye la respuesta final exitosa para devolver al Master Agent
// ============================================================================
// NODO: FormatearRespuestaExito (Code)
// INPUT: CrearTurnoBaserow (respuesta de Baserow con ID del row creado)
// OUTPUT: Respuesta estructurada para Return
// ============================================================================

const baserowResponse = $input.first().json;

// Recuperar metadata del nodo anterior (PrepararTurnoBaserow)
const metaData = $('PrepararTurnoBaserow').first().json._meta;

// El ID del turno creado en Baserow
const turnoRowId = baserowResponse.id;

// ============================================================================
// OUTPUT PARA MASTER AGENT
// ============================================================================
return [{
  json: {
    success: true,
    accion: metaData.accion,
    turno_id: turnoRowId,
    mensaje_para_clienta: metaData.mensaje_para_clienta,
    lead_row_id: metaData.lead_row_id
  }
}];
