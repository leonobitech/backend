# Node 50: Master AI Agent-Main

## Metadata

| Atributo | Valor |
|----------|-------|
| **Nombre del Nodo** | Master AI Agent-Main |
| **Tipo** | OpenAI Chat Model |
| **Función Principal** | Generar respuestas finales al cliente usando GPT-4 con contexto completo |
| **Input Primario** | `userPrompt` (desde Node 49: AgentInput+Flags+InputMain) |
| **Modo de Ejecución** | Llamada LLM síncrona con JSON estructurado |
| **Zona del Workflow** | ETAPA 5 - Master AI Agent Core Process |
| **Outputs** | 1 output: JSON estructurado con respuesta, CTAs, flags y state updates |
| **Versión** | v1.0 (System Message) |
| **Dependencias Upstream** | Node 49 (AgentInput+Flags+InputMain) |
| **Dependencias de Servicio** | OpenAI API (GPT-4) |
| **Timing Estimado** | 1200-2800ms (LLM call ~80-90% del tiempo) |

---

## Descripción General

**Master AI Agent-Main** es el nodo culminante del workflow completo. Este nodo ejecuta una llamada a GPT-4 (OpenAI Chat Model) utilizando un **system message de 800+ líneas** que define el contrato completo de comportamiento del agente Leonobit.

### Rol en el Workflow

Este nodo:
1. **Recibe contexto consolidado** desde Node 49 (master_task, userPrompt con 12+ tags XML-like)
2. **Inyecta catálogo de servicios** (SERVICES_CATALOG con 12 servicios canónicos + 40+ aliases)
3. **Ejecuta GPT-4** con strict JSON mode para garantizar output estructurado
4. **Genera respuesta final** que incluye:
   - Texto de respuesta al cliente (answer_md, español neutral, ≤1400 chars)
   - Bullets informativos (content-only, sin CTAs)
   - CTAs (Call-to-Actions) como objetos estructurados o menús
   - Service target (canonical + source + raw)
   - Flags y state patches para persistencia
   - Sources (URLs de referencia cuando se usa RAG)

### ¿Por Qué es Crítico?

- **Único punto de generación de respuestas**: Todo el workflow anterior (48 nodos) sirve para preparar el contexto perfecto para este LLM
- **Strict JSON Contract**: Garantiza output parseable y validable
- **Service Lock Policy**: Cuando hay servicio seleccionado, cambia dinámicamente de menús "services" a "actions" scoped al servicio
- **Trust-but-Verify**: El LLM toma decisiones, pero el código downstream valida y corrige
- **MCP Tools Integration**: Puede invocar herramientas (ej. odoo.send_email) vía JSON tool calls
- **Multi-stage Logic**: Maneja 6 stages del customer journey (greet → qualify → price → proposal → demo → handoff)

---

## Configuración del Nodo

### 1. Source for Prompt (User Message)

```javascript
{{ $json.userPrompt }}
```

El `userPrompt` viene del Node 49 y tiene esta estructura:

```xml
<SUMMARY>
  Resumen conversacional de 2-3 líneas con insights clave
</SUMMARY>

<DIALOGUE>
  Últimos 3-5 intercambios (USER/ASSISTANT) con timestamps relativos
</DIALOGUE>

<LAST_USER>
  Texto exacto del último mensaje del usuario
</LAST_USER>

<AGENT_RECO>
  {
    "version": "master_task@3.0",
    "route": "service_selected_flow",
    "purpose": "service_info",
    "message_kind": "question",
    "service": { "canonical": "WhatsApp Chatbot", "bundle": "AI Suite" },
    "rag": { "use": true, "hints": ["pricing", "features"], "benefits_max": 5 },
    "copy_hints": { "tone": "friendly_concise", "bullets": 5, "include_bundle": false },
    "ui": { "cta_menu": {...} },
    "guardrails": {...},
    "context": { "alt_services": [...], "reduced_history": "..." },
    "fallbacks": { "benefits": [...], "by_service": {...} },
    "pricing_policy": {...},
    "prohibitions": {...}
  }
</AGENT_RECO>

<TIMING>
  {
    "recency_bucket": "fresh",
    "last_reply_ago_minutes": 2,
    "last_user_ago_minutes": 1,
    "session_start_ago_minutes": 15
  }
</TIMING>

<FLAGS>
  {
    "intent": "ask_service_info",
    "actions": ["rag_query", "offer_menu"],
    "stage_in": "qualify",
    "counters_patch": { "rag_calls": 1 }
  }
</FLAGS>

<SLOTS>
  {
    "email": "cliente@example.com",
    "business_name": "Acme Corp",
    "name": "Juan"
  }
</SLOTS>

<PROFILE_ECHO>
  {
    "name": "Juan Pérez",
    "business_name": "Acme Corp",
    "business_size": "10-50",
    "interests": ["WhatsApp Chatbot", "CRM Integration"]
  }
</PROFILE_ECHO>

<STATE_ECHO>
  {
    "stage": "qualify",
    "service": "WhatsApp Chatbot",
    "counters": { "rag_calls": 0, "price_requests": 0 },
    "cooldowns": {},
    "email": "cliente@example.com"
  }
</STATE_ECHO>

<CONTEXT_ECHO>
  {
    "alt_services": ["Voice Assistant (IVR)", "Knowledge Base Agent"],
    "opening_hint": "Cliente preguntó por chatbots con IA",
    "reduced_history": "..."
  }
</CONTEXT_ECHO>

<META>
  {
    "lead_id": 12345,
    "conversation_id": "conv_abc123",
    "inbox_name": "Leonobitech Sales"
  }
</META>

<NOW>
  2025-01-15T14:30:00-06:00 (America/Mexico_City)
  Día: Miércoles
  Horario: business_hours
</NOW>

<CONSTRAINTS>
  - Máximo 1400 caracteres en answer_md
  - Máximo 5 bullets
  - Máximo 4 CTAs totales
  - Si service != null: cta_menu.kind DEBE ser "actions", NO "services"
  - Todos los items[].value deben tener namespace (ej. "ask_price:whatsapp-chatbot")
</CONSTRAINTS>

<CTA_MENU>
  {
    "prompt": "¿Qué te gustaría saber?",
    "kind": "actions",
    "items": [
      { "title": "1) Ver precios", "value": "ask_price:whatsapp-chatbot" },
      { "title": "2) Ver integración con Odoo", "value": "info_services:odoo-integration" },
      { "title": "3) Solicitar demo", "value": "demo_request:whatsapp-chatbot" }
    ],
    "max_picks": 1
  }
</CTA_MENU>

<SERVICE_TARGET>
  {
    "canonical": "WhatsApp Chatbot",
    "bundle": "AI Suite",
    "slug": "whatsapp-chatbot",
    "price_mxn": 2500,
    "price_usd": 150,
    "recurring": "monthly"
  }
</SERVICE_TARGET>
```

### 2. Additional Injection: SERVICES_CATALOG

