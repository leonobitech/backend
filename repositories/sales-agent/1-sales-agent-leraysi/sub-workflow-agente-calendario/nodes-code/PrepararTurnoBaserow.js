// ============================================================================
// PREPARAR TURNO BASEROW - Agente Calendario Leraysi
// ============================================================================
// Transforma datos de ParseAgentResponse al formato de TurnosLeraysi
// Campos según TABLA-TURNOS-LERAYSI.md
// ============================================================================
// NODO: PrepararTurnoBaserow (Code)
// INPUT: ParseAgentResponse via IF_Agendar (True Branch)
// OUTPUT: Campos listos para Baserow Create Row
// ============================================================================

const data = $input.first().json;

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG = {
  expiracion_minutos: 120 // 2 horas para pagar la seña
};

// Calcular timestamps
const ahora = new Date();
const expiraAt = new Date(ahora.getTime() + CONFIG.expiracion_minutos * 60 * 1000);

// Formatear fecha para Baserow API: ISO 8601 con timezone Argentina
function formatBaserowDatetime(date) {
  // Ajustar UTC a Argentina (UTC-3)
  const argentinaTime = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  const offset = '-03:00';
  const year = argentinaTime.getUTCFullYear();
  const month = String(argentinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(argentinaTime.getUTCDate()).padStart(2, '0');
  const hours = String(argentinaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(argentinaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(argentinaTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

// ============================================================================
// CONSTRUIR REGISTRO PARA BASEROW (TurnosLeraysi)
// ============================================================================
const turnoBaserow = {
  // === Fecha y Hora ===
  fecha: data.fecha_turno,
  hora: data.hora_sugerida || '09:00',

  // === Relación con Lead ===
  clienta_id: data.lead_row_id ? [data.lead_row_id] : [],

  // === Datos de la Clienta (desnormalizados) ===
  nombre_clienta: data.nombre_clienta,
  telefono: data.telefono,
  email: data.email || '',

  // === Servicio ===
  servicio: Array.isArray(data.servicio) ? data.servicio : [data.servicio],
  servicio_detalle: data.servicio_detalle || '',
  tipo_servicio: data.tipo_servicio || 'medio',
  duracion_min: data.duracion_min || 90,

  // === Precio y Seña ===
  precio: data.precio,
  sena_monto: data.sena_monto,
  sena_pagada: false,

  // === Estado ===
  estado: 'pendiente_seña',

  // === Mercado Pago ===
  mp_payment_id: '',
  mp_link: '',

  // === IDs externos ===
  // odoo_event_id: NO enviar (se actualiza después si se crea en Odoo)
  conversation_id: data.conversation_id || null,

  // === Timestamps ===
  created_at: formatBaserowDatetime(ahora),
  expira_at: formatBaserowDatetime(expiraAt),
  confirmado_at: null,  // null hasta que el cliente pague

  // === Notas ===
  notas: `Turno creado via chatbot. Servicio: ${data.servicio}`
};

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Campos para Baserow (directo)
    ...turnoBaserow,

    // Preservar datos para FormatearRespuestaExito
    _meta: {
      accion: data.accion,
      mensaje_para_clienta: data.mensaje_para_clienta,
      lead_row_id: data.lead_row_id
    }
  }
}];
