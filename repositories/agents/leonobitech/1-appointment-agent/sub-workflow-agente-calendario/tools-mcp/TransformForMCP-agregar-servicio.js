// ============================================================================
// TRANSFORM FOR MCP - appointment_add_service
// ============================================================================
// INPUT: { query: "{...}" } where query is a JSON string with parameters
// OUTPUT: { tool, arguments } for the Odoo MCP
// ============================================================================
// BRIDGE: Spanish field names (from code nodes) -> English (Odoo MCP schema)
// ============================================================================

const raw = $input.first().json;

// Parameters come in the "query" field as a JSON string
const params = typeof raw.query === 'string'
  ? JSON.parse(raw.query)
  : raw.query || raw;

// Normalize: accept both duracion_estimada and nueva_duracion
const estimatedDuration = params.estimated_duration || params.duracion_estimada || params.nueva_duracion;

// Accept both Spanish and English field names
const bookingId = params.booking_id || params.turno_id;
const newService = params.new_service || params.nuevo_servicio;
const newServiceDetail = params.new_service_detail || params.nuevo_servicio_detalle;
const newPrice = params.new_price || params.nuevo_precio;
const rawComplexity = params.max_complexity || params.complejidad_maxima;

// Validate required fields
const requiredCheck = {
  booking_id: bookingId,
  new_service: newService,
  new_service_detail: newServiceDetail,
  new_price: newPrice,
  estimated_duration: estimatedDuration,
  max_complexity: rawComplexity
};
const missing = Object.entries(requiredCheck).filter(([k, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  throw new Error(`[appointment_add_service] Missing fields: ${missing.join(', ')}`);
}

// Map complexity: Spanish -> English
const COMPLEXITY_MAP = {
  'simple': 'simple',
  'media': 'medium',
  'compleja': 'complex',
  'muy_compleja': 'very_complex',
  'medium': 'medium',
  'complex': 'complex',
  'very_complex': 'very_complex'
};
const maxComplexity = COMPLEXITY_MAP[rawComplexity] || 'medium';

// Build arguments (English field names for Odoo MCP)
const args = {
  booking_id: Number(bookingId),
  new_service: newService,
  new_service_detail: newServiceDetail,
  new_price: Number(newPrice),
  estimated_duration: Number(estimatedDuration),
  max_complexity: maxComplexity
};

// Optional: new_time (for full-day scheduling, e.g. "09:00")
const newTime = params.new_time || params.nueva_hora;
if (newTime) {
  args.new_time = newTime;
}

// Output for MCP
return [{
  json: {
    tool: "appointment_add_service",
    arguments: args
  }
}];