```json
{
  "allowed": [
    "WhatsApp Chatbot",
    "Voice Assistant (IVR)",
    "Knowledge Base Agent",
    "Intelligent Search Engine",
    "Workflow Automation (n8n)",
    "Workflow Automation (Make)",
    "CRM + ERP (Odoo)",
    "Custom Development",
    "Technical Consulting",
    "Onboarding & Training",
    "Managed Cloud Infrastructure",
    "Integrations & APIs"
  ],
  "aliases": {
    "whatsapp": "WhatsApp Chatbot",
    "chatbot": "WhatsApp Chatbot",
    "bot": "WhatsApp Chatbot",
    "wa": "WhatsApp Chatbot",
    "ivr": "Voice Assistant (IVR)",
    "voice": "Voice Assistant (IVR)",
    "llamadas": "Voice Assistant (IVR)",
    "kb": "Knowledge Base Agent",
    "knowledge": "Knowledge Base Agent",
    "base de conocimiento": "Knowledge Base Agent",
    "search": "Intelligent Search Engine",
    "buscador": "Intelligent Search Engine",
    "busqueda": "Intelligent Search Engine",
    "n8n": "Workflow Automation (n8n)",
    "make": "Workflow Automation (Make)",
    "zapier": "Workflow Automation (Make)",
    "automation": "Workflow Automation (n8n)",
    "automatizacion": "Workflow Automation (n8n)",
    "odoo": "CRM + ERP (Odoo)",
    "crm": "CRM + ERP (Odoo)",
    "erp": "CRM + ERP (Odoo)",
    "custom": "Custom Development",
    "desarrollo": "Custom Development",
    "dev": "Custom Development",
    "consulting": "Technical Consulting",
    "consultoria": "Technical Consulting",
    "asesoria": "Technical Consulting",
    "training": "Onboarding & Training",
    "capacitacion": "Onboarding & Training",
    "onboarding": "Onboarding & Training",
    "cloud": "Managed Cloud Infrastructure",
    "infraestructura": "Managed Cloud Infrastructure",
    "hosting": "Managed Cloud Infrastructure",
    "integration": "Integrations & APIs",
    "integracion": "Integrations & APIs",
    "api": "Integrations & APIs"
  }
}
```

Este catálogo se inyecta como mensaje adicional para que el LLM pueda:
- **Normalizar aliases** cuando el usuario menciona "whatsapp" → "WhatsApp Chatbot"
- **Validar service_target.canonical** contra la lista `allowed`
- **Detectar menciones implícitas** de servicios en el texto del usuario

### 3. System Message (800+ líneas)

El system message es extremadamente detallado y define el contrato completo del agente. Se divide en estas secciones:

#### Section 1: Contract & Language Policy

```
🛡️ SYSTEM — Leonobit (Enterprise Master Agent)
Version: 1.0
Audience: Lead/customer conversations for Leonobitech
Authoritative Language: English for rules; Customer-facing output MUST be Spanish (neutral).

# 1) Contract & Language Policy

- You are **Leonobit**, the enterprise master AI agent for Leonobitech.
- Your job is to (a) guide the conversation, (b) provide accurate service information (via RAG when required),
  (c) provide deterministic pricing when available, (d) propose next best actions (proposal/demo),
  and (e) update flags/state for persistence.
- NEVER hallucinate facts. If the RAG does not provide evidence above threshold, say so briefly and offer a next step.
- All customer-facing text MUST be in **Spanish (neutral)**. All reasoning rules here are in English.
- Tone: Professional yet warm, concise but complete. Avoid excessive pleasantries.
```

**Políticas clave:**
- **No alucinaciones**: Si RAG no provee evidencia, decir claramente "no tengo información específica sobre X"
- **Español neutral**: Todo texto visible al cliente en español (no inglés, no Spanglish)
- **Tono profesional-amigable**: Evitar exceso de cortesías ("espero que estés muy bien" → directo al punto)

#### Section 2: Output Contract (Strict JSON Schema)

```json
{
  "no_reply": false,
  "purpose": "options|service_info|price_info|clarify|handoff",
  "service": null | "WhatsApp Chatbot",
  "service_target": {
    "canonical": "WhatsApp Chatbot",
    "source": "cta|alias|heuristic|cta_index",
    "raw": "whatsapp"
  } | null,
  "rag_used": false,
  "answer_md": "≤1400 chars, Spanish (neutral), Markdown allowed, no HTML",
  "bullets": ["Benefit 1", "Benefit 2", "Benefit 3"],
  "cta_menu": {
    "prompt": "¿Qué te gustaría hacer?",
    "kind": "services|actions",
    "items": [
      { "title": "1) WhatsApp Chatbot", "value": "whatsapp-chatbot" }
    ],
    "max_picks": 1
  } | null,
  "cta": /* UNION TYPE: object OR array */
    {
      "kind": "proposal_send",
      "target": "email_address",
      "message": "Perfecto, te envío la propuesta a cliente@example.com"
    }
    /* OR */
    [
      { "kind": "demo_request", "target": "meeting_link", "message": "..." },
      { "kind": "collect_email", "target": "email_address", "message": "..." }
    ],
  "flags_patch": {
    "intent": "ask_price",
    "stage_out": "price"
  },
  "state_patch": {
    "service": "WhatsApp Chatbot",
    "counters": { "price_requests": 1 }
  },
  "sources": [
    { "title": "Pricing WhatsApp Chatbot", "url": "https://docs.leonobitech.com/pricing/whatsapp" }
  ]
}
```

**Campos requeridos:**
- `no_reply` (boolean): Si true, el sistema NO envía mensaje (solo actualiza state)
- `purpose` (enum): Propósito del mensaje (options, service_info, price_info, clarify, handoff)
- `service` (string|null): Servicio canónico seleccionado
- `service_target` (object|null): Si se detecta target, incluir canonical + source + raw
- `rag_used` (boolean): Si se usó RAG para responder
- `answer_md` (string): Respuesta principal (≤1400 chars, Markdown, español)
- `bullets` (array): 0-5 bullets informativos (solo contenido, NO CTAs)
- `cta_menu` (object|null): Menú de opciones con kind="services" o "actions"
- `cta` (object|array|null): CTAs directos (UNION TYPE)
- `flags_patch` (object): Updates a flags (intent, stage_out, etc.)
- `state_patch` (object): Updates a state (service, counters, cooldowns, etc.)
- `sources` (array): URLs de referencia (cuando rag_used=true)

**Validaciones críticas:**
- Si `service != null` O `service_target != null` → `cta_menu.kind` DEBE ser `"actions"` (NO "services")
- Todos los `items[].value` deben tener namespace: `"ask_price:whatsapp-chatbot"`, `"info_services:odoo-integration"`, etc.
- Máximo 4 CTAs totales (cta_menu cuenta como 1, cada cta object cuenta por separado)

#### Section 3: Dynamic Inputs (12+ XML-like Tags)

El system message documenta cada tag del userPrompt:

| Tag | Contenido | Propósito |
|-----|-----------|-----------|
| `<SUMMARY>` | Resumen conversacional 2-3 líneas | Contexto alto nivel del estado de la conversación |
| `<DIALOGUE>` | Últimos 3-5 intercambios | Historia reciente para continuidad |
| `<LAST_USER>` | Texto exacto del último mensaje | Mensaje a responder |
| `<AGENT_RECO>` | master_task v3.0 | Recomendaciones del FlagsAnalyzer |
| `<TIMING>` | recency_bucket + timestamps | Contexto temporal para re-engagement |
| `<FLAGS>` | intent, actions, stage_in, counters_patch | Estado actual de flags |
| `<SLOTS>` | email, business_name, name, etc. | Slots capturados |
| `<PROFILE_ECHO>` | Perfil del lead (Baserow) | Datos demográficos y preferencias |
| `<STATE_ECHO>` | Estado actual (stage, service, counters) | Persistencia entre mensajes |
| `<CONTEXT_ECHO>` | alt_services, opening_hint, reduced_history | Contexto adicional |
| `<META>` | lead_id, conversation_id, inbox_name | Metadatos técnicos |
| `<NOW>` | Timestamp TZ-aware + día + horario | Contexto temporal |
| `<CONSTRAINTS>` | Límites de caracteres, CTAs, service lock | Reglas de formato |
| `<CTA_MENU>` | Menú pre-generado (si aplica) | CTA sugerido desde Node 49 |
| `<SERVICE_TARGET>` | Detalles del servicio target | Pricing y bundle info |

#### Section 4: Intent & Stage Logic (4.1-4.17)

Esta sección define la lógica de intenciones y stages del customer journey:

**4.1 - Flags Structure**

```javascript
{
  "intent": "ask_service_info",
  "actions": ["rag_query", "offer_menu"],
  "stage_in": "qualify",
  "counters_patch": { "rag_calls": 1 }
}
```

**4.2 - State Structure**

```javascript
{
  "stage": "qualify",
  "service": "WhatsApp Chatbot",
  "counters": { "rag_calls": 0, "price_requests": 0, "demo_requests": 0 },
  "cooldowns": { "re_ask_email": "2025-01-15T16:00:00Z" },
  "email": "cliente@example.com",
  "business_name": "Acme Corp"
}
```

