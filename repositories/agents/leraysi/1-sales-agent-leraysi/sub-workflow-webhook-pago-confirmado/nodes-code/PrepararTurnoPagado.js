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
// RESOLVER HORA (convertir fecha_hora UTC de Odoo a hora Argentina)
// ============================================================================
let hora = turnoBaserow.hora || '09:00';

if (odooTurno.fecha_hora) {
  try {
    const fechaOdoo = new Date(odooTurno.fecha_hora);
    // Restar 3 horas (UTC → Argentina)
    fechaOdoo.setHours(fechaOdoo.getHours() - 3);
    const h = String(fechaOdoo.getHours()).padStart(2, '0');
    const m = String(fechaOdoo.getMinutes()).padStart(2, '0');
    hora = `${h}:${m}`;
  } catch (e) {
    // mantener fallback de Baserow
  }
}

// ============================================================================
// OUTPUT: Todos los campos para Baserow Update Row
// ============================================================================
const precio = odooTurno.precio || parseFloat(turnoBaserow.precio) || 0;

return [{
  json: {
    // ID del row en Baserow para el UPDATE
    row_id: turnoBaserow.id,

    // Campos de estado (siempre se escriben)
    sena_pagada: true,
    estado: odooTurno.estado || 'confirmado',
    mp_payment_id: payment.mp_payment_id || '',
    confirmado_at: payment.confirmado_at || new Date().toISOString(),

    // Campos definitivos (del turno de Odoo, fuente de verdad)
    servicio: servicioArray,
    servicio_detalle: servicioDetalle,
    hora: hora,
    duracion_min: odooTurno.duracion_min || (odooTurno.duracion ? Math.round(odooTurno.duracion * 60) : null) || parseInt(turnoBaserow.duracion_min) || 60,
    complejidad_maxima: odooTurno.complejidad_maxima || turnoBaserow.complejidad_maxima?.value || turnoBaserow.complejidad_maxima || 'media',
    precio: precio,
    sena_monto: Math.round(precio * 0.3),
  }
}];
