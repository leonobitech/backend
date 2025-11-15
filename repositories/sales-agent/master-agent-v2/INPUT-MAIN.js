// ============================================================================
// INPUT MAIN - Entrada principal al Master Agent v2.0
// ============================================================================
// Nodo: Code (n8n)
// Posición: Entre HydrateForHistory y Master AI Agent Main
//
// Recibe: Output de HydrateForHistory (history, lead_id, profile, state)
// Output: Smart Input completo + User Prompt
// ============================================================================

// 1. Obtener datos de entrada (HydrateForHistory)
const inputData = $input.first().json;
const { history, lead_id, profile, state } = inputData;

// Validar datos mínimos requeridos
if (!history || !profile || !state) {
  throw new Error('[InputMain] Missing required fields: history, profile, or state');
}

console.log('[InputMain] Processing lead:', lead_id);
console.log('[InputMain] History messages:', history.length);
console.log('[InputMain] Current stage:', state.stage);

// ============================================================================
// 2. BUILD OPTIONS (Catálogo de servicios, aliases, configuración)
// ============================================================================

const options = {
  interests_allowed: [
    "Odoo",
    "WhatsApp",
    "CRM",
    "Voz",
    "Automatización",
    "Analytics",
    "Reservas",
    "Knowledge Base"
  ],

  services_allowed: [
    "WhatsApp Chatbot",
    "Voice Assistant (IVR)",
    "Knowledge Base Agent",
    "Process Automation (Odoo/ERP)",
    "Lead Capture & Follow-ups",
    "Analytics & Reporting",
    "Smart Reservations",
    "Knowledge Intake Pipeline",
    "Webhook Guard",
    "Website Knowledge Chat",
    "Data Sync Hub",
    "Leonobitech Platform Core"
  ],

  services_aliases: {
    // WhatsApp
    "whatsapp": "WhatsApp Chatbot",
    "whatapp": "WhatsApp Chatbot",
    "chatbot": "WhatsApp Chatbot",
    "whatsapp chatbot": "WhatsApp Chatbot",
    "bot de whatsapp": "WhatsApp Chatbot",
    "bot": "WhatsApp Chatbot",
    "agente": "WhatsApp Chatbot",
    "asistente": "WhatsApp Chatbot",

    // Voz/IVR
    "ivr": "Voice Assistant (IVR)",
    "voice assistant (ivr)": "Voice Assistant (IVR)",
    "agente de voz": "Voice Assistant (IVR)",
    "asistente de voz": "Voice Assistant (IVR)",
    "llamadas": "Voice Assistant (IVR)",
    "voz": "Voice Assistant (IVR)",

    // Knowledge Base
    "knowledge base": "Knowledge Base Agent",
    "knowledge_base": "Knowledge Base Agent",
    "knowledge base agent": "Knowledge Base Agent",
    "knowledgebase": "Knowledge Base Agent",
    "base de conocimiento": "Knowledge Base Agent",
    "agente de conocimiento": "Knowledge Base Agent",
    "rag": "Knowledge Base Agent",
    "faq": "Knowledge Base Agent",
    "kb": "Knowledge Base Agent",

    // Odoo/ERP/CRM
    "odoo": "Process Automation (Odoo/ERP)",
    "erp": "Process Automation (Odoo/ERP)",
    "crm": "Process Automation (Odoo/ERP)",
    "process automation (odoo/erp)": "Process Automation (Odoo/ERP)",
    "automatización de procesos": "Process Automation (Odoo/ERP)",
    "automatizacion": "Process Automation (Odoo/ERP)",

    // Otros
    "leads": "Lead Capture & Follow-ups",
    "lead capture & follow-ups": "Lead Capture & Follow-ups",
    "seguimiento": "Lead Capture & Follow-ups",
    "reportes": "Analytics & Reporting",
    "analytics & reporting": "Analytics & Reporting",
    "analítica": "Analytics & Reporting",
    "analytics": "Analytics & Reporting",
    "reservas": "Smart Reservations",
    "smart reservations": "Smart Reservations",
    "bookings": "Smart Reservations",
    "turnos": "Smart Reservations",
    "ingesta": "Knowledge Intake Pipeline",
    "knowledge intake pipeline": "Knowledge Intake Pipeline",
    "webhook": "Webhook Guard",
    "webhook guard": "Webhook Guard",
    "website chat": "Website Knowledge Chat",
    "chat web": "Website Knowledge Chat",
    "website knowledge": "Website Knowledge Chat",
    "website_knowledge": "Website Knowledge Chat",
    "website knowledge chat": "Website Knowledge Chat",
    "knowledge chat": "Website Knowledge Chat",
    "sync": "Data Sync Hub",
    "data sync hub": "Data Sync Hub",
    "integración de datos": "Data Sync Hub",
    "plataforma": "Leonobitech Platform Core",
    "leonobitech platform core": "Leonobitech Platform Core",
    "core": "Leonobitech Platform Core"
  },

  services_number_map: {
    "1": "WhatsApp Chatbot",
    "2": "Voice Assistant (IVR)",
    "3": "Knowledge Base Agent",
    "4": "Process Automation (Odoo/ERP)"
  },

  stage_allowed: [
    "explore",
    "match",
    "price",
    "qualify",
    "proposal_ready"
  ],

  service_defaults: {
    "Process Automation (Odoo/ERP)": {
      bundle: [
        "Odoo CRM",
        "n8n triggers",
        "WhatsApp Chatbot (opcional)"
      ],
      rag_hints: [
        "Odoo CRM para pymes/restaurantes",
        "automatización con n8n (actividades, presupuestos→facturas)",
        "integración WhatsApp (Chatwoot) ↔ Odoo",
        "reportes y tableros operativos"
      ],
      interests: ["Odoo", "CRM"]
    },
    "WhatsApp Chatbot": {
      bundle: [
        "Chatwoot integration",
        "n8n workflows",
        "Knowledge base"
      ],
      rag_hints: [
        "Chatbot para WhatsApp Business",
        "captura de leads automática",
        "respuestas FAQ 24/7",
        "integración con CRM"
      ],
      interests: ["WhatsApp"]
    },
    "Voice Assistant (IVR)": {
      bundle: [
        "IVR system",
        "Voice recognition",
        "Call routing"
      ],
      rag_hints: [
        "Asistente de voz para llamadas",
        "IVR inteligente con IA",
        "routing automático de llamadas",
        "integración con CRM"
      ],
      interests: ["Voz"]
    }
  },

  cta_menu_default: {
    prompt: "¿Cómo querés avanzar?",
    kind: "service",
    items: [
      "Ver precios",
      "Beneficios e integraciones",
      "Agendar demo",
      "Solicitar propuesta"
    ],
    max_picks: 1
  },

  intents_allowed: [
    "greeting",
    "service_info",
    "price",
    "request_proposal",
    "demo_request",
    "contact_share",
    "schedule_request",
    "negotiation",
    "support",
    "off_topic",
    "unclear"
  ]
};

