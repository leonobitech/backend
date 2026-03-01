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

// Mapeo display name → código Odoo (determinístico, no depender del LLM)
const DISPLAY_TO_CODE = {
  'Corte mujer': 'corte_mujer',
  'Alisado brasileño': 'alisado_brasileno',
  'Alisado keratina': 'alisado_keratina',
  'Mechas completas': 'mechas_completas',
  'Tintura raíz': 'tintura_raiz',
  'Tintura completa': 'tintura_completa',
  'Balayage': 'balayage',
  'Manicura simple': 'manicura_simple',
  'Manicura semipermanente': 'manicura_semipermanente',
  'Pedicura': 'pedicura',
  'Depilación cera piernas': 'depilacion_cera_piernas',
  'Depilación cera axilas': 'depilacion_cera_axilas',
  'Depilación cera bikini': 'depilacion_cera_bikini',
  'Depilación láser piernas': 'depilacion_laser_piernas',
  'Depilación láser axilas': 'depilacion_laser_axilas',
};
// Precios base por servicio — safety net contra inconsistencia del LLM Master
// ParseInput calcula precio desde SERVICIOS_CONFIG pero se contamina si el LLM
// manda servicio/precio incorrectos. BuildAgentPrompt recalcula determinísticamente.
const SERVICIOS_PRECIO = {
  'Corte mujer': { precio_base: 8000, requiere_largo: true },
  'Alisado brasileño': { precio_base: 45000, requiere_largo: true },
  'Alisado keratina': { precio_base: 55000, requiere_largo: true },
  'Mechas completas': { precio_base: 35000, requiere_largo: true },
  'Tintura raíz': { precio_base: 15000, requiere_largo: true },
  'Tintura completa': { precio_base: 25000, requiere_largo: true },
  'Balayage': { precio_base: 50000, requiere_largo: true },
  'Manicura simple': { precio_base: 5000, requiere_largo: false },
  'Manicura semipermanente': { precio_base: 8000, requiere_largo: false },
  'Pedicura': { precio_base: 6000, requiere_largo: false },
  'Depilación cera piernas': { precio_base: 10000, requiere_largo: false },
  'Depilación cera axilas': { precio_base: 4000, requiere_largo: false },
  'Depilación cera bikini': { precio_base: 6000, requiere_largo: false },
  'Depilación láser piernas': { precio_base: 25000, requiere_largo: false },
  'Depilación láser axilas': { precio_base: 12000, requiere_largo: false },
};
const PRECIO_MULT_LARGO = { 'corto': 1.0, 'medio': 1.1, 'largo': 1.2, 'muy_largo': 1.2 };

function calcularPrecioDet(servicioNombre, largoCabello) {
  const config = SERVICIOS_PRECIO[servicioNombre];
  if (!config) return null;
  const mult = (config.requiere_largo && largoCabello) ? (PRECIO_MULT_LARGO[largoCabello] || 1.0) : 1.0;
  return Math.round(config.precio_base * mult);
}

// Convertir servicio(s) de display name a código Odoo
const servicioRaw = Array.isArray(data.servicio) ? data.servicio[0] : data.servicio;
const servicioCodigo = DISPLAY_TO_CODE[servicioRaw] || servicioRaw || 'otro';

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

// Detección explícita: priorizar flags del Master Agent
if (data.agregar_a_turno_existente && turnoIdExistente) {
  esAgregarServicio = true;
} else if (data.accion === "reprogramar") {
  esReprogramacion = true;
} else if (turnoExistente) {
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
    if (serviciosCoinciden) esReprogramacion = true;
    else if (!serviciosCoinciden && fechasCoinciden && turnoIdExistente)
      esAgregarServicio = true;
    else esTurnoAdicional = true;
  } else {
    esTurnoAdicional = true;
  }
}

// Complejidades para cálculos (scope global, usadas en instruccionTarea y _precalculado)
const _compNueva = data.complejidad_maxima || "media";
const _compExistente = data.turno_complejidad_existente || "media";

// Variables de agregar servicio — scope global para instruccionTarea Y _precalculado
const precioExistente = data.turno_precio_existente || 0;
const _serviciosArray = Array.isArray(data.servicio) ? data.servicio : [data.servicio];
const _servicioExistenteNorm = (data.turno_servicio_existente || "").toLowerCase().trim();
const servicioNuevo = _serviciosArray.find(
  (s) => s && s.toLowerCase().trim() !== _servicioExistenteNorm
) || _serviciosArray[_serviciosArray.length - 1] || "otro";
// SAFETY NET: precio del servicio nuevo calculado determinísticamente
const _precioDet = calcularPrecioDet(servicioNuevo, data.largo_cabello);
const precioNuevo = esAgregarServicio
  ? (_precioDet !== null ? _precioDet : (data.precio || 0))
  : (data.precio || 0);

