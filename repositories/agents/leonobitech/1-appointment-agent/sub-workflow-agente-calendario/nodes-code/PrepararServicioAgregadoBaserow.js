// ============================================================================
// PREPARE ADD SERVICE FOR BASEROW - Calendar Agent v4
// ============================================================================
// Two paths based on operation type:
//
// PATH A — ADDITIONAL BOOKING (is_additional_booking = true):
//   Different worker handles ONLY the new service → CREATE new row
//   Original booking stays INTACT (not modified)
//   New row has parent_booking_id to link them
//
// PATH B — SAME WORKER (combined block):
//   UPDATE existing row with pending fields (v3: separation of responsibilities)
//   Definitive data applied via payment webhook
// ============================================================================

const bookingFound = $input.first().json;
const data = $('ParseAgentResponse').first().json;

// Worker configuration
const WORKERS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
};
const WORKER_DISPLAY = {
  primary: $env.WORKER_PRIMARY_NAME || 'Leraysi',
  secondary: $env.WORKER_SECONDARY_NAME || 'Companera',
};
function getWorkerDisplay(worker) {
  return WORKER_DISPLAY[worker] || worker;
}

// ============================================================================
// VALIDATION
// ============================================================================
if (!bookingFound || !bookingFound.id) {
  throw new Error('[PrepararServicioAgregadoBaserow] Booking not found in Baserow. ' +
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
const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 min to pay

// ============================================================================
// PATH A: ADDITIONAL BOOKING — CREATE new row
// ============================================================================
if (data.is_additional_booking) {
  const additionalTime = data.suggested_time || '09:00';
  const priceNew = Number(data.price) || 0;
  const depositNew = Math.round(priceNew * 0.3);

  // ── PARENT RELOCATION (Case C: adding full day to short service, same worker) ──
  const relocatedParentTime = data.relocated_service_time || null;
  const parentNeedsRelocation = relocatedParentTime && data.service_relocated === true;

  // Build new row (same structure as PrepararTurnoBaserow)
  const createFields = {
    // Date and time
    date: data.booking_date
      ? data.booking_date + 'T' + additionalTime + ':00-03:00'
      : null,
    time: additionalTime,

    // Lead relationship (from parent booking)
    // Baserow link row fields come as [{id, value, ...}] → extract only IDs
    client_id: Array.isArray(bookingFound.client_id)
      ? bookingFound.client_id.map(c => typeof c === 'object' ? c.id : c)
      : [],

    // Client data (copied from parent booking)
    // Can be lookup fields (array of objects) or plain text
    client_name: Array.isArray(bookingFound.client_name)
      ? (bookingFound.client_name[0]?.value || data.client_name || '')
      : (bookingFound.client_name || data.client_name || ''),
    phone: Array.isArray(bookingFound.phone)
      ? (bookingFound.phone[0]?.value || data.phone || '')
      : (bookingFound.phone || data.phone || ''),
    email: Array.isArray(bookingFound.email)
      ? (bookingFound.email[0]?.value || data.email || '')
      : (bookingFound.email || data.email || ''),

    // Service: ONLY the new one (not combined)
    service: (data.service_detail || '').split(' + ').filter(s => s.trim()),
    service_detail: data.service_detail || '',
    max_complexity: data.max_complexity || 'medium',
    worker: data.worker || WORKERS.SECONDARY,
    duration_min: data.estimated_duration || 60,

    // Price: ONLY for the new service
    price: priceNew,
    deposit_amount: depositNew,
    deposit_paid: false,

    // State
    state: 'pending_payment',

    // MercadoPago
    mp_preference_id: data.mp_preference_id || '',
    payment_link: data.payment_link || '',
    mp_payment_id: '',

    // Timestamps
    created_at: formatBaserowDatetime(now),
    expires_at: formatBaserowDatetime(expiresAt),

    // Link to parent booking
    parent_booking_id: bookingRowId,
    // pre_relocation_time: ONLY when parent was relocated → used by FiltrarExpirados for revert
    pre_relocation_time: parentNeedsRelocation ? (data.original_parent_time || bookingFound.time || '') : '',
    // pre_relocation_date: original parent datetime before relocation → for direct revert
    pre_relocation_date: parentNeedsRelocation ? (bookingFound.date || '') : '',

    // Odoo
    odoo_booking_id: data.odoo_booking_id || null,

    // Conversation
    conversation_id: bookingFound.conversation_id || data.conversation_id || null,

    // Notes
    notes: `Additional service. Original booking: #${bookingRowId} ` +
           `(${getWorkerDisplay(typeof bookingFound.worker === 'object' ? (bookingFound.worker?.value || WORKERS.PRIMARY) : (bookingFound.worker || WORKERS.PRIMARY))} ` +
           `${bookingFound.time || '?'} ` +
           `${bookingFound.service_detail || ''}). ` +
           `Created on ${now.toLocaleDateString('es-AR')}.` +
           (parentNeedsRelocation ? ` Parent time relocated: ${bookingFound.time} → ${relocatedParentTime}.` : ''),
  };

  console.log(`[PrepararServicioAgregadoBaserow] PATH A: ADDITIONAL BOOKING. ` +
    `Parent: #${bookingRowId} (${getWorkerDisplay(bookingFound.worker)}). ` +
    `New: ${getWorkerDisplay(data.worker)} ${additionalTime} ${data.service_detail}` +
    (parentNeedsRelocation ? `. Relocate parent: ${bookingFound.time} → ${relocatedParentTime}` : ''));

  return [{
    json: {
      _operacion: 'crear_turno_adicional',
      ...createFields,

      // Metadata for FormatearRespuestaServicioAgregado
      _meta: {
        action: data.action,
        client_message: data.client_message,
        lead_row_id: data.lead_row_id,
        odoo_booking_id: data.odoo_booking_id,
        // Parent booking data (for deposit breakdown in response)
        parent_booking_row_id: bookingRowId,
        existing_booking_price: bookingFound.price || 0,
        existing_booking_deposit: bookingFound.deposit_amount || 0,
        existing_service: bookingFound.service_detail || '',
        existing_time: bookingFound.time || '',
        existing_worker: bookingFound.worker || WORKERS.PRIMARY,
        existing_complexity: bookingFound.max_complexity?.value || bookingFound.max_complexity || 'medium',
        // Parent relocation (Case C)
        relocate_parent: parentNeedsRelocation ? {
          row_id: bookingRowId,
          new_time: relocatedParentTime,
          new_date: data.booking_date
            ? data.booking_date + 'T' + relocatedParentTime + ':00-03:00'
            : null,
          original_time: data.original_parent_time || bookingFound.time || '',
        } : null,
        // Definitive data (for additional booking they're the same, no split)
        definitive_data: {
          service: data.service,
          service_detail: data.service_detail || '',
          time: additionalTime,
          duration_min: data.estimated_duration || 60,
          max_complexity: data.max_complexity || 'medium',
          price: priceNew,
          deposit_amount: depositNew,
        },
      }
    }
  }];
}

// ============================================================================
// PATH B: SAME WORKER — UPDATE existing row (v3: separation of responsibilities)
// ============================================================================
const definitiveTime = data.suggested_time || bookingFound.time || '09:00';
const definitivePrice = data.price;
const depositAmount = Math.round((definitivePrice || 0) * 0.3);

const definitiveData = {
  service: data.service,
  service_detail: data.service_detail,
  time: definitiveTime,
  duration_min: data.estimated_duration || 60,
  max_complexity: data.max_complexity || 'medium',
  price: definitivePrice,
  deposit_amount: depositAmount,
};

const updateFields = {
  deposit_paid: false,
  state: 'pending_payment',
  mp_preference_id: data.mp_preference_id || '',
  payment_link: data.payment_link || '',
  updated_at: formatBaserowDatetime(now),
  expires_at: formatBaserowDatetime(expiresAt),
  notes: `Service added on ${now.toLocaleDateString('es-AR')}. ` +
         `Services: ${data.service_detail}. ` +
         `Total: $${definitivePrice?.toLocaleString('es-AR') || 0}. ` +
         `Differential deposit: $${depositAmount.toLocaleString('es-AR')}. ` +
         `Pending payment.`
};

console.log(`[PrepararServicioAgregadoBaserow] PATH B: UPDATE same worker. ` +
  `Row: #${bookingRowId}. Services: ${data.service_detail}`);

return [{
  json: {
    _operacion: 'actualizar_turno_existente',
    row_id: bookingRowId,
    ...updateFields,
    _meta: {
      action: data.action,
      client_message: data.client_message,
      lead_row_id: data.lead_row_id,
      odoo_booking_id: data.odoo_booking_id,
      existing_booking_price: bookingFound.price || 0,
      existing_booking_deposit: bookingFound.deposit_amount || 0,
      existing_service: bookingFound.service_detail || '',
      definitive_data: definitiveData,
    }
  }
}];
