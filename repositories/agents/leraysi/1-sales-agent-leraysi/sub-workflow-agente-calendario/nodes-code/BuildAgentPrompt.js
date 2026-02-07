// ============================================================================
// BUILD AGENT PROMPT - Construye el User Message para Agente Calendario
// ============================================================================
const data = $input.first().json;

const fechaSolicitadaRaw = data.fecha_solicitada || "";
const fechaSoloParte = fechaSolicitadaRaw.includes("T")
  ? fechaSolicitadaRaw.split("T")[0]
  : fechaSolicitadaRaw.split(" ")[0];
const horaSolicitadaParte = fechaSolicitadaRaw.includes("T")
  ? fechaSolicitadaRaw.split("T")[1]?.slice(0, 5)
  : fechaSolicitadaRaw.split(" ")[1]?.slice(0, 5);

const horaDeseada = horaSolicitadaParte || data.hora_deseada || "09:00";
const senaCalculada = Math.round((data.precio || 0) * 0.3);
const fechaHoraCompleta = `${fechaSoloParte} ${horaDeseada}`;

const formatearFechaHumana = (fechaStr) => {
  if (!fechaStr) return "fecha no especificada";
  const soloFecha = fechaStr.includes("T")
    ? fechaStr.split("T")[0]
    : fechaStr.split(" ")[0];
  const fecha = new Date(soloFecha + "T12:00:00");
  if (isNaN(fecha.getTime())) return "fecha invalida";
  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
  ];
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
};

const fechaHumana = formatearFechaHumana(data.fecha_solicitada);
const servicioDisplay = data.servicio_detalle || data.servicio || "servicio";

const turnoExistente = data.turno_agendado === true;
const serviciosSolicitados = Array.isArray(data.servicio)
  ? data.servicio.map((s) => s.toLowerCase().trim())
  : [(data.servicio || "").toLowerCase().trim()];

let servicioTurnoExistente = null;
if (data.turno_servicio_existente) {
  servicioTurnoExistente =
    typeof data.turno_servicio_existente === "object"
      ? (data.turno_servicio_existente.value || "").toLowerCase().trim()
      : data.turno_servicio_existente.toLowerCase().trim();
}

let esReprogramacion = false;
let esAgregarServicio = false;
let esTurnoAdicional = false;

const turnoFechaExistente = data.turno_fecha
  ? data.turno_fecha.includes("T")
    ? data.turno_fecha.split("T")[0]
    : data.turno_fecha.split(" ")[0]
  : null;
const turnoIdExistente = data.turno_id_existente || data.odoo_turno_id || null;

if (turnoExistente) {
  if (servicioTurnoExistente) {
    const servicioExistenteNorm = servicioTurnoExistente.toLowerCase().trim();
    const tieneServicioNuevo = serviciosSolicitados.some(
      (s) =>
        !s.includes(servicioExistenteNorm) &&
        !servicioExistenteNorm.includes(s),
    );
    const serviciosCoinciden = !tieneServicioNuevo;
    const fechasCoinciden =
      turnoFechaExistente &&
      fechaSoloParte &&
      turnoFechaExistente === fechaSoloParte;
    if (serviciosCoinciden && fechasCoinciden) esReprogramacion = true;
    else if (!serviciosCoinciden && fechasCoinciden && turnoIdExistente)
      esAgregarServicio = true;
    else esTurnoAdicional = true;
  } else {
    esTurnoAdicional = true;
  }
}

let instruccionTarea = "";
let jsonRespuestaEsperada = "";

