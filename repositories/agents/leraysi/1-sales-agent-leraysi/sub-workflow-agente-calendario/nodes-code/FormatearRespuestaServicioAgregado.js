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
// CALCULAR DESGLOSE DE SEÑA
// ============================================================================
const precioExistente = Number(metaData.turno_precio_existente) || 0;
const senaPagada = Number(metaData.turno_sena_pagada) || 0;
const precioTotal = prepararData.precio || 0;
const senaTotalNueva = Math.round(precioTotal * 0.3); // 30% del total combinado
const senaDiferencial = Math.max(0, senaTotalNueva - senaPagada);
const servicioExistente = metaData.turno_servicio_existente || '';

// ============================================================================
// OUTPUT PARA MASTER AGENT
// ============================================================================
// Mantiene nombres compatibles con lo que espera el Master Agent prompt
// + desglose de seña para mensaje claro a la clienta
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
      servicios_combinados: prepararData.servicio_detalle,
      precio_total: precioTotal,
      link_pago: prepararData.mp_link,
      // Desglose de seña (para que la LLM explique claramente a la clienta)
      sena_ya_pagada: senaPagada,
      sena_adicional: senaDiferencial,
      sena_total_nueva: senaTotalNueva,
      servicio_existente: servicioExistente,
      precio_existente: precioExistente
    }
  }
}];
