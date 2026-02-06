// ============================================================================
// PREPARAR SERVICIO AGREGADO BASEROW - Agente Calendario Leraysi v2
// ============================================================================
// Transforma datos para UPDATE en Baserow cuando se agrega un servicio
// ESTRUCTURA IGUAL A turno_creado para simplificar mapeo
// ============================================================================
// INPUT: BuscarTurnoBaserow (resultado de búsqueda con row_id)
// OUTPUT: Campos listos para Baserow Update Row (misma estructura que turno_creado)
// ============================================================================

// Datos del turno encontrado en Baserow (viene de BuscarTurnoBaserow / Get many rows)
const turnoEncontrado = $input.first().json;

// Datos de ParseAgentResponse (ahora con estructura igual a turno_creado)
const data = $('ParseAgentResponse').first().json;

// ============================================================================
// VALIDACIÓN
// ============================================================================
if (!turnoEncontrado || !turnoEncontrado.id) {
  throw new Error('[PrepararServicioAgregadoBaserow] No se encontró el turno en Baserow. ' +
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
// CAMPOS A ACTUALIZAR EN BASEROW (misma estructura que turno_creado)
// ============================================================================
const updateFields = {
  // Servicios como array (campo multi-select de Baserow)
  servicio: data.servicio, // Array: ["Manicura semipermanente", "Pedicura"]

  // Detalle para display (concatenación)
  servicio_detalle: data.servicio_detalle, // "Manicura semipermanente + Pedicura"

  // Duración total actualizada (en minutos)
  duracion_min: data.duracion_estimada || 60,

  // Complejidad máxima (puede cambiar al agregar servicio más complejo)
  complejidad_maxima: data.complejidad_maxima || 'media',

  // Precio total actualizado
  precio: data.precio,

  // Seña total (30% del precio total)
  sena_monto: data.sena_monto,

  // Estado de pago (false porque hay nueva seña pendiente)
  sena_pagada: false,

  // Estado del turno
  estado: 'pendiente_pago',

  // MercadoPago (nuevo link)
  mp_preference_id: data.mp_preference_id || '',
  mp_link: data.link_pago || '',

  // Timestamp de actualización
  updated_at: formatBaserowDatetime(ahora),

  // Notas con historial
  notas: `Servicio agregado el ${ahora.toLocaleDateString('es-AR')}. ` +
         `Servicios: ${data.servicio_detalle}. ` +
         `Total: $${data.precio?.toLocaleString('es-AR') || 0}. ` +
         `Seña: $${data.sena_monto?.toLocaleString('es-AR') || 0}`
};

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Row ID para el Update
    row_id: turnoRowId,

    // Campos para Baserow Update (estructura igual a turno_creado)
    ...updateFields,

    // Metadata para FormatearRespuestaServicioAgregado
    _meta: {
      accion: data.accion,
      mensaje_para_clienta: data.mensaje_para_clienta,
      lead_row_id: data.lead_row_id,
      odoo_turno_id: data.odoo_turno_id
    }
  }
}];