if (esReprogramacion && data.fecha_disponible) {
  const mensajeClientaReprogramado = `Listo ${data.nombre_clienta || "reina"}! Tu turno fue reprogramado para el ${fechaHumana} a las ${horaDeseada}. Te enviamos un email de confirmacion.`;
  instruccionTarea = `## REPROGRAMAR TURNO\n\n### PASO 1: Llamar a la tool \`leraysi_reprogramar_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "lead_id": ${data.lead_id || "null"},\n  "nueva_fecha_hora": "${fechaHoraCompleta}",\n  "motivo": "Solicitud de la clienta"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\nReemplazar los valores {ENTRE_LLAVES} con los datos de la respuesta de la tool:\n\n\`\`\`json\n{\n  "estado": "turno_reprogramado",\n  "odoo_turno_id": {turno_id_nuevo de la respuesta si existe, sino turno_id_anterior},\n  "turno_id_anterior": {turno_id_anterior de la respuesta},\n  "turno_id_nuevo": {turno_id_nuevo de la respuesta o null},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora_anterior": "{fecha_hora_anterior de la respuesta}",\n  "fecha_hora_nueva": "${fechaHoraCompleta}",\n  "servicio": "${data.servicio || "otro"}",\n  "link_pago": "{link_pago de la respuesta si existe, o null}",\n  "mp_preference_id": "{mp_preference_id de la respuesta si existe, o null}",\n  "mensaje_para_clienta": "${mensajeClientaReprogramado}"\n}\n\`\`\``;
} else if (esAgregarServicio && data.fecha_disponible) {
  const precioExistente = data.turno_precio_existente || 0;
  const precioNuevo = data.precio || 0;
  const precioTotal = precioExistente + precioNuevo;
  const senaTotalCalculada = Math.round(precioTotal * 0.3);
  const servicioExistenteDisplay =
    data.turno_servicio_existente || "servicio existente";
  const serviciosArray = Array.isArray(data.servicio)
    ? data.servicio
    : [data.servicio];
  const servicioExistenteNorm = (data.turno_servicio_existente || "")
    .toLowerCase()
    .trim();
  const servicioNuevo =
    serviciosArray.find(
      (s) => s && s.toLowerCase().trim() !== servicioExistenteNorm,
    ) ||
    serviciosArray[serviciosArray.length - 1] ||
    "otro";
  const serviciosCombinados = `${servicioExistenteDisplay} + ${servicioNuevo}`;
  const mensajeClientaAgregado = `Listo ${data.nombre_clienta || "reina"}! Actualice tu turno del ${fechaHumana}. Ahora tenes: ${serviciosCombinados}. Total: $${precioTotal.toLocaleString("es-AR")}. Sena actualizada: $${senaTotalCalculada.toLocaleString("es-AR")}. {LINK_PAGO_MSG}`;
  instruccionTarea = `## AGREGAR SERVICIO AL TURNO EXISTENTE\n\n### PASO 1: Llamar a la tool \`leraysi_agregar_servicio_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "turno_id": ${turnoIdExistente},\n  "nuevo_servicio": "${servicioNuevo}",\n  "nuevo_servicio_detalle": "${servicioNuevo}",\n  "nuevo_precio": ${precioNuevo},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "estado": "servicio_agregado",\n  "turno_id": ${turnoIdExistente},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora": "${fechaHoraCompleta}",\n  "servicios_combinados": "{servicio_detalle de la respuesta}",\n  "precio_total": {precio_total de la respuesta},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "sena": {sena de la respuesta},\n  "link_pago": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "mensaje_para_clienta": "${mensajeClientaAgregado}"\n}\n\`\`\``;
} else if (data.fecha_disponible) {
  const mensajeClientaTemplate = `Listo ${data.nombre_clienta || "reina"}! Tu turno de ${servicioDisplay.toLowerCase()} esta reservado para el ${fechaHumana} a las ${horaDeseada}. Para confirmarlo, paga la sena de $${senaCalculada.toLocaleString("es-AR")} en este link: {LINK_PAGO}`;
  instruccionTarea = `## FECHA DISPONIBLE - CREAR TURNO\n\n### PASO 1: Llamar a la tool \`leraysi_crear_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "clienta": "${data.nombre_clienta || ""}",\n  "telefono": "${data.telefono || ""}",\n  "servicio": "${data.servicio || "otro"}",\n  "fecha_hora": "${fechaHoraCompleta}",\n  "precio": ${data.precio || 0},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "lead_id": ${data.lead_id || "null"}${data.email ? `,\n  "email": "${data.email}"` : ""}${data.servicio_detalle ? `,\n  "servicio_detalle": "${data.servicio_detalle}"` : ""}\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "estado": "turno_creado",\n  "turno_id": {turnoId de la respuesta},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora": "${fechaHoraCompleta}",\n  "servicio": "${data.servicio || "otro"}",\n  "servicio_detalle": "${servicioDisplay}",\n  "precio": ${data.precio || 0},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "sena": {sena de la respuesta},\n  "link_pago": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "mensaje_para_clienta": "${mensajeClientaTemplate}"\n}\n\`\`\`\n\n**IMPORTANTE:** En mensaje_para_clienta, reemplazar {LINK_PAGO} con el link_pago real de la respuesta.`;
} else {
  const alternativasTexto =
    data.alternativas?.length > 0
      ? data.alternativas.map((a) => `${a.nombre_dia} ${a.fecha}`).join(", ")
      : "No hay disponibilidad esta semana";
  const alternativasArray =
    data.alternativas?.map((a) => `"${a.nombre_dia} ${a.fecha}"`) || [];
  const mensajeClientaNoDisponible = `Disculpa, el ${fechaHumana} no tenemos disponibilidad (${(data.motivo_no_disponible || "agenda completa").toLowerCase()}). Te puedo ofrecer: ${alternativasTexto}. Cual te queda mejor?`;
  instruccionTarea = `## FECHA NO DISPONIBLE\n\n**NO llamar ninguna tool.**\n\nResponder UNICAMENTE con este JSON:\n\n\`\`\`json\n{\n  "estado": "fecha_no_disponible",\n  "fecha_solicitada": "${data.fecha_solicitada}",\n  "motivo": "${data.motivo_no_disponible || "Sin disponibilidad"}",\n  "alternativas": [${alternativasArray.join(", ")}],\n  "mensaje_para_clienta": "${mensajeClientaNoDisponible}"\n}\n\`\`\``;
}

