// ============================================================================
// FORMAT SUCCESS RESPONSE - Calendar Agent
// ============================================================================
// Builds the final success response to return to Master Agent
// ============================================================================
// NODE: FormatearRespuestaExito (Code)
// INPUT: CrearTurnoBaserow (Baserow response with created row ID)
// OUTPUT: Structured response for Return
// ============================================================================

const baserowResponse = $input.first().json;

// Retrieve metadata from previous node (PrepararTurnoBaserow)
const metaData = $('PrepararTurnoBaserow').first().json._meta;

// The booking row ID created in Baserow
const bookingRowId = baserowResponse.id;

// ============================================================================
// OUTPUT FOR MASTER AGENT
// ============================================================================
return [{
  json: {
    success: true,
    action: metaData.action,
    booking_id: bookingRowId,
    client_message: metaData.client_message,
    lead_row_id: metaData.lead_row_id
  }
}];