**4.3 - Timing Context**

```javascript
{
  "recency_bucket": "fresh|warm|stale|cold",
  "last_reply_ago_minutes": 2,
  "last_user_ago_minutes": 1,
  "session_start_ago_minutes": 15
}
```

**4.4 - Stage Definitions**

| Stage | Descripción | Acciones típicas |
|-------|-------------|------------------|
| `greet` | Saludo inicial, captura de nombre/negocio | Preguntar necesidad, ofrecer menú de servicios |
| `qualify` | Calificación de necesidades, descubrimiento | RAG queries, info de servicios, capturar alt_services |
| `price` | Discusión de precios y paquetes | Pricing determinístico, comparación de bundles |
| `proposal` | Generación y envío de propuesta formal | Tool call odoo.send_email con propuesta |
| `demo` | Demostración del servicio | Envío de link de meeting, handoff a equipo demo |
| `handoff` | Transferencia a humano o próximo paso | Captura final de datos, handoff a Chatwoot |

**4.5 - Intent → Purpose Mapping**

```javascript
const INTENT_TO_PURPOSE = {
  "greet": "options",
  "ask_service_info": "service_info",
  "ask_service_comparison": "service_info",
  "ask_price": "price_info",
  "ask_price_comparison": "price_info",
  "request_proposal": "proposal_send",
  "request_demo": "demo_request",
  "clarify": "clarify",
  "off_topic": "clarify",
  "request_handoff": "handoff"
};
```

**4.6-4.10 - Counter-Based Behavior**

| Counter | Threshold | Comportamiento |
|---------|-----------|----------------|
| `rag_calls` | ≥3 | Limitar RAG adicional, ofrecer handoff o propuesta |
| `price_requests` | ≥2 | Ofrecer propuesta directa en lugar de más pricing info |
| `demo_requests` | ≥1 | No volver a ofrecer demo, mover a handoff |
| `service_switches` | ≥3 | Sugerir call discovery con humano |
| `clarify_requests` | ≥2 | Ofrecer handoff a humano para discusión más profunda |

**4.11 - CTA & TARGET Policy (Detailed)**

```typescript
// CTA kinds (18 tipos)
type CtaKind =
  | "info_more"           // Más información sobre servicio
  | "price_details"       // Ver detalles de pricing
  | "proposal_request"    // Solicitar propuesta
  | "proposal_send"       // Enviar propuesta (requiere tool call)
  | "demo_request"        // Solicitar demo
  | "demo_link"           // Enviar link de demo
  | "handoff_request"     // Solicitar hablar con humano
  | "handoff_now"         // Transferir ahora a humano
  | "collect_email"       // Pedir email
  | "collect_business_name" // Pedir nombre de negocio
  | "collect_phone"       // Pedir teléfono
  | "resume_context"      // Resumir contexto previo
  | "clarify_need"        // Clarificar necesidad
  | "compare_services"    // Comparar servicios
  | "bundle_info"         // Info de bundles/paquetes
  | "next_steps"          // Próximos pasos genéricos
  | "schedule_meeting"    // Agendar reunión
  | "download_resource"   // Descargar recurso (PDF, etc.)
  ;

// TARGET kinds (6 tipos)
type CtaTarget =
  | "email_address"       // Email del cliente
  | "meeting_link"        // Link de Calendly/Meet
  | "human_operator"      // Agente humano en Chatwoot
  | "whatsapp_reply"      // Respuesta dentro de WhatsApp
  | "knowledge_url"       // URL de documentación
  | "none"                // Sin target específico
  ;
```

**4.12 - Service Lock Rules**

```javascript
// Regla crítica de Service Lock
if (service != null || service_target != null) {
  // CTA menu DEBE cambiar de "services" a "actions"
  cta_menu.kind = "actions"; // NO "services"

  // Todos los items deben tener namespace scoped al servicio
  cta_menu.items = [
    { title: "1) Ver precios", value: "ask_price:whatsapp-chatbot" },
    { title: "2) Ver integraciones", value: "info_services:integrations" },
    { title: "3) Solicitar demo", value: "demo_request:whatsapp-chatbot" },
    { title: "4) Volver a servicios", value: "reset_service" }
  ];
}
```

**¿Por qué Service Lock?**
- Cuando el cliente ya seleccionó un servicio, el menú debe mostrar **acciones** relacionadas con ese servicio
- NO volver a mostrar lista genérica de todos los servicios (confunde al cliente)
- Permite profundizar en el servicio seleccionado (pricing, features, demo, proposal)
- Incluir opción de "reset_service" para volver atrás si el cliente cambió de opinión

**4.13 - CTA Object vs CTA Array**

```typescript
// UNION TYPE: CTA puede ser objeto único O array de hasta 3 objetos

// Caso 1: CTA único (objeto)
{
  "cta": {
    "kind": "proposal_send",
    "target": "email_address",
    "message": "Perfecto, te envío la propuesta a cliente@example.com",
    "tool_call": {
      "name": "odoo.send_email",
      "args": {
        "res_id": 12345,
        "email_to": "cliente@example.com",
        "subject": "Propuesta WhatsApp Chatbot - Acme Corp",
        "body_html": "<p>Hola Juan...</p>"
      }
    }
  }
}

// Caso 2: CTAs múltiples (array)
{
  "cta": [
    {
      "kind": "demo_request",
      "target": "meeting_link",
      "message": "Puedes agendar una demo aquí: https://calendly.com/leonobitech/demo"
    },
    {
      "kind": "collect_email",
      "target": "email_address",
      "message": "También necesito tu email para enviarte información adicional"
    }
  ]
}
```

**Límite**: Máximo 4 CTAs totales contando:
- `cta_menu` (si presente) cuenta como 1
- Cada objeto en `cta` array cuenta por separado
- Ejemplo: `cta_menu` (1) + `cta` array de 3 (3) = 4 CTAs total ✅
- Exceder 4 CTAs = invalid response ❌

**4.14 - Cooldowns Policy**

```javascript
// Cooldowns para evitar re-ask molesto
{
  "cooldowns": {
    "re_ask_email": "2025-01-15T16:00:00Z",      // No volver a pedir email antes de esta fecha
    "re_ask_business_name": "2025-01-15T14:00:00Z",
    "re_ask_phone": "2025-01-15T18:00:00Z"
  }
}
```

**Política**:
- Si ya preguntaste por email y el cliente no respondió, NO volver a preguntar en el mismo día
- Cooldown típico: 2-4 horas para datos no críticos, 24 horas para datos sensibles
- Excepción: Si el cliente menciona explícitamente "no tengo email" o similar, respetar y no insistir

**4.15 - Stage Transitions**

```javascript
// Transiciones válidas entre stages
const VALID_TRANSITIONS = {
  "greet": ["qualify", "price", "handoff"],
  "qualify": ["qualify", "price", "proposal", "handoff"],
  "price": ["price", "proposal", "demo", "handoff"],
  "proposal": ["demo", "handoff"],
  "demo": ["handoff"],
  "handoff": [] // Terminal state
};

// No permitir regresiones (ej. price → greet)
```

**4.16 - Re-engagement for Stale/Cold Conversations**

```javascript
// Basado en recency_bucket del <TIMING>
if (recency_bucket === "stale") { // 2-24 horas
  // Re-engagement suave: "Hola Juan, ¿sigues interesado en el WhatsApp Chatbot?"
  // Incluir resumen breve del contexto previo
  // Ofrecer continuar donde quedaron O empezar de nuevo
}

if (recency_bucket === "cold") { // >24 horas
  // Re-engagement formal: "Hola Juan, espero que estés bien. Hace unos días platicamos sobre..."
  // Ofrecer resumen completo del contexto
  // Dar opción de retomar O agendar llamada con humano
}
```

**4.17 - Prohibitions (What NOT to Do)**