// ============================================================================
// 3. BUILD RULES (Políticas de negocio como strings accesibles al LLM)
// ============================================================================

const rules = {
  timing_and_chronology: "Procesar el history de antiguo a reciente; prevalece el evento más nuevo; usar siempre el ts del historial; no inventar datos.",

  interests_policy: "Añadir a state.interests solo ante intención explícita/implícita fuerte; SIEMPRE normalizar usando options.services_aliases (usar el VALUE del mapeo, no el key); usar SOLO nombres técnicos completos de services_allowed (ej: 'Knowledge Base Agent', NO 'Knowledge Base'); sin duplicados; no eliminar salvo rechazo explícito.",

  stage_policy: "Transiciones: explore→match (lead define necesidad/canal o elige servicio por número/alias); match→price (pregunta precio); match→qualify (aporta volumen/uso concreto o pide demo); price→qualify (tras precio, si pide demo/volumen); qualify→proposal_ready (solicita propuesta). No retroceder salvo corrección clara del lead.",

  counters_policy: "services_seen+1 si el usuario explora/elige un servicio; prices_asked+1 si pregunta precio; deep_interest+1 si pide demo o aporta volumen/uso específico. Máx +1 por tipo en una iteración.",

  cooldowns_policy: "email_ask_ts y addressee_ask_ts se actualizan SOLO cuando el assistant lo pide explícitamente; timestamp = ts del mensaje del assistant; conservar el más reciente; no usar mensajes del usuario para estos campos.",

  rag_first_policy: "Si el usuario elige servicio o expresa necesidad clara: generar service_target {canonical,bundle,rag_hints}; priorizar beneficios (3–5 vía RAG) + CTAs (precio/beneficios/demo/propuesta). Prohibido reiniciar menú general; pedir volumen solo como invitación opcional (no bloqueante).",

  anti_loop_policy: "Si en los últimos 5 minutos ya se pidió volumen/caso de uso, no repetir; avanzar con beneficios (RAG) + CTAs.",

  email_gating_policy: "can_ask_email_now=true solo si: stage ∈ {qualify,proposal_ready} AND interests≠∅ AND services_seen≥1 AND prices_asked≥1 AND deep_interest≥1 AND business_name≠∅ AND email vacío y sin cooldown. Si es false, reason debe listar faltantes y 'stage insuficiente' si stage∉{qualify,proposal_ready}.",

  privacy_policy: "No incluir PII (nombre, teléfono, email, IDs, país, tz, canal) en history_summary/recommendation/reason; referirse como 'el usuario'.",

  menu_guard_policy: "Con service_target presente o stage≥match está prohibido recomendar menú general. Usar CTAs del servicio.",

  self_check_policy: "Si el último mensaje es selección de servicio (número/alias) y no hay precio/volumen/demo, stage MUST BE 'match' y services_seen+=1. service_target.bundle y rag_hints no pueden quedar vacíos (3–6 hints). state.interests debe usar VALORES (VALUES) de services_aliases, NO keys (ej: 'Knowledge Base Agent', NO 'Knowledge Base'; 'Process Automation (Odoo/ERP)', NO 'Odoo')."
};

