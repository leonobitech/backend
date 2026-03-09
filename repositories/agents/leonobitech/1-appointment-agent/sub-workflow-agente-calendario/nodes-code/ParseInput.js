// ============================================================================
// PARSE INPUT - Calendar Agent
// ============================================================================
// Processes and validates input from the Master AI Agent
// COMBINES: llm_output (from LLM) + state (from Input Main)
// Calculates duration and PRICE based on service + hair length (deterministic)
// ============================================================================

const raw = $input.first().json;

// ============================================================================
// STEP 1: EXTRACT LLM_OUTPUT AND STATE
// ============================================================================
// The tool can send data in two formats:
// 1. Direct: { "llm_output": {...}, "state": {...} }
// 2. Wrapped: { "query": { "llm_output": {...}, "state": {...} } }

const data = raw.query || raw;

const llmOutput = typeof data.llm_output === 'string'
  ? JSON.parse(data.llm_output)
  : (data.llm_output || {});

const state = typeof data.state === 'string' ? JSON.parse(data.state) : (data.state || {});

// ============================================================================
// STEP 2: COMBINE LLM_OUTPUT + STATE
// ============================================================================
// llmOutput has priority (fresh data from message)
// State fills fields the LLM cannot extract

const input = {
  // === MODE AND ACTION ===
  // ParseInput only passes what the LLM sent (raw).
  // RouteDecision (post-analyzer) decides the definitive mode and action.
  mode: llmOutput.modo || llmOutput.mode || null,
  time_preference: llmOutput.preferencia_horario || llmOutput.time_preference || null,
  action: llmOutput.accion || llmOutput.action || null,

  // === FROM LLM_OUTPUT (what the LLM extracted from the message) ===
  client_name: llmOutput.full_name || llmOutput.nombre_clienta || llmOutput.client_name || state.full_name || state.nick_name,
  service: llmOutput.servicio || llmOutput.service || (
    (state.service_interest || state.servicio_interes) ? [state.service_interest || state.servicio_interes] : []
  ),
  requested_date: llmOutput.fecha_deseada || llmOutput.requested_date || llmOutput.fecha,
  // Extract time from requested_date if in ISO format (e.g.: "2026-02-11T14:00:00")
  requested_time: llmOutput.hora_deseada || llmOutput.requested_time || llmOutput.hora || (() => {
    const fecha = llmOutput.fecha_deseada || llmOutput.requested_date || llmOutput.fecha;
    if (fecha && fecha.includes('T')) {
      const timePart = fecha.split('T')[1];
      if (timePart) return timePart.substring(0, 5);
    }
    return null;
  })(),
  price: llmOutput.precio || llmOutput.price || 0,
  email: llmOutput.email || state.email || null,

  // === FROM STATE (data the LLM cannot see in the userPrompt) ===
  phone: state.phone,
  client_id: state.lead_id,
  lead_id: state.lead_id,
  lead_row_id: state.row_id,
  conversation_id: state.conversation_id,
  image_analysis: state.image_analysis || null,

  // Existing booking state (for reschedule or add service)
  // Accept both new English and old Spanish field names for backwards compat
  booking_scheduled: state.booking_scheduled ?? state.turno_agendado ?? false,
  booking_date: state.booking_date ?? state.turno_fecha ?? null,

  // For adding service to existing booking
  add_to_existing_booking: state.add_to_existing_booking || state.agregar_a_turno_existente
    || llmOutput.add_to_existing_booking || llmOutput.agregar_a_turno_existente
    || llmOutput.accion === 'agregar_a_turno_existente' || llmOutput.action === 'add_to_existing_booking'
    || llmOutput.modo === 'agregar_servicio' || llmOutput.mode === 'add_service'
    || false,
  // existing_booking_id: prioritize state (numeric), validate LLM sends numeric
  existing_booking_id: state.odoo_booking_id || state.odoo_turno_id
    || state.existing_booking_id || state.turno_id_existente || (() => {
    const llmId = llmOutput.turno_id_existente || llmOutput.existing_booking_id;
    if (llmId && !isNaN(Number(llmId))) return llmId;
    return null;
  })(),
  existing_booking_price: state.existing_booking_price || state.turno_precio_existente
    || llmOutput.turno_precio_existente || llmOutput.existing_booking_price || 0,

  // Hair length (only for hair services, null for manicure/pedicure/etc)
  hair_length_raw: state.image_analysis?.length || null
};

