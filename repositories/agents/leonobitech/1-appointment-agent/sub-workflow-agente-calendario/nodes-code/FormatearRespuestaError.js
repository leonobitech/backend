// ============================================================================
// FORMAT ERROR RESPONSE - Calendar Agent
// ============================================================================
// Handles errors and returns structured response to Master Agent
// ============================================================================
// NODE: FormatearRespuestaError (Code)
// INPUT: SwitchAccion (fallback/error branch)
// OUTPUT: Structured error response for Return
// ============================================================================

const input = $input.first().json;

// ============================================================================
// BUILD ERROR MESSAGE
// ============================================================================
let errorMessage = 'Unknown error in calendar workflow';
let errorDetails = {};

// Error from Switch (unrecognized tool)
if (input.error) {
  errorMessage = input.error;
}

// Additional context
if (input.tool) {
  errorDetails.attempted_tool = input.tool;
}

if (input.tools_validas) {
  errorDetails.valid_tools = input.tools_validas;
}

// Original data for debugging
if (input.original_input) {
  errorDetails.original_input = input.original_input;
}

// ============================================================================
// OUTPUT FOR MASTER AGENT
// ============================================================================
return [{
  json: {
    success: false,
    action: 'error',
    error: errorMessage,
    details: errorDetails,
    client_message: 'Lo siento, hubo un problema procesando tu solicitud de turno. Por favor, intenta de nuevo o contacta directamente al salon.'
  }
}];
