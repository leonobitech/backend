// ============================================================================
// OUTPUT MAIN v7.3 PRODUCTION - Ultra Robusto
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de Master AI Agent Main
//
// Recibe: Output del LLM (message, profile_for_persist, state_for_persist)
// Output: Estructura completa para Chatwoot/Odoo/Baserow
//
// Changelog v7.3:
// - Limpieza robusta de markdown code blocks
// - Manejo de múltiples formatos de output
// - Estrategias de repair mejoradas
// - Logs detallados para debugging
// - Validaciones exhaustivas
// ============================================================================

const inputData = $input.first().json;

console.log(
  "[OutputMain v7.3] ================================================"
);
console.log("[OutputMain v7.3] Starting PRODUCTION version...");
console.log(
  "[OutputMain v7.3] ================================================"
);

// ============================================================================
// 1. PARSING ULTRA ROBUSTO DEL OUTPUT DEL LLM
// ============================================================================

let masterOutput;

if (inputData.output) {
  try {
    // ========================================================================
    // FASE 1: LIMPIEZA INICIAL
    // ========================================================================
    let rawOutput = inputData.output.trim();

    console.log(
      "[OutputMain v7.3] Raw output length:",
      rawOutput.length,
      "chars"
    );

    // LIMPIEZA A: Markdown code blocks
    if (rawOutput.includes("```")) {
      console.log(
        "[OutputMain v7.3] 🔧 Detected markdown code blocks, cleaning..."
      );

      // Remover ```json al inicio
      rawOutput = rawOutput.replace(/^```json\s*/i, "");
      // Remover ``` al inicio (sin json)
      rawOutput = rawOutput.replace(/^```\s*/, "");
      // Remover ``` al final
      rawOutput = rawOutput.replace(/\s*```$/m, "");

      rawOutput = rawOutput.trim();
      console.log("[OutputMain v7.3] ✅ Markdown removed");
    }

    // LIMPIEZA B: Whitespace problemático
    rawOutput = rawOutput.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

    // ========================================================================
    // FASE 2: PARSE INICIAL
    // ========================================================================
    masterOutput = JSON.parse(rawOutput);
    console.log(
      "[OutputMain v7.3] ✅ JSON parsed successfully on first attempt"
    );
  } catch (parseError) {
    console.log(
      "[OutputMain v7.3] ⚠️ Initial parse failed:",
      parseError.message
    );
    console.log("[OutputMain v7.3] 🔧 Initiating repair sequence...");

    try {
      let fixedJson = inputData.output.trim();

      // ======================================================================
      // REPAIR STAGE 1: Markdown removal
      // ======================================================================
      if (fixedJson.includes("```")) {
        console.log("[OutputMain v7.3] REPAIR 1: Removing markdown...");
        fixedJson = fixedJson.replace(/^```json\s*/i, "");
        fixedJson = fixedJson.replace(/^```\s*/, "");
        fixedJson = fixedJson.replace(/\s*```$/m, "");
        fixedJson = fixedJson.trim();
      }

      // ======================================================================
      // REPAIR STAGE 2: Invalid _tool_calls_ignored keys
      // ======================================================================
      const invalidKeyMarker = '"_tool_calls_ignored';
      if (fixedJson.includes(invalidKeyMarker)) {
        console.log(
          "[OutputMain v7.3] REPAIR 2: Removing _tool_calls_ignored..."
        );

        const corruptIndex = fixedJson.indexOf(invalidKeyMarker);
        let cutIndex = corruptIndex;

        // Buscar coma anterior
        for (let i = corruptIndex - 1; i >= 0; i--) {
          if (fixedJson[i] === ",") {
            cutIndex = i;
            break;
          }
        }

        // Truncar y cerrar objeto
        fixedJson = fixedJson.substring(0, cutIndex).trim() + "\n}";
        console.log("[OutputMain v7.3] ✅ Invalid key removed");
      }

      // ======================================================================
      // REPAIR STAGE 3: Malformed internal_reasoning
      // ======================================================================
      if (fixedJson.includes('"internal_reasoning"')) {
        console.log(
          "[OutputMain v7.3] REPAIR 3: Cleaning internal_reasoning..."
        );
        fixedJson = fixedJson.replace(
          /,?\s*"internal_reasoning"\s*:\s*\{[^}]*\}/g,
          ""
        );
      }

      // ======================================================================
      // REPAIR STAGE 4: Suspiciously long field names (>200 chars)
      // ======================================================================
      const longFieldPattern = /"_[^"]{200,}"\s*:/;
      if (longFieldPattern.test(fixedJson)) {
        console.log("[OutputMain v7.3] REPAIR 4: Removing long field names...");

        const match = fixedJson.match(longFieldPattern);
        if (match) {
          const fieldIndex = fixedJson.indexOf(match[0]);
          let cutIndex = fieldIndex;

          for (let i = fieldIndex - 1; i >= 0; i--) {
            if (fixedJson[i] === ",") {
              cutIndex = i;
              break;
            }
          }

          fixedJson = fixedJson.substring(0, cutIndex).trim() + "\n}";
          console.log("[OutputMain v7.3] ✅ Long field name removed");
        }
      }

      // ======================================================================
      // REPAIR STAGE 5: Trailing commas
      // ======================================================================
      console.log("[OutputMain v7.3] REPAIR 5: Cleaning trailing commas...");
      fixedJson = fixedJson.replace(/,\s*,/g, ",");
      fixedJson = fixedJson.replace(/,\s*}/g, "}");
      fixedJson = fixedJson.replace(/,\s*]/g, "]");

      // ======================================================================
      // REPAIR STAGE 6: Final parse attempt
      // ======================================================================
      masterOutput = JSON.parse(fixedJson);
      console.log("[OutputMain v7.3] ✅ JSON repaired and parsed successfully");
    } catch (repairError) {
      console.log("[OutputMain v7.3] ❌ CRITICAL: Repair sequence failed");
      console.log("[OutputMain v7.3] Original error:", parseError.message);
      console.log("[OutputMain v7.3] Repair error:", repairError.message);
      console.log(
        "[OutputMain v7.3] ==================== DEBUG INFO ===================="
      );
      console.log(
        "[OutputMain v7.3] First 500 chars:",
        inputData.output.substring(0, 500)
      );
      console.log(
        "[OutputMain v7.3] Last 500 chars:",
        inputData.output.substring(inputData.output.length - 500)
      );
      console.log(
        "[OutputMain v7.3] ================================================"
      );

      throw new Error(
        `[OutputMain v7.3] PARSE FAILED. Original: ${parseError.message}. Repair: ${repairError.message}`
      );
    }
  }
} else {
  console.log("[OutputMain v7.3] No 'output' field, using inputData directly");
  masterOutput = inputData;
}

// ============================================================================
// 2. VALIDACIÓN DE ESTRUCTURA
// ============================================================================

console.log("[OutputMain v7.3] Validating structure...");

// Validación crítica: message.text
if (!masterOutput.message || !masterOutput.message.text) {
  console.log("[OutputMain v7.3] ❌ CRITICAL: Missing message.text");
  console.log("[OutputMain v7.3] Available keys:", Object.keys(masterOutput));
  throw new Error("[OutputMain v7.3] Missing required field: message.text");
}

// Validación crítica: profile_for_persist
if (
  !masterOutput.profile_for_persist ||
  !masterOutput.profile_for_persist.row_id
) {
  console.log(
    "[OutputMain v7.3] ❌ CRITICAL: Missing profile_for_persist.row_id"
  );
  throw new Error(
    "[OutputMain v7.3] Missing required field: profile_for_persist.row_id"
  );
}

// Validación crítica: state_for_persist
if (!masterOutput.state_for_persist) {
  console.log("[OutputMain v7.3] ❌ CRITICAL: Missing state_for_persist");
  throw new Error(
    "[OutputMain v7.3] Missing required field: state_for_persist"
  );
}

console.log("[OutputMain v7.3] ✅ Structure validation passed");

// ============================================================================
// 3. EXTRACCIÓN DE DATOS
// ============================================================================

const {
  message,
  profile_for_persist,
  state_for_persist,
  cta_menu,
  state_update,
  internal_reasoning,
} = masterOutput;

// Obtener lead_id de múltiples fuentes posibles
const lead_id =
  masterOutput.lead_id ||
  profile_for_persist.lead_id ||
  state_for_persist.lead_id;

if (!lead_id) {
  console.log("[OutputMain v7.3] ❌ CRITICAL: No lead_id found");
  throw new Error("[OutputMain v7.3] Missing lead_id");
}

console.log("[OutputMain v7.3] ✅ Data extracted successfully:");
console.log("[OutputMain v7.3]   - lead_id:", lead_id);
console.log(
  "[OutputMain v7.3]   - profile.row_id:",
  profile_for_persist.row_id
);
console.log("[OutputMain v7.3]   - state.stage:", state_for_persist.stage);
console.log(
  "[OutputMain v7.3]   - state.interests:",
  state_for_persist.interests
);
console.log("[OutputMain v7.3]   - message.rag_used:", message.rag_used);
console.log("[OutputMain v7.3]   - cta_menu:", cta_menu ? "present" : "null");

// ============================================================================
// 4. HELPERS - Formateo de texto
// ============================================================================

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeText(str, maxLength = 3500) {
  if (!str) return "";

  let text = String(str);

  try {
    text = text.normalize("NFC");
  } catch (e) {
    // Ignore normalization errors
  }

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1) + "…";
  }

  return text;
}

function markdownToHtml(md) {
  if (!md) return "";

  const lines = md.split(/\r?\n/);
  let html = "";
  let inList = false;
  let currentParagraph = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isBullet = /^[•\-]\s+/.test(line);

    if (isBullet) {
      if (currentParagraph) {
        html += `<p>${escapeHtml(currentParagraph)}</p>`;
        currentParagraph = "";
      }

      if (!inList) {
        html += "<ul>";
        inList = true;
      }

      const text = line.replace(/^[•\-]\s+/, "");
      html += `<li>${escapeHtml(text)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }

      if (!line) {
        if (currentParagraph) {
          html += `<p>${escapeHtml(currentParagraph)}</p>`;
          currentParagraph = "";
        }
      } else {
        if (currentParagraph) {
          currentParagraph += " " + line;
        } else {
          currentParagraph = line;
        }
      }
    }
  }

  if (inList) {
    html += "</ul>";
  }

  if (currentParagraph) {
    html += `<p>${escapeHtml(currentParagraph)}</p>`;
  }

  return html;
}

function arrayToHtmlList(items, ordered = false) {
  if (!Array.isArray(items) || items.length === 0) return "";

  const tag = ordered ? "ol" : "ul";
  const listItems = items
    .map((item) => `<li>${escapeHtml(String(item))}</li>`)
    .join("");

  return `<${tag}>${listItems}</${tag}>`;
}

function arrayToTextList(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items.map((item) => `• ${String(item)}`).join("\n");
}

// ============================================================================
// 5. CONSTRUIR CONTENIDO WHATSAPP
// ============================================================================

console.log("[OutputMain v7.3] Building WhatsApp content...");

let whatsappContent = `🤖 Leonobit:\n${sanitizeText(message.text)}`;

// Agregar fuentes si RAG fue usado
if (
  message.rag_used &&
  Array.isArray(message.sources) &&
  message.sources.length > 0
) {
  const sourcesText = message.sources
    .slice(0, 3)
    .map((s) => `• ${s.name || "Servicio"}`)
    .join("\n");

  whatsappContent += `\n\n*Fuentes:*\n${sourcesText}`;
}

console.log(
  "[OutputMain v7.3] WhatsApp content length:",
  whatsappContent.length,
  "chars"
);

// ============================================================================
// 6. CONSTRUIR HTML PARA ODOO
// ============================================================================

console.log("[OutputMain v7.3] Building HTML content...");

let bodyHtml = `<p><strong>🤖 Leonobit:</strong></p>\n${markdownToHtml(
  message.text
)}`;

// Agregar fuentes
if (
  message.rag_used &&
  Array.isArray(message.sources) &&
  message.sources.length > 0
) {
  bodyHtml += "<p><strong>Fuentes:</strong></p>";
  bodyHtml += arrayToHtmlList(
    message.sources.slice(0, 3).map((s) => s.name || "Servicio"),
    false
  );
}

console.log("[OutputMain v7.3] HTML content length:", bodyHtml.length, "chars");

// ============================================================================
// 7. CONSTRUIR CHATWOOT MESSAGES
// ============================================================================

console.log("[OutputMain v7.3] Building Chatwoot messages...");

let chatwootMessages = [
  {
    content: whatsappContent,
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {},
  },
];

let structuredCta = [];

// CTA Menu (si existe)
if (cta_menu && Array.isArray(cta_menu.items) && cta_menu.items.length > 0) {
  console.log(
    "[OutputMain v7.3] CTA menu detected with",
    cta_menu.items.length,
    "items"
  );

  const menuMessage = {
    content: cta_menu.prompt || "¿Cómo querés avanzar?",
    message_type: "outgoing",
    content_type: "input_select",
    content_attributes: {
      items: cta_menu.items.map((item) => ({
        title: String(item),
        value: String(item),
      })),
    },
  };

  chatwootMessages.push(menuMessage);
  structuredCta = cta_menu.items;

  // Agregar menú al texto de WhatsApp
  whatsappContent += `\n\n*${cta_menu.prompt || "Opciones:"}*\n`;
  whatsappContent += arrayToTextList(cta_menu.items);

  // Agregar menú al HTML de Odoo
  bodyHtml += `<p><strong>${escapeHtml(
    cta_menu.prompt || "Opciones:"
  )}</strong></p>`;
  bodyHtml += arrayToHtmlList(cta_menu.items, false);
}

// ============================================================================
// 8. DETECTAR EXPECT_REPLY
// ============================================================================

const hasQuestion = /[?¿]/.test(message.text);
const expectReply = cta_menu ? true : hasQuestion;

console.log(
  "[OutputMain v7.3] Expect reply:",
  expectReply,
  "(has question:",
  hasQuestion,
  ", has menu:",
  !!cta_menu,
  ")"
);

// ============================================================================
// 9. STATE MERGE (si hay state_update)
// ============================================================================

let finalState = state_for_persist;

if (state_update && Object.keys(state_update).length > 0) {
  console.log("[OutputMain v7.3] ⚠️ state_update detected, merging...");

  finalState = { ...state_for_persist };

  Object.keys(state_update).forEach((key) => {
    if (key === "counters" && state_update.counters) {
      finalState.counters = {
        ...finalState.counters,
        ...state_update.counters,
      };
    } else if (key === "cooldowns" && state_update.cooldowns) {
      finalState.cooldowns = {
        ...finalState.cooldowns,
        ...state_update.cooldowns,
      };
    } else if (state_update[key] !== undefined) {
      finalState[key] = state_update[key];
    }
  });

  console.log("[OutputMain v7.3] ✅ State merged");
}

// ============================================================================
// 10. VALIDACIONES FINALES
// ============================================================================

console.log("[OutputMain v7.3] Running final validations...");

// Validar sincronización de counters
const interestsLength = finalState.interests?.length || 0;
const servicesSeenCounter = finalState.counters?.services_seen || 0;

if (interestsLength !== servicesSeenCounter) {
  console.log("[OutputMain v7.3] ⚠️ WARNING: Counter mismatch");
  console.log("[OutputMain v7.3]   - interests.length:", interestsLength);
  console.log(
    "[OutputMain v7.3]   - counters.services_seen:",
    servicesSeenCounter
  );
}

// Validar campos fijos
if (finalState.tz !== "-03:00") {
  console.log(
    "[OutputMain v7.3] ⚠️ WARNING: timezone is not -03:00, got:",
    finalState.tz
  );
}

if (finalState.channel !== "whatsapp") {
  console.log(
    "[OutputMain v7.3] ⚠️ WARNING: channel is not whatsapp, got:",
    finalState.channel
  );
}

// ============================================================================
// 11. METADATA
// ============================================================================

const metadata = {
  timestamp: new Date().toISOString(),
  rag_used: message.rag_used || false,
  sources_count: message.sources ? message.sources.length : 0,
  has_cta_menu: !!cta_menu,
  internal_reasoning: internal_reasoning || null,
  version: "output-main@7.3",
};

// ============================================================================
// 12. CONSTRUIR OUTPUT FINAL
// ============================================================================

console.log("[OutputMain v7.3] Building final output...");

const output = {
  has_tool_calls: false,

  content_whatsapp: {
    content: whatsappContent,
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {},
  },

  chatwoot_messages: chatwootMessages,

  chatwoot_input_select:
    chatwootMessages.length > 1 ? chatwootMessages[1] : null,

  body_html: bodyHtml,

  lead_id: lead_id,
  id: lead_id,

  state_for_persist: finalState,
  profile_for_persist: profile_for_persist,

  structured_cta: structuredCta,

  expect_reply: expectReply,

  message_kind: internal_reasoning?.intent_detected || "response",

  meta: metadata,
};

// ============================================================================
// 13. LOGS FINALES
// ============================================================================

console.log(
  "[OutputMain v7.3] ================================================"
);
console.log("[OutputMain v7.3] ✅ OUTPUT BUILT SUCCESSFULLY");
console.log(
  "[OutputMain v7.3] ================================================"
);
console.log("[OutputMain v7.3] Summary:");
console.log("[OutputMain v7.3]   - lead_id:", output.lead_id);
console.log(
  "[OutputMain v7.3]   - profile.row_id:",
  output.profile_for_persist.row_id
);
console.log(
  "[OutputMain v7.3]   - state.stage:",
  output.state_for_persist.stage
);
console.log(
  "[OutputMain v7.3]   - state.interests:",
  output.state_for_persist.interests
);
console.log(
  "[OutputMain v7.3]   - content_whatsapp length:",
  output.content_whatsapp.content.length
);
console.log("[OutputMain v7.3]   - body_html length:", output.body_html.length);
console.log(
  "[OutputMain v7.3]   - chatwoot_messages:",
  output.chatwoot_messages.length
);
console.log(
  "[OutputMain v7.3]   - structured_cta:",
  output.structured_cta.length
);
console.log("[OutputMain v7.3]   - expect_reply:", output.expect_reply);
console.log("[OutputMain v7.3]   - meta.rag_used:", output.meta.rag_used);
console.log("[OutputMain v7.3]   - meta.version:", output.meta.version);
console.log(
  "[OutputMain v7.3] ================================================"
);

// ============================================================================
// 14. RETURN
// ============================================================================

return [
  {
    json: output,
  },
];
