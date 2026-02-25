// ============================================================================
// PREPARAR SERVICIO AGREGADO BASEROW - Agente Calendario Leraysi v3
// ============================================================================
// Transforma datos para UPDATE en Baserow cuando se agrega un servicio
//
// SEPARACIÓN DE RESPONSABILIDADES (v3):
// - Este nodo solo escribe campos "pendientes" (mp_link, estado, expira_at)
// - Los campos definitivos (servicio, hora, precio, duracion, complejidad)
//   se guardan en _meta.datos_definitivos para que el webhook de pago
//   los aplique SOLO cuando la clienta pague
// - Si NO paga, el cron expira el turno y los datos originales están intactos
// ============================================================================
// INPUT: BuscarTurnoBaserow (resultado de búsqueda con row_id)
// OUTPUT: Campos pendientes para Baserow Update + _meta con datos definitivos
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
const expiraAt = new Date(ahora.getTime() + 15 * 60 * 1000); // 15 min para pagar

// ============================================================================
// DATOS DEFINITIVOS (se aplican SOLO cuando paga, via webhook)
// ============================================================================
const horaDefinitiva = data.hora_sugerida || turnoEncontrado.hora || '09:00';
const precioDefinitivo = data.precio;
const senaMonto = Math.round((precioDefinitivo || 0) * 0.3);

const datosDefinitivos = {
  servicio: data.servicio,                              // Array: ["Manicura semipermanente", "Pedicura"]
  servicio_detalle: data.servicio_detalle,               // "Manicura semipermanente + Pedicura"
  hora: horaDefinitiva,                                  // Hora actualizada (ej: 15:00 → 09:00 para muy_compleja)
  duracion_min: data.duracion_estimada || 60,            // Duración total en minutos
  complejidad_maxima: data.complejidad_maxima || 'media', // Complejidad combinada
  precio: precioDefinitivo,                              // Precio total combinado
  sena_monto: senaMonto,                                 // 30% del precio total
};

// ============================================================================
// CAMPOS PENDIENTES (se escriben ahora en Baserow, reversibles por cron)
// ============================================================================
const updateFields = {
  // Estado pendiente de pago
  sena_pagada: false,
  estado: 'pendiente_pago',

  // MercadoPago (nuevo link para la seña diferencial)
  mp_preference_id: data.mp_preference_id || '',
  mp_link: data.link_pago || '',

  // Timestamps
  updated_at: formatBaserowDatetime(ahora),
  expira_at: formatBaserowDatetime(expiraAt),

  // Notas informativas (no afectan lógica)
  notas: `Servicio agregado el ${ahora.toLocaleDateString('es-AR')}. ` +
         `Servicios: ${data.servicio_detalle}. ` +
         `Total: $${precioDefinitivo?.toLocaleString('es-AR') || 0}. ` +
         `Seña diferencial: $${senaMonto.toLocaleString('es-AR')}. ` +
         `Pendiente de pago.`
};

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Row ID para el Update
    row_id: turnoRowId,

    // Campos pendientes para Baserow Update (SOLO estos se escriben ahora)
    ...updateFields,

    // Metadata para FormatearRespuestaServicioAgregado + webhook de pago
    _meta: {
      accion: data.accion,
      mensaje_para_clienta: data.mensaje_para_clienta,
      lead_row_id: data.lead_row_id,
      odoo_turno_id: data.odoo_turno_id,
      // Datos del turno original (para desglose de seña en respuesta)
      turno_precio_existente: turnoEncontrado.precio || 0,
      turno_sena_pagada: turnoEncontrado.sena_monto || 0,
      turno_servicio_existente: turnoEncontrado.servicio_detalle || '',
      // Datos definitivos: el webhook aplica estos campos cuando confirma pago
      datos_definitivos: datosDefinitivos,
    }
  }
}];