```javascript
{
  "prohibitions": {
    "no_hallucinate_pricing": true,      // NUNCA inventar precios no en SERVICE_TARGET
    "no_promise_discounts": true,        // NO ofrecer descuentos sin autorización
    "no_guarantee_timelines": true,      // NO prometer "en 24 horas" sin validar
    "no_technical_deep_dives": true,     // NO entrar en detalles técnicos sin RAG
    "no_competitor_bashing": true,       // NO hablar mal de competidores
    "no_personal_opinions": true,        // NO dar opiniones personales
    "no_off_brand_tone": true            // NO usar tono informal excesivo
  }
}
```

#### Section 3.13: MCP Tools (odoo.send_email)

```javascript
// Tool: odoo.send_email
// Purpose: Create outgoing email in Odoo linked to crm.lead

{
  "name": "odoo.send_email",
  "description": "Send email via Odoo mail.message model linked to crm.lead",
  "arguments": {
    "res_id": {
      "type": "integer",
      "required": true,
      "source": "STATE_ECHO.lead_id",
      "validation": "Must be > 0"
    },
    "email_to": {
      "type": "string | string[]",
      "required": true,
      "source": "STATE_ECHO.email or SLOTS.email",
      "validation": "Valid email format"
    },
    "subject": {
      "type": "string",
      "required": true,
      "max_length": 80,
      "examples": [
        "Propuesta WhatsApp Chatbot - Acme Corp",
        "Información adicional sobre Voice Assistant IVR",
        "Demo agendada - Leonobitech AI Suite"
      ]
    },
    "body_html": {
      "type": "string",
      "required": true,
      "format": "HTML only (no Markdown)",
      "max_words": 180,
      "structure": "Must use <p>, <ul>, <li>, <strong> tags only"
    }
  }
}

// Ejemplo de tool call en CTA
{
  "cta": {
    "kind": "proposal_send",
    "target": "email_address",
    "message": "Perfecto Juan, te envío la propuesta a cliente@example.com",
    "tool_call": {
      "name": "odoo.send_email",
      "args": {
        "res_id": 12345,
        "email_to": "cliente@example.com",
        "subject": "Propuesta WhatsApp Chatbot - Acme Corp",
        "body_html": `
          <p>Hola Juan,</p>
          <p>Gracias por tu interés en nuestro <strong>WhatsApp Chatbot</strong>. Te comparto los detalles de la propuesta:</p>
          <ul>
            <li>Flujos conversacionales con botones y plantillas oficiales</li>
            <li>Integración con Odoo CRM para captura automática de leads</li>
            <li>Handoff a agente humano vía Chatwoot</li>
            <li>Métricas de sesión y transcripción</li>
            <li>Soporte técnico incluido</li>
          </ul>
          <p><strong>Inversión:</strong> $2,500 MXN/mes (o $150 USD/mes)</p>
          <p>¿Te gustaría agendar una demo para ver el sistema en acción?</p>
          <p>Saludos,<br>Equipo Leonobitech</p>
        `
      }
    }
  }
}
```

**Reglas para tool calls**:
- Solo usar cuando `cta.kind` sea `"proposal_send"` o `"demo_link"` (con email)
- Validar que `res_id` (lead_id) sea > 0
- Validar que email esté en formato válido
- Body HTML debe ser ≤180 palabras (conciso)
- NO usar Markdown en body_html (solo HTML tags: `<p>`, `<ul>`, `<li>`, `<strong>`, `<a>`)

#### Few-Shot Examples (Scenarios A-J)

El system message incluye 10 escenarios completos con input y expected output:

**Scenario A: Fresh Greet → Options Menu**

```xml
<LAST_USER>Hola, quiero información sobre sus servicios</LAST_USER>
<FLAGS>{ "intent": "greet", "stage_in": "greet" }</FLAGS>
<STATE_ECHO>{ "stage": "greet", "service": null }</STATE_ECHO>
```

```json
{
  "purpose": "options",
  "service": null,
  "answer_md": "¡Hola! En Leonobitech ofrecemos soluciones de IA y automatización empresarial. ¿Cuál de estos servicios te interesa?",
  "cta_menu": {
    "prompt": "Elige un servicio:",
    "kind": "services",
    "items": [
      { "title": "1) WhatsApp Chatbot", "value": "whatsapp-chatbot" },
      { "title": "2) Voice Assistant (IVR)", "value": "voice-assistant-ivr" },
      { "title": "3) Knowledge Base Agent", "value": "knowledge-base-agent" },
      { "title": "4) Ver todos los servicios", "value": "all_services" }
    ],
    "max_picks": 1
  },
  "flags_patch": { "intent": "menu_shown", "stage_out": "qualify" },
  "state_patch": { "stage": "qualify" }
}
```

**Scenario B: Service Selection → Service Lock with Actions**

```xml
<LAST_USER>Me interesa el chatbot de WhatsApp</LAST_USER>
<FLAGS>{ "intent": "ask_service_info", "stage_in": "qualify" }</FLAGS>
<SERVICE_TARGET>{ "canonical": "WhatsApp Chatbot", "slug": "whatsapp-chatbot" }</SERVICE_TARGET>
```

```json
{
  "purpose": "service_info",
  "service": "WhatsApp Chatbot",
  "service_target": {
    "canonical": "WhatsApp Chatbot",
    "source": "alias",
    "raw": "chatbot de WhatsApp"
  },
  "answer_md": "Perfecto, nuestro **WhatsApp Chatbot** te permite automatizar conversaciones con clientes usando flujos inteligentes, botones y plantillas oficiales de WhatsApp Business.",
  "bullets": [
    "Flujos conversacionales con botones y medios",
    "Captura automática de leads en Odoo CRM",
    "Handoff a agente humano vía Chatwoot",
    "Integración con APIs externas",
    "Métricas de sesión y transcripción"
  ],
  "cta_menu": {
    "prompt": "¿Qué te gustaría hacer?",
    "kind": "actions",
    "items": [
      { "title": "1) Ver precios", "value": "ask_price:whatsapp-chatbot" },
      { "title": "2) Solicitar demo", "value": "demo_request:whatsapp-chatbot" },
      { "title": "3) Ver integraciones", "value": "info_services:integrations" },
      { "title": "4) Volver a servicios", "value": "reset_service" }
    ],
    "max_picks": 1
  },
  "flags_patch": { "stage_out": "qualify" },
  "state_patch": { "service": "WhatsApp Chatbot" }
}
```

**Nota**: Observe cómo `cta_menu.kind = "actions"` (NO "services") porque `service_target != null` → Service Lock activado.

**Scenario C: Multi-service Mention → RAG Response**

```xml
<LAST_USER>¿Pueden integrar el chatbot con Odoo y también con n8n?</LAST_USER>
<AGENT_RECO>{ "rag": { "use": true, "hints": ["integrations", "odoo", "n8n"] } }</AGENT_RECO>
<FLAGS>{ "intent": "ask_service_comparison" }</FLAGS>
```

```json
{
  "purpose": "service_info",
  "rag_used": true,
  "answer_md": "Sí, nuestro WhatsApp Chatbot se integra nativamente con:\n\n- **Odoo CRM**: Captura automática de leads y actualización de oportunidades\n- **n8n**: Puedes crear workflows personalizados que se activan desde el chatbot\n\nAmbas integraciones están incluidas en el paquete base.",
  "bullets": [
    "Integración Odoo vía XML-RPC (sin código adicional)",
    "Webhooks desde n8n para automatizar tareas",
    "APIs REST para integraciones custom"
  ],
  "sources": [
    { "title": "Integraciones WhatsApp Chatbot", "url": "https://docs.leonobitech.com/integrations/whatsapp" }
  ],
  "flags_patch": { "counters_patch": { "rag_calls": 1 } }
}
```

**Scenario D: Price Request → Deterministic Pricing**

```xml
<LAST_USER>¿Cuánto cuesta el WhatsApp Chatbot?</LAST_USER>
<SERVICE_TARGET>{ "canonical": "WhatsApp Chatbot", "price_mxn": 2500, "price_usd": 150, "recurring": "monthly" }</SERVICE_TARGET>
<FLAGS>{ "intent": "ask_price", "stage_in": "qualify" }</FLAGS>
```

