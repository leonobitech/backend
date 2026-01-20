// ============================================================================
// TRANSFORM FOR MCP - leraysi_cancelar_turno
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
  throw new Error(`[leraysi_cancelar_turno] Campo requerido faltante: turno_id`);
}

// Construir estructura para MCP
return [{
  json: {
    tool: "leraysi_cancelar_turno",
    arguments: {
      turno_id: Number(query.turno_id),
      // Opcionales
      motivo: query.motivo || undefined,
      notificar_clienta: query.notificar_clienta ?? false
    }
  }
}];
