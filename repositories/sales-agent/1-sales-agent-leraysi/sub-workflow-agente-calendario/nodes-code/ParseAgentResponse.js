// ============================================================================
// PARSE AGENT RESPONSE - Agente Calendario Leraysi
// ============================================================================
// Parsea la respuesta del agente y mapea al formato del workflow
// Compatible con el nuevo formato determinístico de la LLM
// ============================================================================

const input = $('AnalizarDisponibilidad').first().json;
const agentOutput = $input.first().json.output;

// ============================================================================
// PARSEAR JSON DE LA RESPUESTA (robusto)
// ============================================================================
function extractJSON(text) {
  // Intento directo
  try {
    return JSON.parse(text);
  } catch (e) {}

  // Limpiar markdown code blocks
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // Buscar JSON embebido
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }

  // Fallback de error
  return {
    estado: "error",
    mensaje_para_clienta: "Error procesando la solicitud de turno"
  };
}

const llmResponse = extractJSON(agentOutput);

// ============================================================================
// MAPEO DE ESTADO → ACCION (compatibilidad con nodos downstream)
// ============================================================================
const ESTADO_A_ACCION = {
  'turno_creado': 'turno_creado',
  'fecha_no_disponible': 'sin_disponibilidad',
  'turno_reprogramado': 'turno_reprogramado',
  'error': 'error'
};

const accion = ESTADO_A_ACCION[llmResponse.estado] || llmResponse.estado || 'error';

// ============================================================================
// EXTRAER DATOS SEGÚN EL CASO
// ============================================================================
let resultado = {
  // === Datos de contexto (vienen de AnalizarDisponibilidad) ===
  clienta_id: input.clienta_id,
  nombre_clienta: input.nombre_clienta,
  telefono: input.telefono,
  email: input.email || '',
  lead_row_id: input.lead_row_id,
  conversation_id: input.conversation_id || null,
  precio: input.precio,
  servicio: input.servicio,
  servicio_detalle: input.servicio_detalle || '',

  // === Decisión del agente (mapeada) ===
  accion: accion,
  mensaje_para_clienta: llmResponse.mensaje_para_clienta,
  alternativas: llmResponse.alternativas || []
};

// ============================================================================
// CASO: TURNO CREADO
// ============================================================================
if (llmResponse.estado === 'turno_creado') {
  // Extraer mp_preference_id del link_pago
  const mpPreferenceId = llmResponse.link_pago
    ? (llmResponse.link_pago.match(/pref_id=([^&\s]+)/)?.[1] || '')
    : '';

  // Extraer fecha y hora de fecha_hora (formato "YYYY-MM-DD HH:MM")
  const [fechaTurno, horaTurno] = (llmResponse.fecha_hora || '').split(' ');

  resultado = {
    ...resultado,
    // Datos del turno
    fecha_turno: fechaTurno || input.fecha_solicitada,
    hora_sugerida: horaTurno || input.hora_deseada || '09:00',

    // IDs de Odoo
    odoo_turno_id: llmResponse.turno_id,

    // MercadoPago
    mp_preference_id: mpPreferenceId,
    link_pago: llmResponse.link_pago || '',

    // Estado y montos
    estado_turno: 'pendiente_pago',
    sena_monto: llmResponse.sena || Math.round((input.precio || 0) * 0.30)
  };
}

// ============================================================================
// CASO: FECHA NO DISPONIBLE
// ============================================================================
if (llmResponse.estado === 'fecha_no_disponible') {
  resultado = {
    ...resultado,
    fecha_solicitada: llmResponse.fecha_solicitada || input.fecha_solicitada,
    motivo_no_disponible: llmResponse.motivo
  };
}

// ============================================================================
// CASO: TURNO REPROGRAMADO
// ============================================================================
if (llmResponse.estado === 'turno_reprogramado') {
  // Extraer fecha y hora nueva (formato "YYYY-MM-DD HH:MM")
  const [fechaNueva, horaNueva] = (llmResponse.fecha_hora_nueva || '').split(' ');

  resultado = {
    ...resultado,
    // Datos del turno reprogramado
    odoo_turno_id: llmResponse.turno_id,
    fecha_turno: fechaNueva,
    hora_sugerida: horaNueva || '09:00',
    fecha_hora_anterior: llmResponse.fecha_hora_anterior,
    fecha_hora_nueva: llmResponse.fecha_hora_nueva,
    calendario_actualizado: llmResponse.calendario_actualizado || false,
    motivo_reprogramacion: llmResponse.motivo || input.motivo_reprogramacion || ''
  };
}

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: resultado
}];