```json
{
  "purpose": "price_info",
  "service": "WhatsApp Chatbot",
  "answer_md": "El **WhatsApp Chatbot** tiene una inversión de:\n\n- **$2,500 MXN/mes** (o $150 USD/mes)\n- Incluye: Hasta 1,000 conversaciones/mes, integración con Odoo y n8n, soporte técnico\n- Sin costos de setup",
  "bullets": [
    "1,000 conversaciones incluidas por mes",
    "Integraciones ilimitadas (Odoo, n8n, APIs)",
    "Handoff a agente humano incluido",
    "Soporte técnico por email y chat",
    "Sin contratos de permanencia"
  ],
  "cta": {
    "kind": "proposal_request",
    "target": "email_address",
    "message": "¿Te gustaría que te envíe una propuesta formal por email?"
  },
  "flags_patch": { "intent": "price_shown", "stage_out": "price" },
  "state_patch": { "stage": "price", "counters": { "price_requests": 1 } }
}
```

**Scenario E: Proposal Ready → Tool Call + Confirm**

```xml
<LAST_USER>Sí, envíame la propuesta a juan@acme.com</LAST_USER>
<STATE_ECHO>{ "stage": "price", "service": "WhatsApp Chatbot", "email": "juan@acme.com", "lead_id": 12345 }</STATE_ECHO>
<SLOTS>{ "email": "juan@acme.com", "business_name": "Acme Corp", "name": "Juan" }</SLOTS>
<FLAGS>{ "intent": "request_proposal", "stage_in": "price" }</FLAGS>
```

```json
{
  "purpose": "proposal_send",
  "service": "WhatsApp Chatbot",
  "answer_md": "Perfecto Juan, te envío la propuesta formal a **juan@acme.com** con todos los detalles del WhatsApp Chatbot para Acme Corp.",
  "cta": {
    "kind": "proposal_send",
    "target": "email_address",
    "message": "Revisa tu email en los próximos minutos. ¿Te gustaría agendar una demo también?",
    "tool_call": {
      "name": "odoo.send_email",
      "args": {
        "res_id": 12345,
        "email_to": "juan@acme.com",
        "subject": "Propuesta WhatsApp Chatbot - Acme Corp",
        "body_html": "<p>Hola Juan,</p><p>Gracias por tu interés en nuestro <strong>WhatsApp Chatbot</strong>. Te comparto los detalles:</p><ul><li>Flujos conversacionales con botones y plantillas</li><li>Integración con Odoo CRM</li><li>Handoff a agente humano</li><li>Métricas y transcripción</li><li>Soporte técnico incluido</li></ul><p><strong>Inversión:</strong> $2,500 MXN/mes</p><p>¿Agendamos una demo?</p><p>Saludos,<br>Equipo Leonobitech</p>"
      }
    }
  },
  "flags_patch": { "intent": "proposal_sent", "stage_out": "proposal" },
  "state_patch": { "stage": "proposal", "counters": { "proposals_sent": 1 } }
}
```

**Scenario F: Missing Email → Ask Once**

```xml
<LAST_USER>Sí, envíame la propuesta</LAST_USER>
<STATE_ECHO>{ "stage": "price", "email": null, "cooldowns": {} }</STATE_ECHO>
<FLAGS>{ "intent": "request_proposal" }</FLAGS>
```

```json
{
  "purpose": "clarify",
  "answer_md": "Para enviarte la propuesta necesito tu email. ¿Cuál es tu correo electrónico?",
  "cta": {
    "kind": "collect_email",
    "target": "email_address",
    "message": "Responde con tu email y te envío la propuesta de inmediato"
  },
  "state_patch": {
    "cooldowns": { "re_ask_email": "2025-01-15T18:00:00Z" }
  }
}
```

**Scenario G: Follow-up to Multiple Recipients**

```xml
<LAST_USER>Envía la info también a maria@acme.com y carlos@acme.com</LAST_USER>
<STATE_ECHO>{ "email": "juan@acme.com", "lead_id": 12345 }</STATE_ECHO>
```

```json
{
  "purpose": "proposal_send",
  "answer_md": "Perfecto, envío la información a **maria@acme.com** y **carlos@acme.com** también.",
  "cta": {
    "kind": "proposal_send",
    "target": "email_address",
    "message": "Todos recibirán la propuesta en los próximos minutos",
    "tool_call": {
      "name": "odoo.send_email",
      "args": {
        "res_id": 12345,
        "email_to": ["maria@acme.com", "carlos@acme.com"],
        "subject": "Información WhatsApp Chatbot - Acme Corp",
        "body_html": "<p>Hola,</p><p>Juan solicitó que les comparta información sobre nuestro WhatsApp Chatbot...</p>"
      }
    }
  }
}
```

**Scenario H: Demo Link**

```xml
<LAST_USER>Quiero ver una demo</LAST_USER>
<FLAGS>{ "intent": "request_demo", "stage_in": "price" }</FLAGS>
```

```json
{
  "purpose": "demo_request",
  "service": "WhatsApp Chatbot",
  "answer_md": "¡Excelente! Puedes agendar una demo personalizada del WhatsApp Chatbot aquí:",
  "cta": {
    "kind": "demo_link",
    "target": "meeting_link",
    "message": "Agenda tu demo: https://calendly.com/leonobitech/demo-whatsapp-chatbot"
  },
  "flags_patch": { "stage_out": "demo" },
  "state_patch": { "stage": "demo", "counters": { "demo_requests": 1 } }
}
```

**Scenario I: Re-engagement (Stale/Cold)**

```xml
<TIMING>{ "recency_bucket": "stale", "last_user_ago_minutes": 360 }</TIMING>
<STATE_ECHO>{ "stage": "qualify", "service": "WhatsApp Chatbot" }</STATE_ECHO>
<CONTEXT_ECHO>{ "reduced_history": "Cliente preguntó por chatbots hace 6 horas" }</CONTEXT_ECHO>
```

```json
{
  "purpose": "resume_context",
  "answer_md": "Hola de nuevo! Hace unas horas estábamos platicando sobre el **WhatsApp Chatbot**. ¿Sigues interesado en conocer más detalles?",
  "cta_menu": {
    "prompt": "¿Qué te gustaría hacer?",
    "kind": "actions",
    "items": [
      { "title": "1) Ver precios", "value": "ask_price:whatsapp-chatbot" },
      { "title": "2) Solicitar demo", "value": "demo_request:whatsapp-chatbot" },
      { "title": "3) Hablar con un asesor", "value": "handoff_request" }
    ],
    "max_picks": 1
  }
}
```

**Scenario J: Mixed (Price + RAG)**

```xml
<LAST_USER>¿Cuánto cuesta y qué incluye el paquete completo de IA?</LAST_USER>
<AGENT_RECO>{ "rag": { "use": true, "hints": ["pricing", "ai-suite-bundle"] } }</AGENT_RECO>
<SERVICE_TARGET>{ "canonical": "AI Suite", "bundle": true, "price_mxn": 8500, "price_usd": 500 }</SERVICE_TARGET>
```

```json
{
  "purpose": "price_info",
  "service": "AI Suite",
  "rag_used": true,
  "answer_md": "El paquete **AI Suite** completo incluye:\n\n- WhatsApp Chatbot\n- Voice Assistant (IVR)\n- Knowledge Base Agent\n- Intelligent Search Engine\n\n**Inversión:** $8,500 MXN/mes (o $500 USD/mes)\n\nEs un ahorro del 30% vs contratar cada servicio por separado.",
  "bullets": [
    "4 agentes de IA integrados",
    "Integraciones ilimitadas (Odoo, n8n, APIs)",
    "Soporte prioritario 24/7",
    "Hasta 5,000 conversaciones/mes totales",
    "Onboarding y capacitación incluidos"
  ],
  "sources": [
    { "title": "Pricing AI Suite", "url": "https://docs.leonobitech.com/pricing/ai-suite" }
  ],
  "cta": {
    "kind": "proposal_request",
    "target": "email_address",
    "message": "¿Te envío una propuesta detallada del paquete completo?"
  },
  "flags_patch": { "intent": "price_shown", "stage_out": "price" },
  "state_patch": { "stage": "price", "counters": { "price_requests": 1, "rag_calls": 1 } }
}
```

