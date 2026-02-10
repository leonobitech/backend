// ============================================================================
// OUTPUT MAIN LERAYSI v3.2 - Simplificado (pagos van a TurnosLeraysi, no aquí)
// ============================================================================
// Recibe: LLM output (content_whatsapp + state_patch) + state original
// Output: Mensaje para Chatwoot + Update para Baserow
// ============================================================================

console.log("[OutputMain v3.2] Starting...");

// ============================================================================
// 1. OBTENER STATE ORIGINAL (desde Input Main, pasado por el workflow)
// ============================================================================

const inputMainData = $("Input Main").first().json;
const originalState = inputMainData.state;
const protectedFields = inputMainData._protected || [
  "row_id",
  "lead_id",
  "chatwoot_id",
  "chatwoot_inbox_id",
  "conversation_id",
];

if (!originalState) {
  throw new Error("[OutputMain] Missing original state from Input Main");
}

console.log("[OutputMain v3.2] Original state loaded, row_id:", originalState.row_id);

// ============================================================================
// 2. PARSING DEL OUTPUT DEL LLM (ROBUSTO)
// ============================================================================

const llmData = $input.first().json;
let llmOutput;

function cleanJsonString(str) {
  return str
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/m, "")
    .replace(/:\s*\n\s*/g, ": ")
    .replace(/,\s*\n\s*"/g, ', "')
    .replace(/"\s*\n\s*}/g, '"}')
    .replace(/"\s*\n\s*,/g, '",')
    .replace(/true\s*\n\s*,/g, "true,")
    .replace(/false\s*\n\s*,/g, "false,")
    .replace(/null\s*\n\s*,/g, "null,")
    .replace(/}\s*\n\s*,/g, "},")
    .replace(/]\s*\n\s*,/g, "],")
    .replace(/[\x00-\x1F\x7F]/g, (char) => {
      if (char === "\n" || char === "\r" || char === "\t") return " ";
      return "";
    })
    .replace(/\s+/g, " ")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .trim();
}

function extractJson(text) {
  // Intento 1: Parsear directo
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log("[OutputMain v3.2] Parse intento 1 falló");
  }

  // Intento 2: Limpiar y parsear
  const cleaned = cleanJsonString(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.log("[OutputMain v3.2] Parse intento 2 falló");
  }

  // Intento 3: Extraer primer JSON completo (bracket-counting)
  const startIdx = text.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx !== -1) {
      const extracted = text.substring(startIdx, endIdx + 1);
      const matched = cleanJsonString(extracted);
      try {
        return JSON.parse(matched);
      } catch (e) {
        console.log("[OutputMain v3.2] Parse intento 3 falló");
      }
    }
  }

  throw new Error("No se pudo parsear el JSON después de múltiples intentos");
}

if (llmData.output) {
  llmOutput = extractJson(llmData.output);
  console.log("[OutputMain v3.2] ✅ LLM JSON parsed");
} else {
  llmOutput = llmData;
}

// ============================================================================
// 3. EXTRAER content_whatsapp Y state_patch
// ============================================================================

const contentWhatsapp = llmOutput.content_whatsapp || "";
const statePatch = llmOutput.state_patch || {};

if (!contentWhatsapp) {
  throw new Error("[OutputMain] Missing content_whatsapp from LLM");
}

console.log("[OutputMain v3.2] state_patch keys:", Object.keys(statePatch));

// ============================================================================
// 4. APLICAR PATCH AL STATE (protegiendo campos)
// ============================================================================

const mergedState = { ...originalState };

// ── Protección: turno confirmado + pagado → no degradar stage ──
// Cuando el turno ya está agendado y la seña pagada, el stage no puede
// retroceder de "turno_confirmado" a etapas anteriores.
// Esto protege contra el LLM enviando state_patch incorrecto durante
// consultas de disponibilidad para reprogramación.
const turnoConfirmadoPagado = originalState.turno_agendado === true && originalState.sena_pagada === true;
if (turnoConfirmadoPagado && statePatch.stage && statePatch.stage !== "turno_confirmado") {
  console.log(`[OutputMain v3.2] 🛡️ Protección turno confirmado+pagado: bloqueando stage "${statePatch.stage}" → manteniendo "turno_confirmado"`);
  delete statePatch.stage;
}

