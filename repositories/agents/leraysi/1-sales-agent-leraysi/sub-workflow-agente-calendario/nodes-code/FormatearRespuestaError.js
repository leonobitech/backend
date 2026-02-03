// ============================================================================
// FORMATEAR RESPUESTA ERROR - Agente Calendario Leraysi
// ============================================================================
// Maneja errores y devuelve respuesta estructurada al Master Agent
// ============================================================================
// NODO: FormatearRespuestaError (Code)
// INPUT: SwitchAccion (fallback/error branch)
// OUTPUT: Respuesta de error estructurada para Return
// ============================================================================

const input = $input.first().json;

// ============================================================================
// CONSTRUIR MENSAJE DE ERROR
// ============================================================================
let errorMessage = 'Error desconocido en el flujo del calendario';
let errorDetails = {};

// Error del Switch (tool no reconocida)
if (input.error) {
  errorMessage = input.error;
}

// Contexto adicional
if (input.tool) {
  errorDetails.tool_intentada = input.tool;
}

if (input.tools_validas) {
  errorDetails.tools_validas = input.tools_validas;
}

// Datos originales para debugging
if (input.original_input) {
  errorDetails.original_input = input.original_input;
}

// ============================================================================
// OUTPUT PARA MASTER AGENT
// ============================================================================
return [{
  json: {
    success: false,
    accion: 'error',
    error: errorMessage,
    detalles: errorDetails,
    mensaje_para_clienta: 'Lo siento, hubo un problema procesando tu solicitud de turno. Por favor, intenta de nuevo o contacta directamente al salón.'
  }
}];
