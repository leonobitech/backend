// ============================================================================
// TRANSFORM FOR MCP - appointment_create
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

// Resolve required fields (accept both Spanish and English names)
const clientName = params.client_name || params.clienta;
const email = params.email;
const serviceType = params.service_type || params.servicio;
const serviceDetail = params.service_detail || params.servicio_detalle;
const scheduledDatetime = params.scheduled_datetime || params.fecha_hora;
const totalPrice = params.total_price || params.precio;
const estimatedDuration = params.estimated_duration || params.duracion_estimada || params.duracion;
const leadId = params.lead_id;

const requiredCheck = {
  client_name: clientName,
  email,
  service_type: serviceType,
  service_detail: serviceDetail,
  scheduled_datetime: scheduledDatetime,
  total_price: totalPrice,
  estimated_duration: estimatedDuration,
  lead_id: leadId
};
const missing = Object.entries(requiredCheck).filter(([k, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  throw new Error(`[appointment_create] Missing fields: ${missing.join(', ')}`);
}

// Map complexity: Spanish -> English
const COMPLEXITY_MAP = {
  'simple': 'simple',
  'media': 'medium',
  'compleja': 'complex',
  'muy_compleja': 'very_complex',
  // Already English? pass through
  'medium': 'medium',
  'complex': 'complex',
  'very_complex': 'very_complex'
};
const rawComplexity = params.max_complexity || params.complejidad_maxima || 'medium';
const maxComplexity = COMPLEXITY_MAP[rawComplexity] || 'medium';

// Map worker: accept Spanish or English
const WORKER_MAP = {
  'primary': 'primary',
  'secondary': 'secondary',
  'principal': 'primary',
  'secundaria': 'secondary'
};
const rawWorker = params.worker || params.trabajadora || 'primary';
const worker = WORKER_MAP[rawWorker] || 'primary';

// Build arguments (English field names for Odoo MCP)
const args = {
  client_name: clientName,
  email: email,
  service_type: serviceType,
  service_detail: serviceDetail,
  scheduled_datetime: scheduledDatetime,
  total_price: Number(totalPrice),
  estimated_duration: Number(estimatedDuration),
  max_complexity: maxComplexity,
  worker: worker,
  lead_id: Number(leadId)
};

// Optional fields
const phone = params.phone || params.telefono;
if (phone) args.phone = phone;

const notes = params.notes || params.notas;
if (notes) args.notes = notes;

if (params.is_additional_booking) args.is_additional_booking = true;

// Output for MCP
return [{
  json: {
    tool: "appointment_create",
    arguments: args
  }
}];
