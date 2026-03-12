// ============================================================================
// FORMAT CONFIRMATION RESPONSE - Calendar Agent
// ============================================================================
// INPUT: RouteDecision (with mode: "confirm", action: "confirmation_summary")
// OUTPUT: Confirmation summary for the client (without creating booking)
//
// STEP 2 of the 3-step flow:
//   STEP 1: check_availability -> options
//   STEP 2: confirm -> summary (THIS NODE) <- does NOT create anything
//   STEP 3: schedule -> booking + payment link
// ============================================================================

const data = $input.first().json;

const clientName = data.client_name || data.nombre_clienta || 'Reina';
const email = data.email || '';
const serviceDisplay = data.service_detail || (Array.isArray(data.service) ? data.service.join(' + ') : data.service) || 'servicio';
const price = data.price || data.precio || 0;
const deposit = Math.round(price * 0.3);
const addToExistingBooking = (data.add_to_existing_booking ?? data.agregar_a_turno_existente) === true;
const existingTime = data.existing_time || data.turno_hora_original || null;

// --- Human-readable date ---
const requestedDateRaw = data.requested_date || data.fecha_solicitada || data.fecha_deseada || '';
const datePart = requestedDateRaw.includes('T')
  ? requestedDateRaw.split('T')[0]
  : requestedDateRaw.split(' ')[0];
const requestedTime = data.requested_time || data.hora_deseada || '09:00';

const formatHumanDate = (dateStr) => {
  if (!dateStr) return 'fecha no especificada';
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
  const date = new Date(dateOnly + 'T12:00:00');
  if (isNaN(date.getTime())) return 'fecha invalida';
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
};

const humanDate = formatHumanDate(datePart);
const isFullDay = (data.max_complexity === 'very_complex' || data.complejidad_maxima === 'muy_compleja') ||
  (data.estimated_duration && data.estimated_duration >= 600);

// --- Build summary ---
let clientMessage;

if (addToExistingBooking) {
  // -- CONFIRM ADD SERVICE --
  const existingPrice = data.existing_booking_price || data.turno_precio_existente || 0;
  const newPrice = price;
  const totalPrice = existingPrice + newPrice;
  const depositPaid = data.existing_booking_deposit || data.turno_sena_pagada || Math.round(existingPrice * 0.3);
  const newTotalDeposit = Math.round(totalPrice * 0.3);
  const differentialDeposit = Math.max(0, newTotalDeposit - depositPaid);
  const existingService = data.existing_service || data.turno_servicio_existente || 'servicio actual';

  const dateDisplay = isFullDay
    ? `${humanDate} - Jornada completa (09:00 a 19:00)`
    : `${humanDate} a las ${requestedTime}`;

  clientMessage = `${clientName}, te confirmo antes de reservar:\n\n` +
    `* ${existingService}: $${existingPrice.toLocaleString('es-AR')}\n` +
    `* ${serviceDisplay}: $${newPrice.toLocaleString('es-AR')}\n\n` +
    `Total: $${totalPrice.toLocaleString('es-AR')}\n` +
    `Fecha: ${dateDisplay}\n` +
    `A nombre de: ${clientName}\n` +
    `Email: ${email}\n\n` +
    `Sena ya pagada: $${depositPaid.toLocaleString('es-AR')}\n` +
    `Sena adicional a pagar: $${differentialDeposit.toLocaleString('es-AR')}\n\n` +
    `¿Confirmo tu turno?`;

} else {
  // -- CONFIRM NEW BOOKING --
  const servicesArray = Array.isArray(data.service) ? data.service : [data.service].filter(Boolean);

  // Service breakdown with individual prices
  let breakdown;
  if (servicesArray.length === 1) {
    breakdown = `* ${servicesArray[0]}: $${price.toLocaleString('es-AR')}`;
  } else {
    // Multiple services — show each without individual price and total at the end
    breakdown = servicesArray.map(s => `* ${s}`).join('\n');
  }

  const dateDisplay = isFullDay
    ? `${humanDate} - Jornada completa (09:00 a 19:00)`
    : `${humanDate} a las ${requestedTime}`;

  clientMessage = `${clientName}, te confirmo antes de reservar:\n\n` +
    `${breakdown}\n\n` +
    `Total: $${price.toLocaleString('es-AR')}\n` +
    `Fecha: ${dateDisplay}\n` +
    `A nombre de: ${clientName}\n` +
    `Email: ${email}\n\n` +
    `¿Confirmo tu turno?`;
}

console.log(`[FormatConfirmationResponse] Summary generated for ${clientName} | ${serviceDisplay} | ${humanDate}`);

return [{
  json: {
    success: true,
    action: 'confirmation_summary',
    client_message: clientMessage,
    // Pass data for STEP 3 to use
    options: data.options || data.recommended_slots || data.opciones || data.slots_recomendados || [],
    lead_row_id: data.lead_row_id || null,
    price: price,
    deposit: deposit,
    estimated_duration: data.estimated_duration || data.duracion_estimada || 0,
    max_complexity: data.max_complexity || data.complejidad_maxima || 'medium',
    add_to_existing_booking: addToExistingBooking,
    existing_booking_id: data.existing_booking_id || data.turno_id_existente || null,
    existing_booking_price: data.existing_booking_price || data.turno_precio_existente || null,
    existing_time: existingTime,
    existing_booking_deposit: data.existing_booking_deposit || data.turno_sena_pagada || null,
    existing_service: data.existing_service || data.turno_servicio_existente || null
  }
}];
