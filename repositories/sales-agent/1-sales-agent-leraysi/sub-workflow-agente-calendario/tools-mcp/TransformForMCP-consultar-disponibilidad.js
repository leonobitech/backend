// ============================================================================
// TRANSFORM FOR MCP - leraysi_consultar_disponibilidad
// ============================================================================
// Convierte el input del Agente Calendario al formato que espera el MCP
// ============================================================================

const input = $input.first().json;

// El query puede venir como string o como objeto
const query = typeof input.query === 'string'
  ? JSON.parse(input.query)
  : input.query || input;

// Validar campo requerido
if (!query.fecha) {
  throw new Error(`[leraysi_consultar_disponibilidad] Campo requerido faltante: fecha`);
}

// Construir estructura para MCP
return [{
  json: {
    tool: "leraysi_consultar_disponibilidad",
    arguments: {
      fecha: query.fecha,
      // Opcional
      duracion: query.duracion ? Number(query.duracion) : undefined
    }
  }
}];
