// ============================================================================
// FORMATEAR RESPUESTA REPROGRAMADO - Agente Calendario Leraysi v2
// ============================================================================
// Construye la respuesta final para turno reprogramado con mensaje estructurado
// ============================================================================
// NODO: FormatearRespuestaReprogramado (Code)
// INPUT: ActualizarTurnoBaserow (respuesta de Baserow Update)
// OUTPUT: Respuesta estructurada con content_whatsapp_formatted para Master Agent
// ============================================================================

const baserowResponse = $input.first().json;

// Recuperar metadata del nodo anterior (PrepararReprogramadoBaserow)
const metaData = $('PrepararReprogramadoBaserow').first().json._meta;
const prepData = $('PrepararReprogramadoBaserow').first().json;

// El ID del turno actualizado en Baserow
const turnoRowId = baserowResponse.id;

// Detectar si es pre-pago (tiene link de pago nuevo)
const esPrepago = !!(prepData.mp_link);

// ============================================================================
// HELPERS
// ============================================================================

function formatearFechaLegible(fechaStr) {
  if (!fechaStr) return { fechaLegible: 'fecha por confirmar', nombreDia: '', hora: '09:00' };
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  // Parse "2026-02-27 09:00" or "2026-02-27 09:00:00"
  const fecha = new Date(fechaStr.replace(' ', 'T'));
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const nombreDia = dias[fecha.getDay()];
  const nombreDiaCap = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1);
  const hora = fechaStr.split(' ')[1]?.slice(0, 5) || '09:00';
  return { fechaLegible: `${dia}/${mes}/${anio}`, nombreDia: nombreDiaCap, hora };
}

function formatearMonto(monto) {
  return (monto || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// ============================================================================
// EXTRACT TURNO DATA FROM BASEROW
// ============================================================================

const servicios = (baserowResponse.servicio || []).map(s => s.value).join(' y ');
const precio = parseFloat(baserowResponse.precio) || 0;
const senaPagada = baserowResponse.sena_pagada === true || baserowResponse.sena_pagada === 'true';
const senaMonto = parseFloat(baserowResponse.sena_monto) || 0;

const anterior = formatearFechaLegible(metaData.fecha_hora_anterior);
const nueva = formatearFechaLegible(metaData.fecha_hora_nueva);

// ============================================================================
// BUILD STRUCTURED WHATSAPP MESSAGE
// ============================================================================

let mensajeFormateado = `⋆˚🧚‍♀️ ¡Tu turno fue reprogramado! ✨

━━━━━━━━━━━━━━━━━━
  🔄 *Cambio de Fecha*
━━━━━━━━━━━━━━━━━━

❌ *Anterior:* ${anterior.nombreDia} ${anterior.fechaLegible} ${anterior.hora} hs
✅ *Nueva:* ${nueva.nombreDia} ${nueva.fechaLegible} ${nueva.hora} hs

━━━━━━━━━━━━━━━━━━
  📋 *Detalles del Turno*
━━━━━━━━━━━━━━━━━━

💇 *Servicio:* ${servicios}
💰 *Precio:* $${formatearMonto(precio)}`;

if (senaPagada) {
  mensajeFormateado += `\n✅ *Tu seña sigue vigente*`;
}

mensajeFormateado += `\n📍 *Dirección:* Yerbal 513, CABA`;

// PATH A (pre-pago): incluir link de pago
if (esPrepago && prepData.mp_link) {
  mensajeFormateado += `

━━━━━━━━━━━━━━━━━━

💳 *Seña:* $${formatearMonto(senaMonto)}
👉 *Link de pago:*
${prepData.mp_link}`;
}

mensajeFormateado += `

¡Te esperamos en *Estilos Leraysi*! 💅`;

// ============================================================================
// OUTPUT PARA MASTER AGENT
// ============================================================================
const response = {
  success: true,
  accion: metaData.accion,
  turno_id: turnoRowId,
  lead_row_id: metaData.lead_row_id,

  // Mensaje formateado con cards (Master Agent debe usarlo tal cual como content_whatsapp)
  content_whatsapp_formatted: mensajeFormateado,

  // Datos del turno (para referencia del Master Agent)
  turno: {
    servicio: servicios,
    precio,
    sena_pagada: senaPagada,
    fecha_anterior: `${anterior.nombreDia} ${anterior.fechaLegible} ${anterior.hora}`,
    fecha_nueva: `${nueva.nombreDia} ${nueva.fechaLegible} ${nueva.hora}`,
  },

  // Datos específicos de reprogramación
  reprogramacion: {
    fecha_hora_anterior: metaData.fecha_hora_anterior,
    fecha_hora_nueva: metaData.fecha_hora_nueva,
    calendario_actualizado: metaData.calendario_actualizado
  }
};

// PATH A (pre-pago): incluir link de pago nuevo
if (esPrepago) {
  response.link_pago = prepData.mp_link;
  response.mp_preference_id = prepData.mp_preference_id;
  response.sena_monto = baserowResponse.sena_monto;
  response.precio = baserowResponse.precio;
}

return [{ json: response }];
