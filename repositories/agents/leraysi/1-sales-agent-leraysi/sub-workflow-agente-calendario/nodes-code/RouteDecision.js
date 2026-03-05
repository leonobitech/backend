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
//
// FLUJO DE 3 PASOS:
//   PASO 1: consultar_disponibilidad → devuelve opciones (modo: consultar_disponibilidad)
//   PASO 2: confirmar → valida slot, devuelve resumen (modo: confirmar)
//   PASO 3: crear → crea turno + link de pago (modo: agendar)
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

// 2. LLM PIDIÓ CONSULTAR: PASO 1 del flujo tres-pasos → siempre respetar
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

// 3. LLM PIDIÓ CONFIRMAR: PASO 2 — validar slot y devolver resumen sin crear
else if (modoLLM === 'confirmar') {
  if (!disponible || opciones.length === 0) {
    // Slot ya no está disponible (race condition entre PASO 1 y PASO 2)
    modo = 'consultar_disponibilidad';
    accion = 'slot_no_disponible';
    motivo = `Confirmar: slot no disponible, race condition`;
  } else if (slotExactoDisponible) {
    // Slot disponible → devolver resumen de confirmación
    modo = 'confirmar';
    accion = 'resumen_confirmacion';
    motivo = `Confirmar: slot ${horaDeseada} en ${fechaSoloParte} validado OK`;
  } else if (agregarATurnoExistente &&
             data.turno_complejidad_existente === 'muy_compleja' &&
             opciones.some(o => o.fecha === fechaSoloParte && !o.es_fecha_alternativa)) {
    // JC + agregar servicio: hora no matchea exacta pero hay slot mismo día
    modo = 'confirmar';
    accion = 'resumen_confirmacion';
    motivo = `Confirmar JC: slot mismo día disponible`;
  } else {
    // Slot ocupado pero hay alternativas
    modo = 'consultar_disponibilidad';
    accion = 'slot_no_disponible';
    motivo = `Confirmar: slot ${horaDeseada} en ${fechaSoloParte} NO disponible. ${opciones.length} alternativas`;
  }
}

// 4. SIN DISPONIBILIDAD: ni el slot ni alternativas
else if (!disponible || opciones.length === 0) {
  modo = 'consultar_disponibilidad';
  accion = 'sin_disponibilidad';
  motivo = 'Analyzer: sin disponibilidad';
}

// 5. SLOT EXACTO DISPONIBLE + MODO CREAR: PASO 3 — crear turno
else if (slotExactoDisponible && (modoLLM === 'crear' || modoLLM === 'agendar')) {
  modo = 'agendar';
  if (agregarATurnoExistente) {
    accion = 'agregar_servicio';
  } else if (accionLLM === 'reprogramar') {
    accion = 'reprogramar';
  } else {
    accion = 'agendar_turno_nuevo';
  }
  motivo = `Slot ${horaDeseada} en ${fechaSoloParte} disponible → crear`;
}

// 6. JORNADA COMPLETA + AGREGAR SERVICIO + CREAR: rutear directo
//    LLM envía hora 09:00 (llegada) pero el slot real es otro (ej: 12:00 Compañera).
//    El slot exacto no matchea (09:00 ≠ 12:00) pero HAY slot mismo día → agendar.
//    NO mutar hora_deseada — downstream ya maneja 09:00 (cliente) vs 12:00 (interno).
else if ((modoLLM === 'crear' || modoLLM === 'agendar') && agregarATurnoExistente &&
         data.turno_complejidad_existente === 'muy_compleja' &&
         opciones.some(o => o.fecha === fechaSoloParte && !o.es_fecha_alternativa)) {
  modo = 'agendar';
  accion = 'agregar_servicio';
  motivo = `Jornada completa: slot mismo día disponible, ruteo directo a crear`;
}

// 7. SLOT NO DISPONIBLE + HAY ALTERNATIVAS: presentar opciones
//    Race condition (slot se ocupó entre pasos)
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
