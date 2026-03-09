// ============================================================================
// PREPARE RESCHEDULE FOR BASEROW - Calendar Agent
// ============================================================================
// Transforms data for UPDATE in Baserow Bookings table
// INPUT: BuscarTurnoBaserow (search result with row_id)
// OUTPUT: Fields ready for Baserow Update Row
// ============================================================================

const bookingFound = $input.first().json;
const data = $('ParseAgentResponse').first().json;

// ============================================================================
// VALIDATION
// ============================================================================
if (!bookingFound || !bookingFound.id) {
  throw new Error('[PrepararReprogramadoBaserow] Booking not found in Baserow. ' +
                  `odoo_booking_id searched: ${data.odoo_booking_id}`);
}

const bookingRowId = bookingFound.id;

// ============================================================================
// FORMAT DATETIME
// ============================================================================
function formatBaserowDatetime(date) {
  const argentinaTime = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  const offset = '-03:00';
  const year = argentinaTime.getUTCFullYear();
  const month = String(argentinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(argentinaTime.getUTCDate()).padStart(2, '0');
  const hours = String(argentinaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(argentinaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(argentinaTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

const now = new Date();

// ============================================================================
// FIELDS TO UPDATE IN BASEROW (English field names)
// ============================================================================
const updateFields = {
  // New date and time with Argentina timezone
  date: (() => {
    if (!data.booking_date) return null;
    const time = (data.suggested_time || '09:00').split(':').slice(0, 2).join(':');
    return `${data.booking_date}T${time}:00-03:00`;
  })(),
  time: (data.suggested_time || '09:00').split(':').slice(0, 2).join(':'),

  // Update odoo_booking_id (may be new if was pending_payment)
  odoo_booking_id: data.odoo_booking_id,

  // Update timestamp
  updated_at: formatBaserowDatetime(now),

  // Notes with history
  notes: `Booking rescheduled on ${now.toLocaleDateString('es-AR')}. ` +
         `Previous date: ${data.previous_datetime || 'N/A'}. ` +
         `Reason: ${data.reschedule_reason || 'Not specified'}`
};

// If there's a new payment_link (pending_payment case → new booking)
if (data.payment_link) {
  updateFields.payment_link = data.payment_link;
  updateFields.mp_preference_id = data.mp_preference_id || '';
}

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    row_id: bookingRowId,
    ...updateFields,

    // Metadata for FormatearRespuestaReprogramado
    _meta: {
      action: data.action,
      client_message: data.client_message,
      lead_row_id: data.lead_row_id,
      previous_datetime: data.previous_datetime,
      new_datetime: data.new_datetime,
      calendar_updated: data.calendar_updated,
      calendar_accept_url: data.calendar_accept_url || null
    }
  }
}];
