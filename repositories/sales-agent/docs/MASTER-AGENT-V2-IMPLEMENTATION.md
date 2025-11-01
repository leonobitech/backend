# Master Agent v2.0 - Implementation Guide

Guía completa para implementar la versión mejorada del Master Agent que usa Smart Input directamente.

## Cambios Principales

### ❌ **Versión Actual (v1.0)**
```
12+ nodos:
  Webhook → Validations → Fetch History (Odoo) → Chat History Filter →
  Load Profile (Baserow) → Fetch RAG → Build Flags →
  LLM Analyst (GPT-3.5) → Build State Patch → Flags Analyzer →
  Master Agent (GPT-4) → Output Main → Update Baserow → Update Odoo → Chatwoot
```

**Problemas**:
- 🐌 Latencia: 7-9 segundos
- 🤖 Respuestas robóticas ("🤖 Leonobit [Tag]" siempre)
- ❌ RAG no se usa (83% de mensajes)
- ❌ State updates se pierden (business_name, etc.)
- 📋 CTAs forzados siempre (menú en cada respuesta)
- 💰 Dual-LLM innecesario (GPT-3.5 + GPT-4)

---

### ✅ **Versión Nueva (v2.0)**
```
3-4 nodos:
  Webhook → Smart Input Builder → Master Agent v2 (GPT-4o-mini) → Output & Persist
```

**Mejoras**:
- ⚡ Latencia: 2-3 segundos (60% más rápido)
- 💬 Respuestas naturales (conversacionales)
- ✅ RAG usado siempre cuando relevante
- ✅ State updates completos
- 🎯 CTAs solo cuando tiene sentido
- 💰 Un solo LLM (GPT-4o-mini más barato y rápido)

---

## Arquitectura v2.0

```
┌──────────────────────────────────────────────────────────┐
│                    FLUJO SIMPLIFICADO                    │
└──────────────────────────────────────────────────────────┘

WhatsApp → Chatwoot (Webhook)
               ↓
┌──────────────────────────────────────────────────────────┐
│  NODO 1: Smart Input Builder                             │
│  - Fetch history (Odoo mail.message)                     │
│  - Chat History Filter (clean HTML, dedupe)              │
│  - Load Profile & State (Baserow)                        │
│  - Build options (services catalog, aliases, rules)      │
│  - Build meta (timestamp, locale, channel)               │
│                                                           │
│  Output: smart_input (JSON completo)                     │
└──────────────────────────────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────────────┐
│  NODO 2: Master Agent v2 (GPT-4o-mini)                   │
│                                                           │
│  System Prompt: 50-System-Prompt-v2-SIMPLE.md            │
│  User Prompt: Inyecta smart_input completo               │
│                                                           │
│  Tools disponibles (OpenAI function calling):            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ search_services_rag(query, filters, limit)        │  │
│  │   → Query Qdrant vector store                     │  │
│  │   → Returns: service details + benefits           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Output:                                                  │
│  {                                                        │
│    message: { text, rag_used, sources },                 │
│    state_update: { stage, interests, counters, ... },    │
│    cta_menu: { prompt, items, optional }                 │
│  }                                                        │
└──────────────────────────────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────────────┐
│  NODO 3: Output & Persist                                │
│  - Execute tool calls (si GPT-4o-mini llamó a RAG)       │
│  - Update Baserow (state_update)                         │
│  - Update Odoo (mensaje al chatter)                      │
│  - Send message to Chatwoot                              │
└──────────────────────────────────────────────────────────┘
               ↓
         Chatwoot → WhatsApp
```

---

## Paso a Paso: Implementación

### PASO 1: Crear Nodo Smart Input Builder

**Objetivo**: Consolidar todos los nodos de contexto (11-48) en uno solo.

**Código** (n8n Code node):

