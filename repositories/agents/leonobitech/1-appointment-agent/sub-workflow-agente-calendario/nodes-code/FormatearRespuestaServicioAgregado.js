// ============================================================================
// FORMAT SERVICE ADDED RESPONSE - Calendar Agent
// ============================================================================
// Builds the final response when a service is added to an existing booking.
// Branches between:
//   PATH A — ADDITIONAL BOOKING: new row created (Create Row response)
//   PATH B — SAME WORKER: existing row updated (Update Row response)
// ============================================================================
// NODE: FormatearRespuestaServicioAgregado (Code)
// INPUT: ActualizarTurnoBaserow OR CrearTurnoAdicionalBaserow (Baserow response)
// OUTPUT: Structured response for Return -> Master Agent
// ============================================================================

// ============================================================================
// WORKER CONFIGURATION (multi-tenant)
// ============================================================================
const WORKERS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
};

const WORKER_DISPLAY = {
  [WORKERS.PRIMARY]: $env.WORKER_PRIMARY_NAME || 'Estilista 1',
  [WORKERS.SECONDARY]: $env.WORKER_SECONDARY_NAME || 'Estilista 2',
};

function getWorkerDisplay(workerKey) {
  if (!workerKey) return WORKER_DISPLAY[WORKERS.PRIMARY];
  const normalized = workerKey.toLowerCase().trim();
  return WORKER_DISPLAY[normalized] || workerKey;
}

// ============================================================================
// INPUT
// ============================================================================

const baserowResponse = $input.first().json;

// Retrieve data from PrepararServicioAgregadoBaserow node
const prepData = $('PrepararServicioAgregadoBaserow').first().json;
const metaData = prepData._meta;
const definitiveData = metaData.definitive_data || {};

// The Baserow row ID (new or updated)
const bookingRowId = baserowResponse.id;
const isAdditionalBooking = prepData._operation === 'create_additional_booking';

// ============================================================================
// PATH A: ADDITIONAL BOOKING — New row created
// ============================================================================
if (isAdditionalBooking) {
  const newPrice = definitiveData.price || 0;
  const newDeposit = definitiveData.deposit_amount || Math.round(newPrice * 0.3);

  // Client-facing time: if there's a full day booking (parent or child), its time prevails
  // Client arrives at 09:00 for full day, regardless of whether it's parent or child
  const parentComplexity = metaData.existing_complexity || 'medium';
  const childComplexity = definitiveData.max_complexity || 'medium';
  const hasFullDay = parentComplexity === 'very_complex' || childComplexity === 'very_complex';

  let finalClientMessage = metaData.client_message;
  if (hasFullDay) {
    // Determine correct time: the one from the full day booking
    const fullDayTime = parentComplexity === 'very_complex'
      ? (metaData.existing_time || '09:00')
      : (definitiveData.time || '09:00');
    const incorrectTime = parentComplexity === 'very_complex'
      ? (definitiveData.time || '12:00')
      : (metaData.existing_time || '09:00');

    // Replace incorrect time in the LLM message
    if (incorrectTime !== fullDayTime && finalClientMessage.includes(incorrectTime)) {
      finalClientMessage = finalClientMessage.replace(incorrectTime, fullDayTime);
      console.log(`[FormatResponse] Time corrected: ${incorrectTime} -> ${fullDayTime} (full day)`);
    }
  }

  console.log(`[FormatResponse] PATH A: Additional booking created. ` +
    `New row: #${bookingRowId}. Parent: #${metaData.parent_booking_row_id}`);

  return [{
    json: {
      success: true,
      action: 'additional_booking_created',
      booking_id: bookingRowId,
      parent_booking_id: metaData.parent_booking_row_id,
      client_message: finalClientMessage,
      lead_row_id: metaData.lead_row_id,

      // Additional booking data (new service only)
      service_added: {
        is_additional_booking: true,
        odoo_booking_id: metaData.odoo_booking_id,
        new_service: definitiveData.service_detail,
        new_worker: getWorkerDisplay(prepData.worker),
        new_service_price: newPrice,
        deposit_to_pay: newDeposit,
        payment_link: prepData.payment_link,
        // Parent booking data (for context)
        existing_service: metaData.existing_service || '',
        existing_worker: getWorkerDisplay(metaData.existing_worker),
        existing_time: metaData.existing_time || '',
        existing_price: Number(metaData.existing_booking_price) || 0,
      }
    }
  }];
}

// ============================================================================
// PATH B: SAME WORKER — Existing row updated (original v3 logic)
// ============================================================================
const existingPrice = Number(metaData.existing_booking_price) || 0;
const depositPaid = Number(metaData.existing_booking_deposit) || 0;
const totalPrice = definitiveData.price || 0;
const newTotalDeposit = definitiveData.deposit_amount || Math.round(totalPrice * 0.3);
const differentialDeposit = Math.max(0, newTotalDeposit - depositPaid);
const existingService = metaData.existing_service || '';

return [{
  json: {
    success: true,
    action: metaData.action,
    booking_id: bookingRowId,
    client_message: metaData.client_message,
    lead_row_id: metaData.lead_row_id,

    // Service added data (combined block)
    service_added: {
      is_additional_booking: false,
      odoo_booking_id: metaData.odoo_booking_id,
      combined_services: definitiveData.service_detail,
      total_price: totalPrice,
      payment_link: prepData.payment_link,
      deposit_already_paid: depositPaid,
      additional_deposit: differentialDeposit,
      new_total_deposit: newTotalDeposit,
      existing_service: existingService,
      existing_price: existingPrice
    }
  }
}];
