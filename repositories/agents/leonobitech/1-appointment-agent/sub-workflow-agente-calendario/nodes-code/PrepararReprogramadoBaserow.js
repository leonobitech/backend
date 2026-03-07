// ============================================================================
// PREPARAR REPROGRAMADO BASEROW - Agente Calendario Leraysi
// ============================================================================
// Transforma datos para UPDATE en Baserow
// INPUT: BuscarTurnoBaserow (resultado de búsqueda con row_id)
// OUTPUT: Campos listos para Baserow Update Row
// ============================================================================
// NODO: PrepararReprogramadoBaserow (Code)
// FLUJO: Switch → BuscarTurnoBaserow → PrepararReprogramadoBaserow → Update
// ============================================================================

// Datos del turno encontrado en Baserow (viene de BuscarTurnoBaserow)
const turnoEncontrado = $input.first().json;

// Datos de ParseAgentResponse
const data = $('ParseAgentResponse').first().json;

// ============================================================================
// VALIDACIÓN
// ============================================================================
if (!turnoEncontrado || !turnoEncontrado.id) {
  throw new Error('[PrepararReprogramadoBaserow] No se encontró el turno en Baserow. ' +
                  `odoo_turno_id buscado: ${data.odoo_turno_id}`);
}

const turnoRowId = turnoEncontrado.id;

// ============================================================================
// FORMATEAR FECHA
// ============================================================================
function formatBaserowDatetime(date) {
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

const ahora = new Date();

// ============================================================================
// CAMPOS A ACTUALIZAR EN BASEROW
// ============================================================================
const updateFields = {
  // Nueva fecha y hora
  // Fecha+hora con timezone Argentina para que Baserow muestre correctamente
  // hora_sugerida puede venir como "15:00" o "15:00:00" — normalizar a HH:MM
  fecha: (() => {
    if (!data.fecha_turno) return null;
    const hora = (data.hora_sugerida || '09:00').split(':').slice(0, 2).join(':');
    return `${data.fecha_turno}T${hora}:00-03:00`;
  })(),
  hora: (data.hora_sugerida || '09:00').split(':').slice(0, 2).join(':'),

  // Actualizar odoo_turno_id (puede ser nuevo si era pendiente_pago)
  odoo_turno_id: data.odoo_turno_id,

  // Timestamp de actualización
  updated_at: formatBaserowDatetime(ahora),

  // Notas con historial
  notas: `Turno reprogramado el ${ahora.toLocaleDateString('es-AR')}. ` +
         `Fecha anterior: ${data.fecha_hora_anterior || 'N/A'}. ` +
         `Motivo: ${data.motivo_reprogramacion || 'No especificado'}`
};

// Si hay link_pago nuevo (caso pendiente_pago → nuevo turno)
if (data.link_pago) {
  updateFields.mp_link = data.link_pago;
  updateFields.mp_preference_id = data.mp_preference_id || '';
}

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Row ID para el Update
    row_id: turnoRowId,

    // Campos para Baserow Update
    ...updateFields,

    // Metadata para FormatearRespuestaReprogramado
    _meta: {
      accion: data.accion,
      mensaje_para_clienta: data.mensaje_para_clienta,
      lead_row_id: data.lead_row_id,
      fecha_hora_anterior: data.fecha_hora_anterior,
      fecha_hora_nueva: data.fecha_hora_nueva,
      calendario_actualizado: data.calendario_actualizado,
      calendar_accept_url: data.calendar_accept_url || null
    }
  }
}];
