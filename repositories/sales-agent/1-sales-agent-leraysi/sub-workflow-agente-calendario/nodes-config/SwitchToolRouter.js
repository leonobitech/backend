// ============================================================================
// SWITCH TOOL ROUTER - Agente Calendario Leraysi
// ============================================================================
// Reemplaza el nodo IF_Agendar por un Switch que rutea a las 5 herramientas MCP
//
// CONFIGURACIÓN EN n8n:
// - Tipo de nodo: Switch
// - Modo: Rules
// - Data Type: String
// - Value: {{ $json.tool }}
// ============================================================================

// Las salidas del Switch corresponden a cada herramienta MCP:
const SWITCH_OUTPUTS = {
  0: 'leraysi_crear_turno',           // Output 0: Crear turno tentativo
  1: 'leraysi_consultar_turnos_dia',  // Output 1: Consultar turnos de un día
  2: 'leraysi_consultar_disponibilidad', // Output 2: Consultar disponibilidad
  3: 'leraysi_confirmar_turno',       // Output 3: Confirmar turno (post-pago)
  4: 'leraysi_cancelar_turno',        // Output 4: Cancelar turno
  5: 'fallback'                       // Output 5: Tool no reconocida
};

// ============================================================================
// CONFIGURACIÓN DE REGLAS PARA n8n
// ============================================================================
// Copiar estas reglas al nodo Switch en n8n:
//
// Rule 0:
//   - Operation: Equal
//   - Value 1: {{ $json.tool }}
//   - Value 2: leraysi_crear_turno
//   - Output: 0
//
// Rule 1:
//   - Operation: Equal
//   - Value 1: {{ $json.tool }}
//   - Value 2: leraysi_consultar_turnos_dia
//   - Output: 1
//
// Rule 2:
//   - Operation: Equal
//   - Value 1: {{ $json.tool }}
//   - Value 2: leraysi_consultar_disponibilidad
//   - Output: 2
//
// Rule 3:
//   - Operation: Equal
//   - Value 1: {{ $json.tool }}
//   - Value 2: leraysi_confirmar_turno
//   - Output: 3
//
// Rule 4:
//   - Operation: Equal
//   - Value 1: {{ $json.tool }}
//   - Value 2: leraysi_cancelar_turno
//   - Output: 4
//
// Fallback: Output 5 (cuando ninguna regla coincide)
// ============================================================================

// Alternativamente, usar este Code node antes del Switch para normalizar:
const input = $input.first().json;

// El LLM Agente Calendario devuelve la acción/tool a ejecutar
const tool = input.tool || input.action || null;

if (!tool) {
  // Si no hay tool definida, ir a fallback
  return [{
    json: {
      tool: 'fallback',
      error: 'No se especificó herramienta a ejecutar',
      original_input: input
    }
  }];
}

// Validar que la tool sea una de las permitidas
const TOOLS_VALIDAS = [
  'leraysi_crear_turno',
  'leraysi_consultar_turnos_dia',
  'leraysi_consultar_disponibilidad',
  'leraysi_confirmar_turno',
  'leraysi_cancelar_turno'
];

if (!TOOLS_VALIDAS.includes(tool)) {
  return [{
    json: {
      tool: 'fallback',
      error: `Tool no reconocida: ${tool}`,
      tools_validas: TOOLS_VALIDAS,
      original_input: input
    }
  }];
}

// Pasar al Switch con la estructura correcta
return [{
  json: {
    tool: tool,
    arguments: input.arguments || input
  }
}];
