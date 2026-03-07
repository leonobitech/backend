// ============================================================================
// FORMATEAR RESPUESTA CONFIRMACION - Agente Calendario Leraysi
// ============================================================================
// INPUT: RouteDecision (con modo: "confirmar", accion: "resumen_confirmacion")
// OUTPUT: Resumen de confirmación para la clienta (sin crear turno)
//
// PASO 2 del flujo de 3 pasos:
//   PASO 1: consultar_disponibilidad → opciones
//   PASO 2: confirmar → resumen (ESTE NODO) ← NO crea nada
//   PASO 3: crear → turno + link de pago
// ============================================================================

const data = $input.first().json;

const nombreClienta = data.nombre_clienta || 'Reina';
const email = data.email || '';
const servicioDisplay = data.servicio_detalle || (Array.isArray(data.servicio) ? data.servicio.join(' + ') : data.servicio) || 'servicio';
const precio = data.precio || 0;
const sena = Math.round(precio * 0.3);
const esAgregarServicio = data.agregar_a_turno_existente === true;
const horaOriginal = data.turno_hora_original || null;

// --- Fecha humana ---
const fechaSolicitadaRaw = data.fecha_solicitada || data.fecha_deseada || '';
const fechaSoloParte = fechaSolicitadaRaw.includes('T')
  ? fechaSolicitadaRaw.split('T')[0]
  : fechaSolicitadaRaw.split(' ')[0];
const horaDeseada = data.hora_deseada || '09:00';

const formatearFechaHumana = (fechaStr) => {
  if (!fechaStr) return 'fecha no especificada';
  const soloFecha = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr.split(' ')[0];
  const fecha = new Date(soloFecha + 'T12:00:00');
  if (isNaN(fecha.getTime())) return 'fecha invalida';
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
};

const fechaHumana = formatearFechaHumana(fechaSoloParte);
const esJornadaCompleta = (data.complejidad_maxima === 'muy_compleja') ||
  (data.duracion_estimada && data.duracion_estimada >= 600);

// --- Construir resumen ---
let mensajeParaClienta;

if (esAgregarServicio) {
  // ── CONFIRMAR AGREGAR SERVICIO ──
  const precioExistente = data.turno_precio_existente || 0;
  const precioNuevo = precio;
  const precioTotal = precioExistente + precioNuevo;
  const senaPagada = data.turno_sena_pagada || Math.round(precioExistente * 0.3);
  const senaTotalNueva = Math.round(precioTotal * 0.3);
  const senaDiferencial = Math.max(0, senaTotalNueva - senaPagada);
  const servicioExistente = data.turno_servicio_existente || 'servicio actual';

  const fechaDisplay = esJornadaCompleta
    ? `${fechaHumana} - Jornada completa (09:00 a 19:00)`
    : `${fechaHumana} a las ${horaDeseada}`;

  mensajeParaClienta = `${nombreClienta}, te confirmo antes de reservar:\n\n` +
    `* ${servicioExistente}: $${precioExistente.toLocaleString('es-AR')}\n` +
    `* ${servicioDisplay}: $${precioNuevo.toLocaleString('es-AR')}\n\n` +
    `Total: $${precioTotal.toLocaleString('es-AR')}\n` +
    `Fecha: ${fechaDisplay}\n` +
    `A nombre de: ${nombreClienta}\n` +
    `Email: ${email}\n\n` +
    `Sena ya pagada: $${senaPagada.toLocaleString('es-AR')}\n` +
    `Sena adicional a pagar: $${senaDiferencial.toLocaleString('es-AR')}\n\n` +
    `¿Confirmo tu turno?`;

} else {
  // ── CONFIRMAR TURNO NUEVO ──
  const serviciosArray = Array.isArray(data.servicio) ? data.servicio : [data.servicio].filter(Boolean);

  // Desglose de servicios con precios individuales
  let desglose;
  if (serviciosArray.length === 1) {
    desglose = `* ${serviciosArray[0]}: $${precio.toLocaleString('es-AR')}`;
  } else {
    // Múltiples servicios — intentar desglosar si tenemos precios individuales
    // Si no hay info de precios individuales, mostrar cada servicio sin precio y el total al final
    desglose = serviciosArray.map(s => `* ${s}`).join('\n');
  }

  const fechaDisplay = esJornadaCompleta
    ? `${fechaHumana} - Jornada completa (09:00 a 19:00)`
    : `${fechaHumana} a las ${horaDeseada}`;

  mensajeParaClienta = `${nombreClienta}, te confirmo antes de reservar:\n\n` +
    `${desglose}\n\n` +
    `Total: $${precio.toLocaleString('es-AR')}\n` +
    `Fecha: ${fechaDisplay}\n` +
    `A nombre de: ${nombreClienta}\n` +
    `Email: ${email}\n\n` +
    `¿Confirmo tu turno?`;
}

console.log(`[FormatearRespuestaConfirmacion] Resumen generado para ${nombreClienta} | ${servicioDisplay} | ${fechaHumana}`);

return [{
  json: {
    success: true,
    accion: 'resumen_confirmacion',
    mensaje_para_clienta: mensajeParaClienta,
    // Pasar datos para que el PASO 3 pueda usarlos
    opciones: data.opciones || data.slots_recomendados || [],
    lead_row_id: data.lead_row_id || null,
    precio: precio,
    sena: sena,
    duracion_estimada: data.duracion_estimada || 0,
    complejidad_maxima: data.complejidad_maxima || 'media',
    agregar_a_turno_existente: esAgregarServicio,
    turno_id_existente: data.turno_id_existente || null,
    turno_precio_existente: data.turno_precio_existente || null,
    turno_hora_original: horaOriginal,
    turno_sena_pagada: data.turno_sena_pagada || null,
    turno_servicio_existente: data.turno_servicio_existente || null
  }
}];
