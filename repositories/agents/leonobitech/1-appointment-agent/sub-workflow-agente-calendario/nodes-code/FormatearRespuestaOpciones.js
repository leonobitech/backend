// ============================================================================
// FORMAT OPTIONS RESPONSE - Calendar Agent
// ============================================================================
// INPUT: AnalizarDisponibilidad (with recommended_slots[])
// OUTPUT: Formatted response with schedule options for the client
// Used only in "check_availability" mode (LLM bypass)
// ============================================================================

const data = $input.first().json;

// ============================================================================
// DETERMINISTIC GATE: if ParseInput blocked due to missing data
// ============================================================================
if (data.gate_blocked || data.gate_bloqueado) {
  const missing = data.gate_missing_data || data.gate_datos_faltantes || ['email'];
  const name = data.client_name || data.nombre_clienta || 'Reina';

  const missingList = missing.map(d => `* Tu ${d}`).join('\n');

  console.log(`[FormatResponse] GATE: returning missing_data (${missing.join(', ')})`);

  return [{
    json: {
      success: true,
      action: 'missing_data',
      client_message: `${name}, para reservar tu turno necesito que me pases:\n\n${missingList}\n\n¿Me los compartis?`,
      options: [],
      missing_data: missing,
      lead_row_id: data.lead_row_id || null
    }
  }];
}

const slots = data.recommended_slots || data.slots_recomendados || [];
const serviceDisplay = data.service_detail || (Array.isArray(data.service) ? data.service.join(' + ') : data.service) || 'servicio';
const clientName = data.client_name || data.nombre_clienta || 'Reina';
const addToExistingBooking = (data.add_to_existing_booking ?? data.agregar_a_turno_existente) === true;
const existingTime = data.existing_time || data.turno_hora_original || null;
const isSlotUnavailable = (data.action || data.accion) === 'slot_unavailable' || (data.action || data.accion) === 'slot_no_disponible';
const requestedTime = data.requested_time || data.hora_deseada || null;
const existingComplexity = data.existing_complexity || data.turno_complejidad_existente || '';

let action;
let clientMessage;

