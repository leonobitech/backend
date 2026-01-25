// ============================================================================
// BUILD AGENT PROMPT - Construye el User Message para Agente Calendario
// ============================================================================
// INPUT: Datos combinados de ParseInput + AnalizarDisponibilidad
// OUTPUT: userMessage para el AI Agent del calendario
//
// DISEÑO: 100% determinístico - el agente solo ejecuta y mapea datos
// ============================================================================

const data = $input.first().json;

// ============================================================================
// VALORES PRE-CALCULADOS
// ============================================================================
const horaDeseada = data.hora_deseada || '09:00';
const duracionHoras = Math.ceil((data.duracion_estimada || 60) / 60);
const senaCalculada = Math.round((data.precio || 0) * 0.3);
const fechaHoraCompleta = `${data.fecha_solicitada} ${horaDeseada}`;

// Formatear fecha para mensaje humano (ej: "miércoles 29 de enero")
const formatearFechaHumana = (fechaStr) => {
  if (!fechaStr) return 'fecha no especificada';
  const fecha = new Date(fechaStr + 'T12:00:00');
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
};

const fechaHumana = formatearFechaHumana(data.fecha_solicitada);
const servicioDisplay = data.servicio_detalle || data.servicio || 'servicio';

// ============================================================================
// CASO 1: FECHA DISPONIBLE - Crear turno
// ============================================================================
let instruccionTarea = '';
let jsonRespuestaEsperada = '';

if (data.fecha_disponible) {
  // Pre-construir el mensaje para la clienta (template)
  const mensajeClientaTemplate = `¡Listo ${data.nombre_clienta || 'reina'}! Tu turno de ${servicioDisplay.toLowerCase()} está reservado para el ${fechaHumana} a las ${horaDeseada}. Para confirmarlo, pagá la seña de $${senaCalculada.toLocaleString('es-AR')} en este link: {LINK_PAGO}`;

  instruccionTarea = `## ✅ FECHA DISPONIBLE - CREAR TURNO

### PASO 1: Llamar a la tool \`leraysi_crear_turno\`

Usar EXACTAMENTE estos parámetros:

\`\`\`json
{
  "clienta": "${data.nombre_clienta || ''}",
  "telefono": "${data.telefono || ''}",
  "servicio": "${data.servicio || 'otro'}",
  "fecha_hora": "${fechaHoraCompleta}",
  "precio": ${data.precio || 0},
  "duracion": ${duracionHoras},
  "lead_id": ${data.lead_id || 'null'}${data.email ? `,\n  "email": "${data.email}"` : ''}${data.servicio_detalle ? `,\n  "servicio_detalle": "${data.servicio_detalle}"` : ''}
}
\`\`\`

### PASO 2: Después de llamar la tool, responder con este JSON

Reemplazar los valores {ENTRE_LLAVES} con los datos de la respuesta de la tool:

\`\`\`json
{
  "estado": "turno_creado",
  "turno_id": {turnoId de la respuesta},
  "lead_id": ${data.lead_id || 'null'},
  "fecha_hora": "${fechaHoraCompleta}",
  "servicio": "${data.servicio || 'otro'}",
  "servicio_detalle": "${servicioDisplay}",
  "precio": ${data.precio || 0},
  "sena": {sena de la respuesta},
  "link_pago": "{link_pago de la respuesta}",
  "mensaje_para_clienta": "${mensajeClientaTemplate}"
}
\`\`\`

**IMPORTANTE:** En "mensaje_para_clienta", reemplazar {LINK_PAGO} con el link_pago real de la respuesta.`;

// ============================================================================
// CASO 2: FECHA NO DISPONIBLE - Responder alternativas
// ============================================================================
} else {
  const alternativasTexto = data.alternativas?.length > 0
    ? data.alternativas.map(a => `${a.nombre_dia} ${a.fecha}`).join(', ')
    : 'No hay disponibilidad esta semana';

  const alternativasArray = data.alternativas?.map(a => `"${a.nombre_dia} ${a.fecha}"`) || [];

  const mensajeClientaNoDisponible = `Disculpá, el ${fechaHumana} no tenemos disponibilidad (${(data.motivo_no_disponible || 'agenda completa').toLowerCase()}). Te puedo ofrecer: ${alternativasTexto}. ¿Cuál te queda mejor?`;

  instruccionTarea = `## ❌ FECHA NO DISPONIBLE

**NO llamar ninguna tool.**

Responder ÚNICAMENTE con este JSON (copiarlo exacto):

\`\`\`json
{
  "estado": "fecha_no_disponible",
  "fecha_solicitada": "${data.fecha_solicitada}",
  "motivo": "${data.motivo_no_disponible || 'Sin disponibilidad'}",
  "alternativas": [${alternativasArray.join(', ')}],
  "mensaje_para_clienta": "${mensajeClientaNoDisponible}"
}
\`\`\``;
}

// ============================================================================
// CONSTRUIR MENSAJE COMPLETO
// ============================================================================
const userMessage = `# SOLICITUD DE TURNO - Estilos Leraysi

## Datos de la Solicitud

| Campo | Valor |
|-------|-------|
| **Clienta** | ${data.nombre_clienta || 'No proporcionado'} |
| **Teléfono** | ${data.telefono || 'No proporcionado'} |
| **Email** | ${data.email || 'No proporcionado'} |
| **Lead ID** | ${data.lead_id || 'N/A'} |
| **Servicio** | ${servicioDisplay} |
| **Categoría** | ${data.categoria_servicio || 'No clasificado'} |
| **Duración** | ${data.duracion_estimada || 60} min (${duracionHoras}h) |
| **Precio** | $${(data.precio || 0).toLocaleString('es-AR')} |
| **Seña (30%)** | $${senaCalculada.toLocaleString('es-AR')} |
| **Fecha solicitada** | ${data.fecha_solicitada} (${fechaHumana}) |
| **Hora** | ${horaDeseada} |
| **Disponibilidad** | ${data.fecha_disponible ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'} |

## Disponibilidad de la Semana

${data.resumen_disponibilidad || 'No disponible'}

---

${instruccionTarea}`;

// ============================================================================
// RETORNAR
// ============================================================================
return [{
  json: {
    ...data,
    userMessage,
    // Datos pre-calculados para uso posterior
    _precalculado: {
      hora: horaDeseada,
      duracion_horas: duracionHoras,
      sena: senaCalculada,
      fecha_hora_completa: fechaHoraCompleta,
      fecha_humana: fechaHumana,
      servicio_display: servicioDisplay
    }
  }
}];