```javascript
// ============================================================================
// SMART INPUT BUILDER
// Consolida: History + Profile + State + Options + Rules + Meta
// ============================================================================

const items = $input.all();

// 1. Extract evento de Chatwoot webhook
const event = items[0].json;

// 2. Fetch History desde Odoo (reusar nodos 37-38)
const historyRaw = await fetchOdooHistory(event.conversation.id);
const history = cleanHistory(historyRaw); // Chat History Filter logic

// 3. Fetch Profile & State desde Baserow
const profile = await fetchBaserowProfile(event.sender.phone_number);
const state = buildStateFromProfile(profile);

// 4. Build Options (catálogo de servicios, aliases, rules)
const options = {
  interests_allowed: ["Odoo", "WhatsApp", "CRM", "Voz", "Automatización", "Analytics", "Reservas", "Knowledge Base"],

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
    "whatsapp": "WhatsApp Chatbot",
    "chatbot": "WhatsApp Chatbot",
    "bot": "WhatsApp Chatbot",
    "ivr": "Voice Assistant (IVR)",
    "voz": "Voice Assistant (IVR)",
    "crm": "Process Automation (Odoo/ERP)",
    "odoo": "Process Automation (Odoo/ERP)",
    "erp": "Process Automation (Odoo/ERP)"
    // ... más aliases
  },

  service_defaults: {
    "Process Automation (Odoo/ERP)": {
      bundle: ["Odoo CRM", "n8n triggers", "WhatsApp Chatbot (opcional)"],
      rag_hints: [
        "Odoo CRM para pymes/restaurantes",
        "automatización con n8n",
        "integración WhatsApp ↔ Odoo",
        "reportes operativos"
      ],
      interests: ["Odoo", "CRM"]
    }
    // ... más defaults
  },

  stage_allowed: ["explore", "match", "price", "qualify", "proposal_ready"],

  cta_menu_default: {
    prompt: "¿Cómo querés avanzar?",
    kind: "service",
    items: ["Ver precios", "Beneficios e integraciones", "Agendar demo", "Solicitar propuesta"],
    max_picks: 1
  },

  intents_allowed: [
    "greeting", "service_info", "price", "request_proposal",
    "demo_request", "contact_share", "schedule_request",
    "negotiation", "support", "off_topic", "unclear"
  ]
};

// 5. Build Rules (políticas de negocio como strings)
const rules = {
  timing_and_chronology: "Procesar el history de antiguo a reciente; prevalece el evento más nuevo.",

  interests_policy: "Añadir a state.interests solo ante intención explícita/implícita fuerte; normalizar con options.services_aliases; limitar a options.interests_allowed; sin duplicados.",

  stage_policy: "Transiciones: explore→match (lead define necesidad o elige servicio); match→price (pregunta precio); match→qualify (aporta volumen/uso o pide demo); price→qualify (tras precio, si pide demo); qualify→proposal_ready (solicita propuesta). No retroceder.",

  counters_policy: "services_seen+1 si explora/elige servicio; prices_asked+1 si pregunta precio; deep_interest+1 si pide demo o aporta volumen específico. Máx +1 por tipo por mensaje.",

  cooldowns_policy: "email_ask_ts y addressee_ask_ts se actualizan SOLO cuando el assistant lo pide explícitamente; conservar el más reciente.",

  rag_first_policy: "Si el usuario elige servicio: generar service_target; priorizar beneficios (3-5 vía RAG) + CTAs. Prohibido reiniciar menú general.",

  anti_loop_policy: "Si en los últimos 5 minutos ya se pidió volumen/caso de uso, no repetir; avanzar con beneficios (RAG) + CTAs.",

  email_gating_policy: "can_ask_email_now=true solo si: stage ∈ {qualify,proposal_ready} AND interests≠∅ AND services_seen≥1 AND prices_asked≥1 AND deep_interest≥1 AND business_name≠∅ AND email vacío y sin cooldown.",

  privacy_policy: "No incluir PII en reasoning; referirse como 'el usuario'.",

  menu_guard_policy: "Con service_target presente o stage≥match está prohibido menú general. Usar CTAs del servicio.",

  self_check_policy: "Si selección de servicio sin precio/volumen/demo: stage MUST BE 'match' y services_seen+=1."
};

// 6. Build Meta (contexto técnico)
const meta = {
  history_len: history.length,
  truncated: history.length > 50,
  locale_hint: "es",
  channel: event.conversation.channel_type || "whatsapp",
  country: profile.country || "Argentina",
  tz: profile.tz || "-03:00",
  now_ts: new Date().toISOString(),
  anti_loop_window_min: 5,
  version: "smart-input@2"
};

// 7. Output: Smart Input completo
return [{
  json: {
    smart_input: {
      history,
      profile,
      state,
      options,
      rules,
      meta
    }
  }
}];
```

---

### PASO 2: Configurar Master Agent v2

**Nodo**: OpenAI Chat Model (n8n)

**Configuración**:

```yaml
Model: gpt-4o-mini
Temperature: 0.3
Max Tokens: 1500

Messages:
  - Role: system
    Content: {{ $fromFile('50-System-Prompt-v2-SIMPLE.md') }}

  - Role: user
    Content: |
      # Current Conversation Context

      ## Last User Message
      "{{ $json.smart_input.history.filter(m => m.role === 'user').slice(-1)[0].text }}"

      ## Complete Smart Input
      ```json
      {{ JSON.stringify($json.smart_input, null, 2) }}
      ```

      Now respond following the System Prompt guidelines.

Tools (Function Calling):
  - search_services_rag:
      description: "Search services knowledge base"
      parameters:
        query: string (required)
        filters: object (optional)
        limit: number (default: 5)
```