const userMessage = `# SOLICITUD DE TURNO - Estilos Leraysi\n\n## Datos de la Solicitud\n\n| Campo | Valor |\n|-------|-------|\n| **Clienta** | ${data.nombre_clienta || "No proporcionado"} |\n| **Telefono** | ${data.telefono || "No proporcionado"} |\n| **Email** | ${data.email || "No proporcionado"} |\n| **Lead ID** | ${data.lead_id || "N/A"} |\n| **Servicio** | ${servicioDisplay} |\n| **Complejidad** | ${data.complejidad_maxima || "media"} |\n| **Duracion** | ${data.duracion_estimada || 60} min |\n| **Precio** | $${(data.precio || 0).toLocaleString("es-AR")} |\n| **Sena (30%)** | $${senaCalculada.toLocaleString("es-AR")} |\n| **Fecha solicitada** | ${data.fecha_solicitada} (${fechaHumana}) |\n| **Hora** | ${horaDeseada} |\n| **Disponibilidad** | ${data.fecha_disponible ? "DISPONIBLE" : "NO DISPONIBLE"} |\n\n## Disponibilidad de la Semana\n\n${data.resumen_disponibilidad || "No disponible"}\n\n---\n\n${instruccionTarea}`;

return [
  {
    json: {
      ...data,
      userMessage,
      _precalculado: {
        hora: horaDeseada,
        duracion_estimada: data.duracion_estimada || 60,
        complejidad_maxima: data.complejidad_maxima || "media",
        sena: senaCalculada,
        fecha_hora_completa: fechaHoraCompleta,
        fecha_humana: fechaHumana,
        servicio_display: servicioDisplay,
      },
    },
  },
];
