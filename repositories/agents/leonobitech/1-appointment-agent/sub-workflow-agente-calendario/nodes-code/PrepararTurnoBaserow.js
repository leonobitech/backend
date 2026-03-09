// ============================================================================
// PREPARE BOOKING FOR BASEROW - Calendar Agent
// ============================================================================
// Transforms ParseAgentResponse data to Baserow Bookings table format
// ============================================================================
// NODE: PrepararTurnoBaserow (Code)
// INPUT: ParseAgentResponse via IF_Agendar (True Branch)
// OUTPUT: Fields ready for Baserow Create Row
// ============================================================================

const data = $input.first().json;

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  expiration_minutes: 15, // 15 minutes to pay the deposit
};

const now = new Date();
const expiresAt = new Date(now.getTime() + CONFIG.expiration_minutes * 60 * 1000);

// Format datetime for Baserow API: ISO 8601 with Argentina timezone
function formatBaserowDatetime(date) {
  const argentinaTime = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const offset = "-03:00";
  const year = argentinaTime.getUTCFullYear();
  const month = String(argentinaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(argentinaTime.getUTCDate()).padStart(2, "0");
  const hours = String(argentinaTime.getUTCHours()).padStart(2, "0");
  const minutes = String(argentinaTime.getUTCMinutes()).padStart(2, "0");
  const seconds = String(argentinaTime.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

// ============================================================================
// BUILD BASEROW RECORD (Bookings table - English field names)
// ============================================================================
const bookingBaserow = {
  // === Date and Time ===
  date: data.booking_date ? data.booking_date + "T" + (data.suggested_time || "09:00") + ":00-03:00" : null,
  time: data.suggested_time || "09:00",

  // === Lead Relationship ===
  client_id: data.lead_row_id ? [data.lead_row_id] : [],

  // === Client Data (denormalized) ===
  client_name: data.client_name,
  phone: data.phone,
  email: data.email || "",

  // === Service ===
  service: Array.isArray(data.service) ? data.service : [data.service],
  service_detail: data.service_detail || "",
  max_complexity: data.max_complexity || "medium",
  worker: data.worker || "primary",

  // === Price and Deposit ===
  deposit_paid: false,

  // === State ===
  state: data.booking_state || "pending_payment",

  // === Mercado Pago ===
  mp_preference_id: data.mp_preference_id || "",
  payment_link: data.payment_link || "",
  mp_payment_id: "",

  // === Timestamps ===
  created_at: formatBaserowDatetime(now),
  expires_at: formatBaserowDatetime(expiresAt),

  // === Notes ===
  notes: `Booking created via chatbot. Service: ${data.service}`,
};

// Add numeric fields only if they have value (Baserow rejects null)
bookingBaserow.duration_min = data.estimated_duration || 60;
if (data.price != null) {
  bookingBaserow.price = data.price;
}
if (data.deposit_amount != null) {
  bookingBaserow.deposit_amount = data.deposit_amount;
}
if (data.odoo_booking_id) {
  bookingBaserow.odoo_booking_id = data.odoo_booking_id;
}
if (data.conversation_id) {
  bookingBaserow.conversation_id = data.conversation_id;
}

// ============================================================================
// OUTPUT
// ============================================================================
return [
  {
    json: {
      ...bookingBaserow,

      // Preserve data for FormatearRespuestaExito
      _meta: {
        action: data.action,
        client_message: data.client_message,
        lead_row_id: data.lead_row_id,
      },
    },
  },
];
