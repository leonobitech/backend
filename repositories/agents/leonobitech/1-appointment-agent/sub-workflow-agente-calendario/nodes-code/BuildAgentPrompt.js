// ============================================================================
// BUILD AGENT PROMPT - Builds User Message for Calendar Agent
// ============================================================================
const data = $input.first().json;

// ============================================================================
// WORKER CONFIGURATION — Multi-tenant via environment variables
// ============================================================================
const WORKERS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
};
const WORKER_DISPLAY = {
  primary: $env.WORKER_PRIMARY_NAME || 'Estilista 1',
  secondary: $env.WORKER_SECONDARY_NAME || 'Estilista 2',
};
function getWorkerDisplay(worker) {
  return WORKER_DISPLAY[worker] || worker;
}

// ============================================================================
// SERVICE AND PRICE LOOKUPS
// ============================================================================
const requestedDateRaw = data.requested_date || "";
const datePart = requestedDateRaw.includes("T")
  ? requestedDateRaw.split("T")[0]
  : requestedDateRaw.split(" ")[0];
const timePart = requestedDateRaw.includes("T")
  ? requestedDateRaw.split("T")[1]?.slice(0, 5)
  : requestedDateRaw.split(" ")[1]?.slice(0, 5);

const requestedTime = timePart || data.requested_time || "09:00";
const depositCalculated = Math.round((data.price || 0) * 0.3);
const fullDatetime = `${datePart} ${requestedTime}`;

// Display name → Odoo code mapping (deterministic, don't rely on LLM)
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

// Base prices per service — safety net against LLM price inconsistency
const SERVICES_PRICE = {
  'Corte mujer': { base_price: 8000, requires_length: true },
  'Alisado brasileño': { base_price: 45000, requires_length: true },
  'Alisado keratina': { base_price: 55000, requires_length: true },
  'Mechas completas': { base_price: 35000, requires_length: true },
  'Tintura raíz': { base_price: 15000, requires_length: true },
  'Tintura completa': { base_price: 25000, requires_length: true },
  'Balayage': { base_price: 50000, requires_length: true },
  'Manicura simple': { base_price: 5000, requires_length: false },
  'Manicura semipermanente': { base_price: 8000, requires_length: false },
  'Pedicura': { base_price: 6000, requires_length: false },
  'Depilación cera piernas': { base_price: 10000, requires_length: false },
  'Depilación cera axilas': { base_price: 4000, requires_length: false },
  'Depilación cera bikini': { base_price: 6000, requires_length: false },
  'Depilación láser piernas': { base_price: 25000, requires_length: false },
  'Depilación láser axilas': { base_price: 12000, requires_length: false },
};
const PRICE_MULT_LENGTH = { 'corto': 1.0, 'medio': 1.1, 'largo': 1.2, 'muy_largo': 1.2 };

function calculatePriceDet(serviceName, hairLength) {
  const config = SERVICES_PRICE[serviceName];
  if (!config) return null;
  const mult = (config.requires_length && hairLength) ? (PRICE_MULT_LENGTH[hairLength] || 1.0) : 1.0;
  return Math.round(config.base_price * mult);
}

// Convert service display name(s) to Odoo code
const serviceRaw = Array.isArray(data.service) ? data.service[0] : data.service;
const serviceCode = DISPLAY_TO_CODE[serviceRaw] || serviceRaw || 'otro';

const formatHumanDate = (dateStr) => {
  if (!dateStr) return "fecha no especificada";
  const onlyDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.split(" ")[0];
  const date = new Date(onlyDate + "T12:00:00");
  if (isNaN(date.getTime())) return "fecha invalida";
  const days = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
};

const humanDate = formatHumanDate(data.requested_date);
const serviceDisplay = data.service_detail || data.service || "servicio";

const hasExistingBooking = data.booking_scheduled === true;
const requestedServices = Array.isArray(data.service)
  ? data.service.map((s) => s.toLowerCase().trim())
  : [(data.service || "").toLowerCase().trim()];