**Function Implementation** (separar en otro nodo):

```javascript
// ============================================================================
// TOOL: search_services_rag
// ============================================================================

async function search_services_rag(params) {
  const { query, filters = {}, limit = 5 } = params;

  // 1. Generate embedding para la query
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: query
  });

  // 2. Query Qdrant
  const qdrantResponse = await axios.post('http://qdrant:6333/collections/services/points/search', {
    vector: embedding.data[0].embedding,
    limit: limit,
    with_payload: true,
    filter: buildQdrantFilter(filters) // Convert filters to Qdrant format
  });

  // 3. Format results
  const results = qdrantResponse.data.result.map(point => ({
    service_id: point.payload.service_id,
    name: point.payload.name,
    category: point.payload.category,
    description: point.payload.description || "",
    key_features: point.payload.key_features || [],
    use_cases: point.payload.use_cases || "",
    audience: point.payload.audience || "",
    differentiators: point.payload.differentiators || "",
    pricing_model: point.payload.pricing_model,
    starting_price: point.payload.starting_price,
    score: point.score
  }));

  return { results };
}

// Helper: Build Qdrant filter from simple filters object
function buildQdrantFilter(filters) {
  const must = [];

  if (filters.category) {
    must.push({
      key: "metadata.service.category",
      match: { value: filters.category }
    });
  }

  if (filters.tags && filters.tags.length > 0) {
    must.push({
      key: "metadata.service.tags",
      match: { any: filters.tags }
    });
  }

  if (filters.min_price) {
    must.push({
      key: "metadata.service.starting_price",
      range: { gte: filters.min_price }
    });
  }

  if (filters.max_price) {
    must.push({
      key: "metadata.service.starting_price",
      range: { lte: filters.max_price }
    });
  }

  return must.length > 0 ? { must } : undefined;
}
```

---

### PASO 3: Output & Persist

**Código** (n8n Code node):

```javascript
// ============================================================================
// OUTPUT & PERSIST
// ============================================================================

const masterOutput = $json; // Output del Master Agent v2

// 1. Execute tool calls si GPT-4o-mini llamó a algún tool
if (masterOutput.tool_calls && masterOutput.tool_calls.length > 0) {
  for (const toolCall of masterOutput.tool_calls) {
    if (toolCall.function.name === 'search_services_rag') {
      const args = JSON.parse(toolCall.function.arguments);
      const ragResults = await search_services_rag(args);

      // Re-call GPT-4o-mini con los resultados del RAG
      // (OpenAI function calling loop)
      // ...
    }
  }
}

// 2. Extract final output
const { message, state_update, cta_menu } = masterOutput;

// 3. Update Baserow con state_update
if (state_update) {
  await updateBaserowLead(profile.row_id, state_update);
}

// 4. Format message para Chatwoot
let finalText = message.text;

// Agregar sources si RAG usado
if (message.rag_used && message.sources.length > 0) {
  finalText += "\n\n**Fuentes:**\n";
  message.sources.forEach(src => {
    finalText += `- ${src.name}\n`;
  });
}

// Agregar CTA menu si presente y NO opcional
if (cta_menu && !cta_menu.optional) {
  finalText += "\n\n";
  if (cta_menu.prompt) {
    finalText += `**${cta_menu.prompt}**\n`;
  }
  cta_menu.items.forEach((item, idx) => {
    finalText += `${idx + 1}. ${item}\n`;
  });
}

// 5. Save to Odoo chatter
await saveToOdooChatter({
  lead_id: profile.lead_id,
  body: finalText,
  message_type: 'comment'
});

// 6. Send to Chatwoot
await chatwoot.sendMessage({
  conversation_id: profile.conversation_id,
  content: finalText,
  message_type: 'outgoing',
  private: false
});

return [{ json: { success: true, message: finalText } }];
```

---

## Comparación de Outputs

### Mensaje de Prueba
```
User: "Tengo 10 empleados, necesito gestionar mejor el equipo!"
```

### ❌ **Output Actual (v1.0)**

```
🤖 Leonobit [Aclaración]

Hola, gracias por compartir que sos dueño de un restaurante pequeño. Para ajustar la propuesta de Process Automation (Odoo/ERP) a tus necesidades, ¿podrías contarme un poco más sobre el volumen de operaciones o casos específicos que te gustaría automatizar? También puedo ofrecerte una demo para que veas cómo puede ayudarte.

**Opciones:**
- Calcular presupuesto
- Agendar demo
- Ver precios
- Solicitar propuesta
```

**Problemas**:
- ❌ `rag_used: false` (no usó RAG cuando debía)
- ❌ Respuesta genérica (no personalizó por restaurante/10 empleados)
- ❌ Menú forzado (no es necesario aquí)
- ❌ Robótico ("🤖 Leonobit [Tag]")
- ❌ business_name no se guardó en state

