// ============================================================================
// FORMATEAR RESPUESTA REPROGRAMADO - Agente Calendario Leraysi
// ============================================================================
// Construye la respuesta final para turno reprogramado
// ============================================================================
// NODO: FormatearRespuestaReprogramado (Code)
// INPUT: ActualizarTurnoBaserow (respuesta de Baserow Update)
// OUTPUT: Respuesta estructurada para Return
// ============================================================================

const baserowResponse = $input.first().json;

// Recuperar metadata del nodo anterior (PrepararReprogramadoBaserow)
const metaData = $('PrepararReprogramadoBaserow').first().json._meta;

// El ID del turno actualizado en Baserow
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
    lead_row_id: metaData.lead_row_id,

    // Datos específicos de reprogramación
    reprogramacion: {
      fecha_hora_anterior: metaData.fecha_hora_anterior,
      fecha_hora_nueva: metaData.fecha_hora_nueva,
      calendario_actualizado: metaData.calendario_actualizado
    }
  }
}];