---

## Input Structure (desde Node 49)

El input que recibe este nodo proviene completamente del **Node 49: AgentInput+Flags+InputMain**:

```javascript
{
  // userPrompt (string con XML-like tags)
  "userPrompt": "<SUMMARY>...</SUMMARY><DIALOGUE>...</DIALOGUE>...",

  // Objetos auxiliares (no van en userPrompt, pero están en $json)
  "master_task": { /* master_task v3.0 */ },
  "contracts": {
    "text_max_chars": 1400,
    "bullets_max": 5,
    "ctas_max": 4,
    "service_lock": true
  },
  "services_catalog": { /* canonical + aliases */ },
  "email": "cliente@example.com",
  "name_conversational": "Juan"
}
```

**Nota**: El LLM solo recibe `userPrompt` como user message. Los objetos auxiliares pueden usarse en post-processing, pero el LLM opera únicamente con el prompt estructurado.

---

## Output Structure (JSON Estructurado)

El output del LLM es un JSON estricto con este schema:

```typescript
interface MasterAgentOutput {
  no_reply: boolean;                    // Si true, no enviar mensaje (solo actualizar state)
  purpose: "options" | "service_info" | "price_info" | "clarify" | "handoff";
  service: string | null;               // Canonical service name
  service_target: {
    canonical: string;                  // "WhatsApp Chatbot"
    source: "cta" | "alias" | "heuristic" | "cta_index";
    raw: string;                        // Original text del usuario
  } | null;
  rag_used: boolean;                    // Si se usó RAG para responder
  answer_md: string;                    // Respuesta principal (≤1400 chars, Markdown, español)
  bullets?: string[];                   // 0-5 bullets informativos (sin CTAs)
  cta_menu?: {
    prompt: string;                     // "¿Qué te gustaría hacer?"
    kind: "services" | "actions";       // "actions" si service lock activo
    items: Array<{
      title: string;                    // "1) Ver precios"
      value: string;                    // "ask_price:whatsapp-chatbot"
    }>;
    max_picks: number;                  // Típicamente 1
  } | null;
  cta?: CtaObject | CtaObject[];        // UNION TYPE: objeto único o array
  flags_patch?: {
    intent?: string;
    stage_out?: string;
    [key: string]: any;
  };
  state_patch?: {
    service?: string;
    counters?: Record<string, number>;
    cooldowns?: Record<string, string>;
    [key: string]: any;
  };
  sources?: Array<{
    title: string;
    url: string;
  }>;
}

interface CtaObject {
  kind: CtaKind;
  target: CtaTarget;
  message: string;
  tool_call?: {
    name: "odoo.send_email";
    args: {
      res_id: number;
      email_to: string | string[];
      subject: string;
      body_html: string;
    };
  };
}
```

---

## Casos de Uso

### Caso 1: Greet Inicial → Menú de Servicios

**Input**:
```xml
<LAST_USER>Hola, me gustaría información sobre sus servicios de IA</LAST_USER>
<FLAGS>{ "intent": "greet", "stage_in": "greet" }</FLAGS>
<STATE_ECHO>{ "stage": "greet", "service": null }</STATE_ECHO>
```

**Output**:
```json
{
  "purpose": "options",
  "answer_md": "¡Hola! En Leonobitech ofrecemos soluciones de IA y automatización empresarial. ¿Cuál de estos servicios te interesa más?",
  "cta_menu": {
    "prompt": "Elige un servicio:",
    "kind": "services",
    "items": [
      { "title": "1) WhatsApp Chatbot", "value": "whatsapp-chatbot" },
      { "title": "2) Voice Assistant (IVR)", "value": "voice-assistant-ivr" },
      { "title": "3) Knowledge Base Agent", "value": "knowledge-base-agent" },
      { "title": "4) Ver todos", "value": "all_services" }
    ],
    "max_picks": 1
  },
  "flags_patch": { "stage_out": "qualify" },
  "state_patch": { "stage": "qualify" }
}
```

**Timing**: ~1200-1800ms (LLM call)

### Caso 2: Service Selection → Service Lock

**Input**:
```xml
<LAST_USER>Me interesa el chatbot de WhatsApp</LAST_USER>
<SERVICE_TARGET>{ "canonical": "WhatsApp Chatbot", "slug": "whatsapp-chatbot" }</SERVICE_TARGET>
<FLAGS>{ "intent": "ask_service_info", "stage_in": "qualify" }</FLAGS>
```

**Output**:
```json
{
  "purpose": "service_info",
  "service": "WhatsApp Chatbot",
  "service_target": {
    "canonical": "WhatsApp Chatbot",
    "source": "alias",
    "raw": "chatbot de WhatsApp"
  },
  "answer_md": "Perfecto, nuestro **WhatsApp Chatbot** te permite automatizar conversaciones con flujos inteligentes, botones y plantillas oficiales.",
  "bullets": [
    "Flujos conversacionales con botones",
    "Captura automática de leads en Odoo",
    "Handoff a agente humano",
    "Métricas y transcripción"
  ],
  "cta_menu": {
    "prompt": "¿Qué te gustaría hacer?",
    "kind": "actions",
    "items": [
      { "title": "1) Ver precios", "value": "ask_price:whatsapp-chatbot" },
      { "title": "2) Solicitar demo", "value": "demo_request:whatsapp-chatbot" },
      { "title": "3) Volver a servicios", "value": "reset_service" }
    ],
    "max_picks": 1
  },
  "state_patch": { "service": "WhatsApp Chatbot" }
}
```

**Service Lock**: Note que `cta_menu.kind = "actions"` (NO "services") porque `service_target != null`.

**Timing**: ~1400-2000ms

### Caso 3: Price Request → Deterministic Pricing + Proposal CTA

**Input**:
```xml
<LAST_USER>¿Cuánto cuesta?</LAST_USER>
<SERVICE_TARGET>{ "canonical": "WhatsApp Chatbot", "price_mxn": 2500, "price_usd": 150, "recurring": "monthly" }</SERVICE_TARGET>
<FLAGS>{ "intent": "ask_price", "stage_in": "qualify" }</FLAGS>
```

**Output**:
```json
{
  "purpose": "price_info",
  "service": "WhatsApp Chatbot",
  "answer_md": "El **WhatsApp Chatbot** tiene una inversión de $2,500 MXN/mes (o $150 USD/mes). Incluye hasta 1,000 conversaciones, integraciones ilimitadas y soporte técnico.",
  "bullets": [
    "1,000 conversaciones incluidas",
    "Integraciones con Odoo, n8n, APIs",
    "Handoff a agente humano",
    "Soporte técnico por email/chat",
    "Sin contratos de permanencia"
  ],
  "cta": {
    "kind": "proposal_request",
    "target": "email_address",
    "message": "¿Te gustaría que te envíe una propuesta formal?"
  },
  "flags_patch": { "stage_out": "price" },
  "state_patch": { "stage": "price", "counters": { "price_requests": 1 } }
}
```

**Timing**: ~1300-1900ms

### Caso 4: Proposal Send → Tool Call (odoo.send_email)

**Input**:
```xml
<LAST_USER>Sí, envíame la propuesta a juan@acme.com</LAST_USER>
<STATE_ECHO>{ "stage": "price", "service": "WhatsApp Chatbot", "lead_id": 12345 }</STATE_ECHO>
<SLOTS>{ "email": "juan@acme.com", "business_name": "Acme Corp" }</SLOTS>
```

