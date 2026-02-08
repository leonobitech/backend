// ============================================================================
// FORMATEAR RESPUESTA OPCIONES - Agente Calendario Leraysi
// ============================================================================
// INPUT: AnalizarDisponibilidad (con slots_recomendados[])
// OUTPUT: Respuesta formateada con opciones de horario para la clienta
// Se usa solo en modo "consultar_disponibilidad" (bypass del LLM)
// ============================================================================

const data = $input.first().json;

const slots = data.slots_recomendados || [];
const servicioDisplay = data.servicio_detalle || (Array.isArray(data.servicio) ? data.servicio.join(' + ') : data.servicio) || 'servicio';
const nombreClienta = data.nombre_clienta || 'Reina';

let accion;
let mensajeParaClienta;

if (slots.length > 0) {
  // Hay opciones disponibles
  accion = 'opciones_disponibles';

  const opcionesTexto = slots.map(s =>
    `* ${s.fecha_humana} a las ${s.hora}`
  ).join('\n');

  mensajeParaClienta = `${nombreClienta}, para ${servicioDisplay.toLowerCase()} tengo estos horarios:\n\n${opcionesTexto}\n\n¿Cuál te queda mejor?`;
} else {
  // Sin disponibilidad - ofrecer alternativas por día
  accion = 'sin_disponibilidad';

  const alternativas = data.alternativas || [];
  if (alternativas.length > 0) {
    const altTexto = alternativas.map(a =>
      `* ${a.nombre_dia} ${a.fecha}`
    ).join('\n');
    mensajeParaClienta = `${nombreClienta}, no encontré horarios disponibles para ${servicioDisplay.toLowerCase()} en la fecha que pediste. Te puedo ofrecer estos días:\n\n${altTexto}\n\n¿Cuál te queda mejor?`;
  } else {
    mensajeParaClienta = `${nombreClienta}, no encontré horarios disponibles para ${servicioDisplay.toLowerCase()} en los próximos días. ¿Querés que busque en otra fecha?`;
  }
}

return [{
  json: {
    success: true,
    accion,
    mensaje_para_clienta: mensajeParaClienta,
    opciones: slots,
    lead_row_id: data.lead_row_id || null
  }
}];
