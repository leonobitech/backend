// ============================================================================
// PARSE AGENT RESPONSE - Calendar Agent
// ============================================================================
// Parses LLM output JSON, maps status to action for downstream routing
// ============================================================================
const input = $("AnalizarDisponibilidad").first().json;
const buildPrompt = $("BuildAgentPrompt").first().json;
const agentOutput = $input.first().json.output;

// Worker configuration
const WORKERS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
};

function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {}
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {}
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }
  return {
    status: "error",
    client_message: "Error procesando la solicitud de turno",
  };
}

const llmResponse = extractJSON(agentOutput);

// Map LLM status → internal action for routing
// Accept both old Spanish and new English status values
const STATUS_TO_ACTION = {
  // New English statuses (from updated system prompt)
  booking_created: "booking_created",
  additional_booking_created: "service_added",
  date_unavailable: "no_availability",
  booking_rescheduled: "booking_rescheduled",
  service_added: "service_added",
  error: "error",
  // Old Spanish statuses (backwards compat)
  turno_creado: "booking_created",
  turno_adicional_creado: "service_added",
  fecha_no_disponible: "no_availability",
  turno_reprogramado: "booking_rescheduled",
  servicio_agregado: "service_added",
};

const llmStatus = llmResponse.status || llmResponse.estado || "error";
const action = STATUS_TO_ACTION[llmStatus] || llmStatus || "error";

// Get message from LLM (accept both field names)
const clientMessage = llmResponse.client_message || llmResponse.mensaje_para_clienta;

let result = {
  client_id: input.client_id,
  client_name: input.client_name,
  phone: input.phone,
  email: input.email || "",
  lead_row_id: input.lead_row_id,
  conversation_id: input.conversation_id || null,
  price: input.price,
  service: input.service,
  service_detail: input.service_detail || "",
  estimated_duration: input.estimated_duration || 60,
  max_complexity: input.max_complexity || "medium",
  worker: buildPrompt._precalculated?.worker || input.existing_worker || WORKERS.PRIMARY,
  action: action,
  client_message: clientMessage,
  alternatives: llmResponse.alternatives || llmResponse.alternativas || [],
};

// CASE: BOOKING CREATED
if (llmStatus === "booking_created" || llmStatus === "turno_creado") {
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.payment_link?.match(/preference-id=([^&\s]+)/)?.[1] ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  const datetime = llmResponse.datetime || llmResponse.fecha_hora || "";
  const [bookingDate, bookingTime] = datetime.split(" ");
  result = {
    ...result,
    booking_date: bookingDate || input.requested_date,
    suggested_time: bookingTime || input.requested_time || "09:00",
    odoo_booking_id: llmResponse.booking_id || llmResponse.turno_id,
    mp_preference_id: mpPreferenceId,
    payment_link: llmResponse.payment_link || llmResponse.link_pago || "",
    booking_state: "pending_payment",
    deposit_amount: llmResponse.deposit || llmResponse.sena || Math.round((input.price || 0) * 0.3),
  };
}

// CASE: DATE UNAVAILABLE
if (llmStatus === "date_unavailable" || llmStatus === "fecha_no_disponible") {
  result = {
    ...result,
    requested_date: llmResponse.requested_date || llmResponse.fecha_solicitada || input.requested_date,
    unavailable_reason: llmResponse.reason || llmResponse.motivo,
  };
}

// CASE: BOOKING RESCHEDULED
if (llmStatus === "booking_rescheduled" || llmStatus === "turno_reprogramado") {
  const newDatetime = llmResponse.new_datetime || llmResponse.fecha_hora_nueva || "";
  const [newDate, newTime] = newDatetime.split(" ");
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.payment_link?.match(/preference-id=([^&\s]+)/)?.[1] ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  result = {
    ...result,
    odoo_booking_id: llmResponse.odoo_booking_id || llmResponse.odoo_turno_id,
    previous_booking_id: llmResponse.previous_booking_id || llmResponse.turno_id_anterior,
    new_booking_id: llmResponse.new_booking_id || llmResponse.turno_id_nuevo,
    booking_date: newDate,
    suggested_time: newTime || "09:00",
    previous_datetime: llmResponse.previous_datetime || llmResponse.fecha_hora_anterior,
    new_datetime: newDatetime,
    mp_preference_id: mpPreferenceId,
    payment_link: llmResponse.payment_link || llmResponse.link_pago || null,
    calendar_updated: true,
    calendar_accept_url: llmResponse.calendar_accept_url || null,
    reschedule_reason: llmResponse.reason || llmResponse.motivo || "Solicitud de la clienta",
  };
}