let existingServiceName = null;
if (data.existing_service) {
  existingServiceName =
    typeof data.existing_service === "object"
      ? (data.existing_service.value || "").toLowerCase().trim()
      : data.existing_service.toLowerCase().trim();
}

let isReschedule = false;
let isAddService = false;
let isAdditionalBooking = false;

const existingBookingDate = data.booking_date
  ? data.booking_date.includes("T")
    ? data.booking_date.split("T")[0]
    : data.booking_date.split(" ")[0]
  : null;
const existingBookingId = data.existing_booking_id || data.odoo_booking_id || null;

// Explicit detection: prioritize Master Agent flags
if (data.add_to_existing_booking && existingBookingId) {
  isAddService = true;
} else if (data.action === "reprogramar" || data.action === "reschedule") {
  isReschedule = true;
} else if (hasExistingBooking) {
  if (existingServiceName) {
    const existingNorm = existingServiceName.toLowerCase().trim();
    const hasNewService = requestedServices.some(
      (s) => !s.includes(existingNorm) && !existingNorm.includes(s),
    );
    const servicesMatch = !hasNewService;
    const datesMatch = existingBookingDate && datePart && existingBookingDate === datePart;
    if (servicesMatch) isReschedule = true;
    else if (!servicesMatch && datesMatch && existingBookingId) isAddService = true;
    else isAdditionalBooking = true;
  } else {
    isAdditionalBooking = true;
  }
}

// Complexities for calculations (global scope)
const _compNew = data.max_complexity || "medium";
const _compExisting = data.existing_complexity || "medium";

// Add service variables — global scope
const existingPrice = data.existing_booking_price || 0;
const _servicesArray = Array.isArray(data.service) ? data.service : [data.service];
const _existingServiceNorm = (data.existing_service || "").toLowerCase().trim();
const newServiceName = _servicesArray.find(
  (s) => s && s.toLowerCase().trim() !== _existingServiceNorm
) || _servicesArray[_servicesArray.length - 1] || "otro";
const _priceDet = calculatePriceDet(newServiceName, data.hair_length);
const newPrice = isAddService
  ? (_priceDet !== null ? _priceDet : (data.price || 0))
  : (data.price || 0);

let taskInstruction = "";