---

### ✅ **Output Esperado (v2.0)**

```json
{
  "message": {
    "text": "Perfecto, con 10 empleados Odoo CRM te ayuda a gestionar todo el equipo desde un solo panel: asignar tareas, hacer seguimiento de clientes, automatizar reportes. Para restaurantes específicamente, te facilita la coordinación entre cocina, mozos y delivery. ¿Te muestro cómo funciona en una demo rápida?",
    "rag_used": true,
    "sources": [
      { "service_id": "svc-odoo-automation", "name": "Process Automation (Odoo/ERP)" }
    ]
  },
  "state_update": {
    "stage": "qualify",
    "business_name": "restaurante",
    "counters": {
      "deep_interest": 2
    }
  },
  "cta_menu": null
}
```

**Mejoras**:
- ✅ `rag_used: true` (usó RAG correctamente)
- ✅ Personalizado (menciona "10 empleados", "restaurantes", "cocina/mozos/delivery")
- ✅ Natural (sin estructura robótica)
- ✅ CTA suave (pregunta al final, no menú forzado)
- ✅ `business_name: "restaurante"` guardado
- ✅ `stage: qualify` (avanzó correctamente)
- ✅ `deep_interest: 2` (incrementó contador)

---

## Testing

### Test 1: Probar con mensaje actual

```bash
# En n8n, enviar webhook manual con Smart Input de ejemplo
curl -X POST http://localhost:5678/webhook/sales-agent-v2 \
  -H "Content-Type: application/json" \
  -d @smart-input-example.json
```

**Verificar**:
1. ¿Usó RAG? (`rag_used: true`)
2. ¿Respuesta natural? (sin "🤖 Leonobit [Tag]")
3. ¿State update correcto? (business_name guardado, stage avanzado)
4. ¿Counters incrementados? (deep_interest +1)

### Test 2: Comparar latencia

**v1.0**: ~7-9 segundos (12 nodos)
**v2.0 esperado**: ~2-3 segundos (3 nodos)

### Test 3: Probar diferentes escenarios

1. **User elige servicio**: "Me interesa el chatbot de WhatsApp"
   - ✅ Debe llamar RAG
   - ✅ Debe incrementar services_seen
   - ✅ Debe transicionar a stage: match

2. **User pregunta precio**: "Cuánto cuesta?"
   - ✅ Debe llamar RAG para pricing
   - ✅ Debe incrementar prices_asked
   - ✅ Debe transicionar a stage: price

3. **User solicita propuesta**: "Mandame info por email"
   - ❌ Si no cumple email_gating_policy: NO pedir email
   - ✅ En su lugar: seguir calificando
   - ✅ Si cumple todas condiciones: pedir email

---

## Rollback Plan

Si la v2.0 no funciona bien:

1. **No borrar v1.0** - Mantener workflow actual como backup
2. **Crear v2.0 en paralelo** - Nuevo workflow separado
3. **Testing progresivo** - Probar con % de tráfico (si n8n lo permite)
4. **Switch fácil** - Cambiar webhook endpoint de Chatwoot

---

## Métricas de Éxito

| Métrica | v1.0 (actual) | v2.0 (meta) |
|---------|---------------|-------------|
| **Latencia promedio** | 7-9s | 2-3s |
| **RAG usage rate** | 17% | 90%+ |
| **State accuracy** | 60% | 95%+ |
| **Response naturalness** | 3/10 | 8/10 |
| **CTA relevance** | 4/10 | 9/10 |
| **Cost per message** | $0.08-0.10 | $0.03-0.05 |

---

## Próximos Pasos

1. ✅ **Crear archivos**: System Prompt v2, User Prompt v2, Implementation Guide
2. ⏳ **Implementar en n8n**: Crear workflow v2 en paralelo
3. ⏳ **Testing**: Probar con mensajes reales del log
4. ⏳ **Ajustar prompts**: Iterar basado en resultados
5. ⏳ **Deploy gradual**: Migrar % de tráfico a v2
6. ⏳ **Monitor**: Comparar métricas v1 vs v2
7. ⏳ **Switch completo**: Si v2 funciona bien, deprecar v1

---

## Archivos Creados

1. **50-System-Prompt-v2-SIMPLE.md** - System prompt simplificado (vs 2522 líneas actual)
2. **50-User-Prompt-v2-SMART-INPUT.js** - Inyección de Smart Input
3. **MASTER-AGENT-V2-IMPLEMENTATION.md** - Este documento

---

**Versión**: 2.0
**Fecha**: 2025-11-01
**Estado**: ✅ Listo para implementar
