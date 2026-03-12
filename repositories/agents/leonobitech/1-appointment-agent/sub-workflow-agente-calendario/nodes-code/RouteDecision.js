// ============================================================================
// ROUTE DECISION - Deterministic decision node
// ============================================================================
// POSITION: AnalizarDisponibilidad -> [RouteDecision] -> SwitchMode
//
// This node has ALL the cards:
//   - What the LLM sent (mode, action, add_to_existing_booking, etc.)
//   - What the analyzer found (options, available, recommended_slots)
//
// RESPONSIBILITY: Decide `mode` and `action` deterministically.
// SwitchMode only branches based on what this node decides.
// Doesn't matter if the LLM failed to send mode/action — this node corrects.
//
// 3-STEP FLOW:
//   STEP 1: check_availability -> returns options (mode: check_availability)
//   STEP 2: confirm -> validates slot, returns summary (mode: confirm)
//   STEP 3: schedule -> creates booking + payment link (mode: schedule)
// ============================================================================

const data = $input.first().json;

// === LLM data (may be null) — accept both English and Spanish ===
const llmMode = data.mode || data.modo;
const llmAction = data.action || data.accion;

// === Analyzer data (reality) — accept both English and Spanish ===
const options = data.options || data.recommended_slots || data.opciones || data.slots_recomendados || [];
const available = (data.available ?? data.disponible) === true;

// === Request context — accept both English and Spanish ===
const gateBlocked = (data.gate_blocked ?? data.gate_bloqueado) === true;
const addToExistingBooking = (data.add_to_existing_booking ?? data.agregar_a_turno_existente) === true;
const bookingScheduled = (data.booking_scheduled ?? data.turno_agendado) === true;

// === Requested date and time — accept both English and Spanish ===
const requestedDateRaw = data.requested_date || data.fecha_solicitada || data.fecha_deseada || '';
const datePart = requestedDateRaw.includes('T')
  ? requestedDateRaw.split('T')[0]
  : requestedDateRaw.split(' ')[0];
const requestedTime = data.requested_time || data.hora_deseada || '';

// === Existing booking complexity — accept both ===
const existingComplexity = data.existing_complexity || data.turno_complejidad_existente || '';

// ============================================================================
// CHECK IF THE EXACT REQUESTED SLOT IS IN THE OPTIONS
// ============================================================================
// Compares requested date + time against analyzer options.
// If no option matches -> the slot is NOT available.
const exactSlotAvailable = options.some(o =>
  (o.date || o.fecha) === datePart && (o.start_time || o.hora_inicio) === requestedTime
);

// ============================================================================
// DECISION TREE — DETERMINISTIC
// ============================================================================
let mode, action, reason;

// Normalize LLM mode values (accept both Spanish and English)
const MODE_MAP = {
  'consultar_disponibilidad': 'check_availability',
  'check_availability': 'check_availability',
  'confirmar': 'confirm',
  'confirm': 'confirm',
  'crear': 'schedule',
  'agendar': 'schedule',
  'schedule': 'schedule',
  'create': 'schedule',
};
const normalizedLlmMode = MODE_MAP[llmMode] || llmMode;

// Normalize LLM action values
const normalizedLlmAction = llmAction === 'reprogramar' ? 'reschedule'
  : llmAction === 'reschedule' ? 'reschedule'
  : llmAction;

// 1. GATE BLOCKED: missing required data -> direct bypass
if (gateBlocked) {
  mode = 'check_availability';
  action = 'missing_data';
  reason = `Gate blocked: missing ${(data.gate_missing_data || data.gate_datos_faltantes || []).join(', ')}`;
}

// 2. LLM REQUESTED CHECK: STEP 1 of three-step flow -> always respect
else if (normalizedLlmMode === 'check_availability') {
  mode = 'check_availability';
  if (addToExistingBooking) {
    action = 'check_add_service';
  } else if (normalizedLlmAction === 'reschedule') {
    action = 'check_reschedule';
  } else {
    action = 'check_new_booking';
  }
  reason = `LLM requested check explicitly (action: ${action})`;
}

// 3. LLM REQUESTED CONFIRM: STEP 2 -> validate slot and return summary without creating
else if (normalizedLlmMode === 'confirm') {
  if (!available || options.length === 0) {
    // Slot no longer available (race condition between STEP 1 and STEP 2)
    mode = 'check_availability';
    action = 'slot_unavailable';
    reason = `Confirm: slot unavailable, race condition`;
  } else if (exactSlotAvailable) {
    // Slot available -> return confirmation summary
    mode = 'confirm';
    action = 'confirmation_summary';
    reason = `Confirm: slot ${requestedTime} on ${datePart} validated OK`;
  } else if (addToExistingBooking &&
             existingComplexity === 'very_complex' &&
             options.some(o => (o.date || o.fecha) === datePart && !(o.is_alternative_date || o.es_fecha_alternativa))) {
    // Full day + add service: time doesn't match exactly but there's a same-day slot
    mode = 'confirm';
    action = 'confirmation_summary';
    reason = `Confirm full day: same-day slot available`;
  } else {
    // Slot taken but alternatives exist
    mode = 'check_availability';
    action = 'slot_unavailable';
    reason = `Confirm: slot ${requestedTime} on ${datePart} NOT available. ${options.length} alternatives`;
  }
}

// 4. NO AVAILABILITY: neither the slot nor alternatives
else if (!available || options.length === 0) {
  mode = 'check_availability';
  action = 'no_availability';
  reason = 'Analyzer: no availability';
}

// 5. EXACT SLOT AVAILABLE + SCHEDULE MODE: STEP 3 -> create booking
else if (exactSlotAvailable && normalizedLlmMode === 'schedule') {
  mode = 'schedule';
  if (addToExistingBooking) {
    action = 'add_service';
  } else if (normalizedLlmAction === 'reschedule') {
    action = 'reschedule';
  } else {
    action = 'schedule_new_booking';
  }
  reason = `Slot ${requestedTime} on ${datePart} available -> create`;
}

// 6. FULL DAY + ADD SERVICE + SCHEDULE: direct routing
//    LLM sends time 09:00 (arrival) but the real slot is different (e.g.: 12:00 Secondary).
//    The exact slot doesn't match (09:00 != 12:00) but there IS a same-day slot -> schedule.
//    DO NOT mutate requested_time — downstream already handles 09:00 (client) vs 12:00 (internal).
else if (normalizedLlmMode === 'schedule' && addToExistingBooking &&
         existingComplexity === 'very_complex' &&
         options.some(o => (o.date || o.fecha) === datePart && !(o.is_alternative_date || o.es_fecha_alternativa))) {
  mode = 'schedule';
  action = 'add_service';
  reason = `Full day: same-day slot available, direct routing to create`;
}

// 7. SLOT NOT AVAILABLE + HAS ALTERNATIVES: present options
//    Race condition (slot was taken between steps)
else {
  mode = 'check_availability';
  action = 'slot_unavailable';
  reason = `Slot ${requestedTime} on ${datePart} NOT available. ${options.length} alternatives`;
}

console.log(`[RouteDecision] mode=${mode} | action=${action} | ${reason}`);

// ============================================================================
// OUTPUT: same data + decided mode and action
// ============================================================================
return [{
  json: {
    ...data,
    mode,
    action,
    _route_decision: {
      llm_mode: llmMode || null,
      llm_action: llmAction || null,
      exact_slot_available: exactSlotAvailable,
      total_options: options.length,
      reason
    }
  }
}];
