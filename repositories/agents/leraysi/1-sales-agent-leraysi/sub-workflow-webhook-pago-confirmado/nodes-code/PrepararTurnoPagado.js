// ============================================================================
// PREPARAR TURNO PAGADO - Webhook Pago Confirmado
// ============================================================================
// Combina datos del webhook (Odoo) con datos del turno (Baserow) para preparar
// la actualización definitiva de TurnosLeraysi.
//
// SEPARACIÓN DE RESPONSABILIDADES:
// - PrepararServicioAgregadoBaserow solo escribió campos pendientes (mp_link, estado)
// - Este nodo prepara los campos DEFINITIVOS (servicio, hora, precio, etc.)
//   que se aplican a Baserow SOLO cuando se confirma el pago.
// ============================================================================
// NODO: PrepararTurnoPagado (Code)
// INPUT: BuscarTurnoPorMP (turno actual de Baserow)
// ACCESO: WebhookPagoConfirmado (datos de Odoo via webhook)
// OUTPUT: Campos listos para ActualizarTurnoPagado (Baserow Update)
// ============================================================================

const turnoBaserow = $input.first().json;
const webhook = $('WebhookPagoConfirmado').first().json;

const odooTurno = webhook.body?.turno || {};
const payment = webhook.body?.payment || {};
const mcpData = webhook.body?.mcp?.data || {};

// ============================================================================
// MAPEO DE SERVICIO: código Odoo → display name Baserow
// ============================================================================
const CODE_TO_DISPLAY = {
  corte_mujer: 'Corte mujer',
  alisado_brasileno: 'Alisado brasileño',
  alisado_keratina: 'Alisado keratina',
  mechas_completas: 'Mechas completas',
  tintura_raiz: 'Tintura raíz',
  tintura_completa: 'Tintura completa',
  balayage: 'Balayage',
  manicura_simple: 'Manicura simple',
  manicura_semipermanente: 'Manicura semipermanente',
  pedicura: 'Pedicura',
  depilacion_cera_piernas: 'Depilación cera piernas',
  depilacion_cera_axilas: 'Depilación cera axilas',
  depilacion_cera_bikini: 'Depilación cera bikini',
  depilacion_laser_piernas: 'Depilación láser piernas',
  depilacion_laser_axilas: 'Depilación láser axilas',
};

// ============================================================================
// RESOLVER SERVICIO (multi-select para Baserow)
// ============================================================================
// Odoo envía servicio_detalle como "Manicura semipermanente + Pedicura"
// y servicio como código ("manicura_semipermanente")
let servicioArray;
const servicioDetalle = odooTurno.servicio_detalle || '';

if (servicioDetalle && servicioDetalle.includes('+')) {
  // Múltiples servicios: split por "+"
  servicioArray = servicioDetalle.split('+').map(s => s.trim());
} else if (servicioDetalle) {
  // Un solo servicio con display name
  servicioArray = [servicioDetalle];
} else {
  // Fallback: convertir código Odoo a display name
  const code = odooTurno.servicio || '';
  servicioArray = [CODE_TO_DISPLAY[code] || code];
}

// ============================================================================
// RESOLVER HORA
// ============================================================================
// El webhook envía hora_argentina (HH:MM) ya convertida desde UTC en Python.
// Fallback: turnoBaserow.hora (valor pre-pago de Baserow).
const hora = odooTurno.hora_argentina || turnoBaserow.hora || '09:00';

// ============================================================================
// DETECTAR TURNO CON SERVICIO FUSIONADO (padre de turno adicional)
// ============================================================================
// Cuando Odoo envía datos combinados ("Balayage + Manicura simple"), este turno
// es el PADRE de un turno adicional. En Baserow cada fila mantiene su servicio
// individual, así que NO sobreescribimos los campos de servicio del padre.
// También detectamos si este row ES un hijo (tiene turno_padre_id).
const esFusionado = servicioDetalle.includes('+');
const esHijo = turnoBaserow.turno_padre_id != null
  && turnoBaserow.turno_padre_id !== ''
  && turnoBaserow.turno_padre_id !== 0;
const noSobreescribirServicio = esFusionado || esHijo;

// ============================================================================
// OUTPUT: Todos los campos para Baserow Update Row
// ============================================================================
const precio = noSobreescribirServicio
  ? parseFloat(turnoBaserow.precio) || 0
  : (odooTurno.precio || parseFloat(turnoBaserow.precio) || 0);

// Extraer servicio original de Baserow (puede ser array de objetos {id, value} o strings)
const servicioBaserow = Array.isArray(turnoBaserow.servicio)
  ? turnoBaserow.servicio.map(s => s.value || s)
  : [turnoBaserow.servicio || ''];
const servicioDetalleBaserow = turnoBaserow.servicio_detalle || servicioBaserow.join(' + ');

return [{
  json: {
    // ID del row en Baserow para el UPDATE
    row_id: turnoBaserow.id,

    // Campos de estado (siempre se escriben)
    sena_pagada: true,
    estado: odooTurno.estado || 'confirmado',
    mp_payment_id: payment.mp_payment_id || '',
    confirmado_at: payment.confirmado_at || new Date().toISOString(),

    // Campos de servicio: usar Baserow (original) si fusionado/hijo, sino Odoo (fuente de verdad)
    fecha: turnoBaserow.fecha
      ? new Date(`${turnoBaserow.fecha.split('T')[0]}T${noSobreescribirServicio ? (turnoBaserow.hora || '09:00') : hora}:00-03:00`).toISOString()
      : null,
    servicio: noSobreescribirServicio ? servicioBaserow : servicioArray,
    servicio_detalle: noSobreescribirServicio ? servicioDetalleBaserow : servicioDetalle,
    hora: noSobreescribirServicio ? (turnoBaserow.hora || '09:00') : hora,
    duracion_min: noSobreescribirServicio
      ? (parseInt(turnoBaserow.duracion_min) || 60)
      : (odooTurno.duracion_min || (odooTurno.duracion ? Math.round(odooTurno.duracion * 60) : null) || parseInt(turnoBaserow.duracion_min) || 60),
    complejidad_maxima: noSobreescribirServicio
      ? (turnoBaserow.complejidad_maxima?.value || turnoBaserow.complejidad_maxima || 'media')
      : (odooTurno.complejidad_maxima || turnoBaserow.complejidad_maxima?.value || turnoBaserow.complejidad_maxima || 'media'),
    precio: precio,
    // sena_monto: si fusionado/hijo, mantener valor existente de Baserow (cada fila tiene su seña)
    // sino usar monto_pago_pendiente de Odoo (diferencial) o calcular 30%
    sena_monto: noSobreescribirServicio
      ? (parseFloat(turnoBaserow.sena_monto) || Math.round(precio * 0.3))
      : (odooTurno.monto_pago_pendiente || Math.round(precio * 0.3)),

    // odoo_event_id: ID del evento de calendario creado por confirmar_pago_completo
    odoo_event_id: mcpData.event_id || null,
  }
}];
