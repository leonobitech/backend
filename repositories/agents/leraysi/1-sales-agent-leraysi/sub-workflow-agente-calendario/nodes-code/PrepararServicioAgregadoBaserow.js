// ============================================================================
// PREPARAR SERVICIO AGREGADO BASEROW - Agente Calendario Leraysi
// ============================================================================
// Transforma datos para UPDATE en Baserow cuando se agrega un servicio
// INPUT: BuscarTurnoBaserow (resultado de búsqueda con row_id)
// OUTPUT: Campos listos para Baserow Update Row
// ============================================================================
// NODO: PrepararServicioAgregadoBaserow (Code)
// FLUJO: Switch → BuscarTurnoBaserow → PrepararServicioAgregadoBaserow → Update
// ============================================================================

// Datos del turno encontrado en Baserow (viene de BuscarTurnoBaserow / Get many rows)
const turnoEncontrado = $input.first().json;

// Datos de ParseAgentResponse
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
// CAMPOS A ACTUALIZAR EN BASEROW
// ============================================================================
const updateFields = {
  // Servicios combinados (ej: "Manicura semipermanente + Pedicura")
  servicio_detalle: data.servicios_combinados,

  // Precio total actualizado
  precio: data.precio_total,

  // Nuevo link de pago (para seña diferencial)
  mp_link: data.link_pago || '',
  mp_preference_id: data.mp_preference_id || '',

  // Timestamp de actualización
  updated_at: formatBaserowDatetime(ahora),

  // Estado vuelve a pendiente_pago (porque hay nueva seña)
  estado: 'pendiente_pago',

  // Notas con historial
  notas: `Servicio agregado el ${ahora.toLocaleDateString('es-AR')}. ` +
         `Servicios: ${data.servicios_combinados}. ` +
         `Nuevo total: $${data.precio_total?.toLocaleString('es-AR') || 0}. ` +
         `Seña diferencial: $${data.sena_diferencial?.toLocaleString('es-AR') || 0}`
};

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Row ID para el Update
    row_id: turnoRowId,

    // Campos para Baserow Update
    ...updateFields,

    // Metadata para FormatearRespuestaServicioAgregado
    _meta: {
      accion: data.accion,
      mensaje_para_clienta: data.mensaje_para_clienta,
      lead_row_id: data.lead_row_id,
      odoo_turno_id: data.odoo_turno_id,
      servicios_combinados: data.servicios_combinados,
      precio_total: data.precio_total,
      sena_diferencial: data.sena_diferencial,
      link_pago: data.link_pago
    }
  }
}];
