// ============================================================================
// TRANSFORM FOR MCP - leraysi_agregar_servicio_turno
// ============================================================================
// INPUT: { query: "{...}" } donde query es JSON string con los parámetros
// OUTPUT: { tool, arguments } para el MCP de Odoo
// ============================================================================

const raw = $input.first().json;

// Los parámetros vienen en el campo "query" como JSON string
const params = typeof raw.query === 'string'
  ? JSON.parse(raw.query)
  : raw.query || raw;

// Normalizar: aceptar tanto duracion_estimada como nueva_duracion
if (!params.duracion_estimada && params.nueva_duracion) {
  params.duracion_estimada = params.nueva_duracion;
}

// Validar campos requeridos
const required = ['turno_id', 'nuevo_servicio', 'nuevo_servicio_detalle', 'nuevo_precio', 'duracion_estimada', 'complejidad_maxima'];
const missing = required.filter(f => !params[f]);

if (missing.length > 0) {
  throw new Error(`[leraysi_agregar_servicio_turno] Faltantes: ${missing.join(', ')}`);
}

// Construir arguments
const args = {
  turno_id: Number(params.turno_id),
  nuevo_servicio: params.nuevo_servicio,
  nuevo_servicio_detalle: params.nuevo_servicio_detalle,
  nuevo_precio: Number(params.nuevo_precio),
  duracion_estimada: Number(params.duracion_estimada),
  complejidad_maxima: params.complejidad_maxima
};

// Campo opcional: nueva_hora (para jornada completa, ej: "09:00")
if (params.nueva_hora) {
  args.nueva_hora = params.nueva_hora;
}

// Output para MCP
return [{
  json: {
    tool: "leraysi_agregar_servicio_turno",
    arguments: args
  }
}];