if (isReschedule && data.date_available) {
  const clientMsg = `Listo ${data.client_name || "reina"}! Tu turno fue reprogramado para el ${humanDate} a las ${requestedTime}. Te enviamos un email de confirmacion.`;
  taskInstruction = `## REPROGRAMAR TURNO\n\n### PASO 1: Llamar a la tool \`leraysi_reprogramar_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "lead_id": ${data.lead_id || "null"},\n  "nueva_fecha_hora": "${fullDatetime}",\n  "motivo": "Solicitud de la clienta"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "status": "booking_rescheduled",\n  "odoo_booking_id": {turno_id_nuevo de la respuesta si existe, sino turno_id_anterior},\n  "previous_booking_id": {turno_id_anterior de la respuesta},\n  "new_booking_id": {turno_id_nuevo de la respuesta o null},\n  "lead_id": ${data.lead_id || "null"},\n  "previous_datetime": "{fecha_hora_anterior de la respuesta}",\n  "new_datetime": "${fullDatetime}",\n  "service": "${serviceCode}",\n  "payment_link": "{link_pago de la respuesta si existe, o null}",\n  "mp_preference_id": "{mp_preference_id de la respuesta si existe, o null}",\n  "calendar_accept_url": "{calendar_accept_url de la respuesta si existe, o null}",\n  "client_message": "${clientMsg}"\n}\n\`\`\``;
} else if (isAddService && data.date_available) {
  const selectedOption = (data.options || data.recommended_slots || [])[0];
  const existingWorkerName = (data.existing_worker || WORKERS.PRIMARY).toLowerCase().trim();
  const optionWorker = (selectedOption?.worker || '').toLowerCase().trim();
  const _isAdditionalDetected = selectedOption?.is_additional_booking === true ||
    (optionWorker && existingWorkerName && optionWorker !== existingWorkerName);
  const forceAdditional = _compExisting === "very_complex" || _compNew === "very_complex";
  const isAdditionalFlag = _isAdditionalDetected || forceAdditional;

  const newServiceCode = DISPLAY_TO_CODE[newServiceName] || newServiceName;
  const existingServiceDisplay = data.existing_service || "servicio existente";

  if (isAdditionalFlag && _isAdditionalDetected) {
    // ── ADDITIONAL BOOKING: DIFFERENT WORKER ──
    const depositNew = Math.round(newPrice * 0.3);
    const additionalWorker = selectedOption?.worker || WORKERS.SECONDARY;
    const slotTime = selectedOption?.start_time || requestedTime;
    const slotDatetime = `${datePart} ${slotTime}`;
    const isFullDay = data.existing_complexity === 'very_complex';
    const clientFacingTime = isFullDay ? (data.existing_time || requestedTime) : slotTime;
    const clientMsg = `Listo ${data.client_name || "reina"}! Agregamos ${newServiceName.toLowerCase()} a tu visita del ${humanDate} a las ${clientFacingTime}. Sena: $${depositNew.toLocaleString("es-AR")}. {LINK_PAGO_MSG}`;
    taskInstruction = `## TURNO ADICIONAL — SERVICIO CON OTRA TRABAJADORA\n\nLa clienta ya tiene turno de ${existingServiceDisplay} con ${getWorkerDisplay(data.existing_worker || WORKERS.PRIMARY)}. El nuevo servicio lo hace ${getWorkerDisplay(additionalWorker)}.\n\n### PASO 1: Llamar a la tool \`leraysi_crear_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "clienta": "${data.client_name || ""}",\n  "telefono": "${data.phone || ""}",\n  "servicio": "${newServiceCode}",\n  "fecha_hora": "${slotDatetime}",\n  "precio": ${newPrice},\n  "duracion_estimada": ${data.estimated_duration || 60},\n  "complejidad_maxima": "${data.max_complexity || "medium"}",\n  "lead_id": ${data.lead_id || "null"},\n  "es_turno_adicional": true${data.email ? `,\n  "email": "${data.email}"` : ""}${`,\n  "servicio_detalle": "${newServiceName}"`}\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "status": "additional_booking_created",\n  "booking_id": {turnoId de la respuesta},\n  "parent_booking_id": ${existingBookingId},\n  "lead_id": ${data.lead_id || "null"},\n  "datetime": "${slotDatetime}",\n  "service": "${newServiceCode}",\n  "service_detail": "${newServiceName}",\n  "worker": "${additionalWorker}",\n  "price": ${newPrice},\n  "estimated_duration": ${data.estimated_duration || 60},\n  "max_complexity": "${data.max_complexity || "medium"}",\n  "deposit": {sena de la respuesta},\n  "payment_link": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "client_message": "${clientMsg}"\n}\n\`\`\``;
  } else if (isAdditionalFlag && !_isAdditionalDetected) {
    // ── SAME WORKER + FULL DAY ──
    const depositNew = Math.round(newPrice * 0.3);
    const sameWorker = selectedOption?.worker || data.existing_worker || WORKERS.PRIMARY;
    const slotTime = selectedOption?.start_time || requestedTime;
    const slotDatetime = `${datePart} ${slotTime}`;
    const clientFacingTime = data.existing_time || requestedTime;
    const clientMsg = `Listo ${data.client_name || "reina"}! Agregamos ${newServiceName.toLowerCase()} a tu visita del ${humanDate} a las ${clientFacingTime}. Sena: $${depositNew.toLocaleString("es-AR")}. {LINK_PAGO_MSG}`;
    taskInstruction = `## AGREGAR SERVICIO — MISMA TRABAJADORA (JORNADA COMPLETA)\n\nLa clienta ya tiene turno de ${existingServiceDisplay} con ${getWorkerDisplay(sameWorker)}. Agregamos ${newServiceName} al mismo turno.\n\n### PASO 1: Llamar a la tool \`leraysi_agregar_servicio_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "turno_id": ${existingBookingId},\n  "nuevo_servicio": "${newServiceCode}",\n  "nuevo_servicio_detalle": "${newServiceName}",\n  "nuevo_precio": ${newPrice},\n  "duracion_estimada": ${data.estimated_duration || 60},\n  "complejidad_maxima": "${data.max_complexity || "medium"}",\n  "nueva_hora": "${slotTime}"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "status": "additional_booking_created",\n  "booking_id": ${existingBookingId},\n  "parent_booking_id": ${existingBookingId},\n  "lead_id": ${data.lead_id || "null"},\n  "datetime": "${slotDatetime}",\n  "service": "${newServiceCode}",\n  "service_detail": "${newServiceName}",\n  "worker": "${sameWorker}",\n  "price": ${newPrice},\n  "estimated_duration": ${data.estimated_duration || 60},\n  "max_complexity": "${data.max_complexity || "medium"}",\n  "deposit": {sena de la respuesta},\n  "payment_link": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "client_message": "${clientMsg}"\n}\n\`\`\``;
  } else {
    // ── ADD SERVICE SAME WORKER: combined block ──
    const totalPrice = existingPrice + newPrice;
    const totalDeposit = Math.round(totalPrice * 0.3);
    const existingDepositPaid = data.existing_deposit || Math.round(existingPrice * 0.3);
    const differentialDeposit = totalDeposit - existingDepositPaid;
    const existDuration = data.existing_duration || 0;
    const newDuration = data.estimated_duration || 60;
    const combinedDuration = (_compNew === "very_complex" || _compExisting === "very_complex")
      ? 600 : existDuration + newDuration;
    const COMP_ORDER = { simple: 1, medium: 2, complex: 3, very_complex: 4 };
    const ORDER_TO_COMP = { 1: 'simple', 2: 'medium', 3: 'complex', 4: 'very_complex' };
    const _existSvcs = (data.existing_service || "").split(" + ").filter(s => s.trim());
    const _newSvcs = Array.isArray(data.service) ? data.service : [data.service].filter(Boolean);
    const _totalCount = _existSvcs.length + _newSvcs.length;
    let _floorComp = 'simple';
    if (_totalCount >= 3) _floorComp = 'very_complex';
    else if (_totalCount >= 2) _floorComp = 'complex';
    const combinedComplexity = ORDER_TO_COMP[Math.max(
      COMP_ORDER[_compExisting] || 2,
      COMP_ORDER[_compNew] || 2,
      COMP_ORDER[_floorComp] || 1
    )] || "medium";
    const combinedServices = `${existingServiceDisplay} + ${newServiceName}`;
    const clientMsg = `Listo ${data.client_name || "reina"}! Actualice tu turno del ${humanDate} a las ${requestedTime}. Ahora tenes: ${combinedServices}. Total: $${totalPrice.toLocaleString("es-AR")}. Sena adicional a pagar: $${differentialDeposit.toLocaleString("es-AR")}. {LINK_PAGO_MSG}`;
    taskInstruction = `## AGREGAR SERVICIO AL TURNO EXISTENTE\n\n### PASO 1: Llamar a la tool \`leraysi_agregar_servicio_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "turno_id": ${existingBookingId},\n  "nuevo_servicio": "${newServiceCode}",\n  "nuevo_servicio_detalle": "${newServiceName}",\n  "nuevo_precio": ${newPrice},\n  "duracion_estimada": ${combinedDuration},\n  "complejidad_maxima": "${combinedComplexity}",\n  "nueva_hora": "${requestedTime}"\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "status": "service_added",\n  "booking_id": ${existingBookingId},\n  "lead_id": ${data.lead_id || "null"},\n  "datetime": "${fullDatetime}",\n  "combined_services": "{servicio_detalle de la respuesta}",\n  "total_price": {precio_total de la respuesta},\n  "estimated_duration": ${combinedDuration},\n  "max_complexity": "${combinedComplexity}",\n  "deposit": {sena de la respuesta},\n  "payment_link": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "client_message": "${clientMsg}"\n}\n\`\`\``;
  }
} else if (data.date_available) {
  const clientMsg = `Listo ${data.client_name || "reina"}! Tu turno de ${serviceDisplay.toLowerCase()} esta reservado para el ${humanDate} a las ${requestedTime}. Para confirmarlo, paga la sena de $${depositCalculated.toLocaleString("es-AR")} en este link: {LINK_PAGO}. Tenes 15 minutos para abonar, despues el link expira y se libera el turno.`;
  taskInstruction = `## FECHA DISPONIBLE - CREAR TURNO\n\n### PASO 1: Llamar a la tool \`leraysi_crear_turno\`\n\nUsar EXACTAMENTE estos parametros:\n\n\`\`\`json\n{\n  "clienta": "${data.client_name || ""}",\n  "telefono": "${data.phone || ""}",\n  "servicio": "${serviceCode}",\n  "fecha_hora": "${fullDatetime}",\n  "precio": ${data.price || 0},\n  "duracion_estimada": ${data.estimated_duration || 60},\n  "complejidad_maxima": "${data.max_complexity || "medium"}",\n  "lead_id": ${data.lead_id || "null"}${data.email ? `,\n  "email": "${data.email}"` : ""}${data.service_detail ? `,\n  "servicio_detalle": "${data.service_detail}"` : ""}\n}\n\`\`\`\n\n### PASO 2: Despues de llamar la tool, responder con este JSON\n\n\`\`\`json\n{\n  "status": "booking_created",\n  "booking_id": {turnoId de la respuesta},\n  "lead_id": ${data.lead_id || "null"},\n  "datetime": "${fullDatetime}",\n  "service": "${serviceCode}",\n  "service_detail": "${serviceDisplay}",\n  "price": ${data.price || 0},\n  "estimated_duration": ${data.estimated_duration || 60},\n  "max_complexity": "${data.max_complexity || "medium"}",\n  "deposit": {sena de la respuesta},\n  "payment_link": "{link_pago de la respuesta}",\n  "mp_preference_id": "{mp_preference_id de la respuesta}",\n  "client_message": "${clientMsg}"\n}\n\`\`\`\n\n**IMPORTANTE:** En client_message, reemplazar {LINK_PAGO} con el link_pago real de la respuesta.`;
} else {
  const alternativesText =
    data.alternatives?.length > 0
      ? data.alternatives.map((a) => `${a.day_name} ${a.date}`).join(", ")
      : "No hay disponibilidad esta semana";
  const alternativesArray =
    data.alternatives?.map((a) => `"${a.day_name} ${a.date}"`) || [];
  const clientMsg = `Disculpa, el ${humanDate} no tenemos disponibilidad (${(data.unavailable_reason || "agenda completa").toLowerCase()}). Te puedo ofrecer: ${alternativesText}. Cual te queda mejor?`;
  taskInstruction = `## FECHA NO DISPONIBLE\n\n**NO llamar ninguna tool.**\n\nResponder UNICAMENTE con este JSON:\n\n\`\`\`json\n{\n  "status": "date_unavailable",\n  "requested_date": "${data.requested_date}",\n  "reason": "${data.unavailable_reason || "Sin disponibilidad"}",\n  "alternatives": [${alternativesArray.join(", ")}],\n  "client_message": "${clientMsg}"\n}\n\`\`\``;
}

