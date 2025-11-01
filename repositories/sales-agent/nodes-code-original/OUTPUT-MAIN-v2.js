// ============================================================================
// OUTPUT MAIN v2.0 - Formateo de salida para Baserow, Odoo y Chatwoot
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de Master AI Agent Main
//
// Recibe: Output de Master Agent v2.0 (message, state_update, cta_menu)
// Output: Formatos para WhatsApp, HTML (Odoo), y datos para persistir
// ============================================================================

// ============================================================================
// 1. OBTENER DATOS DE ENTRADA
// ============================================================================

const inputData = $input.first().json;

// Input desde Master Agent v2.0
const masterOutput = inputData.output ? JSON.parse(inputData.output) : inputData;

// Validar estructura
if (!masterOutput || !masterOutput.message) {
  throw new Error('[OutputMain] Missing required field: message');
}

const { message, state_update, cta_menu, internal_reasoning } = masterOutput;

console.log('[OutputMain] Processing message...');
console.log('[OutputMain] RAG used:', message.rag_used);
console.log('[OutputMain] CTA menu:', cta_menu ? 'present' : 'null');
console.log('[OutputMain] State update:', state_update ? Object.keys(state_update) : 'none');

// Pass-through data
const lead_id = inputData.lead_id;
const profile = inputData.profile;
const state_base = inputData.state;

// ============================================================================
// 2. HELPERS - Formateo de texto
// ============================================================================

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize text - remover caracteres inválidos
 */
function sanitizeText(str, maxLength = 3500) {
  if (!str) return '';

  let text = String(str);

  // Normalizar unicode
  try {
    text = text.normalize('NFC');
  } catch (e) {
    // ignore
  }

  // Limpiar caracteres de control
  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Truncar si excede límite
  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1) + '…';
  }

  return text;
}

/**
 * Convertir Markdown simple a HTML
 */
function markdownToHtml(md) {
  if (!md) return '';

  const lines = md.split(/\r?\n/);
  let html = '';
  let inList = false;
  let currentParagraph = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detectar bullet (• o - al inicio)
    const isBullet = /^[•\-]\s+/.test(line);

    if (isBullet) {
      // Cerrar párrafo anterior si existe
      if (currentParagraph) {
        html += `<p>${escapeHtml(currentParagraph)}</p>`;
        currentParagraph = '';
      }

      // Iniciar lista si no está abierta
      if (!inList) {
        html += '<ul>';
        inList = true;
      }

      // Agregar item a la lista
      const text = line.replace(/^[•\-]\s+/, '');
      html += `<li>${escapeHtml(text)}</li>`;
    } else {
      // Cerrar lista si estaba abierta
      if (inList) {
        html += '</ul>';
        inList = false;
      }

      // Línea vacía = separador de párrafos
      if (!line) {
        if (currentParagraph) {
          html += `<p>${escapeHtml(currentParagraph)}</p>`;
          currentParagraph = '';
        }
      } else {
        // Acumular texto del párrafo
        if (currentParagraph) {
          currentParagraph += ' ' + line;
        } else {
          currentParagraph = line;
        }
      }
    }
  }

  // Cerrar lista si quedó abierta
  if (inList) {
    html += '</ul>';
  }

  // Cerrar párrafo si quedó texto
  if (currentParagraph) {
    html += `<p>${escapeHtml(currentParagraph)}</p>`;
  }

  return html;
}

/**
 * Convertir array a lista HTML
 */
function arrayToHtmlList(items, ordered = false) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const tag = ordered ? 'ol' : 'ul';
  const listItems = items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('');

  return `<${tag}>${listItems}</${tag}>`;
}

/**
 * Convertir array a texto con bullets
 */
function arrayToTextList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  return items.map(item => `• ${String(item)}`).join('\n');
}

// ============================================================================
// 3. CONSTRUIR MENSAJE PARA WHATSAPP (Texto plano)
// ============================================================================

let whatsappText = sanitizeText(message.text);

// Agregar fuentes si RAG fue usado
if (message.rag_used && Array.isArray(message.sources) && message.sources.length > 0) {
  const sourcesText = message.sources
    .slice(0, 3)
    .map(s => `• ${s.name || 'Servicio'}`)
    .join('\n');

  whatsappText += `\n\n*Fuentes:*\n${sourcesText}`;
}

// ============================================================================
// 4. CONSTRUIR MENSAJE PARA ODOO (HTML)
// ============================================================================

