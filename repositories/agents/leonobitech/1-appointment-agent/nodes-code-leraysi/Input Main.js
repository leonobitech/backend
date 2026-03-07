// ============================================================================
// INPUT MAIN v3.1 - Con contexto temporal explícito
// ============================================================================

const inputData = $input.first().json;
const { history, lead_id, profile } = inputData;

// Usamos profile como state (estructura única)
const state = profile;

if (!history || !state) {
  throw new Error("[InputMain] Missing required fields: history or state");
}

// ============================================================================
// 2. CAMPOS PROTEGIDOS (no modificables por LLM)
// ============================================================================

const PROTECTED_FIELDS = [
  "row_id",
  "lead_id",
  "chatwoot_id",
  "chatwoot_inbox_id",
  "conversation_id",
];

// ============================================================================
// 3. BUILD META + CONTEXTO TEMPORAL
// ============================================================================

const now = new Date();
const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaHumana = `${diasSemana[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;

const meta = {
  now_ts: now.toISOString(),
  now_human: fechaHumana,
  history_len: history.length,
  channel: state.channel || "whatsapp",
  country: state.country || "Argentina",
  tz: state.tz || "-03:00",
};

// ============================================================================
// 4. BUILD USER PROMPT
// ============================================================================

const lastUserMessage = history.filter((m) => m.role === "user").slice(-1)[0];
const userMessageText = state.last_message || lastUserMessage?.text || "[Foto enviada]";
const displayName = state.full_name || state.nick_name || "clienta";

// Sección de análisis de imagen (solo si existe)
let imageSection = "";
if (state.image_analysis) {
  const ia = state.image_analysis;
  // Precios base de servicios de cabello (ajustados por largo detectado)
  const PRECIOS_BASE = {
    'Corte mujer': 8000, 'Alisado brasileño': 45000, 'Alisado keratina': 55000,
    'Mechas completas': 35000, 'Tintura raíz': 15000, 'Tintura completa': 25000,
    'Balayage': 50000
  };
  // Precios fijos (no dependen del largo del cabello)
  const PRECIOS_FIJOS = {
    'Manicura simple': 5000, 'Manicura semipermanente': 8000, 'Pedicura': 6000,
    'Depilación cera piernas': 10000, 'Depilación cera axilas': 4000,
    'Depilación cera bikini': 6000, 'Depilación láser piernas': 25000,
    'Depilación láser axilas': 12000
  };
  const MULT = { 'corto': 1.0, 'medio': 1.1, 'largo': 1.2, 'muy_largo': 1.2 };
  const mult = MULT[ia.length] || 1.0;

  const tablaCabello = Object.entries(PRECIOS_BASE)
    .map(([s, base]) => `- ${s}: $${Math.round(base * mult).toLocaleString('es-AR')}`)
    .join('\n');
  const tablaFijos = Object.entries(PRECIOS_FIJOS)
    .map(([s, p]) => `- ${s}: $${p.toLocaleString('es-AR')}`)
    .join('\n');

  imageSection = `
## Foto Recibida
Largo: ${ia.length} | Textura: ${ia.texture} | Condición: ${ia.condition}
Color: ${ia.current_color} | ${ia.is_dyed ? "Teñido" : "Sin teñir"} | ${ia.has_roots ? "Con raíces" : "Sin raíces"}

## PRECIOS FINALES (ya calculados, usar EXACTAMENTE estos valores)
### Servicios de cabello (ajustados para cabello ${ia.length}):
${tablaCabello}
### Servicios precio fijo:
${tablaFijos}

⚠️ USAR estos precios EXACTOS al dar presupuesto y al llamar tools. NO aplicar ajustes adicionales.
`;
}

// Formatear historial completo (últimos 10 mensajes)
const recentHistory = history.slice(-10);
const historyFormatted = recentHistory
  .map((m) => `[${m.role.toUpperCase()}]: ${m.text}`)
  .join("\n\n");

const userPrompt = `## Historial de Conversación
${historyFormatted}

---

## 📅 Contexto Temporal
**Hoy es: ${fechaHumana}**

## Estado Actual del Lead
- Stage: ${state.stage}
- Turno agendado: ${state.turno_agendado ? "SÍ" : "no"}
- Seña pagada: ${state.sena_pagada ? "SÍ" : "no"}
- Servicio de interés: ${state.servicio_interes || "ninguno"}
- Foto recibida: ${state.foto_recibida ? "SÍ" : "no"}
- Presupuesto dado: ${state.presupuesto_dado ? "SÍ" : "no"}
- Esperando foto: ${state.waiting_image ? "SÍ" : "no"}
- Contadores: services_seen=${state.services_seen}, prices_asked=${state.prices_asked}, deep_interest=${state.deep_interest}
- Datos cliente: full_name=${state.full_name || "pendiente"}, email=${state.email || "pendiente"}
${imageSection}
---

## Último Mensaje a Responder
"${userMessageText}"

Responde a este mensaje actualizando el state según corresponda.
`;

// ============================================================================
// 5. OUTPUT
// ============================================================================

return [
  {
    json: {
      userPrompt,
      lead_id,
      state,
      meta,
      _protected: PROTECTED_FIELDS,
    },
  },
];
