// ============================================================================
// PREPARAR SERVICIO AGREGADO BASEROW - Agente Calendario Leraysi v4
// ============================================================================
// Bifurca en DOS caminos según tipo de operación:
//
// PATH A — TURNO ADICIONAL (es_turno_adicional = true):
//   Otra trabajadora hace SOLO el servicio nuevo → CREATE fila nueva
//   El turno original queda INTACTO (no se modifica)
//   La fila nueva tiene turno_padre_id para vincularlos
//
// PATH B — MISMA TRABAJADORA (bloque combinado):
//   UPDATE fila existente con campos pendientes (v3: separación responsabilidades)
//   Los datos definitivos se aplican via webhook de pago
// ============================================================================
// INPUT: BuscarTurnoBaserow (resultado de búsqueda con row_id)
// OUTPUT: Campos para Baserow Create o Update + _meta
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
const expiraAt = new Date(ahora.getTime() + 15 * 60 * 1000); // 15 min para pagar

// ============================================================================
// PATH A: TURNO ADICIONAL — CREATE fila nueva
// ============================================================================
if (data.es_turno_adicional) {
  const horaAdicional = data.hora_sugerida || '09:00';
  const precioNuevo = Number(data.precio) || 0;
  const senaNuevo = Math.round(precioNuevo * 0.3);

  // Construir fila nueva (misma estructura que PrepararTurnoBaserow)
  const createFields = {
    // Fecha y hora
    fecha: data.fecha_turno
      ? data.fecha_turno + 'T' + horaAdicional + ':00-03:00'
      : null,
    hora: horaAdicional,

    // Relación con Lead (del turno padre)
    // Baserow link row fields vienen como [{id, value, ...}] → extraer solo IDs [219]
    clienta_id: Array.isArray(turnoEncontrado.clienta_id)
      ? turnoEncontrado.clienta_id.map(c => typeof c === 'object' ? c.id : c)
      : [],

    // Datos clienta (copiados del turno padre)
    // Pueden ser lookup fields (array de objetos) o texto plano
    nombre_clienta: Array.isArray(turnoEncontrado.nombre_clienta)
      ? (turnoEncontrado.nombre_clienta[0]?.value || data.nombre_clienta || '')
      : (turnoEncontrado.nombre_clienta || data.nombre_clienta || ''),
    telefono: Array.isArray(turnoEncontrado.telefono)
      ? (turnoEncontrado.telefono[0]?.value || data.telefono || '')
      : (turnoEncontrado.telefono || data.telefono || ''),
    email: Array.isArray(turnoEncontrado.email)
      ? (turnoEncontrado.email[0]?.value || data.email || '')
      : (turnoEncontrado.email || data.email || ''),

    // Servicio: SOLO el nuevo (no combinado)
    // Baserow multi-select espera array de display names: ["Pedicura"]
    // servicio_detalle es string ("Pedicura" o "Manicura simple + Pedicura")
    servicio: (data.servicio_detalle || '').split(' + ').filter(s => s.trim()),
    servicio_detalle: data.servicio_detalle || '',
    complejidad_maxima: data.complejidad_maxima || 'media',
    trabajadora: data.trabajadora || 'Companera',
    duracion_min: data.duracion_estimada || 60,

    // Precio: SOLO del servicio nuevo
    precio: precioNuevo,
    sena_monto: senaNuevo,
    sena_pagada: false,

    // Estado
    estado: 'pendiente_pago',

    // MercadoPago
    mp_preference_id: data.mp_preference_id || '',
    mp_link: data.link_pago || '',
    mp_payment_id: '',

    // Timestamps
    created_at: formatBaserowDatetime(ahora),
    expira_at: formatBaserowDatetime(expiraAt),

    // Vinculación con turno padre
    turno_padre_id: turnoRowId,

    // Odoo
    odoo_turno_id: data.odoo_turno_id || null,

    // Conversation
    conversation_id: turnoEncontrado.conversation_id || data.conversation_id || null,

    // Notas
    notas: `Servicio adicional. Turno original: #${turnoRowId} ` +
           `(${typeof turnoEncontrado.trabajadora === 'object' ? (turnoEncontrado.trabajadora?.value || 'Leraysi') : (turnoEncontrado.trabajadora || 'Leraysi')} ` +
           `${turnoEncontrado.hora || '?'} ` +
           `${turnoEncontrado.servicio_detalle || ''}). ` +
           `Creado el ${ahora.toLocaleDateString('es-AR')}.`,
  };

  console.log(`[PrepararServicioAgregadoBaserow] PATH A: TURNO ADICIONAL. ` +
    `Padre: #${turnoRowId} (${turnoEncontrado.trabajadora}). ` +
    `Nuevo: ${data.trabajadora} ${horaAdicional} ${data.servicio_detalle}`);

  return [{
    json: {
      // Flag para que el IF node en n8n sepa que es CREATE (no UPDATE)
      _operacion: 'crear_turno_adicional',

      // Campos para Baserow Create Row
      ...createFields,

      // Metadata para FormatearRespuestaServicioAgregado
      _meta: {
        accion: data.accion,
        mensaje_para_clienta: data.mensaje_para_clienta,
        lead_row_id: data.lead_row_id,
        odoo_turno_id: data.odoo_turno_id,
        // Datos del turno padre (para desglose de seña en respuesta)
        turno_padre_row_id: turnoRowId,
        turno_precio_existente: turnoEncontrado.precio || 0,
        turno_sena_pagada: turnoEncontrado.sena_monto || 0,
        turno_servicio_existente: turnoEncontrado.servicio_detalle || '',
        turno_hora_original: turnoEncontrado.hora || '',
        turno_trabajadora_original: turnoEncontrado.trabajadora || 'Leraysi',
        turno_complejidad_padre: turnoEncontrado.complejidad_maxima?.value || turnoEncontrado.complejidad_maxima || 'media',
        // Datos definitivos (para turno adicional son los mismos, no hay split)
        datos_definitivos: {
          servicio: data.servicio,
          servicio_detalle: data.servicio_detalle || '',
          hora: horaAdicional,
          duracion_min: data.duracion_estimada || 60,
          complejidad_maxima: data.complejidad_maxima || 'media',
          precio: precioNuevo,
          sena_monto: senaNuevo,
        },
      }
    }
  }];
}