let bodyHtml = markdownToHtml(message.text);

// Agregar fuentes
if (message.rag_used && Array.isArray(message.sources) && message.sources.length > 0) {
  bodyHtml += '<p><strong>Fuentes:</strong></p>';
  bodyHtml += arrayToHtmlList(
    message.sources.slice(0, 3).map(s => s.name || 'Servicio'),
    false
  );
}

// ============================================================================
// 5. CONSTRUIR CTA MENU (si existe)
// ============================================================================

let chatwootMessages = [];
let structuredCta = [];
let expectReply = true;

// Mensaje principal de texto
const mainMessage = {
  content: whatsappText,
  message_type: 'outgoing',
  content_type: 'text',
  content_attributes: {}
};

chatwootMessages.push(mainMessage);

// CTA Menu (si existe)
if (cta_menu && Array.isArray(cta_menu.items) && cta_menu.items.length > 0) {
  const menuMessage = {
    content: cta_menu.prompt || '¿Cómo querés avanzar?',
    message_type: 'outgoing',
    content_type: 'input_select',
    content_attributes: {
      items: cta_menu.items.map(item => ({
        title: String(item),
        value: String(item)
      }))
    }
  };

  chatwootMessages.push(menuMessage);
  structuredCta = cta_menu.items;

  // Agregar menú al texto de WhatsApp
  whatsappText += `\n\n*${cta_menu.prompt || 'Opciones:'}*\n`;
  whatsappText += arrayToTextList(cta_menu.items);

  // Agregar menú al HTML de Odoo
  bodyHtml += `<p><strong>${escapeHtml(cta_menu.prompt || 'Opciones:')}</strong></p>`;
  bodyHtml += arrayToHtmlList(cta_menu.items, false);
}

// Si no hay menú pero hay pregunta en el mensaje, esperar respuesta
const hasQuestion = /[?¿]/.test(message.text);
if (!cta_menu && hasQuestion) {
  expectReply = true;
} else if (!cta_menu) {
  expectReply = false;
}

// ============================================================================
// 6. ACTUALIZAR STATE CON state_update
// ============================================================================

const updatedState = { ...state_base };

if (state_update) {
  // Merge state updates
  Object.keys(state_update).forEach(key => {
    if (state_update[key] !== undefined) {
      updatedState[key] = state_update[key];
    }
  });

  console.log('[OutputMain] State updated with keys:', Object.keys(state_update));
}

// ============================================================================
// 7. METADATA
// ============================================================================

const metadata = {
  timestamp: new Date().toISOString(),
  rag_used: message.rag_used || false,
  sources_count: message.sources ? message.sources.length : 0,
  has_cta_menu: !!cta_menu,
  internal_reasoning: internal_reasoning || null,
  version: 'output-main@2.0'
};

// ============================================================================
// 8. OUTPUT FINAL
// ============================================================================

const output = {
  // Para Chatwoot/WhatsApp
  content_whatsapp: {
    content: sanitizeText(whatsappText),
    message_type: 'outgoing',
    content_type: 'text',
    content_attributes: {}
  },

  chatwoot_messages: chatwootMessages,

  chatwoot_input_select: chatwootMessages.length > 1 ? chatwootMessages[1] : null,

  // Para Odoo (mail.message body en HTML)
  body_html: bodyHtml,

  // Para Baserow (actualizar lead)
  lead_id: lead_id,

  // Para Odoo Record Agent Response (espera "id" no "lead_id")
  id: lead_id,

  state_for_persist: updatedState,

  profile_for_persist: profile,

  // CTAs estructurados
  structured_cta: structuredCta,

  // Expect reply
  expect_reply: expectReply,

  // Message kind
  message_kind: internal_reasoning?.intent_detected || 'response',

  // Metadata
  meta: metadata
};

// ============================================================================
// 9. LOGS PARA DEBUGGING
// ============================================================================

console.log('[OutputMain] ✅ Output formatted successfully');
console.log('[OutputMain] WhatsApp text length:', whatsappText.length, 'chars');
console.log('[OutputMain] HTML body length:', bodyHtml.length, 'chars');
console.log('[OutputMain] Chatwoot messages:', chatwootMessages.length);
console.log('[OutputMain] Structured CTAs:', structuredCta.length);
console.log('[OutputMain] Expect reply:', expectReply);

// ============================================================================
// 10. RETURN
// ============================================================================

return [{
  json: output
}];
