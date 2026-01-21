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

// Extraer datos del tool response si existe (puede estar en .data o directamente)
const toolData = agentDecision.data || {};

// Extraer turnoId - puede venir como turno_id, turnoId, o en data.turnoId
const odooTurnoId = agentDecision.turno_id
  || agentDecision.turnoId
  || toolData.turnoId
  || null;

// Extraer link_pago - puede estar en diferentes lugares
const linkPago = agentDecision.link_pago
  || toolData.link_pago
  || '';

// Extraer mp_preference_id - puede estar en data, o parsearlo de link_pago
const mpPreferenceId = agentDecision.mp_preference_id
  || toolData.mp_preference_id
  || (linkPago.match(/pref_id=([^&\s]+)/)?.[1])
  || '';

// Extraer estado
const estadoTurno = agentDecision.estado
  || toolData.estado
  || 'pendiente_pago';

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
    hora_sugerida: agentDecision.hora_sugerida || agentDecision.hora,
    tipo_servicio: agentDecision.tipo_servicio,
    duracion_min: agentDecision.duracion_min,
    mensaje_para_clienta: agentDecision.mensaje_para_clienta,
    alternativas: agentDecision.alternativas || [],

    // Datos del turno creado en Odoo (extraídos robustamente)
    odoo_turno_id: odooTurnoId,
    mp_preference_id: mpPreferenceId,
    link_pago: linkPago,
    estado_turno: estadoTurno,

    // Seña (del agente, del tool, o calculada)
    sena_monto: agentDecision.sena || toolData.sena || Math.round((input.precio || 0) * 0.30)
  }
}];
