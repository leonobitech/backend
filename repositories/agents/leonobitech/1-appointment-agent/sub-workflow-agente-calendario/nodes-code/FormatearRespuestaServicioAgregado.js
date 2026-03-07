// ============================================================================
// FORMATEAR RESPUESTA SERVICIO AGREGADO - Agente Calendario Leraysi v4
// ============================================================================
// Construye la respuesta final cuando se agrega un servicio a turno existente.
// Bifurca entre:
//   PATH A — TURNO ADICIONAL: fila nueva creada (Create Row response)
//   PATH B — MISMA TRABAJADORA: fila existente actualizada (Update Row response)
// ============================================================================
// NODO: FormatearRespuestaServicioAgregado (Code)
// INPUT: ActualizarTurnoBaserow O CrearTurnoAdicionalBaserow (respuesta de Baserow)
// OUTPUT: Respuesta estructurada para Return → Master Agent
// ============================================================================

const baserowResponse = $input.first().json;

// Recuperar datos del nodo PrepararServicioAgregadoBaserow
const prepararData = $('PrepararServicioAgregadoBaserow').first().json;
const metaData = prepararData._meta;
const definitivos = metaData.datos_definitivos || {};

// El ID de la fila en Baserow (nueva o actualizada)
const turnoRowId = baserowResponse.id;
const esTurnoAdicional = prepararData._operacion === 'crear_turno_adicional';

// ============================================================================
// PATH A: TURNO ADICIONAL — Fila nueva creada
// ============================================================================
if (esTurnoAdicional) {
  const precioNuevo = definitivos.precio || 0;
  const senaNuevo = definitivos.sena_monto || Math.round(precioNuevo * 0.3);

  // ── Hora client-facing: si hay jornada completa (padre o hijo), su hora prevalece ──
  // La clienta llega a las 09:00 para jornada completa, sin importar si es padre o hijo.
  const complejidadPadre = metaData.turno_complejidad_padre || 'media';
  const complejidadHijo = definitivos.complejidad_maxima || 'media';
  const hayJornadaCompleta = complejidadPadre === 'muy_compleja' || complejidadHijo === 'muy_compleja';

  let mensajeClienteFinal = metaData.mensaje_para_clienta;
  if (hayJornadaCompleta) {
    // Determinar hora correcta: la del turno con jornada completa
    const horaJornada = complejidadPadre === 'muy_compleja'
      ? (metaData.turno_hora_original || '09:00')
      : (definitivos.hora || '09:00');
    const horaIncorrecta = complejidadPadre === 'muy_compleja'
      ? (definitivos.hora || '12:00')
      : (metaData.turno_hora_original || '09:00');

    // Reemplazar hora incorrecta en el mensaje de la LLM
    if (horaIncorrecta !== horaJornada && mensajeClienteFinal.includes(horaIncorrecta)) {
      mensajeClienteFinal = mensajeClienteFinal.replace(horaIncorrecta, horaJornada);
      console.log(`[FormatearRespuesta] Hora corregida: ${horaIncorrecta} → ${horaJornada} (jornada completa)`);
    }
  }

  console.log(`[FormatearRespuesta] PATH A: Turno adicional creado. ` +
    `Row nuevo: #${turnoRowId}. Padre: #${metaData.turno_padre_row_id}`);

  return [{
    json: {
      success: true,
      accion: 'turno_adicional_creado',
      turno_id: turnoRowId,
      turno_id_padre: metaData.turno_padre_row_id,
      mensaje_para_clienta: mensajeClienteFinal,
      lead_row_id: metaData.lead_row_id,

      // Datos del turno adicional (solo servicio nuevo)
      servicio_agregado: {
        es_turno_adicional: true,
        odoo_turno_id: metaData.odoo_turno_id,
        servicio_nuevo: definitivos.servicio_detalle,
        trabajadora_nueva: prepararData.trabajadora || 'Companera',
        precio_servicio_nuevo: precioNuevo,
        sena_a_pagar: senaNuevo,
        link_pago: prepararData.mp_link,
        // Datos del turno padre (para contexto)
        servicio_existente: metaData.turno_servicio_existente || '',
        trabajadora_existente: metaData.turno_trabajadora_original || 'Leraysi',
        hora_existente: metaData.turno_hora_original || '',
        precio_existente: Number(metaData.turno_precio_existente) || 0,
      }
    }
  }];
}

// ============================================================================
// PATH B: MISMA TRABAJADORA — Fila existente actualizada (lógica v3 original)
// ============================================================================
const precioExistente = Number(metaData.turno_precio_existente) || 0;
const senaPagada = Number(metaData.turno_sena_pagada) || 0;
const precioTotal = definitivos.precio || 0;
const senaTotalNueva = definitivos.sena_monto || Math.round(precioTotal * 0.3);
const senaDiferencial = Math.max(0, senaTotalNueva - senaPagada);
const servicioExistente = metaData.turno_servicio_existente || '';

return [{
  json: {
    success: true,
    accion: metaData.accion,
    turno_id: turnoRowId,
    mensaje_para_clienta: metaData.mensaje_para_clienta,
    lead_row_id: metaData.lead_row_id,

    // Datos de servicio agregado (bloque combinado)
    servicio_agregado: {
      es_turno_adicional: false,
      odoo_turno_id: metaData.odoo_turno_id,
      servicios_combinados: definitivos.servicio_detalle,
      precio_total: precioTotal,
      link_pago: prepararData.mp_link,
      sena_ya_pagada: senaPagada,
      sena_adicional: senaDiferencial,
      sena_total_nueva: senaTotalNueva,
      servicio_existente: servicioExistente,
      precio_existente: precioExistente
    }
  }
}];