let instruccionTarea = "";
let jsonRespuestaEsperada = "";

if (esReprogramacion && data.fecha_disponible) {
  const mensajeClientaReprogramado = `Listo ${data.nombre_clienta || "reina"}! Tu turno fue reprogramado para el ${fechaHumana} a las ${horaDeseada}. Te enviamos un email de confirmacion.`;
  instruccionTarea = `## REPROGRAMAR TURNO\n\n### PASO 1: Llamar a la tool \`leraysi_reprogramar_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "lead_id": ${data.lead_id || "null"},\n  "nueva_fecha_hora": "${fechaHoraCompleta}",\n  "motivo": "Solicitud de la clienta"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\nReemplazar los valores {ENTRE_LLAVES} con los datos de la respuesta de la tool:\n\n\`\`\`json\n{\n  "estado": "turno_reprogramado",\n  "odoo_turno_id": {turno_id_nuevo de la respuesta si existe, sino turno_id_anterior},\n  "turno_id_anterior": {turno_id_anterior de la respuesta},\n  "turno_id_nuevo": {turno_id_nuevo de la respuesta o null},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora_anterior": "{fecha_hora_anterior de la respuesta}",\n  "fecha_hora_nueva": "${fechaHoraCompleta}",\n  "servicio": "${servicioCodigo}",\n  "link_pago": "{link_pago de la respuesta si existe, o null}",\n  "mp_preference_id": "{mp_preference_id de la respuesta si existe, o null}",\n  "calendar_accept_url": "{calendar_accept_url de la respuesta si existe, o null}",\n  "mensaje_para_clienta": "${mensajeClientaReprogramado}"\n}\n\`\`\``;
} else if (esAgregarServicio && data.fecha_disponible) {
  // Detectar si la opción elegida es turno adicional (otra trabajadora, fila nueva)
  const opcionElegida = (data.opciones || data.slots_recomendados || [])[0];
  const trabajadoraExistente = (data.turno_trabajadora_existente || 'Leraysi').toLowerCase().trim();
  const trabajadoraOpcion = (opcionElegida?.trabajadora || '').toLowerCase().trim();
  const esTurnoAdicionalFlag = opcionElegida?.es_turno_adicional === true ||
    (trabajadoraOpcion && trabajadoraExistente && trabajadoraOpcion !== trabajadoraExistente);

  // precioExistente, precioNuevo, servicioNuevo ya en scope global
  const servicioNuevoCodigo = DISPLAY_TO_CODE[servicioNuevo] || servicioNuevo;
  const servicioExistenteDisplay = data.turno_servicio_existente || "servicio existente";

  if (esTurnoAdicionalFlag) {
    // ── TURNO ADICIONAL: otra trabajadora hace SOLO el servicio nuevo ──
    // Usar leraysi_crear_turno (crear fila nueva en Baserow, turno original intacto)
    const senaServicioNuevo = Math.round(precioNuevo * 0.3);
    const trabajadoraAdicional = opcionElegida?.trabajadora || 'Companera';
    // Hora interna: usar hora_inicio del slot (ej: 12:00 Compañera), NO hora_deseada (09:00 llegada)
    const horaInternaSlot = opcionElegida?.hora_inicio || horaDeseada;
    const fechaHoraInterna = `${fechaSoloParte} ${horaInternaSlot}`;
    // Hora cliente: para jornada completa usa hora de llegada (09:00), otros usan hora del slot
    const esJornadaCompleta = data.turno_complejidad_existente === 'muy_compleja';
    const horaClienteFacing = esJornadaCompleta ? (data.turno_hora_original || horaDeseada) : horaInternaSlot;
    const mensajeClientaTurnoAdicional = `Listo ${data.nombre_clienta || "reina"}! Agregamos ${servicioNuevo.toLowerCase()} a tu visita del ${fechaHumana} a las ${horaClienteFacing}. Sena: $${senaServicioNuevo.toLocaleString("es-AR")}. {LINK_PAGO_MSG}`;
    instruccionTarea = `## TURNO ADICIONAL — SERVICIO CON OTRA TRABAJADORA\n\nLa clienta ya tiene turno de ${servicioExistenteDisplay} con ${data.turno_trabajadora_existente || 'Leraysi'}. El nuevo servicio lo hace ${trabajadoraAdicional}.\n\n### PASO 1: Llamar a la tool \`leraysi_crear_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "clienta": "${data.nombre_clienta || ""}",\n  "telefono": "${data.telefono || ""}",\n  "servicio": "${servicioNuevoCodigo}",\n  "fecha_hora": "${fechaHoraInterna}",\n  "precio": ${precioNuevo},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "lead_id": ${data.lead_id || "null"},\n  "es_turno_adicional": true${data.email ? `,\n  "email": "${data.email}"` : ""}${`,\n  "servicio_detalle": "${servicioNuevo}"`}\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "estado": "turno_adicional_creado",\n  "turno_id": {turnoId de la respuesta},\n  "turno_id_padre": ${turnoIdExistente},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora": "${fechaHoraInterna}",\n  "servicio": "${servicioNuevoCodigo}",\n  "servicio_detalle": "${servicioNuevo}",\n  "trabajadora": "${trabajadoraAdicional}",\n  "precio": ${precioNuevo},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "sena": {sena de la respuesta},\n  "link_pago": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "mensaje_para_clienta": "${mensajeClientaTurnoAdicional}"\n}\n\`\`\``;
  } else {
    // ── AGREGAR SERVICIO MISMA TRABAJADORA: bloque combinado (UPDATE fila existente) ──
    const precioTotal = precioExistente + precioNuevo;
    const senaTotalCalculada = Math.round(precioTotal * 0.3);
    const senaPagadaExistente = data.turno_sena_pagada || Math.round(precioExistente * 0.3);
    const senaDiferencial = senaTotalCalculada - senaPagadaExistente;
    const duracionExistente = data.turno_duracion_existente || 0;
    const duracionNueva = data.duracion_estimada || 60;
    const duracionCombinada = (_compNueva === "muy_compleja" || _compExistente === "muy_compleja")
      ? 600 : duracionExistente + duracionNueva;
    const COMPLEJIDAD_ORDER = { simple: 1, media: 2, compleja: 3, muy_compleja: 4 };
    const ORDER_TO_COMP = { 1: 'simple', 2: 'media', 3: 'compleja', 4: 'muy_compleja' };
    const complejidadExistente = data.turno_complejidad_existente || "media";
    const complejidadNueva = data.complejidad_maxima || "media";
    const _existSvcs = (data.turno_servicio_existente || "").split(" + ").filter(s => s.trim());
    const _newSvcs = Array.isArray(data.servicio) ? data.servicio : [data.servicio].filter(Boolean);
    const _totalCount = _existSvcs.length + _newSvcs.length;
    let _floorComp = 'simple';
    if (_totalCount >= 3) _floorComp = 'muy_compleja';
    else if (_totalCount >= 2) _floorComp = 'compleja';
    const complejidadCombinada = ORDER_TO_COMP[Math.max(
      COMPLEJIDAD_ORDER[complejidadExistente] || 2,
      COMPLEJIDAD_ORDER[complejidadNueva] || 2,
      COMPLEJIDAD_ORDER[_floorComp] || 1
    )] || "media";
    const serviciosCombinados = `${servicioExistenteDisplay} + ${servicioNuevo}`;
    const mensajeClientaAgregado = `Listo ${data.nombre_clienta || "reina"}! Actualice tu turno del ${fechaHumana} a las ${horaDeseada}. Ahora tenes: ${serviciosCombinados}. Total: $${precioTotal.toLocaleString("es-AR")}. Sena adicional a pagar: $${senaDiferencial.toLocaleString("es-AR")}. {LINK_PAGO_MSG}`;
    instruccionTarea = `## AGREGAR SERVICIO AL TURNO EXISTENTE\n\n### PASO 1: Llamar a la tool \`leraysi_agregar_servicio_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "turno_id": ${turnoIdExistente},\n  "nuevo_servicio": "${servicioNuevoCodigo}",\n  "nuevo_servicio_detalle": "${servicioNuevo}",\n  "nuevo_precio": ${precioNuevo},\n  "duracion_estimada": ${duracionCombinada},\n  "complejidad_maxima": "${complejidadCombinada}",\n  "nueva_hora": "${horaDeseada}"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "estado": "servicio_agregado",\n  "turno_id": ${turnoIdExistente},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora": "${fechaHoraCompleta}",\n  "servicios_combinados": "{servicio_detalle de la respuesta}",\n  "precio_total": {precio_total de la respuesta},\n  "duracion_estimada": ${duracionCombinada},\n  "complejidad_maxima": "${complejidadCombinada}",\n  "sena": {sena de la respuesta},\n  "link_pago": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "mensaje_para_clienta": "${mensajeClientaAgregado}"\n}\n\`\`\``;
  }
} else if (data.fecha_disponible) {
  const mensajeClientaTemplate = `Listo ${data.nombre_clienta || "reina"}! Tu turno de ${servicioDisplay.toLowerCase()} esta reservado para el ${fechaHumana} a las ${horaDeseada}. Para confirmarlo, paga la sena de $${senaCalculada.toLocaleString("es-AR")} en este link: {LINK_PAGO}. Tenes 15 minutos para abonar, despues el link expira y se libera el turno.`;
  instruccionTarea = `## FECHA DISPONIBLE - CREAR TURNO\n\n### PASO 1: Llamar a la tool \`leraysi_crear_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "clienta": "${data.nombre_clienta || ""}",\n  "telefono": "${data.telefono || ""}",\n  "servicio": "${servicioCodigo}",\n  "fecha_hora": "${fechaHoraCompleta}",\n  "precio": ${data.precio || 0},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "lead_id": ${data.lead_id || "null"}${data.email ? `,\n  "email": "${data.email}"` : ""}${data.servicio_detalle ? `,\n  "servicio_detalle": "${data.servicio_detalle}"` : ""}\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "estado": "turno_creado",\n  "turno_id": {turnoId de la respuesta},\n  "lead_id": ${data.lead_id || "null"},\n  "fecha_hora": "${fechaHoraCompleta}",\n  "servicio": "${servicioCodigo}",\n  "servicio_detalle": "${servicioDisplay}",\n  "precio": ${data.precio || 0},\n  "duracion_estimada": ${data.duracion_estimada || 60},\n  "complejidad_maxima": "${data.complejidad_maxima || "media"}",\n  "sena": {sena de la respuesta},\n  "link_pago": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "mensaje_para_clienta": "${mensajeClientaTemplate}"\n}\n\`\`\`\n\n**IMPORTANTE:** En mensaje_para_clienta, reemplazar {LINK_PAGO} con el link_pago real de la respuesta.`;
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
      _precalculado: (() => {
        // Detectar turno adicional para usar valores SOLO del servicio nuevo
        const _opcion = (data.opciones || data.slots_recomendados || [])[0];
        const _trabExist = (data.turno_trabajadora_existente || 'Leraysi').toLowerCase().trim();
        const _trabOpcion = (_opcion?.trabajadora || '').toLowerCase().trim();
        const _esTurnoAdicional = esAgregarServicio && (
          _opcion?.es_turno_adicional === true ||
          (_trabOpcion && _trabExist && _trabOpcion !== _trabExist)
        );

        if (_esTurnoAdicional) {
          // TURNO ADICIONAL: hora interna del slot (ej: 12:00), NO hora de llegada (09:00)
          const _horaSlot = _opcion?.hora_inicio || horaDeseada;
          return {
            hora: _horaSlot,
            duracion_estimada: data.duracion_estimada || 60,
            complejidad_maxima: data.complejidad_maxima || "media",
            sena: Math.round(precioNuevo * 0.3),
            fecha_hora_completa: `${fechaSoloParte} ${_horaSlot}`,
            fecha_humana: fechaHumana,
            servicio_display: servicioDisplay,
            trabajadora: _opcion?.trabajadora || 'Companera',
            es_turno_adicional: true,
            turno_id_padre: turnoIdExistente,
          };
        }

        // AGREGAR SERVICIO misma trabajadora o TURNO NUEVO/REPROGRAMAR
        return {
          hora: horaDeseada,
          duracion_estimada: esAgregarServicio
            ? ((_compNueva === "muy_compleja" || _compExistente === "muy_compleja") ? 600 : (data.turno_duracion_existente || 0) + (data.duracion_estimada || 60))
            : (data.duracion_estimada || 60),
          complejidad_maxima: esAgregarServicio
            ? (() => {
                const ORD = { simple: 1, media: 2, compleja: 3, muy_compleja: 4 };
                const ORD_R = { 1: 'simple', 2: 'media', 3: 'compleja', 4: 'muy_compleja' };
                const ex = data.turno_complejidad_existente || "media";
                const nw = data.complejidad_maxima || "media";
                const eSvcs = (data.turno_servicio_existente || "").split(" + ").filter(s => s.trim());
                const nSvcs = Array.isArray(data.servicio) ? data.servicio : [data.servicio].filter(Boolean);
                const tot = eSvcs.length + nSvcs.length;
                let fl = 'simple';
                if (tot >= 3) fl = 'muy_compleja';
                else if (tot >= 2) fl = 'compleja';
                return ORD_R[Math.max(ORD[ex] || 2, ORD[nw] || 2, ORD[fl] || 1)] || "media";
              })()
            : (data.complejidad_maxima || "media"),
          sena: esAgregarServicio
            ? Math.round((precioExistente + precioNuevo) * 0.3)
            : senaCalculada,
          fecha_hora_completa: fechaHoraCompleta,
          fecha_humana: fechaHumana,
          servicio_display: servicioDisplay,
          trabajadora: (data.opciones || data.slots_recomendados || [])[0]?.trabajadora || data.turno_trabajadora_existente || 'Leraysi',
        };
      })(),
    },
  },
];
