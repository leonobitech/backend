// ============================================================================
// FORMATEAR RESPUESTA SERVICIO AGREGADO - Agente Calendario Leraysi
// ============================================================================
// Construye la respuesta final cuando se agrega un servicio a turno existente
// ============================================================================
// NODO: FormatearRespuestaServicioAgregado (Code)
// INPUT: ActualizarTurnoBaserow (respuesta de Baserow Update)
// OUTPUT: Respuesta estructurada para Return
// ============================================================================

const baserowResponse = $input.first().json;

// Recuperar metadata del nodo anterior (PrepararServicioAgregadoBaserow)
const metaData = $('PrepararServicioAgregadoBaserow').first().json._meta;

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

    // Datos específicos de servicio agregado
    servicio_agregado: {
      odoo_turno_id: metaData.odoo_turno_id,
      servicios_combinados: metaData.servicios_combinados,
      precio_total: metaData.precio_total,
      sena_diferencial: metaData.sena_diferencial,
      link_pago: metaData.link_pago
    }
  }
}];
