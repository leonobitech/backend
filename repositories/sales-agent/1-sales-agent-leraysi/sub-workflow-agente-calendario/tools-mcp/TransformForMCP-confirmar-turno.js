// ============================================================================
// TRANSFORM FOR MCP - leraysi_confirmar_turno
// ============================================================================
// Convierte el input del Agente Calendario al formato que espera el MCP
// ============================================================================

const input = $input.first().json;

// El query puede venir como string o como objeto
const query = typeof input.query === 'string'
  ? JSON.parse(input.query)
  : input.query || input;

// Validar campo requerido
if (!query.turno_id) {
  throw new Error(`[leraysi_confirmar_turno] Campo requerido faltante: turno_id`);
}

// Construir estructura para MCP
return [{
  json: {
    tool: "leraysi_confirmar_turno",
    arguments: {
      turno_id: Number(query.turno_id),
      // Opcionales
      mp_payment_id: query.mp_payment_id || undefined,
      notas: query.notas || undefined
    }
  }
}];