// -- SLOT NO LONGER AVAILABLE: race condition, present alternatives with context --
if (isSlotUnavailable && slots.length > 0) {
  action = 'options_available';

  const optionsText = slots.map(s => {
    if (s.duration_min >= 600 || s.duracion_min >= 600) {
      return `* ${s.human_date || s.fecha_humana} - jornada completa (${s.start_time || s.hora_inicio} a ${s.end_time || s.hora_fin})`;
    }
    return `* ${s.human_date || s.fecha_humana} a las ${s.start_time || s.hora_inicio}`;
  }).join('\n');

  clientMessage = `${clientName}, disculpa, el horario de las ${requestedTime || '?'} ya no esta disponible. Te puedo ofrecer estas alternativas:\n\n${optionsText}\n\n¿Cual te queda mejor?`;

} else if (addToExistingBooking && existingComplexity === 'very_complex') {
  // -- ADD SERVICE TO FULL DAY: confirm directly without options --
  // Client will already be there all day — no point offering time options.
  const sameDaySlot = slots.find(s => !(s.is_alternative_date || s.es_fecha_alternativa));

  if (sameDaySlot) {
    action = 'confirm_add_service_direct';

    const existingPrice = data.existing_booking_price || data.turno_precio_existente || 0;
    const newPrice = data.price || data.precio || 0;
    const totalPrice = existingPrice + newPrice;
    const depositPaid = data.existing_booking_deposit || data.turno_sena_pagada || Math.round(existingPrice * 0.3);
    const newTotalDeposit = Math.round(totalPrice * 0.3);
    const differentialDeposit = Math.max(0, newTotalDeposit - depositPaid);
    const existingService = data.existing_service || data.turno_servicio_existente || 'servicio actual';
    const slotDate = sameDaySlot.human_date || sameDaySlot.fecha_humana || 'tu turno';

    clientMessage = `¡Genial mi vida! Voy a agregar ${serviceDisplay.toLowerCase()} a tu turno del ${slotDate} - Jornada completa.\n\n` +
      `Resumen:\n` +
      `* ${existingService}: $${existingPrice.toLocaleString('es-AR')}\n` +
      `* ${serviceDisplay}: $${newPrice.toLocaleString('es-AR')}\n` +
      `* Total: $${totalPrice.toLocaleString('es-AR')}\n\n` +
      `Sena ya pagada: $${depositPaid.toLocaleString('es-AR')}\n` +
      `Sena adicional a pagar: $${differentialDeposit.toLocaleString('es-AR')}\n\n` +
      `¿Me confirmas, reina?`;
  } else {
    // Doesn't fit same day — brief message without options
    action = 'no_availability_add_service';
    clientMessage = `${clientName}, lamentablemente no podemos agregar ${serviceDisplay.toLowerCase()} a tu turno. La agenda esta completa ese dia. ¿Queres agendarlo para otro dia por separado?`;
  }

} else if (addToExistingBooking && slots.length > 0 && (data.date_available === false || data.fecha_disponible === false) && slots.every(s => (s.service_relocated || s.servicio_reubicado) && (s.is_alternative_date || s.es_fecha_alternativa))) {
  // -- ADD SERVICE NOT AVAILABLE SAME DAY: offer clear options --
  // Case: very_complex service (full day) doesn't fit on existing booking day.
  // DON'T force reschedule — give control to the client.
  action = 'options_add_service_unavailable';

  const existingService = data.existing_service || data.turno_servicio_existente || 'servicio actual';

  // Format requested date
  const requestedDateStr = data.requested_date || data.fecha_solicitada || data.fecha_deseada || '';
  let requestedDateHuman = requestedDateStr;
  if (requestedDateStr) {
    const _days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const _months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fObj = new Date(requestedDateStr + 'T12:00:00');
    requestedDateHuman = `${_days[fObj.getDay()]} ${fObj.getDate()} de ${_months[fObj.getMonth()]}`;
  }

  // Compact alternative dates: "martes 3, miercoles 4 o jueves 5"
  const altDates = slots.map(s => {
    const parts = (s.human_date || s.fecha_humana).split(' ');
    return `${parts[0]} ${parts[1]}`;
  }).join(', ').replace(/, ([^,]+)$/, ' o $1');

  clientMessage = `${clientName}, no es posible agregar ${serviceDisplay.toLowerCase()} a tu turno del ${requestedDateHuman}\n\n` +
    `${serviceDisplay} requiere jornada completa (09:00 a 19:00) y ese dia la agenda esta llena.\n\n` +
    `¿Que preferis hacer?\n\n` +
    `1 Mantener tu ${existingService} el ${requestedDateHuman} a las ${existingTime} como esta\n` +
    `2 Reprogramar todo junto en jornada completa (${altDates})\n` +
    `3 Agendar ${serviceDisplay.toLowerCase()} por separado en otro dia\n\n` +
    `Decime y lo coordinamos`;

} else if (addToExistingBooking && slots.length > 0) {
  // -- ADD SERVICE: options with schedule change context + deposit breakdown --
  action = 'options_add_service';

  const optionsText = slots.map(s => {
    const isAdditional = s.is_additional_booking || s.es_turno_adicional;
    const humanDate = s.human_date || s.fecha_humana;
    const startTime = s.start_time || s.hora_inicio;
    const endTime = s.end_time || s.hora_fin;
    const workerName = s.worker_name || s.trabajadora;
    const isAltDate = s.is_alternative_date || s.es_fecha_alternativa;
    const durationMin = s.duration_min || s.duracion_min;

    if (isAdditional) {
      // Additional booking: another worker handles only the new service
      // Arrival time does NOT change — excellent UX
      if (!isAltDate && existingTime) {
        return `* ${humanDate} - ${workerName} hace tu ${serviceDisplay.toLowerCase()} a las ${startTime} (vos llegas a las ${existingTime} como estaba previsto)`;
      }
      return `* ${humanDate} a las ${startTime} con ${workerName}`;
    }
    if (durationMin >= 600) {
      return `* ${humanDate} - jornada completa (${startTime} a ${endTime}, tu servicio actual se acomoda dentro)`;
    }
    if (existingTime && startTime === existingTime && !isAltDate) {
      return `* ${humanDate} a las ${startTime} (tu horario actual se mantiene)`;
    }
    if (existingTime && !isAltDate) {
      return `* ${humanDate} a las ${startTime} (tu turno se moveria de ${existingTime} a ${startTime})`;
    }
    return `* ${humanDate} a las ${startTime}`;
  }).join('\n');

  // Calculate deposit breakdown for add service
  const existingPrice = data.existing_booking_price || data.turno_precio_existente || 0;
  const newPrice = data.price || data.precio || 0;
  // Additional booking: deposit only for new service. Combined block: differential deposit
  const hasAdditionalBooking = slots.some(s => s.is_additional_booking || s.es_turno_adicional);
  const totalPrice = hasAdditionalBooking ? newPrice : (existingPrice + newPrice);
  const depositPaid = hasAdditionalBooking ? 0 : (data.existing_booking_deposit || data.turno_sena_pagada || Math.round(existingPrice * 0.3));
  const newTotalDeposit = Math.round(totalPrice * 0.3);
  const differentialDeposit = Math.max(0, newTotalDeposit - depositPaid);

  const existingService = data.existing_service || data.turno_servicio_existente || 'servicio actual';

  let depositBreakdown;
  if (hasAdditionalBooking) {
    depositBreakdown = `\n\nServicio adicional:\n` +
      `* ${serviceDisplay}: $${newPrice.toLocaleString('es-AR')}\n` +
      `Sena a pagar: $${differentialDeposit.toLocaleString('es-AR')}\n` +
      `(tu turno de ${existingService} a las ${existingTime || '?'} no cambia)`;
  } else {
    depositBreakdown = `\n\nResumen del turno actualizado:\n` +
      `* ${existingService}: $${existingPrice.toLocaleString('es-AR')}\n` +
      `* ${serviceDisplay}: $${newPrice.toLocaleString('es-AR')}\n` +
      `* Total: $${(existingPrice + newPrice).toLocaleString('es-AR')}\n\n` +
      `Sena ya pagada: $${(data.existing_booking_deposit || data.turno_sena_pagada || Math.round(existingPrice * 0.3)).toLocaleString('es-AR')}\n` +
      `Sena adicional a pagar: $${differentialDeposit.toLocaleString('es-AR')}`;
  }

  clientMessage = `${clientName}, para agregar ${serviceDisplay.toLowerCase()} a tu turno, estas son las opciones:\n\n${optionsText}${depositBreakdown}\n\n¿Cual te queda mejor?`;

} else if (slots.length > 0) {
  // -- NEW BOOKING: normal options --
  action = 'options_available';

  const isFullDay = slots.some(s => (s.duration_min || s.duracion_min) >= 600);

  const optionsText = slots.map(s => {
    const humanDate = s.human_date || s.fecha_humana;
    const startTime = s.start_time || s.hora_inicio;
    const endTime = s.end_time || s.hora_fin;
    const durationMin = s.duration_min || s.duracion_min;
    const inProcess = s.in_process || s.en_proceso;

    if (inProcess) {
      return `* ${humanDate} a las ${startTime} (aprovechando tiempo de proceso)`;
    }
    if (durationMin >= 600) {
      return `* ${humanDate} - jornada completa (${startTime} a ${endTime})`;
    }
    return `* ${humanDate} a las ${startTime}`;
  }).join('\n');

  if (isFullDay) {
    clientMessage = `${clientName}, como ${serviceDisplay.toLowerCase()} es un servicio extenso, necesitamos una jornada completa. Tengo disponibles estos dias:\n\n${optionsText}\n\n¿Cual te queda mejor?`;
  } else {
    clientMessage = `${clientName}, para ${serviceDisplay.toLowerCase()} tengo estos horarios:\n\n${optionsText}\n\n¿Cual te queda mejor?`;
  }
} else {
  // -- NO AVAILABILITY --
  action = addToExistingBooking ? 'no_availability_add_service' : 'no_availability';

  const alternatives = data.alternatives || data.alternativas || [];
  if (alternatives.length > 0) {
    const altText = alternatives.map(a =>
      `* ${a.day_name || a.nombre_dia} ${a.date || a.fecha}`
    ).join('\n');
    clientMessage = addToExistingBooking
      ? `${clientName}, no es posible agregar ${serviceDisplay.toLowerCase()} a tu turno ese dia. Te puedo ofrecer estos dias:\n\n${altText}\n\n¿Cual te queda mejor?`
      : `${clientName}, no encontre horarios disponibles para ${serviceDisplay.toLowerCase()} en la fecha que pediste. Te puedo ofrecer estos dias:\n\n${altText}\n\n¿Cual te queda mejor?`;
  } else {
    clientMessage = addToExistingBooking
      ? `${clientName}, no es posible agregar ${serviceDisplay.toLowerCase()} a tu turno en los proximos dias. Ambas estilistas tienen la agenda completa.`
      : `${clientName}, no encontre horarios disponibles para ${serviceDisplay.toLowerCase()} en los proximos dias. ¿Queres que busque en otra fecha?`;
  }
}

return [{
  json: {
    success: true,
    action,
    client_message: clientMessage,
    options: action === 'confirm_add_service_direct'
      ? slots.filter(s => !(s.is_alternative_date || s.es_fecha_alternativa))
      : slots,
    lead_row_id: data.lead_row_id || null,
    // Deterministic price for Master Agent to quote correctly
    price: data.price || data.precio || 0,
    deposit: Math.round((data.price || data.precio || 0) * 0.3),
    estimated_duration: data.estimated_duration || data.duracion_estimada || 0,
    max_complexity: data.max_complexity || data.complejidad_maxima || 'medium',
    // Add service context (for Master Agent to know the flow)
    add_to_existing_booking: addToExistingBooking,
    existing_booking_id: data.existing_booking_id || data.turno_id_existente || null,
    existing_booking_price: data.existing_booking_price || data.turno_precio_existente || null,
    existing_time: existingTime,
    // Deposit breakdown (only relevant when addToExistingBooking)
    existing_booking_deposit: data.existing_booking_deposit || data.turno_sena_pagada || null,
    existing_service: data.existing_service || data.turno_servicio_existente || null
  }
}];