// CASE: ADDITIONAL BOOKING CREATED (different worker, new Baserow row)
if (llmStatus === "additional_booking_created" || llmStatus === "turno_adicional_creado") {
  const datetime = llmResponse.datetime || llmResponse.fecha_hora || "";
  const [bookingDate, bookingTime] = datetime.split(" ");
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.payment_link?.match(/preference-id=([^&\s]+)/)?.[1] ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  const priceNew = Number(llmResponse.price || llmResponse.precio) || Number(input.price) || 0;
  result = {
    ...result,
    odoo_booking_id: llmResponse.booking_id || llmResponse.turno_id,
    // For finding the PARENT booking in Baserow
    odoo_parent_booking_id: llmResponse.parent_booking_id || llmResponse.turno_id_padre || buildPrompt._precalculated?.parent_booking_id || null,
    parent_booking_id: llmResponse.parent_booking_id || llmResponse.turno_id_padre || buildPrompt._precalculated?.parent_booking_id || null,
    booking_date: bookingDate || input.requested_date,
    suggested_time: bookingTime || input.requested_time || "09:00",
    service: llmResponse.service || llmResponse.servicio || input.service,
    service_detail: llmResponse.service_detail || llmResponse.servicio_detalle || input.service_detail || "",
    price: priceNew,
    estimated_duration: llmResponse.estimated_duration || llmResponse.duracion_estimada || input.estimated_duration || 60,
    max_complexity: llmResponse.max_complexity || llmResponse.complejidad_maxima || input.max_complexity || "medium",
    deposit_amount: llmResponse.deposit || llmResponse.sena || Math.round(priceNew * 0.3),
    mp_preference_id: mpPreferenceId,
    payment_link: llmResponse.payment_link || llmResponse.link_pago || "",
    booking_state: "pending_payment",
    worker: llmResponse.worker || llmResponse.trabajadora || buildPrompt._precalculated?.worker || WORKERS.SECONDARY,
    // Parent booking data (for context)
    existing_service: input.existing_service || "",
    existing_worker: input.existing_worker || WORKERS.PRIMARY,
    existing_booking_price: input.existing_booking_price || 0,
    is_additional_booking: true,
    // Parent relocation (Strategy B: adding full day to short existing, same worker)
    relocated_service_time: buildPrompt._precalculated?.existing_service_time || null,
    service_relocated: buildPrompt._precalculated?.service_relocated || false,
    original_parent_time: buildPrompt._precalculated?.original_time || null,
  };
}

