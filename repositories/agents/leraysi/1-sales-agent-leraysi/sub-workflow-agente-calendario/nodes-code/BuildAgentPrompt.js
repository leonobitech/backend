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
// Extraer fecha y hora de fecha_solicitada (soporta ISO "2026-01-26T16:00:00" o "2026-01-26 16:00")
const fechaSolicitadaRaw = data.fecha_solicitada || '';
const fechaSoloParte = fechaSolicitadaRaw.includes('T')
  ? fechaSolicitadaRaw.split('T')[0]
  : fechaSolicitadaRaw.split(' ')[0];
const horaSolicitadaParte = fechaSolicitadaRaw.includes('T')
  ? fechaSolicitadaRaw.split('T')[1]?.slice(0, 5)
  : fechaSolicitadaRaw.split(' ')[1]?.slice(0, 5);

// Usar hora de la fecha solicitada, o la hora_deseada del input, o default 09:00
const horaDeseada = horaSolicitadaParte || data.hora_deseada || '09:00';
const duracionHoras = Math.ceil((data.duracion_estimada || 60) / 60);
const senaCalculada = Math.round((data.precio || 0) * 0.3);
// Formato correcto: "2026-01-26 16:00" (fecha espacio hora)
const fechaHoraCompleta = `${fechaSoloParte} ${horaDeseada}`;

// Formatear fecha para mensaje humano (ej: "miércoles 29 de enero")
const formatearFechaHumana = (fechaStr) => {
  if (!fechaStr) return 'fecha no especificada';
  // Extraer solo la parte de la fecha si viene con hora
  const soloFecha = fechaStr.includes('T')
    ? fechaStr.split('T')[0]
    : fechaStr.split(' ')[0];
  const fecha = new Date(soloFecha + 'T12:00:00');
  if (isNaN(fecha.getTime())) return 'fecha inválida';
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
};

const fechaHumana = formatearFechaHumana(data.fecha_solicitada);
const servicioDisplay = data.servicio_detalle || data.servicio || 'servicio';

// ============================================================================
// DETECTAR SI ES REPROGRAMACIÓN O TURNO NUEVO ADICIONAL
// ============================================================================
// Lógica:
// - Si NO hay turno agendado → CREAR NUEVO
// - Si hay turno agendado y el servicio es IGUAL → REPROGRAMAR
// - Si hay turno agendado y el servicio es DIFERENTE → CREAR NUEVO (adicional)
//
// El campo turno_servicio_existente debe venir de GetTurnosSemana
// ============================================================================

const turnoExistente = data.turno_agendado === true;

// Normalizar servicios solicitados (puede venir como array o string)
const serviciosSolicitados = Array.isArray(data.servicio)
  ? data.servicio.map(s => s.toLowerCase().trim())
  : [(data.servicio || '').toLowerCase().trim()];
const servicioSolicitado = serviciosSolicitados[0] || '';

// Servicio del turno existente (pasado desde GetTurnosSemana o el state)
// Puede venir como string directo o como objeto {value: "..."}
let servicioTurnoExistente = null;
if (data.turno_servicio_existente) {
  servicioTurnoExistente = typeof data.turno_servicio_existente === 'object'
    ? (data.turno_servicio_existente.value || '').toLowerCase().trim()
    : data.turno_servicio_existente.toLowerCase().trim();
}

// Determinar si es reprogramación, agregar servicio, o turno adicional
let esReprogramacion = false;
let esAgregarServicio = false;
let esTurnoAdicional = false;

// Extraer fecha del turno existente para comparar
const turnoFechaExistente = data.turno_fecha
  ? (data.turno_fecha.includes('T') ? data.turno_fecha.split('T')[0] : data.turno_fecha.split(' ')[0])
  : null;

// ID del turno existente (para agregar servicio)
const turnoIdExistente = data.turno_id_existente || data.odoo_turno_id || null;

if (turnoExistente) {
  if (servicioTurnoExistente) {
    // Comparar servicios - detectar si hay servicios NUEVOS que no están en el existente
    const servicioExistenteNorm = servicioTurnoExistente.toLowerCase().trim();

    // Verificar si algún servicio solicitado es diferente al existente
    const tieneServicioNuevo = serviciosSolicitados.some(s =>
      !s.includes(servicioExistenteNorm) && !servicioExistenteNorm.includes(s)
    );

    // Si TODOS los servicios coinciden con el existente, es el mismo servicio
    const serviciosCoinciden = !tieneServicioNuevo;

    // Comparar fechas - si son diferentes, es turno adicional aunque el servicio sea igual
    const fechasCoinciden = turnoFechaExistente && fechaSoloParte &&
                            turnoFechaExistente === fechaSoloParte;

    // Caso 1: Mismo servicio Y misma fecha → REPROGRAMAR (solo cambio de hora)
    if (serviciosCoinciden && fechasCoinciden) {
      esReprogramacion = true;
    }
    // Caso 2: Diferente servicio Y misma fecha → AGREGAR SERVICIO
    // (si tenemos turno_id_existente, agregamos al turno en vez de crear uno nuevo)
    else if (!serviciosCoinciden && fechasCoinciden && turnoIdExistente) {
      esAgregarServicio = true;
    }
    // Caso 3: Todo lo demás → TURNO ADICIONAL (nuevo turno)
    else {
      esTurnoAdicional = true;
    }
  } else {
    // No tenemos info del servicio existente - por defecto crear turno adicional
    esReprogramacion = false;
    esTurnoAdicional = true;
  }
}