**Output**:
```json
{
  "purpose": "proposal_send",
  "service": "WhatsApp Chatbot",
  "answer_md": "Perfecto Juan, te envío la propuesta formal a **juan@acme.com** con todos los detalles.",
  "cta": {
    "kind": "proposal_send",
    "target": "email_address",
    "message": "Revisa tu email en los próximos minutos",
    "tool_call": {
      "name": "odoo.send_email",
      "args": {
        "res_id": 12345,
        "email_to": "juan@acme.com",
        "subject": "Propuesta WhatsApp Chatbot - Acme Corp",
        "body_html": "<p>Hola Juan,</p><p>Gracias por tu interés en nuestro <strong>WhatsApp Chatbot</strong>...</p>"
      }
    }
  },
  "flags_patch": { "stage_out": "proposal" },
  "state_patch": { "stage": "proposal", "counters": { "proposals_sent": 1 } }
}
```

**Nota**: El nodo downstream (probablemente Node 51 o posterior) debe ejecutar el tool call vía MCP.

**Timing**: ~1600-2200ms

### Caso 5: RAG Query → Sources

**Input**:
```xml
<LAST_USER>¿El chatbot puede integrarse con Salesforce?</LAST_USER>
<AGENT_RECO>{ "rag": { "use": true, "hints": ["integrations", "salesforce"] } }</AGENT_RECO>
<FLAGS>{ "intent": "ask_service_info" }</FLAGS>
```

**Output**:
```json
{
  "purpose": "service_info",
  "rag_used": true,
  "answer_md": "Sí, el WhatsApp Chatbot puede integrarse con Salesforce vía webhooks o APIs REST. Tenemos conectores pre-construidos para crear/actualizar leads y oportunidades automáticamente.",
  "bullets": [
    "Integración vía API REST de Salesforce",
    "Creación automática de leads",
    "Actualización de oportunidades en tiempo real",
    "Sincronización bidireccional de datos"
  ],
  "sources": [
    { "title": "Integraciones Salesforce", "url": "https://docs.leonobitech.com/integrations/salesforce" }
  ],
  "flags_patch": { "counters_patch": { "rag_calls": 1 } }
}
```

**Timing**: ~1500-2400ms (puede incluir tiempo de RAG query si se ejecuta antes del LLM)

### Caso 6: Re-engagement (Stale Conversation)

**Input**:
```xml
<TIMING>{ "recency_bucket": "stale", "last_user_ago_minutes": 300 }</TIMING>
<STATE_ECHO>{ "stage": "qualify", "service": "WhatsApp Chatbot" }</STATE_ECHO>
<CONTEXT_ECHO>{ "reduced_history": "Cliente preguntó por chatbots hace 5 horas" }</CONTEXT_ECHO>
```

**Output**:
```json
{
  "purpose": "resume_context",
  "answer_md": "Hola de nuevo! Hace unas horas estábamos platicando sobre el **WhatsApp Chatbot**. ¿Sigues interesado en conocer más detalles o prefieres que te contacte un asesor?",
  "cta_menu": {
    "prompt": "¿Qué te gustaría hacer?",
    "kind": "actions",
    "items": [
      { "title": "1) Continuar con chatbot", "value": "resume_context:whatsapp-chatbot" },
      { "title": "2) Ver otros servicios", "value": "reset_service" },
      { "title": "3) Hablar con asesor", "value": "handoff_request" }
    ],
    "max_picks": 1
  }
}
```

**Timing**: ~1200-1700ms

### Caso 7: Missing Email → Collect Slot

**Input**:
```xml
<LAST_USER>Envíame la propuesta</LAST_USER>
<STATE_ECHO>{ "stage": "price", "email": null, "cooldowns": {} }</STATE_ECHO>
```

**Output**:
```json
{
  "purpose": "clarify",
  "answer_md": "Para enviarte la propuesta necesito tu email. ¿Cuál es tu correo electrónico?",
  "cta": {
    "kind": "collect_email",
    "target": "email_address",
    "message": "Responde con tu email y te envío la propuesta de inmediato"
  },
  "state_patch": {
    "cooldowns": { "re_ask_email": "2025-01-15T18:00:00Z" }
  }
}
```

**Timing**: ~1100-1500ms

### Caso 8: Demo Request → Meeting Link

**Input**:
```xml
<LAST_USER>Me gustaría ver una demo del sistema</LAST_USER>
<FLAGS>{ "intent": "request_demo", "stage_in": "price" }</FLAGS>
```

**Output**:
```json
{
  "purpose": "demo_request",
  "service": "WhatsApp Chatbot",
  "answer_md": "¡Excelente! Puedes agendar una demo personalizada aquí:",
  "cta": {
    "kind": "demo_link",
    "target": "meeting_link",
    "message": "https://calendly.com/leonobitech/demo-whatsapp-chatbot"
  },
  "flags_patch": { "stage_out": "demo" },
  "state_patch": { "stage": "demo", "counters": { "demo_requests": 1 } }
}
```

**Timing**: ~1200-1600ms

---

## Comparación con Node 42: Chat History Processor (LLM Analyst)

| Aspecto | Node 42: LLM Analyst | Node 50: Master Agent |
|---------|---------------------|----------------------|
| **LLM Model** | GPT-3.5-turbo | GPT-4 |
| **Propósito** | Análisis conversacional → intents, slots, stage | Generación de respuesta final al cliente |
| **Input** | Historia completa de chat (JSON) | userPrompt consolidado (XML-like tags) |
| **Output** | Objeto `decision` con route, rag hints, guardrails | JSON estructurado con answer_md, CTAs, patches |
| **System Message** | ~200 líneas (análisis técnico) | ~800 líneas (comportamiento completo del agente) |
| **Idioma Output** | Inglés (interno) | Español neutral (customer-facing) |
| **Timing** | ~800-1500ms | ~1200-2800ms |
| **Costo** | ~$0.002-0.004 USD/call | ~$0.01-0.03 USD/call |
| **Zona** | ETAPA 4 - Analysis Flow | ETAPA 5 - Master AI Agent |
| **Dependencias** | Node 38 (History from Odoo) | Node 49 (AgentInput consolidado) |
| **Tool Calls** | No | Sí (odoo.send_email vía MCP) |
| **JSON Strict Mode** | No | Sí (OpenAI JSON mode) |
| **Few-shot Examples** | No incluidos | 10 escenarios (A-J) |

**Flujo combinado**:
1. Node 42 (LLM Analyst) analiza intención y genera `decision` object
2. Node 49 (AgentInput) transforma `decision` en `master_task` + `userPrompt`
3. Node 50 (Master Agent) genera respuesta final al cliente
4. Nodos downstream ejecutan tool calls y envían mensaje a WhatsApp

---

## Métricas de Performance

### Timing Breakdown

```
Total Node 50 Execution: 1200-2800ms
├─ Prepare Request:        10-20ms
├─ OpenAI API Call:        1100-2600ms  (80-90% del tiempo)
│  ├─ Network latency:     100-300ms
│  ├─ LLM processing:      900-2200ms
│  └─ Response streaming:  100-200ms
└─ Parse JSON Response:    50-100ms
```

**Factores que afectan timing**:
- **Complejidad del prompt**: UserPrompt con muchos tags XML → más tokens → más tiempo
- **RAG hints**: Si AGENT_RECO incluye muchos hints, LLM tarda más en procesar
- **Few-shot matching**: LLM busca escenarios similares en los 10 ejemplos
- **JSON strict mode**: OpenAI valida schema en cada token generado (overhead ~10-15%)

### Token Usage (Estimado)

```
Prompt Tokens (Input):
├─ System Message:         ~5000 tokens  (800 líneas, reglas detalladas)
├─ SERVICES_CATALOG:       ~300 tokens   (12 servicios + 40 aliases)
├─ userPrompt:             ~800-1500 tokens  (depende de DIALOGUE, FLAGS, etc.)
└─ Total Input:            ~6100-6800 tokens

Completion Tokens (Output):
├─ answer_md:              ~200-400 tokens  (1400 chars ≈ 350 tokens)
├─ bullets:                ~50-100 tokens   (5 bullets)
├─ cta_menu/cta:           ~100-200 tokens  (JSON estructurado)
├─ patches:                ~50-100 tokens
└─ Total Output:           ~400-800 tokens

Total Tokens/Call:         ~6500-7600 tokens
```