// ============================================================================
// SERVICE CONFIGURATION AND DURATIONS
// ============================================================================
// The 15 official services from Baserow (table 856 - ServiciosLeraysi)
//
// complexity: FIXED per service (determines daily salon capacity)
//   - very_complex: max 2/day
//   - complex: max 3/day
//   - medium: max 4/day
//   - simple: max 5/day
//
// requires_length: true = hair service (length affects duration)
//                  false = non-hair service (nails, waxing)
//
const SERVICIOS_CONFIG = {
  // === HAIRCUT (1 service) ===
  'Corte mujer': { base_min: 60, complexity: 'medium', requires_length: true, base_price: 8000 },

  // === STRAIGHTENING (2 services) — very_complex with 3 phases ===
  'Alisado brasileño': { base_min: 600, complexity: 'very_complex', requires_length: true, base_price: 45000, active_start: 180, process_time: 300, active_end: 120 },
  'Alisado keratina':  { base_min: 600, complexity: 'very_complex', requires_length: true, base_price: 55000, active_start: 180, process_time: 300, active_end: 120 },

  // === COLOR (4 services) — very_complex with 3 phases (except root touch-up) ===
  'Mechas completas':  { base_min: 600, complexity: 'very_complex', requires_length: true, base_price: 35000, active_start: 180, process_time: 300, active_end: 120 },
  'Tintura raíz': { base_min: 60, complexity: 'complex', requires_length: true, base_price: 15000 },
  'Tintura completa':  { base_min: 600, complexity: 'very_complex', requires_length: true, base_price: 25000, active_start: 180, process_time: 300, active_end: 120 },
  'Balayage':          { base_min: 600, complexity: 'very_complex', requires_length: true, base_price: 50000, active_start: 180, process_time: 300, active_end: 120 },

  // === NAILS (3 services) ===
  'Manicura simple': { base_min: 120, complexity: 'medium', requires_length: false, base_price: 5000 },
  'Manicura semipermanente': { base_min: 180, complexity: 'complex', requires_length: false, base_price: 8000 },
  'Pedicura': { base_min: 120, complexity: 'medium', requires_length: false, base_price: 6000 },

  // === WAXING/LASER (5 services) ===
  'Depilación cera piernas': { base_min: 120, complexity: 'medium', requires_length: false, base_price: 10000 },
  'Depilación cera axilas': { base_min: 60, complexity: 'simple', requires_length: false, base_price: 4000 },
  'Depilación cera bikini': { base_min: 60, complexity: 'simple', requires_length: false, base_price: 6000 },
  'Depilación láser piernas': { base_min: 120, complexity: 'medium', requires_length: false, base_price: 25000 },
  'Depilación láser axilas': { base_min: 60, complexity: 'simple', requires_length: false, base_price: 12000 }
};

// Extra duration (additive) based on hair length
// Only applies to services with requires_length: true
const DURATION_EXTRA_LENGTH = {
  'corto': 0,
  'medio': 60,
  'largo': 120,
  'muy_largo': 120
};

// Hair length → complexity mapping for hair services (max: complex)
// very_complex is EXCLUSIVE to the 5 chemical treatments (always, regardless of length)
const COMPLEXITY_BY_LENGTH = {
  'corto': 'medium',
  'medio': 'complex',
  'largo': 'complex',
  'muy_largo': 'complex'
};

// Price multiplier based on hair length
// Only applies to services with requires_length: true
// short = base price, medium = +10%, long = +20%
const PRICE_MULTIPLIER_LENGTH = {
  'corto': 1.0,
  'medio': 1.1,
  'largo': 1.2,
  'muy_largo': 1.2
};

// ============================================================================
// HELPER: Check if any service requires hair length
// ============================================================================
function anyServiceRequiresLength(services) {
  return services.some(srv => {
    const config = SERVICIOS_CONFIG[srv];
    return config ? config.requires_length !== false : true;
  });
}

// ============================================================================
// REQUIRED FIELDS VALIDATION
// ============================================================================
// In query mode only service and date are needed (no client data/price yet)
const isQueryMode = input.mode === 'consultar_disponibilidad' || input.mode === 'check_availability';
const requiredFields = isQueryMode
  ? ['service', 'requested_date']
  : ['client_id', 'client_name', 'service', 'requested_date'];

