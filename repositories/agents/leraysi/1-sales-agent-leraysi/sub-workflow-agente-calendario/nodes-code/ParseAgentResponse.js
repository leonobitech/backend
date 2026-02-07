// ============================================================================
// PARSE AGENT RESPONSE - Agente Calendario Leraysi
// ============================================================================
const input = $("AnalizarDisponibilidad").first().json;
const agentOutput = $input.first().json.output;

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
    estado: "error",
    mensaje_para_clienta: "Error procesando la solicitud de turno",
  };
}

const llmResponse = extractJSON(agentOutput);

const ESTADO_A_ACCION = {
  turno_creado: "turno_creado",
  fecha_no_disponible: "sin_disponibilidad",
  turno_reprogramado: "turno_reprogramado",
  servicio_agregado: "servicio_agregado",
  error: "error",
};
const accion =
  ESTADO_A_ACCION[llmResponse.estado] || llmResponse.estado || "error";

let resultado = {
  clienta_id: input.clienta_id,
  nombre_clienta: input.nombre_clienta,
  telefono: input.telefono,
  email: input.email || "",
  lead_row_id: input.lead_row_id,
  conversation_id: input.conversation_id || null,
  precio: input.precio,
  servicio: input.servicio,
  servicio_detalle: input.servicio_detalle || "",
  duracion_estimada: input.duracion_estimada || 60,
  complejidad_maxima: input.complejidad_maxima || "media",
  accion: accion,
  mensaje_para_clienta: llmResponse.mensaje_para_clienta,
  alternativas: llmResponse.alternativas || [],
};

// CASO: TURNO CREADO
if (llmResponse.estado === "turno_creado") {
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  const [fechaTurno, horaTurno] = (llmResponse.fecha_hora || "").split(" ");
  resultado = {
    ...resultado,
    fecha_turno: fechaTurno || input.fecha_solicitada,
    hora_sugerida: horaTurno || input.hora_deseada || "09:00",
    odoo_turno_id: llmResponse.turno_id,
    mp_preference_id: mpPreferenceId,
    link_pago: llmResponse.link_pago || "",
    estado_turno: "pendiente_pago",
    sena_monto: llmResponse.sena || Math.round((input.precio || 0) * 0.3),
  };
}

// CASO: FECHA NO DISPONIBLE
if (llmResponse.estado === "fecha_no_disponible") {
  resultado = {
    ...resultado,
    fecha_solicitada: llmResponse.fecha_solicitada || input.fecha_solicitada,
    motivo_no_disponible: llmResponse.motivo,
  };
}

// CASO: TURNO REPROGRAMADO
if (llmResponse.estado === "turno_reprogramado") {
  const [fechaNueva, horaNueva] = (llmResponse.fecha_hora_nueva || "").split(
    " ",
  );
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  resultado = {
    ...resultado,
    odoo_turno_id: llmResponse.odoo_turno_id,
    turno_id_anterior: llmResponse.turno_id_anterior,
    turno_id_nuevo: llmResponse.turno_id_nuevo,
    fecha_turno: fechaNueva,
    hora_sugerida: horaNueva || "09:00",
    fecha_hora_anterior: llmResponse.fecha_hora_anterior,
    fecha_hora_nueva: llmResponse.fecha_hora_nueva,
    mp_preference_id: mpPreferenceId,
    link_pago: llmResponse.link_pago || null,
    calendario_actualizado: true,
    motivo_reprogramacion: llmResponse.motivo || "Solicitud de la clienta",
  };
}

// CASO: SERVICIO AGREGADO
if (llmResponse.estado === "servicio_agregado") {
  const [fechaTurno, horaTurno] = (llmResponse.fecha_hora || "").split(" ");
  const mpPreferenceId =
    llmResponse.mp_preference_id ||
    llmResponse.link_pago?.match(/preference-id=([^&\s]+)/)?.[1] ||
    "";
  const servicioExistente = input.turno_servicio_existente || "";
  const serviciosInputArray = Array.isArray(input.servicio)
    ? input.servicio
    : [input.servicio];
  const servicioExistenteNorm = servicioExistente.toLowerCase().trim();
  const servicioNuevoRaw =
    serviciosInputArray.find(
      (s) => s && s.toLowerCase().trim() !== servicioExistenteNorm,
    ) ||
    serviciosInputArray[serviciosInputArray.length - 1] ||
    "";
  const servicioNuevo = servicioNuevoRaw
    ? servicioNuevoRaw.charAt(0).toUpperCase() +
      servicioNuevoRaw.slice(1).replace(/_/g, " ")
    : "";
  const serviciosArray = [];
  if (servicioExistente) serviciosArray.push(servicioExistente);
  if (
    servicioNuevo &&
    servicioNuevo.toLowerCase() !== servicioExistente.toLowerCase()
  ) {
    serviciosArray.push(servicioNuevo);
  }
  const servicioDetalleCombinado = serviciosArray.join(" + ");
  const fechaTurnoFinal =
    fechaTurno ||
    (input.turno_fecha?.includes("T")
      ? input.turno_fecha.split("T")[0]
      : input.turno_fecha?.split(" ")[0]) ||
    "";
  const horaTurnoFinal =
    horaTurno ||
    (input.turno_fecha?.includes("T")
      ? input.turno_fecha.split("T")[1]?.slice(0, 5)
      : input.turno_fecha?.split(" ")[1]) ||
    "09:00";
  resultado = {
    ...resultado,
    odoo_turno_id: llmResponse.turno_id,
    fecha_turno: fechaTurnoFinal,
    hora_sugerida: horaTurnoFinal,
    servicio: serviciosArray,
    servicio_detalle: servicioDetalleCombinado,
    precio: llmResponse.precio_total,
    duracion_estimada:
      llmResponse.duracion_estimada || input.duracion_estimada || 60,
    complejidad_maxima:
      llmResponse.complejidad_maxima || input.complejidad_maxima || "media",
    sena_monto:
      llmResponse.sena || Math.round((llmResponse.precio_total || 0) * 0.3),
    mp_preference_id: mpPreferenceId,
    link_pago: llmResponse.link_pago || "",
    estado_turno: "pendiente_pago",
  };
}

return [{ json: resultado }];