// ============================================================================
// PATH B: MISMA TRABAJADORA — UPDATE fila existente (v3: separación responsabilidades)
// ============================================================================
const horaDefinitiva = data.hora_sugerida || turnoEncontrado.hora || '09:00';
const precioDefinitivo = data.precio;
const senaMonto = Math.round((precioDefinitivo || 0) * 0.3);

const datosDefinitivos = {
  servicio: data.servicio,
  servicio_detalle: data.servicio_detalle,
  hora: horaDefinitiva,
  duracion_min: data.duracion_estimada || 60,
  complejidad_maxima: data.complejidad_maxima || 'media',
  precio: precioDefinitivo,
  sena_monto: senaMonto,
};

const updateFields = {
  sena_pagada: false,
  estado: 'pendiente_pago',
  mp_preference_id: data.mp_preference_id || '',
  mp_link: data.link_pago || '',
  updated_at: formatBaserowDatetime(ahora),
  expira_at: formatBaserowDatetime(expiraAt),
  notas: `Servicio agregado el ${ahora.toLocaleDateString('es-AR')}. ` +
         `Servicios: ${data.servicio_detalle}. ` +
         `Total: $${precioDefinitivo?.toLocaleString('es-AR') || 0}. ` +
         `Seña diferencial: $${senaMonto.toLocaleString('es-AR')}. ` +
         `Pendiente de pago.`
};

console.log(`[PrepararServicioAgregadoBaserow] PATH B: UPDATE misma trabajadora. ` +
  `Row: #${turnoRowId}. Servicios: ${data.servicio_detalle}`);

return [{
  json: {
    _operacion: 'actualizar_turno_existente',
    row_id: turnoRowId,
    ...updateFields,
    _meta: {
      accion: data.accion,
      mensaje_para_clienta: data.mensaje_para_clienta,
      lead_row_id: data.lead_row_id,
      odoo_turno_id: data.odoo_turno_id,
      turno_precio_existente: turnoEncontrado.precio || 0,
      turno_sena_pagada: turnoEncontrado.sena_monto || 0,
      turno_servicio_existente: turnoEncontrado.servicio_detalle || '',
      datos_definitivos: datosDefinitivos,
    }
  }
}];
