// ============================================================================
// FORMAT RESCHEDULE RESPONSE - Calendar Agent
// ============================================================================
// Builds the final response for a rescheduled booking with structured message
// ============================================================================
// NODE: FormatearRespuestaReprogramado (Code)
// INPUT: ActualizarTurnoBaserow (Baserow Update response)
// OUTPUT: Structured response with content_whatsapp_formatted for Master Agent
// ============================================================================

const baserowResponse = $input.first().json;

// Retrieve metadata from previous node (PrepararReprogramadoBaserow)
const metaData = $('PrepararReprogramadoBaserow').first().json._meta;
const prepData = $('PrepararReprogramadoBaserow').first().json;

// The updated booking row ID in Baserow
const bookingRowId = baserowResponse.id;

// Detect if pre-payment (has new payment link)
const isPrePayment = !!(prepData.payment_link);

// ============================================================================
// HELPERS
// ============================================================================

function formatReadableDate(dateStr) {
  if (!dateStr) return { readable: 'date to be confirmed', dayName: '', time: '09:00' };
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  // Parse "2026-02-27 09:00" or "2026-02-27 09:00:00"
  const date = new Date(dateStr.replace(' ', 'T'));
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dayName = days[date.getDay()];
  const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const time = dateStr.split(' ')[1]?.slice(0, 5) || '09:00';
  return { readable: `${day}/${month}/${year}`, dayName: dayNameCap, time };
}

function formatAmount(amount) {
  return (amount || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// ============================================================================
// EXTRACT BOOKING DATA FROM BASEROW (English field names)
// ============================================================================

const services = (baserowResponse.service || []).map(s => s.value).join(' y ');
const price = parseFloat(baserowResponse.price) || 0;
const depositPaid = baserowResponse.deposit_paid === true || baserowResponse.deposit_paid === 'true';
const depositAmount = parseFloat(baserowResponse.deposit_amount) || 0;

const previous = formatReadableDate(metaData.previous_datetime);
const newDate = formatReadableDate(metaData.new_datetime);

// ============================================================================
// BUILD STRUCTURED WHATSAPP MESSAGE
// ============================================================================

let formattedMessage = `Tu turno fue reprogramado!

  Cambio de Fecha

*Anterior:* ${previous.dayName} ${previous.readable} ${previous.time} hs
*Nueva:* ${newDate.dayName} ${newDate.readable} ${newDate.time} hs

  Detalles del Turno

*Servicio:* ${services}
*Precio:* $${formatAmount(price)}`;

if (depositPaid) {
  formattedMessage += `\n*Tu sena sigue vigente*`;
}

formattedMessage += `\n*Direccion:* Yerbal 513, CABA`;

// PATH A (pre-payment): include payment link
if (isPrePayment && prepData.payment_link) {
  formattedMessage += `

*Sena:* $${formatAmount(depositAmount)}
*Link de pago:*
${prepData.payment_link}`;
}

// Calendar confirmation link (post-payment, calendar updated)
const calendarAcceptUrl = metaData.calendar_accept_url || null;
if (!isPrePayment && calendarAcceptUrl) {
  formattedMessage += `

*Confirma tu asistencia:*
${calendarAcceptUrl}`;
}

// ============================================================================
// OUTPUT FOR MASTER AGENT
// ============================================================================
const response = {
  success: true,
  action: metaData.action,
  booking_id: bookingRowId,
  lead_row_id: metaData.lead_row_id,

  // Formatted message with cards (Master Agent must use as-is as content_whatsapp)
  content_whatsapp_formatted: formattedMessage,

  // Booking data (for Master Agent reference)
  booking: {
    service: services,
    price,
    deposit_paid: depositPaid,
    previous_date: `${previous.dayName} ${previous.readable} ${previous.time}`,
    new_date: `${newDate.dayName} ${newDate.readable} ${newDate.time}`,
  },

  // Reschedule-specific data
  reschedule: {
    previous_datetime: metaData.previous_datetime,
    new_datetime: metaData.new_datetime,
    calendar_updated: metaData.calendar_updated
  }
};

// PATH A (pre-payment): include new payment link
if (isPrePayment) {
  response.payment_link = prepData.payment_link;
  response.mp_preference_id = prepData.mp_preference_id;
  response.deposit_amount = baserowResponse.deposit_amount;
  response.price = baserowResponse.price;
}

return [{ json: response }];