// ============================================================================
// CASO 0: REPROGRAMAR TURNO EXISTENTE (mismo servicio)
// ============================================================================
let instruccionTarea = '';
let jsonRespuestaEsperada = '';

// Solo reprogramamos si es el MISMO servicio
// Si es servicio DIFERENTE, cae al CASO 1 (crear turno nuevo/adicional)
if (esReprogramacion && data.fecha_disponible) {
  const mensajeClientaReprogramado = `¡Listo ${data.nombre_clienta || 'reina'}! Tu turno fue reprogramado para el ${fechaHumana} a las ${horaDeseada}. Te enviamos un email de confirmación.`;

  instruccionTarea = `## 🔄 REPROGRAMAR TURNO

### PASO 1: Llamar a la tool \`leraysi_reprogramar_turno\`

Usar EXACTAMENTE estos parámetros:

\`\`\`json
{
  "lead_id": ${data.lead_id || 'null'},
  "nueva_fecha_hora": "${fechaHoraCompleta}",
  "motivo": "Solicitud de la clienta"
}
\`\`\`

### PASO 2: Después de llamar la tool, responder con este JSON

Reemplazar los valores {ENTRE_LLAVES} con los datos de la respuesta de la tool:

\`\`\`json
{
  "estado": "turno_reprogramado",
  "odoo_turno_id": {turno_id_nuevo de la respuesta si existe, sino turno_id_anterior},
  "turno_id_anterior": {turno_id_anterior de la respuesta},
  "turno_id_nuevo": {turno_id_nuevo de la respuesta o null},
  "lead_id": ${data.lead_id || 'null'},
  "fecha_hora_anterior": "{fecha_hora_anterior de la respuesta}",
  "fecha_hora_nueva": "${fechaHoraCompleta}",
  "servicio": "${data.servicio || 'otro'}",
  "link_pago": "{link_pago de la respuesta si existe, o null}",
  "mensaje_para_clienta": "${mensajeClientaReprogramado}"
}
\`\`\`

**IMPORTANTE:** El campo \`odoo_turno_id\` debe ser el ID del turno activo:
- Si la respuesta tiene \`turno_id_nuevo\` (caso pendiente_pago): usar ese valor
- Si \`turno_id_nuevo\` es null (caso confirmado): usar \`turno_id_anterior\`

**NOTA:** Si la respuesta incluye \`link_pago\`, actualizar el mensaje para incluir: "Necesitás pagar la nueva seña en: {link_pago}"`;

// ============================================================================
// CASO 0.5: AGREGAR SERVICIO AL TURNO EXISTENTE
// ============================================================================
// Cuando la clienta tiene un turno el mismo día y quiere agregar otro servicio
} else if (esAgregarServicio && data.fecha_disponible) {
  // Calcular totales combinados
  const precioExistente = data.turno_precio_existente || 0;
  const precioNuevo = data.precio || 0;
  const precioTotal = precioExistente + precioNuevo;
  const senaTotalCalculada = Math.round(precioTotal * 0.3);

  const servicioExistenteDisplay = data.turno_servicio_existente || 'servicio existente';
  const servicioNuevoDisplay = servicioDisplay;
  const serviciosCombinados = `${servicioExistenteDisplay} + ${servicioNuevoDisplay}`;

  const mensajeClientaAgregado = `¡Listo ${data.nombre_clienta || 'reina'}! Actualicé tu turno del ${fechaHumana}. Ahora tenés: ${serviciosCombinados}. Total: $${precioTotal.toLocaleString('es-AR')}. Seña actualizada: $${senaTotalCalculada.toLocaleString('es-AR')}. {LINK_PAGO_MSG}`;

  instruccionTarea = `## ➕ AGREGAR SERVICIO AL TURNO EXISTENTE

### PASO 1: Llamar a la tool \`leraysi_agregar_servicio_turno\`

Usar EXACTAMENTE estos parámetros:

\`\`\`json
{
  "turno_id": ${turnoIdExistente},
  "nuevo_servicio": "${data.servicio || 'otro'}",
  "nuevo_servicio_detalle": "${servicioNuevoDisplay}",
  "nuevo_precio": ${precioNuevo},
  "nueva_duracion": ${duracionHoras}
}
\`\`\`

### PASO 2: Después de llamar la tool, responder con este JSON

Reemplazar los valores {ENTRE_LLAVES} con los datos de la respuesta de la tool:

\`\`\`json
{
  "estado": "servicio_agregado",
  "turno_id": ${turnoIdExistente},
  "lead_id": ${data.lead_id || 'null'},
  "fecha_hora": "${fechaHoraCompleta}",
  "servicios_combinados": "{servicio_detalle de la respuesta}",
  "precio_total": {precio_total de la respuesta},
  "sena": {sena de la respuesta},
  "link_pago": "{link_pago de la respuesta}",
  "mensaje_para_clienta": "${mensajeClientaAgregado}"
}
\`\`\`

**IMPORTANTE:** En "mensaje_para_clienta":
- Si hay link_pago, reemplazar {LINK_PAGO_MSG} con: "Te actualicé el link de pago: {link_pago}"
- Si no hay link_pago, reemplazar {LINK_PAGO_MSG} con: ""`;

// ============================================================================
// CASO 1: FECHA DISPONIBLE - Crear turno nuevo
// ============================================================================
} else if (data.fecha_disponible) {
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
