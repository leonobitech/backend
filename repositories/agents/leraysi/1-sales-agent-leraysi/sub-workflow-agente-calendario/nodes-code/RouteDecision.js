// ============================================================================
// ROUTE DECISION - Nodo decisor determinístico
// ============================================================================
// POSICIÓN: AnalizarDisponibilidad → [RouteDecision] → SwitchModo
//
// Este nodo tiene TODAS las cartas:
//   - Lo que la LLM envió (modo, accion, agregar_a_turno_existente, etc.)
//   - Lo que el analyzer encontró (opciones, disponible, slots_recomendados)
//
// RESPONSABILIDAD: Decidir `modo` y `accion` de forma determinística.
// SwitchModo solo bifurca basándose en lo que este nodo decide.
// No importa si la LLM falló en enviar modo/accion — este nodo corrige.
// ============================================================================

const data = $input.first().json;

// === Datos de la LLM (pueden ser null) ===
const modoLLM = data.modo;
const accionLLM = data.accion;

// === Datos del analyzer (realidad) ===
const opciones = data.opciones || data.slots_recomendados || [];
const disponible = data.disponible === true;

// === Contexto del request ===
const gateBloqueado = data.gate_bloqueado === true;
const agregarATurnoExistente = data.agregar_a_turno_existente === true;
const turnoAgendado = data.turno_agendado === true;

// === Hora y fecha solicitadas ===
const fechaSolicitadaRaw = data.fecha_solicitada || data.fecha_deseada || '';
const fechaSoloParte = fechaSolicitadaRaw.includes('T')
  ? fechaSolicitadaRaw.split('T')[0]
  : fechaSolicitadaRaw.split(' ')[0];
const horaDeseada = data.hora_deseada || '';

// ============================================================================
// VERIFICAR SI EL SLOT EXACTO SOLICITADO ESTÁ EN LAS OPCIONES
// ============================================================================
// Compara fecha + hora solicitada contra las opciones del analyzer.
// Si ninguna opción coincide → el slot NO está disponible.
const slotExactoDisponible = opciones.some(o =>
  o.fecha === fechaSoloParte && o.hora_inicio === horaDeseada
);

// ============================================================================
// DECISION TREE — DETERMINÍSTICO
// ============================================================================
let modo, accion, motivo;

// 1. GATE BLOQUEADO: faltan datos obligatorios → bypass directo
if (gateBloqueado) {
  modo = 'consultar_disponibilidad';
  accion = 'datos_faltantes';
  motivo = `Gate bloqueado: faltan ${(data.gate_datos_faltantes || []).join(', ')}`;
}

// 2. LLM PIDIÓ CONSULTAR: primera llamada del flujo dos-pasos → siempre respetar
else if (modoLLM === 'consultar_disponibilidad') {
  modo = 'consultar_disponibilidad';
  if (agregarATurnoExistente) {
    accion = 'consultar_agregar_servicio';
  } else if (accionLLM === 'reprogramar') {
    accion = 'consultar_reprogramar';
  } else {
    accion = 'consultar_turno_nuevo';
  }
  motivo = `LLM pidió consultar explícitamente (accion: ${accion})`;
}

// 3. SIN DISPONIBILIDAD: ni el slot ni alternativas
else if (!disponible || opciones.length === 0) {
  modo = 'consultar_disponibilidad';
  accion = 'sin_disponibilidad';
  motivo = 'Analyzer: sin disponibilidad';
}

// 4. SLOT EXACTO DISPONIBLE: la hora+fecha solicitada existe → agendar
else if (slotExactoDisponible) {
  modo = 'agendar';
  if (agregarATurnoExistente) {
    accion = 'agregar_servicio';
  } else if (accionLLM === 'reprogramar') {
    accion = 'reprogramar';
  } else {
    accion = 'agendar_turno_nuevo';
  }
  motivo = `Slot ${horaDeseada} en ${fechaSoloParte} disponible`;
}

// 5. JORNADA COMPLETA + AGREGAR SERVICIO + AGENDAR: rutear directo
//    LLM envía hora 09:00 (llegada) pero el slot real es otro (ej: 12:00 Compañera).
//    El slot exacto no matchea (09:00 ≠ 12:00) pero HAY slot mismo día → agendar.
//    NO mutar hora_deseada — downstream ya maneja 09:00 (cliente) vs 12:00 (interno).
else if (modoLLM === 'agendar' && agregarATurnoExistente &&
         data.turno_complejidad_existente === 'muy_compleja' &&
         opciones.some(o => o.fecha === fechaSoloParte && !o.es_fecha_alternativa)) {
  modo = 'agendar';
  accion = 'agregar_servicio';
  motivo = `Jornada completa: slot mismo día disponible, ruteo directo a agendar`;
}

// 6. SLOT NO DISPONIBLE + HAY ALTERNATIVAS: presentar opciones
//    Este es el caso de race condition (slot se ocupó entre consulta y confirmación)
else {
  modo = 'consultar_disponibilidad';
  accion = 'slot_no_disponible';
  motivo = `Slot ${horaDeseada} en ${fechaSoloParte} NO disponible. ${opciones.length} alternativas`;
}

console.log(`[RouteDecision] modo=${modo} | accion=${accion} | ${motivo}`);

// ============================================================================
// OUTPUT: misma data + modo y accion decididos
// ============================================================================
return [{
  json: {
    ...data,
    modo,
    accion,
    _route_decision: {
      modo_llm: modoLLM || null,
      accion_llm: accionLLM || null,
      slot_exacto_disponible: slotExactoDisponible,
      total_opciones: opciones.length,
      motivo
    }
  }
}];