for (const [key, value] of Object.entries(statePatch)) {
  // Saltar campos protegidos
  if (protectedFields.includes(key)) {
    console.log(`[OutputMain v3.2] ⚠️ Ignorando campo protegido: ${key}`);
    continue;
  }

  // Manejar contadores (incrementales)
  if (["services_seen", "prices_asked", "deep_interest"].includes(key)) {
    const currentVal = Number(mergedState[key]) || 0;
    const patchVal = Number(value) || 0;
    // Si el patch es mayor, usar el patch (asume que LLM incrementó)
    // Si no, mantener el original
    mergedState[key] = Math.max(currentVal, patchVal);
    console.log(`[OutputMain v3.2] Contador ${key}: ${currentVal} → ${mergedState[key]}`);
    continue;
  }

  // Manejar arrays (interests) - merge sin duplicados
  if (key === "interests" && Array.isArray(value)) {
    const currentArr = Array.isArray(mergedState.interests) ? mergedState.interests : [];
    const merged = [...new Set([...currentArr, ...value])];
    mergedState.interests = merged;
    console.log(`[OutputMain v3.2] Interests merged:`, merged);
    continue;
  }

  // Manejar timestamps de solicitud (true → timestamp ISO, false → null)
  if ((key === "email_ask_ts" || key === "fullname_ask_ts") && typeof value === 'boolean') {
    if (value === false) {
      // LLM dice "ya no preguntar" → limpiar el campo (Baserow necesita null, no false)
      mergedState[key] = null;
      console.log(`[OutputMain v3.2] ${key} → null (LLM envió false)`);
      continue;
    }
    // value === true → convertir a timestamp
    // Formato para Baserow: YYYY-MM-DDThh:mm:ss-03:00
    // Ajustar UTC a Argentina (UTC-3)
    const now = new Date();
    const argentinaTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    const offset = '-03:00';
    const year = argentinaTime.getUTCFullYear();
    const month = String(argentinaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(argentinaTime.getUTCDate()).padStart(2, '0');
    const hours = String(argentinaTime.getUTCHours()).padStart(2, '0');
    const minutes = String(argentinaTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(argentinaTime.getUTCSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
    mergedState[key] = timestamp;
    console.log(`[OutputMain v3.2] ${key} convertido a timestamp:`, timestamp);
    continue;
  }

  // Campos normales: sobrescribir
  mergedState[key] = value;
}

console.log("[OutputMain v3.2] Merged state:");
console.log("  - stage:", mergedState.stage);
console.log("  - servicio_interes:", mergedState.servicio_interes);
console.log("  - waiting_image:", mergedState.waiting_image);

// ============================================================================
// 5. GENERAR NOTES DINÁMICO
// ============================================================================

function generateContextualNote(state) {
  const stage = state.stage;
  const servicio = state.servicio_interes;

  if (stage === "explore") {
    return "Conversación inicial - explorando servicios";
  }

  if (stage === "consulta") {
    if (state.waiting_image) {
      return `Consulta ${servicio} - Esperando foto`;
    }
    return `Consulta sobre ${servicio || "servicios"}`;
  }

  if (stage === "presupuesto") {
    const analysis = state.image_analysis;
    if (analysis) {
      return `Presupuesto ${servicio} - Cabello ${analysis.length || ""} (${analysis.complexity || "media"})`;
    }
    return `Presupuesto dado - ${servicio}`;
  }

  if (stage === "turno_pendiente") {
    return `Gestionando turno - ${servicio}`;
  }

  if (stage === "turno_confirmado") {
    return `Turno confirmado - ${servicio} (${state.turno_fecha || "fecha pendiente"})`;
  }

  return "Conversación en curso";
}

// ============================================================================
// 6. HELPERS
// ============================================================================

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeText(str, maxLength = 3500) {
  if (!str) return "";
  let text = String(str)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1) + "…";
  }
  return text;
}

// ============================================================================
// 7. CONSTRUIR CONTENIDO HTML
// ============================================================================

const whatsappContent = sanitizeText(contentWhatsapp);
const bodyHtml = `<p>${escapeHtml(whatsappContent)}</p>`;

// ============================================================================
// 8. CONSTRUIR BASEROW UPDATE (estructura unificada)
// ============================================================================

const baserowUpdate = {
  // IDs (para identificar el row)
  row_id: mergedState.row_id,

  // Datos del cliente (actualizables por LLM)
  full_name: mergedState.full_name || null,
  email: mergedState.email || null,

  // Funnel state
  stage: mergedState.stage,
  priority: mergedState.priority || "normal",
  servicio_interes: mergedState.servicio_interes || null,
  interests: Array.isArray(mergedState.interests) ? mergedState.interests : [],

  // Flags del proceso
  foto_recibida: Boolean(mergedState.foto_recibida),
  presupuesto_dado: Boolean(mergedState.presupuesto_dado),
  turno_agendado: Boolean(mergedState.turno_agendado),
  turno_fecha: mergedState.turno_fecha || null,
  sena_pagada: Boolean(mergedState.sena_pagada),
  waiting_image: Boolean(mergedState.waiting_image),

  // NOTA: Campos de pago (link_pago, mp_preference_id, precio, etc.)
  // NO van aquí - se guardan en TurnosLeraysi via sub-workflow

  // Contadores
  services_seen: mergedState.services_seen ?? 0,
  prices_asked: mergedState.prices_asked ?? 0,
  deep_interest: mergedState.deep_interest ?? 0,

  // Cooldowns (Baserow datetime: solo acepta string ISO o null, NUNCA boolean)
  email_ask_ts: typeof mergedState.email_ask_ts === 'string' ? mergedState.email_ask_ts : null,
  fullname_ask_ts: typeof mergedState.fullname_ask_ts === 'string' ? mergedState.fullname_ask_ts : null,

  // Nota dinámica
  notes: generateContextualNote(mergedState),

  // Análisis de imagen (si existe)
  image_analysis: mergedState.image_analysis
    ? JSON.stringify(mergedState.image_analysis)
    : null,
};

console.log("[OutputMain v3.2] Notes generado:", baserowUpdate.notes);

// ============================================================================
// 9. OUTPUT FINAL
// ============================================================================

const output = {
  content_whatsapp: {
    content: whatsappContent,
    message_type: "outgoing",
    content_type: "text",
  },
  body_html: bodyHtml,
  lead_id: mergedState.lead_id,
  row_id: mergedState.row_id,
  baserow_update: baserowUpdate,
  state: mergedState,
  meta: {
    timestamp: new Date().toISOString(),
    version: "leraysi-output@3.1",
    patch_applied: Object.keys(statePatch),
  },
};

console.log("[OutputMain v3.2] ✅ Done");

return [{ json: output }];
