// ============================================================================
// TURNO LEAD CONFIRMADO - Webhook Pago Confirmado v2
// ============================================================================
// Prepara los datos para actualizar LeadsLeraysi después de pago confirmado
// y construye el mensaje de confirmación para la clienta
//
// v2: Incluye turno_update con campos definitivos (servicio, hora, precio,
//     duracion_min, complejidad_maxima, sena_monto) para que el nodo
//     ActualizarTurnoPagadoDefinitivo los escriba a Baserow.
//     Separación de responsabilidades: PrepararServicioAgregadoBaserow solo
//     escribe campos "pendientes", los definitivos se aplican aquí post-pago.
// ============================================================================
// NODO: TurnoLeadConfirmado (Code)
// INPUT: ObtenerLead (datos del lead actual)
// ACCESO: WebhookPagoConfirmado, ActualizarTurnoPagado
// OUTPUT: Formato compatible con Output Main (content_whatsapp, baserow_update, state)
//         + turno_update con campos definitivos para TurnosLeraysi
// ============================================================================

const lead = $input.first().json;
const turno = $('ActualizarTurnoPagado').first().json;
const webhook = $('WebhookPagoConfirmado').first().json;

// ============================================================================
// EXTRAER DATOS DEL TURNO (Baserow)
// ============================================================================

// Servicios como string
const servicios = turno.servicio
  .map(s => s.value)
  .join(' y ');

const serviciosLista = turno.servicio.map(s => s.value);

// Fecha y hora del turno
const fechaTurno = turno.fecha ? turno.fecha.split('T')[0] : null;
// Normalizar hora a HH:MM (Baserow puede enviar HH:MM:SS)
const horaTurnoRaw = turno.hora || '09:00';
const horaTurno = horaTurnoRaw.split(':').slice(0, 2).join(':');

