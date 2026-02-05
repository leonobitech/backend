// ============================================================================
// FORMATEAR RESPUESTA SERVICIO AGREGADO - Agente Calendario Leraysi v2
// ============================================================================
// Construye la respuesta final cuando se agrega un servicio a turno existente
// Compatible con estructura simplificada (igual a turno_creado)
// ============================================================================
// NODO: FormatearRespuestaServicioAgregado (Code)
// INPUT: ActualizarTurnoBaserow (respuesta de Baserow Update)
// OUTPUT: Respuesta estructurada para Return → Master Agent
// ============================================================================

const baserowResponse = $input.first().json;

// Recuperar datos del nodo PrepararServicioAgregadoBaserow
const prepararData = $('PrepararServicioAgregadoBaserow').first().json;
const metaData = prepararData._meta;

// El ID del turno actualizado en Baserow
const turnoRowId = baserowResponse.id;

// ============================================================================
// OUTPUT PARA MASTER AGENT
// ============================================================================
// Mantiene nombres compatibles con lo que espera el Master Agent prompt
// (link_pago, precio_total, sena_diferencial, servicios_combinados)
// ============================================================================
return [{
  json: {
    success: true,
    accion: metaData.accion,
    turno_id: turnoRowId,
    mensaje_para_clienta: metaData.mensaje_para_clienta,
    lead_row_id: metaData.lead_row_id,

    // Datos específicos de servicio agregado
    // Mapea nombres nuevos → nombres que espera el Master Agent
    servicio_agregado: {
      odoo_turno_id: metaData.odoo_turno_id,
      // servicios_combinados ← servicio_detalle
      servicios_combinados: prepararData.servicio_detalle,
      // precio_total ← precio
      precio_total: prepararData.precio,
      // sena_diferencial ← sena_monto (es la seña total, no diferencial)
      sena_diferencial: prepararData.sena_monto,
      // link_pago ← mp_link
      link_pago: prepararData.mp_link
    }
  }
}];
