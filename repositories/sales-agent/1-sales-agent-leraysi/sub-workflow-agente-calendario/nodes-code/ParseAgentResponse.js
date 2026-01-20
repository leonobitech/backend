// ============================================================================
// PARSE AGENT RESPONSE - Agente Calendario Leraysi
// ============================================================================

const input = $('AnalizarDisponibilidad').first().json;
const agentOutput = $input.first().json.output;

// Parsear JSON de la respuesta del agente (robusto)
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {}

  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }

  return { accion: "error", mensaje_para_clienta: "Error procesando la solicitud de turno" };
}

const agentDecision = extractJSON(agentOutput);

// Combinar input original con decisión del agente
return [{
  json: {
    // Datos de la clienta
    clienta_id: input.clienta_id,
    nombre_clienta: input.nombre_clienta,
    telefono: input.telefono,
    email: input.email || '',
    lead_row_id: input.lead_row_id,
    conversation_id: input.conversation_id || null,
    precio: input.precio,
    servicio: input.servicio,
    servicio_detalle: input.servicio_detalle || '',

    // Decisión del agente
    accion: agentDecision.accion,
    fecha_turno: agentDecision.fecha_turno,
    hora_sugerida: agentDecision.hora_sugerida,
    tipo_servicio: agentDecision.tipo_servicio,
    duracion_min: agentDecision.duracion_min,
    mensaje_para_clienta: agentDecision.mensaje_para_clienta,
    alternativas: agentDecision.alternativas || [],

    // Para calcular seña
    sena_monto: Math.round((input.precio || 0) * 0.30)
  }
}];