// CASE: SERVICE ADDED (same worker, update existing row)
if (llmStatus === "service_added" || llmStatus === "servicio_agregado") {
  const datetime = llmResponse.datetime || llmResponse.fecha_hora || "";
  const [bookingDate, bookingTime] = datetime.split(" ");
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.payment_link?.match(/preference-id=([^&\s]+)/)?.[1] ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  // Use combined services from MCP tool (most reliable, reads from Odoo)
  let combinedServiceDetail = "";
  let servicesArray = [];
  const combinedFromLLM = llmResponse.combined_services || llmResponse.servicios_combinados;
  if (combinedFromLLM) {
    combinedServiceDetail = combinedFromLLM;
    servicesArray = combinedServiceDetail.split(" + ").map(s => s.trim()).filter(Boolean);
  } else {
    const existingSvc = input.existing_service || "";
    const inputServicesArr = Array.isArray(input.service) ? input.service : [input.service];
    const existingNorm = existingSvc.toLowerCase().trim();
    const newSvcRaw =
      inputServicesArr.find((s) => s && s.toLowerCase().trim() !== existingNorm) ||
      inputServicesArr[inputServicesArr.length - 1] || "";
    const newSvc = newSvcRaw
      ? newSvcRaw.charAt(0).toUpperCase() + newSvcRaw.slice(1).replace(/_/g, " ")
      : "";
    servicesArray = [];
    if (existingSvc) servicesArray.push(existingSvc);
    if (newSvc && newSvc.toLowerCase() !== existingSvc.toLowerCase()) {
      servicesArray.push(newSvc);
    }
    combinedServiceDetail = servicesArray.join(" + ");
  }
  const bookingDateFinal =
    bookingDate ||
    (input.booking_date?.includes("T")
      ? input.booking_date.split("T")[0]
      : input.booking_date?.split(" ")[0]) ||
    "";
  const bookingTimeFinal =
    bookingTime ||
    (input.booking_date?.includes("T")
      ? input.booking_date.split("T")[1]?.slice(0, 5)
      : input.booking_date?.split(" ")[1]) ||
    "09:00";
  // Safety net: deterministic price over LLM price
  const existPriceDet = Number(input.existing_booking_price) || 0;
  const newPriceDet = Number(input.price) || 0;
  const totalPriceDet = existPriceDet + newPriceDet;
  const llmTotalPrice = llmResponse.total_price || llmResponse.precio_total || 0;
  const totalPriceFinal = totalPriceDet > 0 ? totalPriceDet : llmTotalPrice;
  if (llmTotalPrice && totalPriceDet > 0 && llmTotalPrice !== totalPriceDet) {
    console.log(`[ParseAgentResponse] 🔧 Price service_added corrected: LLM=$${llmTotalPrice}, det=$${totalPriceDet}`);
  }
  result = {
    ...result,
    odoo_booking_id: llmResponse.booking_id || llmResponse.turno_id,
    booking_date: bookingDateFinal,
    suggested_time: bookingTimeFinal,
    service: servicesArray,
    service_detail: combinedServiceDetail,
    price: totalPriceFinal,
    estimated_duration: llmResponse.estimated_duration || llmResponse.duracion_estimada || input.estimated_duration || 60,
    max_complexity: llmResponse.max_complexity || llmResponse.complejidad_maxima || input.max_complexity || "medium",
    deposit_amount: llmResponse.deposit || llmResponse.sena || Math.round((totalPriceFinal || 0) * 0.3),
    mp_preference_id: mpPreferenceId,
    payment_link: llmResponse.payment_link || llmResponse.link_pago || "",
    booking_state: "pending_payment",
  };
}

// ── OVERRIDE: _precalculated.is_additional_booking is the authority (not the LLM) ──
if (buildPrompt._precalculated?.is_additional_booking === true) {
  console.log(`[ParseAgentResponse] 🔧 Override additional booking: forcing new service data (LLM status="${llmStatus}")`);
  result.is_additional_booking = true;

  // Reset service/price to NEW service only (LLM/tool return combined)
  result.service = input.service;
  result.service_detail = input.service_detail || '';
  const _priceNewOverride = Number(input.price) || 0;
  result.price = _priceNewOverride;
  result.deposit_amount = Math.round(_priceNewOverride * 0.3);
  result.estimated_duration = input.estimated_duration || 60;
  result.max_complexity = input.max_complexity || 'medium';

  // Time: use _precalculated (real process window), not LLM
  result.suggested_time = buildPrompt._precalculated?.time || result.suggested_time;

  // Propagate relocation fields
  result.relocated_service_time = result.relocated_service_time || buildPrompt._precalculated?.existing_service_time || null;
  if (result.service_relocated === undefined) {
    result.service_relocated = buildPrompt._precalculated?.service_relocated || false;
  }
  result.original_parent_time = result.original_parent_time || buildPrompt._precalculated?.original_time || null;

  // Parent booking data
  result.parent_booking_id = result.parent_booking_id || buildPrompt._precalculated?.parent_booking_id || null;
  result.odoo_parent_booking_id = result.parent_booking_id;

  // Worker from _precalculated (more reliable than LLM)
  result.worker = buildPrompt._precalculated?.worker || result.worker || input.existing_worker || WORKERS.PRIMARY;
}

// Normalize suggested_time to HH:MM (LLM may return "15:00:00" with seconds)
if (result.suggested_time) {
  result.suggested_time = result.suggested_time.split(':').slice(0, 2).join(':');
}

return [{ json: result }];