const fieldValues = {
  service: input.service,
  requested_date: input.requested_date,
  client_id: input.client_id,
  client_name: input.client_name
};
const missingFields = requiredFields.filter(field => !fieldValues[field]);

if (missingFields.length > 0) {
  throw new Error(`[ParseInput] Missing required fields: ${missingFields.join(', ')}`);
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

const client_id = input.client_id;
const client_name = input.client_name;
const phone = input.phone;
const email = input.email || null;

let service = Array.isArray(input.service) ? input.service : [input.service];
const requested_date = input.requested_date;
const requested_time = input.requested_time || null;
const price = Number(input.price) || 0;

const lead_row_id = input.lead_row_id || input.row_id;
const conversation_id = input.conversation_id || null;

const image_analysis = input.image_analysis || null;

// Hair length: only applies if a service requires it
// For Manicure, Pedicure, Waxing → hair_length = null
// No image → null (fallback to SERVICIOS_CONFIG defaults)
const serviceArray = Array.isArray(input.service) ? input.service : [input.service];
const needsLength = anyServiceRequiresLength(serviceArray);
const hair_length = needsLength
  ? (image_analysis?.length || input.hair_length_raw || null)
  : null;

// ============================================================================
// ESTIMATED DURATION CALCULATION
// ============================================================================
function calculateDuration(services, length) {
  let totalDuration = 0;

  for (const srv of services) {
    const config = SERVICIOS_CONFIG[srv];
    if (config) {
      let serviceDuration = config.base_min;
      // Only add extra time if service requires length AND length data exists
      // Does NOT apply to very_complex (base_min 600 is already total: 3h+5h+2h)
      if (config.requires_length && length && config.complexity !== 'very_complex') {
        serviceDuration += (DURATION_EXTRA_LENGTH[length] || 0);
      }
      totalDuration += serviceDuration;
    } else {
      totalDuration += 60; // Unknown service fallback
    }
  }

  // Round to multiples of 15 minutes
  return Math.ceil(totalDuration / 15) * 15;
}

// Determine the highest complexity among requested services
// Factor 1: individual service complexity (hair: via COMPLEXITY_BY_LENGTH, others: fixed)
// Factor 2: service count (2 = min complex, 3+ = min very_complex)
// Result: MAX(highest_individual, floor_by_count)
function getMaxComplexity(services, length) {
  const COMP_ORDER = { simple: 1, medium: 2, complex: 3, very_complex: 4 };
  const ORDER_TO_COMP = { 1: 'simple', 2: 'medium', 3: 'complex', 4: 'very_complex' };

  const complexities = services.map(srv => {
    const config = SERVICIOS_CONFIG[srv];
    if (!config) return 'medium';
    if (config.requires_length && length && config.complexity !== 'very_complex') {
      return COMPLEXITY_BY_LENGTH[length] || config.complexity;
    }
    return config.complexity;
  });

  let maxIndividual = 'simple';
  if (complexities.includes('very_complex')) maxIndividual = 'very_complex';
  else if (complexities.includes('complex')) maxIndividual = 'complex';
  else if (complexities.includes('medium')) maxIndividual = 'medium';

  let floorByCount = 'simple';
  if (services.length >= 3) floorByCount = 'very_complex';
  else if (services.length >= 2) floorByCount = 'complex';

  const finalOrder = Math.max(COMP_ORDER[maxIndividual] || 2, COMP_ORDER[floorByCount] || 1);
  return ORDER_TO_COMP[finalOrder] || maxIndividual;
}

// ============================================================================
// DETERMINISTIC PRICE CALCULATION
// ============================================================================
function calculatePrice(services, length) {
  let totalPrice = 0;
  for (const srv of services) {
    const config = SERVICIOS_CONFIG[srv];
    if (config && config.base_price != null) {
      let servicePrice = config.base_price;
      if (config.requires_length && length) {
        servicePrice = Math.round(config.base_price * (PRICE_MULTIPLIER_LENGTH[length] || 1.0));
      }
      totalPrice += servicePrice;
    } else {
      console.log(`[ParseInput] ⚠️ Service "${srv}" not found in config, price not calculable`);
      return null;
    }
  }
  return totalPrice;
}

// ============================================================================
// DEFENSE: Filter existing service when adding to existing booking
// ============================================================================
// If the LLM accidentally sends the existing service along with the new one,
// duration doubles in AnalizarDisponibilidad.
// Solution: filter services matching service_interest from state.
if (input.add_to_existing_booking && service.length > 1) {
  const existingService = (state.service_interest || state.servicio_interes || '').toLowerCase().trim();
  if (existingService) {
    const filteredServices = service.filter(
      s => s.toLowerCase().trim() !== existingService
    );
    if (filteredServices.length > 0 && filteredServices.length < service.length) {
      console.log(`[ParseInput] 🛡️ DEFENSE add_service: filtered "${existingService}" from array. ` +
                  `Original: [${service.join(', ')}] → Filtered: [${filteredServices.join(', ')}]`);
      service.length = 0;
      filteredServices.forEach(s => service.push(s));
    }
  }
}

const estimated_duration = calculateDuration(service, hair_length);
const max_complexity = getMaxComplexity(service, hair_length);
const service_detail = service.join(' + ');

// Deterministic price: override LLM price
const calculated_price = calculatePrice(service, hair_length);
const finalPrice = calculated_price !== null ? calculated_price : price;
if (calculated_price !== null && price > 0 && calculated_price !== price) {
  console.log(`[ParseInput] 🔧 Price corrected: LLM=$${price}, deterministic=$${calculated_price}`);
}

// ============================================================================
// DETERMINISTIC GATE: required data for new booking
// ============================================================================
// If new booking and missing email or full_name → block flow.
// Forces mode "check_availability" so SwitchModo routes to
// FormatearRespuestaOpciones, which detects gate_blocked and returns
// "missing_data" to the Master Agent.

const isNewBooking = !input.booking_scheduled && !input.add_to_existing_booking;
const hasFullName = !!(llmOutput.full_name || state.full_name);
const hasEmail = !!email;
const hasPhone = !!phone;
const isTelegram = (state.channel || '').toLowerCase() === 'telegram';

let gate_blocked = false;
const gate_missing_data = [];

if (isNewBooking) {
  if (!hasFullName) gate_missing_data.push('nombre completo');
  if (!hasEmail) gate_missing_data.push('email');
  if (isTelegram && !hasPhone) gate_missing_data.push('teléfono');
  gate_blocked = gate_missing_data.length > 0;
}

if (gate_blocked) {
  console.log(`[ParseInput] 🛡️ GATE BLOCKED: missing ${gate_missing_data.join(', ')}`);
}

// ============================================================================
// EXTRACT PHASES FOR VERY_COMPLEX SERVICES (if applicable)
// ============================================================================
let active_start = null;
let process_time = null;
let active_end = null;

const serviceWithPhases = service.find(srv => {
  const config = SERVICIOS_CONFIG[srv];
  return config && config.active_start != null;
});
if (serviceWithPhases) {
  const config = SERVICIOS_CONFIG[serviceWithPhases];
  active_start = config.active_start;
  process_time = config.process_time;
  active_end = config.active_end;
}

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Client data
    client_id,
    client_name,
    phone,
    email,

    // Service
    service,
    service_detail,
    requested_date,
    requested_time,
    price: finalPrice,
    estimated_duration,
    max_complexity,

    // Phases for very_complex services (3 phases: active_start, process_time, active_end)
    active_start,
    process_time,
    active_end,

    // Image analysis
    image_analysis,
    hair_length,

    // Context IDs
    lead_id: input.lead_id,
    lead_row_id,
    conversation_id,

    // Existing booking state (for reschedule)
    booking_scheduled: input.booking_scheduled,
    booking_date: input.booking_date,

    // For adding service to existing booking
    add_to_existing_booking: input.add_to_existing_booking,
    existing_booking_id: input.existing_booking_id,
    existing_booking_price: input.existing_booking_price,

    // Operation mode (raw from LLM, RouteDecision decides the definitive one)
    mode: input.mode,
    time_preference: input.time_preference,
    action: input.action,

    // Deterministic GATE
    gate_blocked,
    gate_missing_data,

    // Metadata
    received_at: new Date().toISOString()
  }
}];
