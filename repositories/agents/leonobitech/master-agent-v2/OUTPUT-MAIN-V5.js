// ============================================================================
// OUTPUT MAIN v7.5 DEFINITIVE - PRODUCTION READY
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de Master AI Agent Main
//
// Compatible con: System Prompt v7.2
// Recibe: Output del LLM (message, profile_for_persist, state_for_persist)
// Output: Estructura completa para Chatwoot/Odoo/Baserow
//
// Changelog v7.5:
// - Limpieza robusta de markdown code blocks
// - Detección y truncado de trailing text
// - Manejo inteligente de múltiples formatos
// - Logs ultra detallados para debugging
// - Validaciones exhaustivas pero eficientes
// - Compatible 100% con System Prompt v7.2
// ============================================================================

const inputData = $input.first().json;

console.log("========================================================");
console.log("[OutputMain v7.5] PRODUCTION - Starting...");
console.log("========================================================");

// ============================================================================
// 1. PARSING ROBUSTO DEL OUTPUT DEL LLM
// ============================================================================

let masterOutput;

if (inputData.output) {
  try {
    // ========================================================================
    // FASE 1: LIMPIEZA INICIAL SIMPLE
    // ========================================================================
    let rawOutput = inputData.output.trim();

    console.log(
      "[OutputMain v7.5] Raw output length:",
      rawOutput.length,
      "chars"
    );

    // LIMPIEZA A: Markdown code blocks (simple y efectivo)
    if (rawOutput.includes("```")) {
      console.log("[OutputMain v7.5] 🔧 Cleaning markdown blocks...");
      rawOutput = rawOutput.replace(/^```json\s*/i, "");
      rawOutput = rawOutput.replace(/^```\s*/, "");
      rawOutput = rawOutput.replace(/\s*```$/m, "");
      rawOutput = rawOutput.trim();
      console.log("[OutputMain v7.5] ✅ Markdown removed");
    }

    // ========================================================================
    // FASE 2: PARSE DIRECTO
    // ========================================================================
    masterOutput = JSON.parse(rawOutput);
    console.log("[OutputMain v7.5] ✅ JSON parsed successfully");
  } catch (parseError) {
    console.log("[OutputMain v7.5] ⚠️ Parse failed:", parseError.message);
    console.log("[OutputMain v7.5] 🔧 Starting repair...");

    try {
      let fixedJson = inputData.output.trim();

      // ======================================================================
      // REPAIR 1: Markdown
      // ======================================================================
      if (fixedJson.includes("```")) {
        console.log("[OutputMain v7.5] REPAIR: Removing markdown...");
        fixedJson = fixedJson.replace(/^```json\s*/i, "");
        fixedJson = fixedJson.replace(/^```\s*/, "");
        fixedJson = fixedJson.replace(/\s*```$/m, "");
        fixedJson = fixedJson.trim();
      }

      // ======================================================================
      // REPAIR 2: Detectar fin de JSON y truncar trailing text
      // ======================================================================
      console.log("[OutputMain v7.5] REPAIR: Finding JSON boundaries...");

      let depth = 0;
      let inString = false;
      let escape = false;
      let jsonEnd = -1;

      for (let i = 0; i < fixedJson.length; i++) {
        const char = fixedJson[i];

        if (escape) {
          escape = false;
          continue;
        }

        if (char === "\\") {
          escape = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === "{") {
            depth++;
          } else if (char === "}") {
            depth--;
            if (depth === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
      }

      if (jsonEnd !== -1 && jsonEnd < fixedJson.length) {
        const trailing = fixedJson.substring(jsonEnd).trim();
        if (trailing.length > 0) {
          console.log(
            "[OutputMain v7.5] ✅ Truncated",
            trailing.length,
            "chars trailing text"
          );
          console.log("[OutputMain v7.5] Preview:", trailing.substring(0, 100));
          fixedJson = fixedJson.substring(0, jsonEnd);
        }
      }

      // ======================================================================
      // REPAIR 3: Limpiar claves corruptas
      // ======================================================================
      const invalidKey = '"_tool_calls_ignored';
      if (fixedJson.includes(invalidKey)) {
        console.log("[OutputMain v7.5] REPAIR: Removing invalid keys...");
        const idx = fixedJson.indexOf(invalidKey);
        let cutIdx = idx;
        for (let i = idx - 1; i >= 0; i--) {
          if (fixedJson[i] === ",") {
            cutIdx = i;
            break;
          }
        }
        fixedJson = fixedJson.substring(0, cutIdx).trim() + "\n}";
      }

      // ======================================================================
      // REPAIR 4: Trailing commas
      // ======================================================================
      fixedJson = fixedJson.replace(/,\s*}/g, "}");
      fixedJson = fixedJson.replace(/,\s*]/g, "]");

      // ======================================================================
      // PARSE FINAL
      // ======================================================================
      masterOutput = JSON.parse(fixedJson);
      console.log("[OutputMain v7.5] ✅ JSON repaired successfully");
    } catch (repairError) {
      console.log("[OutputMain v7.5] ❌ CRITICAL: Repair failed");
      console.log("[OutputMain v7.5] Original error:", parseError.message);
      console.log("[OutputMain v7.5] Repair error:", repairError.message);
      console.log(
        "[OutputMain v7.5] ==================== DEBUG ===================="
      );
      console.log(
        "[OutputMain v7.5] First 600:",
        inputData.output.substring(0, 600)
      );
      console.log(
        "[OutputMain v7.5] Last 600:",
        inputData.output.substring(inputData.output.length - 600)
      );
      console.log(
        "[OutputMain v7.5] =========================================="
      );

      throw new Error(
        `[OutputMain v7.5] PARSE FAILED. Original: ${parseError.message}. Repair: ${repairError.message}`
      );
    }
  }
} else {
  console.log("[OutputMain v7.5] No 'output' field, using inputData directly");
  masterOutput = inputData;
}

// ============================================================================
// 2. VALIDACIÓN DE ESTRUCTURA CRÍTICA
// ============================================================================

console.log("[OutputMain v7.5] Validating structure...");

if (!masterOutput.message || !masterOutput.message.text) {
  console.log("[OutputMain v7.5] ❌ Missing message.text");
  throw new Error("[OutputMain v7.5] Missing required field: message.text");
}

if (
  !masterOutput.profile_for_persist ||
  !masterOutput.profile_for_persist.row_id
) {
  console.log("[OutputMain v7.5] ❌ Missing profile_for_persist.row_id");
  throw new Error("[OutputMain v7.5] Missing profile_for_persist.row_id");
}

if (!masterOutput.state_for_persist) {
  console.log("[OutputMain v7.5] ❌ Missing state_for_persist");
  throw new Error("[OutputMain v7.5] Missing state_for_persist");
}

console.log("[OutputMain v7.5] ✅ Structure valid");

// ============================================================================
// 3. EXTRACCIÓN DE DATOS
// ============================================================================

const { message, profile_for_persist, state_for_persist } = masterOutput;

const lead_id =
  masterOutput.lead_id ||
  profile_for_persist.lead_id ||
  state_for_persist.lead_id;

if (!lead_id) {
  throw new Error("[OutputMain v7.5] Missing lead_id");
}

console.log("[OutputMain v7.5] Data extracted:");
console.log("  - lead_id:", lead_id);
console.log("  - profile.row_id:", profile_for_persist.row_id);
console.log("  - state.stage:", state_for_persist.stage);
console.log("  - state.interests:", state_for_persist.interests);
console.log("  - message.rag_used:", message.rag_used);

// ============================================================================
// 4. HELPERS DE FORMATEO
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
  } catch (e) {}

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

  for (let line of lines) {
    line = line.trim();
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

  if (inList) html += "</ul>";
  if (currentParagraph) html += `<p>${escapeHtml(currentParagraph)}</p>`;

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

console.log("[OutputMain v7.5] Building WhatsApp content...");

let whatsappContent = `🤖 Leonobit:\n${sanitizeText(message.text)}`;

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

console.log("[OutputMain v7.5] WhatsApp length:", whatsappContent.length);

// ============================================================================
// 6. CONSTRUIR HTML PARA ODOO
// ============================================================================

console.log("[OutputMain v7.5] Building HTML content...");

let bodyHtml = `<p><strong>🤖 Leonobit:</strong></p>\n${markdownToHtml(
  message.text
)}`;

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

console.log("[OutputMain v7.5] HTML length:", bodyHtml.length);

// ============================================================================
// 7. CONSTRUIR CHATWOOT MESSAGES
// ============================================================================

console.log("[OutputMain v7.5] Building Chatwoot messages...");

let chatwootMessages = [
  {
    content: whatsappContent,
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {},
  },
];

let structuredCta = [];
let expectReply = /[?¿]/.test(message.text);

console.log("[OutputMain v7.5] Expect reply:", expectReply);

// ============================================================================
// 8. VALIDACIONES FINALES
// ============================================================================

console.log("[OutputMain v7.5] Running validations...");

const interestsLength = state_for_persist.interests?.length || 0;
const servicesSeenCounter = state_for_persist.counters?.services_seen || 0;

if (interestsLength !== servicesSeenCounter) {
  console.log("[OutputMain v7.5] ⚠️ Counter mismatch:");
  console.log("  - interests.length:", interestsLength);
  console.log("  - services_seen:", servicesSeenCounter);
}

if (state_for_persist.tz !== "-03:00") {
  console.log(
    "[OutputMain v7.5] ⚠️ Timezone not -03:00:",
    state_for_persist.tz
  );
}

if (state_for_persist.channel !== "whatsapp") {
  console.log(
    "[OutputMain v7.5] ⚠️ Channel not whatsapp:",
    state_for_persist.channel
  );
}

// ============================================================================
// 9. METADATA
// ============================================================================

const metadata = {
  timestamp: new Date().toISOString(),
  rag_used: message.rag_used || false,
  sources_count: message.sources ? message.sources.length : 0,
  version: "output-main@7.5",
};

// ============================================================================
// 10. CONSTRUIR OUTPUT FINAL
// ============================================================================

console.log("[OutputMain v7.5] Building final output...");

const output = {
  has_tool_calls: false,

  content_whatsapp: {
    content: whatsappContent,
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {},
  },

  chatwoot_messages: chatwootMessages,

  chatwoot_input_select: null,

  body_html: bodyHtml,

  lead_id: lead_id,
  id: lead_id,

  state_for_persist: state_for_persist,
  profile_for_persist: profile_for_persist,

  structured_cta: structuredCta,

  expect_reply: expectReply,

  message_kind: "response",

  meta: metadata,
};

// ============================================================================
// 11. LOGS FINALES
// ============================================================================

console.log("========================================================");
console.log("[OutputMain v7.5] ✅ SUCCESS");
console.log("========================================================");
console.log("[OutputMain v7.5] Summary:");
console.log("  - lead_id:", output.lead_id);
console.log("  - stage:", output.state_for_persist.stage);
console.log("  - interests:", output.state_for_persist.interests);
console.log("  - whatsapp length:", output.content_whatsapp.content.length);
console.log("  - html length:", output.body_html.length);
console.log("  - rag_used:", output.meta.rag_used);
console.log("========================================================");

// ============================================================================
// 12. RETURN
// ============================================================================

return [
  {
    json: output,
  },
];
