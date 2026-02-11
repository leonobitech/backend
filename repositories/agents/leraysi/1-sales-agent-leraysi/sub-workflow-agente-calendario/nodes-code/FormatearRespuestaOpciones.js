// ============================================================================
// FORMATEAR RESPUESTA OPCIONES - Agente Calendario Leraysi
// ============================================================================
// INPUT: AnalizarDisponibilidad (con slots_recomendados[])
// OUTPUT: Respuesta formateada con opciones de horario para la clienta
// Se usa solo en modo "consultar_disponibilidad" (bypass del LLM)
// ============================================================================

const data = $input.first().json;

// ============================================================================
// GATE DETERMINÍSTICO: si ParseInput bloqueó por datos faltantes
// ============================================================================
if (data.gate_bloqueado) {
  const faltantes = data.gate_datos_faltantes || ['email'];
  const nombre = data.nombre_clienta || 'Reina';

  const listaFaltantes = faltantes.map(d => `* Tu ${d}`).join('\n');

  console.log(`[FormatearRespuesta] 🛡️ GATE: devolviendo datos_faltantes (${faltantes.join(', ')})`);

  return [{
    json: {
      success: true,
      accion: 'datos_faltantes',
      mensaje_para_clienta: `${nombre}, para reservar tu turno necesito que me pases:\n\n${listaFaltantes}\n\n¿Me los compartís?`,
      opciones: [],
      datos_faltantes: faltantes,
      lead_row_id: data.lead_row_id || null
    }
  }];
}

const slots = data.slots_recomendados || [];
const servicioDisplay = data.servicio_detalle || (Array.isArray(data.servicio) ? data.servicio.join(' + ') : data.servicio) || 'servicio';
const nombreClienta = data.nombre_clienta || 'Reina';

let accion;
let mensajeParaClienta;

if (slots.length > 0) {
  // Hay opciones disponibles
  accion = 'opciones_disponibles';

  const esJornadaCompleta = data.jornada_completa || slots.some(s => s.jornada_completa);

  const opcionesTexto = slots.map(s => {
    if (s.jornada_completa) {
      return `* ${s.fecha_humana} - jornada completa (${s.hora} a ${s.hora_fin})`;
    }
    return `* ${s.fecha_humana} a las ${s.hora}`;
  }).join('\n');

  if (esJornadaCompleta) {
    mensajeParaClienta = `${nombreClienta}, como ${servicioDisplay.toLowerCase()} es una combinación extensa, necesitamos una jornada completa. Tengo disponibles estos días:\n\n${opcionesTexto}\n\n¿Cuál te queda mejor?`;
  } else {
    mensajeParaClienta = `${nombreClienta}, para ${servicioDisplay.toLowerCase()} tengo estos horarios:\n\n${opcionesTexto}\n\n¿Cuál te queda mejor?`;
  }
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