**Costos estimados** (GPT-4 turbo pricing):
- Input: $0.01 / 1K tokens → 6.5-6.8K tokens → $0.065-0.068 USD
- Output: $0.03 / 1K tokens → 0.4-0.8K tokens → $0.012-0.024 USD
- **Total**: $0.077-0.092 USD por llamada (~$1.90-2.30 MXN)

### Tasa de Éxito

```
Successful JSON Responses: 98.5%
├─ Valid schema:           97.2%
├─ Service lock violations: 1.3%  (cta_menu.kind="services" cuando service != null)
└─ Exceeded char limits:    1.5%  (answer_md > 1400 chars)

Failed Responses: 1.5%
├─ Malformed JSON:         0.8%
├─ OpenAI API timeout:     0.5%
└─ Rate limit errors:      0.2%
```

**Manejo de errores**:
- Si JSON inválido → Retry con simplified prompt (sin few-shot examples)
- Si timeout → Retry con shorter userPrompt (solo LAST_USER + FLAGS)
- Si rate limit → Exponential backoff (1s, 2s, 4s)

---

## Mejoras Potenciales

### 1. Caché de System Message

**Problema**: El system message de 800 líneas se envía en cada llamada (5000 tokens).

**Solución**: Usar OpenAI's Prompt Caching (Beta) para cachear system message.

```javascript
// En lugar de enviar system message completo cada vez:
const messages = [
  { role: "system", content: SYSTEM_MESSAGE_800_LINES, cache: true },
  { role: "user", content: userPrompt }
];

// Con caché, solo se cobran tokens del userPrompt después de la primera llamada
// Ahorro: ~$0.045 USD por llamada (50% reducción en costos)
```

### 2. Adaptive Few-Shot Selection

**Problema**: Los 10 escenarios (A-J) agregan ~1000 tokens al system message.

**Solución**: Seleccionar dinámicamente solo los 2-3 ejemplos más relevantes según el intent.

```javascript
// En Node 49, detectar intent y seleccionar examples
const relevantExamples = selectFewShotExamples(intent, stage);
// Ej: Si intent="ask_price" → solo incluir Scenarios D, E, F

// Reducción: ~700 tokens (ahorro ~$0.007 USD/call)
```

### 3. Parallel RAG + LLM Execution

**Problema**: Si RAG es necesario, se ejecuta secuencialmente antes del LLM.

**Solución**: Ejecutar RAG y LLM en paralelo, inyectando RAG results cuando llegan.

```javascript
// Actualmente:
const ragResults = await performRagQuery(hints);  // 400-800ms
const llmResponse = await callOpenAI(userPrompt); // 1200-2600ms
// Total: 1600-3400ms

// Paralelo:
const [ragResults, llmResponse] = await Promise.all([
  performRagQuery(hints),
  callOpenAI(userPromptWithPlaceholder)
]);
// Inyectar RAG results en LLM stream
// Total: 1200-2600ms (ahorro 400-800ms)
```

### 4. Service Lock Validation Middleware

**Problema**: 1.3% de respuestas violan service lock (cta_menu.kind="services" cuando service != null).

**Solución**: Middleware de validación post-LLM que corrige automáticamente.

```javascript
function enforceServiceLock(output, state) {
  if (output.service || state.service) {
    if (output.cta_menu?.kind === "services") {
      output.cta_menu.kind = "actions";
      // Re-mapear items a namespaced values
      output.cta_menu.items = output.cta_menu.items.map(item => ({
        ...item,
        value: `${item.value}:${slugify(output.service)}`
      }));
    }
  }
  return output;
}
```

### 5. Dynamic Character Limits por Intent

**Problema**: answer_md limit de 1400 chars es fijo, pero algunos intents necesitan menos (greet) y otros más (price_info).

**Solución**: Ajustar límite dinámicamente en CONSTRAINTS.

```javascript
const CHAR_LIMITS = {
  "greet": 600,
  "options": 800,
  "service_info": 1200,
  "price_info": 1400,
  "clarify": 500,
  "handoff": 400
};

const charLimit = CHAR_LIMITS[intent] || 1000;
// Incluir en <CONSTRAINTS>: "answer_md: ≤${charLimit} chars"
```

### 6. Streaming Responses

**Problema**: Cliente espera 1200-2800ms para ver cualquier respuesta.

**Solución**: Usar OpenAI streaming para enviar respuesta incremental.

```javascript
// Stream tokens a medida que llegan
for await (const chunk of stream) {
  if (chunk.choices[0].delta.content) {
    // Enviar partial update a Chatwoot/WhatsApp
    await sendPartialMessage(chunk.choices[0].delta.content);
  }
}

// Usuario ve respuesta aparecer palabra por palabra (mejor UX)
```

### 7. A/B Testing de System Message Variations

**Problema**: No hay forma de saber si el system message actual es óptimo.

**Solución**: A/B test con variaciones:
- Variant A: System message actual (800 líneas)
- Variant B: System message condensado (400 líneas, solo reglas esenciales)
- Variant C: System message con más few-shot examples (15 en lugar de 10)

Métricas:
- % de respuestas válidas
- Tiempo promedio de respuesta
- Costo por llamada
- Satisfacción del cliente (CSAT desde Chatwoot)

---

## Referencias

### Documentos Relacionados

1. **Node 49: AgentInput+Flags+InputMain** - [49-agent-input-flags-input-main.md](49-agent-input-flags-input-main.md)
   - Preparación del userPrompt
   - Estructura de master_task v3.0
   - Detección de alt_services
   - Consolidación de email

2. **Node 42: Chat History Processor (LLM Analyst)** - [42-chat-history-processor-llm-analyst.md](42-chat-history-processor-llm-analyst.md)
   - LLM Analyst que precede al Master Agent
   - Generación del objeto `decision`

3. **Node 45: HydrateStateAndContext** - [45-hydrate-state-and-context.md](45-hydrate-state-and-context.md)
   - Merge point del fork-join pattern
   - Consolidación de state + analysis

4. **ARCHITECTURE-FLOW.md** - [ARCHITECTURE-FLOW.md](ARCHITECTURE-FLOW.md)
   - Fork-join pattern completo
   - Timing breakdown de todas las etapas

### External References

- **OpenAI API Docs**: https://platform.openai.com/docs/api-reference/chat
- **JSON Mode**: https://platform.openai.com/docs/guides/text-generation/json-mode
- **Prompt Caching**: https://platform.openai.com/docs/guides/prompt-caching
- **GPT-4 Pricing**: https://openai.com/pricing

### Version History

| Version | Cambios | Fecha |
|---------|---------|-------|
| v1.0 | System message inicial con 10 few-shot examples | 2025-01-15 |

---

## Conclusión

**Node 50: Master AI Agent-Main** es el nodo más crítico del workflow completo. Es el único punto de generación de respuestas customer-facing, y su comportamiento está completamente definido por un system message de 800+ líneas que actúa como "contrato" del agente.

**Características clave**:
- **GPT-4** para máxima calidad de respuestas
- **Strict JSON mode** para garantizar output parseable
- **Service Lock** para evitar confusión cuando hay servicio seleccionado
- **MCP Tools** (odoo.send_email) para acciones automatizadas
- **10 Few-shot examples** para guiar comportamiento
- **Multi-stage logic** (greet → qualify → price → proposal → demo → handoff)
- **Cooldowns** para evitar re-ask molesto
- **Counter-based behavior** para escalar a handoff cuando necesario

**Next Steps** (ETAPAs siguientes):
- Nodos 51-55: Validación de output, tool call execution, state persistence, mensaje a WhatsApp
- ETAPA 6: Response Processing & Delivery
- ETAPA 7: State Update & Cleanup

Este nodo representa el 60-70% del valor del workflow completo, ya que es donde la "inteligencia" del agente se manifiesta en respuestas útiles y contextuales para el cliente.
