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
const required = ['clienta', 'telefono', 'servicio', 'fecha_hora', 'precio'];
const missing = required.filter(f => !params[f]);

if (missing.length > 0) {
  throw new Error(`[leraysi_crear_turno] Faltantes: ${missing.join(', ')}`);
}

// Construir arguments (requeridos + opcionales)
const args = {
  clienta: params.clienta,
  telefono: params.telefono,
  servicio: params.servicio,
  fecha_hora: params.fecha_hora,
  precio: Number(params.precio)
};

// Agregar opcionales si existen
if (params.email) args.email = params.email;
if (params.duracion) args.duracion = Number(params.duracion);
if (params.servicio_detalle) args.servicio_detalle = params.servicio_detalle;

// Output para MCP
return [{
  json: {
    tool: "leraysi_crear_turno",
    arguments: args
  }
}];