const userMessage = `# SOLICITUD DE TURNO - Estilos Leraysi\n\n## Datos de la Solicitud\n\n| Campo | Valor |\n|-------|-------|\n| **Clienta** | ${data.client_name || "No proporcionado"} |\n| **Telefono** | ${data.phone || "No proporcionado"} |\n| **Email** | ${data.email || "No proporcionado"} |\n| **Lead ID** | ${data.lead_id || "N/A"} |\n| **Servicio** | ${serviceDisplay} |\n| **Complejidad** | ${data.max_complexity || "medium"} |\n| **Duracion** | ${data.estimated_duration || 60} min |\n| **Precio** | $${(data.price || 0).toLocaleString("es-AR")} |\n| **Sena (30%)** | $${depositCalculated.toLocaleString("es-AR")} |\n| **Fecha solicitada** | ${data.requested_date} (${humanDate}) |\n| **Hora** | ${requestedTime} |\n| **Disponibilidad** | ${data.date_available ? "DISPONIBLE" : "NO DISPONIBLE"} |\n\n## Disponibilidad de la Semana\n\n${data.availability_summary || "No disponible"}\n\n---\n\n${taskInstruction}`;

return [
  {
    json: {
      ...data,
      userMessage,
      _precalculated: (() => {
        const _option = (data.options || data.recommended_slots || [])[0];
        const _existWorker = (data.existing_worker || WORKERS.PRIMARY).toLowerCase().trim();
        const _optionWorker = (_option?.worker || '').toLowerCase().trim();
        const _forceAdditional = _compExisting === "very_complex" || _compNew === "very_complex";
        const _isAdditionalBooking = isAddService && (
          _forceAdditional ||
          _option?.is_additional_booking === true ||
          (_optionWorker && _existWorker && _optionWorker !== _existWorker)
        );

        if (_isAdditionalBooking) {
          const _slotTime = _option?.start_time || requestedTime;
          return {
            time: _slotTime,
            estimated_duration: data.estimated_duration || 60,
            max_complexity: data.max_complexity || "medium",
            deposit: Math.round(newPrice * 0.3),
            full_datetime: `${datePart} ${_slotTime}`,
            human_date: humanDate,
            service_display: serviceDisplay,
            worker: _option?.worker || WORKERS.SECONDARY,
            is_additional_booking: true,
            parent_booking_id: existingBookingId,
            existing_service_time: _option?.existing_service_time || null,
            service_relocated: _option?.service_relocated || false,
            original_time: _option?.original_time || null,
          };
        }

        return {
          time: requestedTime,
          estimated_duration: isAddService
            ? ((_compNew === "very_complex" || _compExisting === "very_complex") ? 600 : (data.existing_duration || 0) + (data.estimated_duration || 60))
            : (data.estimated_duration || 60),
          max_complexity: isAddService
            ? (() => {
                const ORD = { simple: 1, medium: 2, complex: 3, very_complex: 4 };
                const ORD_R = { 1: 'simple', 2: 'medium', 3: 'complex', 4: 'very_complex' };
                const ex = data.existing_complexity || "medium";
                const nw = data.max_complexity || "medium";
                const eSvcs = (data.existing_service || "").split(" + ").filter(s => s.trim());
                const nSvcs = Array.isArray(data.service) ? data.service : [data.service].filter(Boolean);
                const tot = eSvcs.length + nSvcs.length;
                let fl = 'simple';
                if (tot >= 3) fl = 'very_complex';
                else if (tot >= 2) fl = 'complex';
                return ORD_R[Math.max(ORD[ex] || 2, ORD[nw] || 2, ORD[fl] || 1)] || "medium";
              })()
            : (data.max_complexity || "medium"),
          deposit: isAddService
            ? Math.round((existingPrice + newPrice) * 0.3)
            : depositCalculated,
          full_datetime: fullDatetime,
          human_date: humanDate,
          service_display: serviceDisplay,
          worker: (data.options || data.recommended_slots || [])[0]?.worker || data.existing_worker || WORKERS.PRIMARY,
        };
      })(),
    },
  },
];
