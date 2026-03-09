// ============================================================================
// FORMAT NO AVAILABILITY RESPONSE - Calendar Agent
// ============================================================================
// Formats the response when there is no availability for the requested booking
// ============================================================================
// NODE: FormatearRespuestaSinDisponibilidad (Code)
// INPUT: ParseAgentResponse via IF_Agendar (False Branch)
// OUTPUT: Formatted response for the main workflow
// ============================================================================

const data = $input.first().json;

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    success: false,
    action: data.action || 'no_availability',
    client_message: data.client_message,
    lead_row_id: data.lead_row_id,
    alternatives: data.alternatives || []
  }
}];
