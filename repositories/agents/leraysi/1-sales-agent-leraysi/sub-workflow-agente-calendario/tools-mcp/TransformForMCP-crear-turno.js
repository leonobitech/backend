// ============================================================================
// TRANSFORM FOR MCP - leraysi_crear_turno
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
const required = [
  'clienta',
  'telefono',
  'email',
  'servicio',
  'servicio_detalle',
  'fecha_hora',
  'precio',
  'duracion',
  'lead_id'
];
const missing = required.filter(f => !params[f]);

if (missing.length > 0) {
  throw new Error(`[leraysi_crear_turno] Faltantes: ${missing.join(', ')}`);
}

// Construir arguments (todos requeridos)
const args = {
  clienta: params.clienta,
  telefono: params.telefono,
  email: params.email,
  servicio: params.servicio,
  servicio_detalle: params.servicio_detalle,
  fecha_hora: params.fecha_hora,
  precio: Number(params.precio),
  duracion: Number(params.duracion),
  lead_id: Number(params.lead_id)
};

// Campo opcional
if (params.notas) args.notas = params.notas;

// Output para MCP
return [{
  json: {
    tool: "leraysi_crear_turno",
    arguments: args
  }
}];
