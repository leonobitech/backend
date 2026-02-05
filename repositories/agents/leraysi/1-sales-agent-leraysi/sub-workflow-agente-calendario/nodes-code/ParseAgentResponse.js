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
  'servicio_agregado': 'servicio_agregado',
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
  complejidad_maxima: input.complejidad_maxima || 'media',

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

  // Extraer mp_preference_id si hay nuevo link_pago (caso pendiente_pago reprogramado)
  const mpPreferenceId = llmResponse.link_pago
    ? (llmResponse.link_pago.match(/pref_id=([^&\s]+)/)?.[1] || '')
    : '';

  resultado = {
    ...resultado,
    // Datos del turno reprogramado
    // odoo_turno_id viene directamente del LLM (ya calculado según turno_id_nuevo o turno_id_anterior)
    odoo_turno_id: llmResponse.odoo_turno_id,
    turno_id_anterior: llmResponse.turno_id_anterior,
    turno_id_nuevo: llmResponse.turno_id_nuevo,
    fecha_turno: fechaNueva,
    hora_sugerida: horaNueva || '09:00',
    fecha_hora_anterior: llmResponse.fecha_hora_anterior,
    fecha_hora_nueva: llmResponse.fecha_hora_nueva,
    // Para caso pendiente_pago reprogramado (nuevo link de pago)
    mp_preference_id: mpPreferenceId,
    link_pago: llmResponse.link_pago || null,
    // Flags
    calendario_actualizado: true, // Si llegamos aquí, el MCP ya actualizó calendario
    motivo_reprogramacion: llmResponse.motivo || 'Solicitud de la clienta'
  };
}

// ============================================================================
// CASO: SERVICIO AGREGADO A TURNO EXISTENTE
// ============================================================================
// Estructura IGUAL a turno_creado para simplificar mapeo Baserow
// ============================================================================
if (llmResponse.estado === 'servicio_agregado') {
  // Extraer fecha y hora (formato "YYYY-MM-DD HH:MM")
  const [fechaTurno, horaTurno] = (llmResponse.fecha_hora || '').split(' ');

  // Extraer mp_preference_id del link_pago
  const mpPreferenceId = llmResponse.link_pago
    ? (llmResponse.link_pago.match(/pref_id=([^&\s]+)/)?.[1] || '')
    : '';

  // Construir array de servicios para campo multi-select de Baserow
  // El servicio existente viene de input.turno_servicio_existente
  // El nuevo servicio viene de input.servicio (puede ser array o string)
  const servicioExistente = input.turno_servicio_existente || '';

  // FIX: input.servicio puede ser array o string
  // Encontrar el servicio NUEVO (el que no está en el turno existente)
  const serviciosInputArray = Array.isArray(input.servicio) ? input.servicio : [input.servicio];
  const servicioExistenteNorm = servicioExistente.toLowerCase().trim();
  const servicioNuevoRaw = serviciosInputArray.find(s =>
    s && s.toLowerCase().trim() !== servicioExistenteNorm
  ) || serviciosInputArray[serviciosInputArray.length - 1] || '';

  // Capitalizar si es necesario
  const servicioNuevo = servicioNuevoRaw
    ? servicioNuevoRaw.charAt(0).toUpperCase() + servicioNuevoRaw.slice(1).replace(/_/g, ' ')
    : '';

  // Crear array con servicios (sin duplicados)
  const serviciosArray = [];
  if (servicioExistente) serviciosArray.push(servicioExistente);
  if (servicioNuevo && servicioNuevo.toLowerCase() !== servicioExistente.toLowerCase()) {
    serviciosArray.push(servicioNuevo);
  }

  // servicio_detalle como concatenación para display
  const servicioDetalleCombinado = serviciosArray.join(' + ');

  // Usar fecha del turno existente si no viene en la respuesta
  const fechaTurnoFinal = fechaTurno
    || (input.turno_fecha?.includes('T') ? input.turno_fecha.split('T')[0] : input.turno_fecha?.split(' ')[0])
    || '';
  const horaTurnoFinal = horaTurno
    || (input.turno_fecha?.includes('T') ? input.turno_fecha.split('T')[1]?.slice(0, 5) : input.turno_fecha?.split(' ')[1])
    || '09:00';

  resultado = {
    ...resultado,
    // ID del turno en Odoo (el mismo que se actualizó)
    odoo_turno_id: llmResponse.turno_id,

    // Datos del turno actualizado
    fecha_turno: fechaTurnoFinal,
    hora_sugerida: horaTurnoFinal,

    // ===== ESTRUCTURA IGUAL A turno_creado =====
    // Servicios como array (para campo multi-select de Baserow)
    servicio: serviciosArray,
    // Detalle para display (concatenación)
    servicio_detalle: servicioDetalleCombinado,
    // Precio total (mismo nombre que turno_creado)
    precio: llmResponse.precio_total,
    // Seña total (mismo nombre que turno_creado)
    sena_monto: llmResponse.sena || Math.round((llmResponse.precio_total || 0) * 0.30),

    // MercadoPago (nuevo link)
    mp_preference_id: mpPreferenceId,
    link_pago: llmResponse.link_pago || '',

    // Estado
    estado_turno: 'pendiente_pago'
  };
}

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: resultado
}];