// Construir fecha completa para turno_fecha (convertir Argentina → UTC para Baserow)
let turnoFechaISO = null;
if (fechaTurno) {
  const d = new Date(`${fechaTurno}T${horaTurno}:00-03:00`);
  turnoFechaISO = d.toISOString();
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

// Formatear duración en texto legible
function formatearDuracion(minutos) {
  if (!minutos || minutos <= 0) return null;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  if (horas === 0) return `${mins} min`;
  if (mins === 0) return horas === 1 ? '1 hora' : `${horas} horas`;
  return `${horas}h ${mins}min`;
}

// Formatear monto en pesos argentinos
function formatearMonto(monto) {
  return (monto || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

const fechaLegible = formatearFechaLegible(fechaTurno);
const nombreDia = getNombreDia(fechaTurno);
const nombreDiaCap = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1);

// Duración desde Baserow (minutos)
const duracionMin = parseInt(turno.duracion_min) || 0;
const duracionTexto = formatearDuracion(duracionMin);

// ============================================================================
// EXTRAER DATOS DE PAGO (MCP result vía webhook)
// ============================================================================

// MCP data: webhook.body.mcp.data (estructura real del endpoint /internal/mcp/call-tool)
const mcpData = webhook.body?.mcp?.data || webhook.body?.mcp || {};
const pagos = mcpData.pagos || {};

// Precio total desde Baserow (fuente de verdad para precio)
const precioTotal = parseFloat(turno.precio) || 0;

// Seña recién pagada (monto de este pago)
const senaMontoNum = parseFloat(turno.sena_monto) || 0;

// Monto del pago reciente (este pago específico)
const mcpTurno = mcpData.turno || {};
const pagoReciente = parseFloat(mcpTurno.sena) || senaMontoNum;

// Datos acumulados del MCP (si están disponibles)
const totalPagado = pagos.total_pagado || senaMontoNum;
const cantidadPagos = pagos.cantidad_pagos || 1;
const pendienteRestante = pagos.pendiente_restante != null
  ? pagos.pendiente_restante
  : Math.max(0, precioTotal - totalPagado);

// URL de confirmación de asistencia
const calendarAcceptUrl = mcpData.calendar_accept_url || null;

// ============================================================================
// CONSTRUIR MENSAJE PARA LA CLIENTA
// ============================================================================

const nombreClienta = lead.full_name || turno.nombre_clienta?.[0]?.value || 'clienta';
const primerNombre = nombreClienta.split(' ')[0];

// Card 1: Turno Reservado
let mensajeContent = `⋆˚🧚‍♀️ ¡${primerNombre}, tu pago fue recibido! ✨

━━━━━━━━━━━━━━━━━━
  📅 *Turno Reservado*
━━━━━━━━━━━━━━━━━━

💇 *Servicio:* ${servicios}
📆 *Fecha:* ${nombreDiaCap} ${fechaLegible}
🕐 *Hora:* ${horaTurno} hs`;

if (duracionTexto) {
  mensajeContent += `\n⏱️ *Duración:* ${duracionTexto}`;
}

mensajeContent += `\n📍 *Dirección:* Yerbal 513, CABA`;

// Card 2: Detalle de Pago
mensajeContent += `

━━━━━━━━━━━━━━━━━━
  💰 *Detalle de Pago*
━━━━━━━━━━━━━━━━━━

💳 *Pago recibido:* $${formatearMonto(pagoReciente)}
✅ *Seña total pagada:* $${formatearMonto(totalPagado)}
💲 *Precio total:* $${formatearMonto(precioTotal)}`;

if (pendienteRestante > 0) {
  mensajeContent += `\n📌 *Pendiente:* $${formatearMonto(pendienteRestante)}`;
} else {
  mensajeContent += `\n✨ *Pago completo*`;
}

// Link de confirmación de asistencia
if (calendarAcceptUrl) {
  mensajeContent += `

━━━━━━━━━━━━━━━━━━

👉 *Confirmá tu asistencia:*
${calendarAcceptUrl}`;
}

mensajeContent += `

¡Te esperamos en *Estilos Leraysi*! 💅`;

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
// CONSTRUIR turno_update (campos definitivos para TurnosLeraysi)
// ============================================================================
// v2: El webhook de pago ahora escribe los campos definitivos a Baserow.
// Estos datos vienen de Odoo (fuente de verdad) via el webhook body.
// Antes de pagar, PrepararServicioAgregadoBaserow solo escribió campos
// pendientes (mp_link, estado, expira_at). Ahora aplicamos los definitivos.
// ============================================================================

const webhookTurno = webhook.body?.turno || {};

// Extraer hora del turno de Odoo (fecha_hora viene como ISO: "2026-02-26T12:00:00")
let horaDefinitiva = horaTurno; // fallback a la hora de Baserow
if (webhookTurno.fecha_hora) {
  try {
    // fecha_hora de Odoo viene en UTC, convertir a Argentina para extraer hora local
    const fechaOdoo = new Date(webhookTurno.fecha_hora);
    // Restar 3 horas (UTC → Argentina)
    fechaOdoo.setHours(fechaOdoo.getHours() - 3);
    const h = String(fechaOdoo.getHours()).padStart(2, '0');
    const m = String(fechaOdoo.getMinutes()).padStart(2, '0');
    horaDefinitiva = `${h}:${m}`;
  } catch (e) {
    // mantener fallback
  }
}

// servicio de Odoo puede ser string (código) o puede venir servicio_detalle
const servicioOdoo = webhookTurno.servicio || turno.servicio;
const servicioDetalleOdoo = webhookTurno.servicio_detalle || turno.servicio_detalle || '';

// turno_update: campos definitivos para Baserow TurnosLeraysi (tabla 855)
const turno_update = {
  row_id: turno.id,                                                 // Row ID del turno en Baserow
  servicio: Array.isArray(servicioOdoo) ? servicioOdoo : turno.servicio, // Multi-select (array de Baserow)
  servicio_detalle: servicioDetalleOdoo,                             // "Manicura semipermanente + Pedicura"
  hora: horaDefinitiva,                                              // HH:MM en Argentina
  duracion_min: webhookTurno.duracion_min || parseInt(turno.duracion_min) || 60,
  complejidad_maxima: webhookTurno.complejidad_maxima || turno.complejidad_maxima || 'media',
  precio: webhookTurno.precio || parseFloat(turno.precio) || 0,
  sena_monto: Math.round((webhookTurno.precio || parseFloat(turno.precio) || 0) * 0.3),
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

    // Campos a actualizar en Baserow LeadsLeraysi
    baserow_update,

    // Campos definitivos a actualizar en Baserow TurnosLeraysi
    turno_update,

    // Estado completo del lead
    state,

    // Metadata
    meta: {
      timestamp: new Date().toISOString(),
      version: 'leraysi-pago-confirmado@2.0',
      turno_id: turno.id,
      odoo_turno_id: turno.odoo_turno_id,
      mp_payment_id: turno.mp_payment_id
    }
  }
}];
