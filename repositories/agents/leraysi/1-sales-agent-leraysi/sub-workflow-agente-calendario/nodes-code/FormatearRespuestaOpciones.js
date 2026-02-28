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
const esAgregarServicio = data.agregar_a_turno_existente === true;
const horaOriginal = data.turno_hora_original || null;
const esSlotNoDisponible = data.accion === 'slot_no_disponible';
const horaDeseada = data.hora_deseada || null;

let accion;
let mensajeParaClienta;

// ── SLOT YA NO DISPONIBLE: race condition, presentar alternativas con contexto ──
if (esSlotNoDisponible && slots.length > 0) {
  accion = 'opciones_disponibles';

  const opcionesTexto = slots.map(s => {
    if (s.duracion_min >= 600) {
      return `* ${s.fecha_humana} - jornada completa (${s.hora_inicio} a ${s.hora_fin})`;
    }
    return `* ${s.fecha_humana} a las ${s.hora_inicio}`;
  }).join('\n');

  mensajeParaClienta = `${nombreClienta}, disculpa, el horario de las ${horaDeseada || '?'} ya no esta disponible. Te puedo ofrecer estas alternativas:\n\n${opcionesTexto}\n\n¿Cual te queda mejor?`;

} else if (esAgregarServicio && data.turno_complejidad_existente === 'muy_compleja') {
  // ── AGREGAR SERVICIO A JORNADA COMPLETA: confirmar directo sin opciones ──
  // La clienta ya va a estar todo el día — no tiene sentido ofrecer opciones de horario.
  const slotMismoDia = slots.find(s => !s.es_fecha_alternativa);

  if (slotMismoDia) {
    accion = 'confirmar_agregar_servicio_directo';

    const precioExistente = data.turno_precio_existente || 0;
    const precioNuevo = data.precio || 0;
    const precioTotal = precioExistente + precioNuevo;
    const senaPagada = data.turno_sena_pagada || Math.round(precioExistente * 0.3);
    const senaTotalNueva = Math.round(precioTotal * 0.3);
    const senaDiferencial = Math.max(0, senaTotalNueva - senaPagada);
    const servicioExistente = data.turno_servicio_existente || 'servicio actual';
    const fechaSlot = slotMismoDia.fecha_humana || 'tu turno';

    mensajeParaClienta = `⋆˚🧚‍♀️¡Genial mi vida! 💅 Voy a agregar ${servicioDisplay.toLowerCase()} a tu turno del ${fechaSlot} - Jornada completa.\n\n` +
      `📋 Resumen:\n` +
      `* ${servicioExistente}: $${precioExistente.toLocaleString('es-AR')}\n` +
      `* ${servicioDisplay}: $${precioNuevo.toLocaleString('es-AR')}\n` +
      `* Total: $${precioTotal.toLocaleString('es-AR')}\n\n` +
      `💰 Seña ya pagada: $${senaPagada.toLocaleString('es-AR')}\n` +
      `💰 Seña adicional a pagar: $${senaDiferencial.toLocaleString('es-AR')}\n\n` +
      `¿Me confirmas, reina? 🫶✨`;
  } else {
    // No cabe el mismo día — mensaje breve sin opciones
    accion = 'sin_disponibilidad_agregar';
    mensajeParaClienta = `${nombreClienta}, lamentablemente no podemos agregar ${servicioDisplay.toLowerCase()} a tu turno 😔 La agenda está completa ese día. ¿Querés agendarlo para otro día por separado?`;
  }

} else if (esAgregarServicio && slots.length > 0) {
  // ── AGREGAR SERVICIO: opciones con contexto de cambio horario + desglose seña ──
  accion = 'opciones_agregar_servicio';

  const opcionesTexto = slots.map(s => {
    if (s.es_turno_adicional) {
      // Turno adicional: otra trabajadora hace solo el servicio nuevo
      // La hora de llegada NO cambia — excelente UX
      if (!s.es_fecha_alternativa && horaOriginal) {
        return `* ${s.fecha_humana} - ${s.trabajadora} hace tu ${servicioDisplay.toLowerCase()} a las ${s.hora_inicio} (vos llegas a las ${horaOriginal} como estaba previsto)`;
      }
      return `* ${s.fecha_humana} a las ${s.hora_inicio} con ${s.trabajadora}`;
    }
    if (s.duracion_min >= 600) {
      return `* ${s.fecha_humana} - jornada completa (${s.hora_inicio} a ${s.hora_fin}, tu servicio actual se acomoda dentro)`;
    }
    if (horaOriginal && s.hora_inicio === horaOriginal && !s.es_fecha_alternativa) {
      return `* ${s.fecha_humana} a las ${s.hora_inicio} (tu horario actual se mantiene)`;
    }
    if (horaOriginal && !s.es_fecha_alternativa) {
      return `* ${s.fecha_humana} a las ${s.hora_inicio} (tu turno se moveria de ${horaOriginal} a ${s.hora_inicio})`;
    }
    return `* ${s.fecha_humana} a las ${s.hora_inicio}`;
  }).join('\n');

  // Calcular desglose de seña para agregar servicio
  const precioExistente = data.turno_precio_existente || 0;
  const precioNuevo = data.precio || 0;
  // Turno adicional: seña solo del servicio nuevo. Bloque combinado: seña diferencial
  const hayTurnoAdicional = slots.some(s => s.es_turno_adicional);
  const precioTotal = hayTurnoAdicional ? precioNuevo : (precioExistente + precioNuevo);
  const senaPagada = hayTurnoAdicional ? 0 : (data.turno_sena_pagada || Math.round(precioExistente * 0.3));
  const senaTotalNueva = Math.round(precioTotal * 0.3);
  const senaDiferencial = Math.max(0, senaTotalNueva - senaPagada);

  const servicioExistente = data.turno_servicio_existente || 'servicio actual';

  let desgloseSena;
  if (hayTurnoAdicional) {
    desgloseSena = `\n\n📋 Servicio adicional:\n` +
      `* ${servicioDisplay}: $${precioNuevo.toLocaleString('es-AR')}\n` +
      `💰 Seña a pagar: $${senaDiferencial.toLocaleString('es-AR')}\n` +
      `(tu turno de ${servicioExistente} a las ${horaOriginal || '?'} no cambia)`;
  } else {
    desgloseSena = `\n\n📋 Resumen del turno actualizado:\n` +
      `* ${servicioExistente}: $${precioExistente.toLocaleString('es-AR')}\n` +
      `* ${servicioDisplay}: $${precioNuevo.toLocaleString('es-AR')}\n` +
      `* Total: $${(precioExistente + precioNuevo).toLocaleString('es-AR')}\n\n` +
      `💰 Seña ya pagada: $${(data.turno_sena_pagada || Math.round(precioExistente * 0.3)).toLocaleString('es-AR')}\n` +
      `💰 Seña adicional a pagar: $${senaDiferencial.toLocaleString('es-AR')}`;
  }

  mensajeParaClienta = `${nombreClienta}, para agregar ${servicioDisplay.toLowerCase()} a tu turno, estas son las opciones:\n\n${opcionesTexto}${desgloseSena}\n\n¿Cual te queda mejor?`;

} else if (slots.length > 0) {
  // ── TURNO NUEVO: opciones normales ──
  accion = 'opciones_disponibles';

  const esJornadaCompleta = slots.some(s => s.duracion_min >= 600);

  const opcionesTexto = slots.map(s => {
    if (s.en_proceso) {
      return `* ${s.fecha_humana} a las ${s.hora_inicio} (aprovechando tiempo de proceso)`;
    }
    if (s.duracion_min >= 600) {
      return `* ${s.fecha_humana} - jornada completa (${s.hora_inicio} a ${s.hora_fin})`;
    }
    return `* ${s.fecha_humana} a las ${s.hora_inicio}`;
  }).join('\n');

  if (esJornadaCompleta) {
    mensajeParaClienta = `${nombreClienta}, como ${servicioDisplay.toLowerCase()} es un servicio extenso, necesitamos una jornada completa. Tengo disponibles estos días:\n\n${opcionesTexto}\n\n¿Cuál te queda mejor?`;
  } else {
    mensajeParaClienta = `${nombreClienta}, para ${servicioDisplay.toLowerCase()} tengo estos horarios:\n\n${opcionesTexto}\n\n¿Cuál te queda mejor?`;
  }
} else {
  // ── SIN DISPONIBILIDAD ──
  accion = esAgregarServicio ? 'sin_disponibilidad_agregar' : 'sin_disponibilidad';

  const alternativas = data.alternativas || [];
  if (alternativas.length > 0) {
    const altTexto = alternativas.map(a =>
      `* ${a.nombre_dia} ${a.fecha}`
    ).join('\n');
    mensajeParaClienta = esAgregarServicio
      ? `${nombreClienta}, no es posible agregar ${servicioDisplay.toLowerCase()} a tu turno ese dia. Te puedo ofrecer estos dias:\n\n${altTexto}\n\n¿Cual te queda mejor?`
      : `${nombreClienta}, no encontré horarios disponibles para ${servicioDisplay.toLowerCase()} en la fecha que pediste. Te puedo ofrecer estos días:\n\n${altTexto}\n\n¿Cuál te queda mejor?`;
  } else {
    mensajeParaClienta = esAgregarServicio
      ? `${nombreClienta}, no es posible agregar ${servicioDisplay.toLowerCase()} a tu turno en los proximos dias. Ambas estilistas tienen la agenda completa.`
      : `${nombreClienta}, no encontré horarios disponibles para ${servicioDisplay.toLowerCase()} en los próximos días. ¿Querés que busque en otra fecha?`;
  }
}

return [{
  json: {
    success: true,
    accion,
    mensaje_para_clienta: mensajeParaClienta,
    opciones: accion === 'confirmar_agregar_servicio_directo'
      ? slots.filter(s => !s.es_fecha_alternativa)
      : slots,
    lead_row_id: data.lead_row_id || null,
    // Precio determinístico para que Master Agent cotice correctamente
    precio: data.precio || 0,
    sena: Math.round((data.precio || 0) * 0.3),
    duracion_estimada: data.duracion_estimada || 0,
    complejidad_maxima: data.complejidad_maxima || 'media',
    // Contexto agregar servicio (para que Master Agent sepa el flujo)
    agregar_a_turno_existente: esAgregarServicio,
    turno_id_existente: data.turno_id_existente || null,
    turno_precio_existente: data.turno_precio_existente || null,
    turno_hora_original: horaOriginal,
    // Desglose seña (solo relevante cuando esAgregarServicio)
    turno_sena_pagada: data.turno_sena_pagada || null,
    turno_servicio_existente: data.turno_servicio_existente || null
  }
}];
