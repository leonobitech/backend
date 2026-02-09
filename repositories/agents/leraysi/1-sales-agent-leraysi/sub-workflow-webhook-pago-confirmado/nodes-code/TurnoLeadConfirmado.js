// ============================================================================
// TURNO LEAD CONFIRMADO - Webhook Pago Confirmado
// ============================================================================
// Prepara los datos para actualizar LeadsLeraysi después de pago confirmado
// y construye el mensaje de confirmación para la clienta
// ============================================================================
// NODO: TurnoLeadConfirmado (Code)
// INPUT: ObtenerLead (datos del lead actual)
// ACCESO: WebhookPagoConfirmado, ActualizarTurnoPagado
// OUTPUT: Formato compatible con Output Main (content_whatsapp, baserow_update, state)
// ============================================================================

const lead = $input.first().json;
const turno = $('ActualizarTurnoPagado').first().json;
const webhook = $('WebhookPagoConfirmado').first().json;

// ============================================================================
// EXTRAER DATOS DEL TURNO
// ============================================================================

// Servicios como string
const servicios = turno.servicio
  .map(s => s.value)
  .join(' y ');

const serviciosLista = turno.servicio.map(s => s.value);

// Fecha y hora del turno
const fechaTurno = turno.fecha ? turno.fecha.split('T')[0] : null;
const horaTurno = turno.hora || '09:00';

// Construir fecha completa para turno_fecha (ISO 8601)
let turnoFechaISO = null;
if (fechaTurno) {
  turnoFechaISO = `${fechaTurno}T${horaTurno}:00-03:00`;
}

// Formatear fecha legible para el mensaje (DD/MM/YYYY)
function formatearFechaLegible(fechaISO) {
  if (!fechaISO) return 'fecha por confirmar';
  const fecha = new Date(fechaISO);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

// Nombre del día en español
function getNombreDia(fechaISO) {
  if (!fechaISO) return '';
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const fecha = new Date(fechaISO);
  return dias[fecha.getDay()];
}

const fechaLegible = formatearFechaLegible(fechaTurno);
const nombreDia = getNombreDia(fechaTurno);

// Datos de pago
const senaMontoNum = parseFloat(turno.sena_monto) || 0;
const senaMonto = senaMontoNum.toLocaleString('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

// ============================================================================
// CONSTRUIR MENSAJE PARA LA CLIENTA
// ============================================================================

const nombreClienta = lead.full_name || turno.nombre_clienta?.[0]?.value || 'clienta';
const primerNombre = nombreClienta.split(' ')[0];

const mensajeContent = `⋆˚🧚‍♀️ ¡${primerNombre}, tu pago de $${senaMonto} fue recibido! ✨

✅ *Turno confirmado*
📅 ${nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1)} ${fechaLegible}
🕐 ${horaTurno} hs
💇 ${servicios}

¡Te esperamos en Estilos Leraysi! 💅`;

// ============================================================================
// CONSTRUIR NOTA ACTUALIZADA
// ============================================================================

const notaActualizada = `Seña pagada ✓ - ${servicios} (${nombreDia} ${fechaLegible} ${horaTurno})`;

// ============================================================================
// EXTRAER VALORES DE CAMPOS CON ESTRUCTURA BASEROW
// ============================================================================

const extractValue = (field) => {
  if (Array.isArray(field) && field.length > 0) return field[0].value;
  if (field && typeof field === 'object' && 'value' in field) return field.value;
  return field;
};

const extractValues = (field) => {
  if (Array.isArray(field)) return field.map(f => f.value || f);
  return field ? [field] : [];
};

// ============================================================================
// CONSTRUIR baserow_update (campos a actualizar en LeadsLeraysi)
// ============================================================================

const baserow_update = {
  row_id: lead.id,
  stage: 'turno_confirmado',
  turno_agendado: true,
  turno_fecha: turnoFechaISO,
  sena_pagada: true,
  notes: notaActualizada,
  last_activity_iso: new Date().toISOString()
};

// ============================================================================
// CONSTRUIR state (estado completo del lead)
// ============================================================================

const state = {
  row_id: lead.id,
  nick_name: lead.nick_name || '',
  full_name: lead.full_name || nombreClienta,
  phone: lead.phone_number,
  email: extractValue(lead.email) || '',
  channel: extractValue(lead.channel) || 'whatsapp',
  country: extractValue(lead.country) || 'Argentina',
  tz: lead.tz || '-03:00',
  stage: 'turno_confirmado',
  priority: extractValue(lead.priority) || 'normal',
  servicio_interes: lead.servicio_interes || serviciosLista[0] || '',
  interests: extractValues(lead.interests),
  foto_recibida: lead.foto_recibida || false,
  presupuesto_dado: lead.presupuesto_dado || false,
  turno_agendado: true,
  turno_fecha: turnoFechaISO,
  sena_pagada: true,
  waiting_image: lead.waiting_image || false,
  services_seen: parseInt(lead.services_seen) || 0,
  prices_asked: parseInt(lead.prices_asked) || 0,
  deep_interest: parseInt(lead.deep_interest) || 0,
  lead_id: parseInt(lead.lead_id),
  chatwoot_id: parseInt(lead.chatwoot_id),
  chatwoot_inbox_id: parseInt(lead.chatwoot_inbox_id),
  conversation_id: parseInt(lead.conversation_id || turno.conversation_id),
  last_message: lead.last_message || '',
  last_message_id: lead.last_message_id || '',
  last_activity_iso: new Date().toISOString(),
  description: `Seña pagada ✓ • Turno: ${nombreDia} ${fechaLegible} ${horaTurno} • ${servicios}`
};

// Parsear image_analysis si existe
if (lead.image_analysis) {
  try {
    state.image_analysis = typeof lead.image_analysis === 'string'
      ? JSON.parse(lead.image_analysis)
      : lead.image_analysis;
  } catch (e) {
    state.image_analysis = null;
  }
}

// ============================================================================
// OUTPUT
// ============================================================================

return [{
  json: {
    // Mensaje para WhatsApp/Chatwoot
    content_whatsapp: {
      content: mensajeContent,
      message_type: 'outgoing',
      content_type: 'text'
    },

    // HTML para Odoo chatter
    body_html: `<p>${mensajeContent.replace(/\n/g, '<br>')}</p>`,

    // IDs importantes
    lead_id: parseInt(lead.lead_id),
    row_id: lead.id,

    // Campos a actualizar en Baserow
    baserow_update,

    // Estado completo del lead
    state,

    // Metadata
    meta: {
      timestamp: new Date().toISOString(),
      version: 'leraysi-pago-confirmado@1.0',
      turno_id: turno.id,
      odoo_turno_id: turno.odoo_turno_id,
      mp_payment_id: turno.mp_payment_id
    }
  }
}];