// ============================================================================
// 4. BUILD META (Contexto técnico)
// ============================================================================

const meta = {
  history_len: history.length,
  truncated: history.length > 50,
  locale_hint: "es",
  channel: profile.channel || "whatsapp",
  country: profile.country || "Argentina",
  tz: profile.tz || "-03:00",
  now_ts: new Date().toISOString(),
  anti_loop_window_min: 5,
  version: "smart-input@2"
};

// ============================================================================
// 4.5. FETCH MCP TOOLS (Para Odoo Actions)
// ============================================================================

let tools = [];
try {
  console.log('[InputMain] Fetching MCP tools from Odoo MCP Server...');

  const mcpResponse = await fetch('http://odoo_mcp:8100/internal/mcp/tools', {
    method: 'GET',
    headers: {
      'X-Service-Token': 'aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37',
      'Content-Type': 'application/json'
    }
  });

  if (!mcpResponse.ok) {
    console.error('[InputMain] MCP tools fetch failed:', mcpResponse.status, mcpResponse.statusText);
    // No lanzar error, continuar con tools vacío
  } else {
    const mcpData = await mcpResponse.json();
    tools = mcpData.tools || [];
    console.log('[InputMain] ✅ Fetched', tools.length, 'MCP tools');
  }
} catch (error) {
  console.error('[InputMain] Error fetching MCP tools:', error.message);
  // Continuar con tools vacío en caso de error
}

// ============================================================================
// 5. CONSTRUIR SMART INPUT COMPLETO
// ============================================================================

const smart_input = {
  history,
  profile,
  state,
  options,
  rules,
  meta,
  tools  // MCP tools para Odoo actions (agendar demo, enviar propuesta, etc.)
};

// ============================================================================
// 6. BUILD USER PROMPT
// ============================================================================

function buildUserPrompt(smartInput) {
  const { history } = smartInput;

  // Extraer último mensaje del usuario
  const lastUserMessage = history
    .filter(m => m.role === 'user')
    .slice(-1)[0];

  if (!lastUserMessage) {
    throw new Error('[InputMain] No user message found in history');
  }

  // Construir prompt
  return `# Current Conversation Context

## Last User Message
"${lastUserMessage.text}"
(Timestamp: ${lastUserMessage.ts})

## Complete Smart Input

\`\`\`json
${JSON.stringify(smartInput, null, 2)}
\`\`\`

---

**Instructions**:

1. **Read the last user message** carefully
2. **Review the conversation history** for context
3. **Check the current state** (stage, interests, counters, cooldowns)
4. **Consult the rules** for business policies
5. **Use RAG** if the user mentions services or needs
6. **Return COMPLETE profile and state** (merge your updates with the input)
7. **Respond naturally** in Spanish

Remember:
- Be conversational, not robotic
- Use RAG when relevant (rag_first_policy)
- Respect cooldowns and stage transitions
- Extract business context (business_name, industry)
- Only show CTAs when it makes sense
- **IMPORTANT**: Return the FULL \`profile\` and \`state\` objects (not just diffs)

Now respond to the user following the System Prompt guidelines.`;
}

const userPrompt = buildUserPrompt(smart_input);

// ============================================================================
// 7. LOGS PARA DEBUGGING
// ============================================================================

console.log('[InputMain] ✅ Smart Input built successfully');
console.log('[InputMain] Last user message:', smart_input.history.filter(m => m.role === 'user').slice(-1)[0]?.text);
console.log('[InputMain] Current stage:', smart_input.state.stage);
console.log('[InputMain] Interests:', smart_input.state.interests);
console.log('[InputMain] Counters:', JSON.stringify(smart_input.state.counters));
console.log('[InputMain] MCP Tools available:', smart_input.tools.length);
console.log('[InputMain] User prompt length:', userPrompt.length, 'chars');

// ============================================================================
// 8. OUTPUT
// ============================================================================

return [{
  json: {
    smart_input: smart_input,
    userPrompt: userPrompt,

    // Pass through útiles para siguiente nodo
    lead_id: lead_id,
    profile: profile,
    state: state
  }
}];
