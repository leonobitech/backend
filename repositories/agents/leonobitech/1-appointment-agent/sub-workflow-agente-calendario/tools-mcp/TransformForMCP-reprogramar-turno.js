// ============================================================================
// TRANSFORM FOR MCP - leraysi_reprogramar_turno
// ============================================================================
// INPUT: { query: "{...}" } donde query es JSON string con los parámetros
// OUTPUT: { tool, arguments } para el MCP de Odoo
// ============================================================================

const raw = $input.first().json;

// Los parámetros vienen en el campo "query" como JSON string
const params = typeof raw.query === 'string'
  ? JSON.parse(raw.query)
  : raw.query || raw;

// Validar campos requeridos
const required = ['lead_id', 'nueva_fecha_hora', 'motivo'];
const missing = required.filter(f => !params[f]);

if (missing.length > 0) {
  throw new Error(`[leraysi_reprogramar_turno] Faltantes: ${missing.join(', ')}`);
}

// Construir arguments
const args = {
  lead_id: Number(params.lead_id),
  nueva_fecha_hora: params.nueva_fecha_hora,
  motivo: params.motivo
};

// Output para MCP
return [{
  json: {
    tool: "leraysi_reprogramar_turno",
    arguments: args
  }
}];
