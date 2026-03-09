// ============================================================================
// TRANSFORM FOR MCP - appointment_reschedule
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

// Accept both Spanish and English field names
const leadId = params.lead_id;
const newDatetime = params.new_datetime || params.nueva_fecha_hora;
const reason = params.reason || params.motivo;

// Validate required fields
const requiredCheck = { lead_id: leadId, new_datetime: newDatetime, reason: reason };
const missing = Object.entries(requiredCheck).filter(([k, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  throw new Error(`[appointment_reschedule] Missing fields: ${missing.join(', ')}`);
}

// Build arguments (English field names for Odoo MCP)
const args = {
  lead_id: Number(leadId),
  new_datetime: newDatetime,
  reason: reason
};

// Output for MCP
return [{
  json: {
    tool: "appointment_reschedule",
    arguments: args
  }
}];
