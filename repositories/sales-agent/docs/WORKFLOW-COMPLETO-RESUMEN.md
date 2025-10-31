# Resumen Completo del Workflow - Sales Agent WhatsApp

**Versión**: 1.0
**Fecha**: 2025-10-31
**Total de Nodos**: 56
**Autor**: Leonobitech

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura General](#arquitectura-general)
3. [Overview de las 5 ETAPAs](#overview-de-las-5-etapas)
4. [Flujo de Datos End-to-End](#flujo-de-datos-end-to-end)
5. [Stack Tecnológico](#stack-tecnológico)
6. [Análisis de Timing](#análisis-de-timing)
7. [Análisis de Costos](#análisis-de-costos)
8. [Patrones de Diseño](#patrones-de-diseño)
9. [Optimizaciones Identificadas](#optimizaciones-identificadas)
10. [Referencias](#referencias)

---

## Resumen Ejecutivo

Este workflow implementa un **agente de ventas conversacional multicanal** que opera 24/7 atendiendo consultas de clientes potenciales a través de WhatsApp. El sistema integra múltiples tecnologías para proporcionar respuestas inteligentes, contextualizadas y alineadas con las políticas de negocio de Leonobitech.

**Capacidades Clave**:
- ✅ Atención automatizada en WhatsApp con respuestas naturales en español
- ✅ RAG (Retrieval-Augmented Generation) con documentación empresarial en Qdrant
- ✅ Análisis de intención y recomendaciones estratégicas con GPT-3.5-turbo
- ✅ Generación de respuestas finales con GPT-4 (master agent)
- ✅ Persistencia dual: Baserow (leads) + Odoo (CRM)
- ✅ Gestión de estado conversacional con cooldowns y contadores
- ✅ Políticas de negocio como código (guardrails)
- ✅ Menús interactivos con flujo natural inteligente

**Métricas de Performance**:
- **Tiempo total**: ~7.7-8.8 segundos (entrada → respuesta)
- **Costo por mensaje**: ~$0.08-0.10 USD
- **Tokens por conversación**: ~8000-9500 tokens
- **Tasa de éxito**: >95% (parsing robusto con 3 estrategias)

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FLUJO COMPLETO (56 NODOS)                       │
└─────────────────────────────────────────────────────────────────────────┘

  WhatsApp Business API
         │
         ▼
  ┌──────────────────┐
  │  CHATWOOT (UI)   │  ◄── Agente humano puede intervenir
  └──────────────────┘
         │
         ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                        n8n WORKFLOW (56 NODOS)                         ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║  [ETAPA 1] INGESTA                    (Nodos 1-10)   ~150ms           ║
  ║    ├─ Webhook Chatwoot                                                ║
  ║    ├─ Validaciones (agente humano, duplicados)                        ║
  ║    └─ Fetch metadata (conversación, contacto)                         ║
  ║                                                                        ║
  ║  [ETAPA 2] CONTEXTO & RAG             (Nodos 11-27)  ~1.8-2.2s        ║
  ║    ├─ Fetch historial de Baserow                                      ║
  ║    ├─ Fetch 8-10 mensajes previos (Chatwoot)                          ║
  ║    ├─ Query Qdrant (RAG): ~1.2-1.5s                                   ║
  ║    └─ Construcción del contexto conversacional                        ║
  ║                                                                        ║
  ║  [ETAPA 3] ZONA DE FLAGS             (Nodos 28-41)  ~350-450ms        ║
  ║    ├─ Evaluación de cooldowns (email_ask, addressee_ask)              ║
  ║    ├─ Evaluación de proposal (auto-trigger)                           ║
  ║    ├─ Decisiones ACK_ONLY (WhatsApp out-of-band)                      ║
  ║    └─ Generación de flags JSON                                        ║
  ║                                                                        ║
  ║  [ETAPA 4] LLM ANALYST                (Nodos 42-48)  ~1.8-2.3s        ║
  ║    ├─ GPT-3.5-turbo (analista estratégico)                            ║
  ║    ├─ Detección de intención y stage                                  ║
  ║    ├─ Recomendaciones para Master Agent                               ║
  ║    └─ Guardrails y validaciones                                       ║
  ║                                                                        ║
  ║  [ETAPA 5] MASTER AI AGENT            (Nodos 49-56)  ~3.8-4.3s        ║
  ║    ├─ GPT-4 (master agent): ~2.5-3s                                   ║
  ║    ├─ Generación de respuesta final                                   ║
  ║    ├─ Output formatting (parsing robusto): ~100ms                     ║
  ║    ├─ Persistencia dual (Baserow + Odoo): ~600ms                      ║
  ║    └─ Delivery a Chatwoot: ~50ms                                      ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
         │
         ▼
  ┌──────────────────┐
  │  CHATWOOT (UI)   │  ◄── Mensaje aparece en conversación
  └──────────────────┘
         │
         ▼
  WhatsApp Business API
         │
         ▼
   📱 Usuario final
```

---

## Overview de las 5 ETAPAs

### ETAPA 1: INGESTA (Nodos 1-10)
**Duración**: ~150ms
**Propósito**: Recibir y validar mensajes entrantes desde Chatwoot

**Nodos clave**:
- **Node 1**: Webhook receptor (Chatwoot → n8n)
- **Node 2-4**: Validaciones (mensaje de agente humano, duplicados)
- **Node 5-10**: Fetch de metadata (conversación, contacto, labels)

**Output**: Objeto `meta` con toda la información contextual del mensaje

**Detalles**: Ver [ETAPA-1-RESUMEN.md](ETAPA-1-RESUMEN.md)

---

### ETAPA 2: CONTEXTO & RAG (Nodos 11-27)
**Duración**: ~1.8-2.2 segundos
**Propósito**: Construir contexto conversacional con historial + RAG

**Nodos clave**:
- **Node 11-14**: Fetch historial de Baserow (lead state)
- **Node 15-20**: Fetch mensajes previos de Chatwoot (8-10 últimos)
- **Node 21-24**: Query a Qdrant (RAG con embeddings): **~1.2-1.5s**
- **Node 25-27**: Merge y construcción del contexto final

**Output**: Objeto `context` con:
```javascript
{
  lead_state: {...},          // Baserow state
  conversation_history: [...], // 8-10 mensajes previos
  rag_results: [...],         // Top 5-8 chunks relevantes
  meta: {...}                 // Metadata de ETAPA 1
}
```

**Detalles**: Ver [ETAPA-2-RESUMEN.md](ETAPA-2-RESUMEN.md)

---

### ETAPA 3: ZONA DE FLAGS (Nodos 28-41)
**Duración**: ~350-450ms
**Propósito**: Evaluar condiciones de negocio y generar flags de decisión

**Nodos clave**:
- **Node 28-32**: Cooldown evaluation (email_ask, addressee_ask)
- **Node 33-36**: Proposal auto-trigger (≥2 services, ≥1 price)
- **Node 37-39**: ACK_ONLY decision (mensajes out-of-band de WhatsApp)
- **Node 40-41**: Flags merge (JSON con todas las decisiones)

**Output**: Objeto `flags` con:
```javascript
{
  cooldowns: {
    email_ask_ok: true,
    email_ask_ms_left: 0,
    addressee_ask_ok: false,
    addressee_ask_ms_left: 14563000
  },
  proposal: {
    auto_offer: true,
    trigger: "auto(services>=2 && prices>=1)"
  },
  force_ack_only: false,
  ack_only_reason: null
}
```

**Detalles**: Ver [ETAPA-3-RESUMEN.md](ETAPA-3-RESUMEN.md)

---

### ETAPA 4: LLM ANALYST (Nodos 42-48)
**Duración**: ~1.8-2.3 segundos
**Propósito**: Análisis estratégico de la conversación con GPT-3.5-turbo

**Nodos clave**:
- **Node 42**: OpenAI Chat Model (GPT-3.5-turbo)
- **Node 43**: Output parsing con regex
- **Node 44-47**: Validaciones y guardrails
- **Node 48**: Construcción de `master_task` v3.0

**Output**: Objeto `analyst_result` con:
```javascript
{
  intent: "ask_service_info",
  stage: "explore",
  recommendation: "INSTRUCCIONES PARA MASTER: El usuario pregunta por chatbot de WhatsApp...",
  guardrails: {
    do_not: ["no especular con precios sin service lock"],
    must: ["explicar beneficios concretos"],
    fallback: "Si no hay info suficiente, ofrecer agendar llamada"
  },
  rag_hints: ["whatsapp-chatbot", "funcionalidades", "integración"]
}
```

**Características**:
- ~200 líneas de system prompt
- 6 escenarios few-shot
- Costo: ~$0.01-0.015 USD/call
- Tokens: ~1500-2000 input, ~300-500 output

**Detalles**: Ver [ETAPA-4-RESUMEN.md](ETAPA-4-RESUMEN.md)

---

### ETAPA 5: MASTER AI AGENT (Nodos 49-56)
**Duración**: ~3.8-4.3 segundos
**Propósito**: Generación de respuesta final con GPT-4 y delivery

**Nodos clave**:
- **Node 49**: UserPrompt builder (XML con 12+ tags)
- **Node 50**: OpenAI Chat Model (GPT-4): **~2.5-3s**
- **Node 51**: Output Main (parsing robusto + formatting): **~100ms**
- **Node 52**: Gate (validación NO_REPLY)
- **Node 53**: StatePatchLead (Baserow): **~300ms**
- **Node 54**: UpdateEmailLead (Odoo): **~150ms**
- **Node 55**: RecordAgentResponse (Odoo chatter): **~150ms**
- **Node 56**: Output to Chatwoot: **~50ms**

**Output**: Mensaje final formateado con:
```javascript
{
  llm: {
    text: "Leonobit 🤖 *[Servicio]*:\n¡Hola Juan! El chatbot de WhatsApp...",
    body_html: "<div>...</div>",
    chatwoot_input_select: {...},
    validation: {...}
  },
  state_for_persist: {...},  // 10 campos para Baserow
  odoo_updates: {...}         // Email + chatter para Odoo
}
```

**Características**:
- ~800 líneas de system prompt (Master Agent)
- 10 escenarios few-shot (A-J)
- Service Lock enforcement
- Natural Flow Policy (5 casos de supresión de menú)
- Parsing robusto (3 estrategias, 95%+2%+3% success rate)
- Persistencia dual paralela (ahorra ~530ms)
- Costo: ~$0.08 USD/call (GPT-4)
- Tokens: ~6500-7600 input, ~400-600 output

**Detalles**: Ver [ETAPA-5-RESUMEN.md](ETAPA-5-RESUMEN.md)

---

## Flujo de Datos End-to-End

### Ejemplo Completo: Usuario pregunta por servicio

```
ENTRADA (WhatsApp):
"Hola, me interesa el chatbot de WhatsApp, ¿qué funcionalidades tiene?"

┌─────────────────────────────────────────────────────────────────────────┐
│ ETAPA 1: INGESTA (~150ms)                                               │
└─────────────────────────────────────────────────────────────────────────┘
  ▼
  {
    meta: {
      conversation_id: 190,
      sender_id: 123,
      phone: "+525512345678",
      name: "Juan Pérez",
      message: "Hola, me interesa el chatbot de WhatsApp...",
      timestamp: "2025-10-31T10:30:00Z"
    }
  }

┌─────────────────────────────────────────────────────────────────────────┐
│ ETAPA 2: CONTEXTO & RAG (~2s)                                           │
└─────────────────────────────────────────────────────────────────────────┘
  ▼
  {
    context: {
      lead_state: {
        id: 33,
        email: null,
        stage: "explore",
        interests: ["whatsapp-chatbot"],
        counters: { services_seen: 1, prices_asked: 0, deep_interest: 2 }
      },
      conversation_history: [
        { role: "contact", content: "Hola, ¿me pueden ayudar?", ts: "..." },
        { role: "assistant", content: "¡Claro! Soy Leonobit...", ts: "..." }
      ],
      rag_results: [
        {
          content: "El chatbot de WhatsApp permite automatizar...",
          score: 0.87,
          metadata: { doc: "whatsapp-chatbot-features.md" }
        },
        // ... 4-7 chunks más
      ]
    }
  }

┌─────────────────────────────────────────────────────────────────────────┐
│ ETAPA 3: FLAGS (~400ms)                                                 │
└─────────────────────────────────────────────────────────────────────────┘
  ▼
  {
    flags: {
      cooldowns: {
        email_ask_ok: true,        // Puede pedir email
        addressee_ask_ok: false    // Ya preguntó recientemente
      },
      proposal: {
        auto_offer: false,         // Aún no cumple condiciones
        trigger: "pending"
      },
      force_ack_only: false
    }
  }

┌─────────────────────────────────────────────────────────────────────────┐
│ ETAPA 4: LLM ANALYST (~2s, GPT-3.5-turbo)                               │
└─────────────────────────────────────────────────────────────────────────┘
  ▼
  {
    analyst_result: {
      intent: "ask_service_info",
      stage: "explore",
      recommendation: "INSTRUCCIONES PARA MASTER: Usuario pregunta por funcionalidades del chatbot de WhatsApp. Basándote en RAG chunks, explica: automatización 24/7, respuestas inteligentes con IA, menús interactivos, integración con sistemas empresariales. Mantén tono conversacional, máximo 2 bullets. Ofrece menú: ask_price, ask_demo, ask_other_service.",
      guardrails: {
        do_not: ["no dar precio sin service lock"],
        must: ["usar información de RAG", "ofrecer siguiente paso claro"],
        fallback: "Si usuario pide algo no cubierto en RAG, ofrecer contactar con experto"
      },
      rag_hints: ["whatsapp-chatbot", "automatización", "IA"]
    }
  }

┌─────────────────────────────────────────────────────────────────────────┐
│ ETAPA 5: MASTER AGENT (~4s, GPT-4 + formatting + persistence)          │
└─────────────────────────────────────────────────────────────────────────┘
  ▼
  Node 49: UserPrompt Builder
  {
    userPrompt: `
      <analyst_recommendation>
        INSTRUCCIONES PARA MASTER: Usuario pregunta por funcionalidades...
      </analyst_recommendation>
      <rag_chunks>
        [Chunk 1] El chatbot de WhatsApp permite automatizar...
        [Chunk 2] Principales funcionalidades: respuestas IA, menús...
        ...
      </rag_chunks>
      <lead_state>
        {"stage": "explore", "interests": ["whatsapp-chatbot"], ...}
      </lead_state>
      <flags>
        {"cooldowns": {...}, "proposal": {...}}
      </flags>
      <conversation_history>
        ...
      </conversation_history>
      <user_latest_message>
        Hola, me interesa el chatbot de WhatsApp, ¿qué funcionalidades tiene?
      </user_latest_message>
    `
  }

  Node 50: GPT-4 Call (~2.5s)
  {
    "answer_md": "¡Hola Juan! 👋\n\nEl chatbot de WhatsApp de Leonobitech es una solución que te permite automatizar la atención al cliente 24/7 con inteligencia artificial. Las funcionalidades principales son:\n\n• **Respuestas inteligentes**: Usando IA (GPT-4), el bot entiende preguntas complejas y responde de forma natural\n• **Menús interactivos**: Los clientes pueden navegar opciones fácilmente (servicios, precios, demos)\n• **Integración empresarial**: Se conecta con tu CRM, bases de datos y sistemas existentes\n\n¿Te gustaría saber más sobre algún aspecto específico?",
    "bullets": [
      "Respuestas inteligentes con IA (GPT-4)",
      "Menús interactivos para navegación fácil",
      "Integración con CRM y sistemas empresariales"
    ],
    "cta_menu": {
      "kind": "services",
      "prompt": "¿Qué te gustaría saber?",
      "items": [
        { "id": "ask_price:whatsapp-chatbot", "label": "💰 Ver precios", "desc": "Planes y costos" },
        { "id": "ask_demo:whatsapp-chatbot", "label": "🎥 Solicitar demo", "desc": "Ver en acción" },
        { "id": "ask_other_service", "label": "🔍 Otros servicios", "desc": "Explorar más" }
      ]
    },
    "cta": {
      "preferred": "ask_price:whatsapp-chatbot",
      "alternatives": ["ask_demo:whatsapp-chatbot"]
    },
    "flags_patch": {
      "expect_reply_natural": true
    },
    "state_patch": {
      "stage": "explore",
      "interests_add": ["whatsapp-chatbot"],
      "counters_increment": { "deep_interest": 1 }
    }
  }

  Node 51: Output Formatting (~100ms)
  {
    llm: {
      text: "Leonobit 🤖 *[Servicio]*:\n¡Hola Juan! 👋\n\nEl chatbot de WhatsApp...",
      body_html: "<div><strong>Leonobit 🤖 [Servicio]</strong></div><p>¡Hola Juan! 👋</p>...",
      chatwoot_input_select: {
        content: "¿Qué te gustaría saber?",
        content_type: "input_select",
        content_attributes: {
          items: [
            { title: "💰 Ver precios", value: "ask_price:whatsapp-chatbot" },
            { title: "🎥 Solicitar demo", value: "ask_demo:whatsapp-chatbot" },
            { title: "🔍 Otros servicios", value: "ask_other_service" }
          ]
        }
      },
      validation: {
        ok: true,
        notes: ["parse:direct", "menu:3_items", "cta:preferred"]
      }
    },
    state_for_persist: {
      stage: "explore",
      interests: ["whatsapp-chatbot"],
      counters: { services_seen: 1, deep_interest: 3 }
    }
  }

  Node 53-55: Parallel Persistence (~600ms total)
  ├─ Baserow: UPDATE lead #33 (stage, interests, counters)
  ├─ Odoo: UPDATE crm.lead #33 (email_from si aplica)
  └─ Odoo: CREATE mail.message (chatter log)

  Node 56: Delivery to Chatwoot (~50ms)
  POST /api/v1/accounts/1/conversations/190/messages
  {
    "content": "Leonobit 🤖 *[Servicio]*:\n¡Hola Juan! 👋...",
    "message_type": "outgoing",
    "content_type": "input_select",
    "content_attributes": { items: [...] }
  }

SALIDA (WhatsApp):
"Leonobit 🤖 *[Servicio]*:
¡Hola Juan! 👋

El chatbot de WhatsApp de Leonobitech es una solución que te permite automatizar la atención al cliente 24/7 con inteligencia artificial. Las funcionalidades principales son:

• Respuestas inteligentes con IA (GPT-4)
• Menús interactivos para navegación fácil
• Integración con CRM y sistemas empresariales

¿Te gustaría saber más sobre algún aspecto específico?

[Menú interactivo]
💰 Ver precios
🎥 Solicitar demo
🔍 Otros servicios"
```

**Tiempo total**: ~7.7 segundos (WhatsApp → respuesta)

---

## Stack Tecnológico

### Plataformas Core

| Componente | Tecnología | Versión | Propósito |
|-----------|-----------|---------|-----------|
| **Workflow Engine** | n8n | Latest | Orquestación de 56 nodos |
| **LLM Analyst** | OpenAI GPT-3.5-turbo | - | Análisis de intención y estrategia |
| **Master Agent** | OpenAI GPT-4 | - | Generación de respuestas finales |
| **Vector DB** | Qdrant | - | RAG con embeddings de documentación |
| **Lead DB** | Baserow | - | Estado conversacional y leads |
| **CRM** | Odoo 17 | Community | Gestión de oportunidades (crm.lead) |
| **Chat UI** | Chatwoot | - | Interfaz de conversación + webhooks |
| **Messaging** | WhatsApp Business API | - | Canal de comunicación final |

### APIs y Protocolos

| Servicio | Protocolo | Autenticación |
|---------|-----------|---------------|
| **Chatwoot** | REST API | API Token (Bearer) |
| **Qdrant** | REST API | API Key |
| **Baserow** | REST API | API Token |
| **Odoo** | XML-RPC | Database + UID + Password |
| **OpenAI** | REST API | API Key (Bearer) |

### Modelos de Datos

**Baserow (Leads)**:
```javascript
{
  id: number,                  // Row ID
  phone: string,               // +525512345678
  name: string,                // "Juan Pérez"
  email: string | null,        // Obtenido en conversación
  business_name: string | null,
  stage: string,               // greet|explore|qualify|price|proposal|demo|handoff
  interests: string[],         // ["whatsapp-chatbot", "custom-web-app"]
  service: string | null,      // Service lock (si seleccionó uno)
  service_target: string | null,
  counters: {
    services_seen: number,
    prices_asked: number,
    deep_interest: number,
    messages_since_last_offer: number
  },
  cooldowns: {
    email_ask_ts: number | null,
    addressee_ask_ts: number | null
  },
  proposal_offer_done: boolean,
  created_at: string,
  updated_at: string
}
```

**Odoo (crm.lead)**:
```python
{
  'id': int,                   # Lead ID
  'name': str,                 # "WhatsApp Lead: Juan Pérez"
  'email_from': str,           # "juan@acme.com"
  'phone': str,                # "+525512345678"
  'description': str,          # HTML con historial
  'stage_id': int,             # ID de etapa en pipeline
  'user_id': int,              # Responsable (vendedor)
  'team_id': int,              # Equipo de ventas
  'source_id': int,            # Fuente: "WhatsApp Bot"
  'create_date': datetime,
  'write_date': datetime
}
```

**Odoo (mail.message)**:
```python
{
  'id': int,
  'model': 'crm.lead',
  'res_id': int,               # Lead ID
  'body': str,                 # HTML del mensaje
  'message_type': 'comment',
  'subtype_id': int,           # 1 = Discussions
  'author_id': int,            # Bot user ID
  'date': datetime
}
```

---

## Análisis de Timing

### Desglose por ETAPA

| ETAPA | Nodos | Duración | % del Total | Operaciones Principales |
|-------|-------|----------|-------------|------------------------|
| **1. INGESTA** | 1-10 | 150ms | 2% | HTTP webhook, validaciones básicas |
| **2. CONTEXTO & RAG** | 11-27 | 1800-2200ms | 25% | Baserow fetch, Chatwoot history, **Qdrant query** |
| **3. FLAGS** | 28-41 | 350-450ms | 5% | Cooldowns, proposal trigger, ACK decisions |
| **4. LLM ANALYST** | 42-48 | 1800-2300ms | 25% | **GPT-3.5-turbo call**, parsing, validaciones |
| **5. MASTER AGENT** | 49-56 | 3800-4300ms | 50% | Prompt build, **GPT-4 call**, formatting, persistence |
| **TOTAL** | 56 | **7700-8800ms** | 100% | **~7.7-8.8 segundos** |

### Desglose Detallado de ETAPA 5 (50% del tiempo total)

| Operación | Duración | % de ETAPA 5 |
|-----------|----------|--------------|
| **GPT-4 Call** (Node 50) | 2500-3000ms | 60-70% |
| **Baserow StatePatch** (Node 53) | 300ms | 7-8% |
| **Odoo UpdateEmail** (Node 54) | 150ms | 3-4% |
| **Odoo RecordResponse** (Node 55) | 150ms | 3-4% |
| **Chatwoot Output** (Node 56) | 50ms | 1% |
| **Output Formatting** (Node 51) | 100ms | 2-3% |
| **UserPrompt Build** (Node 49) | 50ms | 1% |
| **Gate + Misc** (Nodes 52, etc.) | 500-650ms | 13-15% |

**Observación crítica**: GPT-4 es el cuello de botella principal (~2.5-3s), representando el 30-35% del tiempo total del workflow.

### Comparación de Latencia por Componente

```
┌─────────────────────────────────────────────────────────────────┐
│                    LATENCIA POR COMPONENTE                       │
└─────────────────────────────────────────────────────────────────┘

GPT-4 (Node 50)         ████████████████████████████████  2500-3000ms
GPT-3.5 (Node 42)       ██████████████████                1800-2300ms
Qdrant RAG (Node 21-24) █████████████                     1200-1500ms
Baserow Fetch (Node 11) ███                                300ms
Baserow Update (Node 53)███                                300ms
Chatwoot History        ██                                 200ms
Odoo Email (Node 54)    █                                  150ms
Odoo Chatter (Node 55)  █                                  150ms
FLAGS Evaluation        ██                                 400ms
Output Formatting       █                                  100ms
Chatwoot Delivery       ▌                                   50ms
Ingesta & Validations   █                                  150ms

0ms                1000ms              2000ms              3000ms
```

---

## Análisis de Costos

### Costos por Mensaje

| Componente | Modelo | Tokens Input | Tokens Output | Costo/Call | % del Total |
|-----------|--------|--------------|---------------|------------|-------------|
| **LLM Analyst** | GPT-3.5-turbo | 1500-2000 | 300-500 | $0.01-0.015 | 12-15% |
| **Master Agent** | GPT-4 | 6500-7600 | 400-600 | $0.075-0.09 | 85-88% |
| **TOTAL** | - | **8000-9600** | **700-1100** | **$0.08-0.10** | 100% |

**Notas**:
- Pricing GPT-3.5-turbo: $0.0005/1K input, $0.0015/1K output
- Pricing GPT-4: $0.01/1K input, $0.03/1K output
- Los costos de Qdrant, Baserow, Chatwoot, Odoo son fijos mensuales (no por mensaje)

### Proyección de Costos Mensuales

| Volumen Mensual | Costo LLM Total | Costo/Día | Observaciones |
|----------------|-----------------|-----------|---------------|
| **1,000 msgs** | $80-100 | $2.67-3.33 | Piloto con 1-2 clientes |
| **5,000 msgs** | $400-500 | $13.33-16.67 | 5-10 clientes activos |
| **10,000 msgs** | $800-1,000 | $26.67-33.33 | Escala media |
| **50,000 msgs** | $4,000-5,000 | $133-167 | Escala alta |

**Optimizaciones potenciales**:
- Usar GPT-3.5-turbo para Master Agent en casos simples (ahorro 85%)
- Implementar cache de respuestas frecuentes
- Fine-tuning de modelo más económico

### Costos de Infraestructura (No por mensaje)

| Servicio | Plan | Costo Mensual |
|---------|------|---------------|
| **Chatwoot** | Cloud Business | $19-79/mes |
| **Baserow** | Premium | $5-20/mes |
| **Odoo** | Community (self-hosted) | $0 (VPS ~$20/mes) |
| **Qdrant** | Cloud Starter | $25-50/mes |
| **n8n** | Self-hosted | $0 (VPS incluido) |
| **WhatsApp Business API** | Variable | $0.005-0.01/msg |
| **TOTAL FIJO** | - | **~$70-170/mes** |

**Costo total estimado** (5,000 msgs/mes): $470-670/mes ($0.094-0.134/msg)

---

## Patrones de Diseño

### 1. Guardrails-as-Code
**Ubicación**: ETAPAs 3, 4, 5
**Propósito**: Codificar políticas de negocio como estructuras de datos validables

**Implementación**:
```javascript
// ETAPA 3: Cooldowns (Node 28-32)
const EMAIL_ASK_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 días
if (now - email_ask_ts < EMAIL_ASK_COOLDOWN_MS) {
  email_ask_ok = false;
}

// ETAPA 4: Guardrails del LLM Analyst (Node 42)
{
  "guardrails": {
    "do_not": ["no especular con precios sin service lock"],
    "must": ["usar información de RAG", "mantener tono profesional"],
    "fallback": "Si no hay info, ofrecer contactar con experto"
  }
}

// ETAPA 5: Service Lock Enforcement (Node 50)
if (service != null || service_target != null) {
  cta_menu.kind = "actions"; // NO "services"
  // Todos los items DEBEN estar namespacedos
}
```

**Beneficios**:
- Políticas versionadas en código (git)
- Cambios auditables
- Testing de reglas de negocio

---

### 2. Trust-but-Verify
**Ubicación**: ETAPA 5 (Node 51)
**Propósito**: Permitir que LLM genere libremente, pero validar/corregir con código

**Implementación**:
```javascript
// Node 51: Output Main
const raw = rawLLM.output; // Texto libre de GPT-4

// 1. TRUST: Intentar parsear JSON
let parsed = tryParseJSON(raw);

// 2. VERIFY: Validar estructura
if (!parsed.answer_md || parsed.answer_md.length > 1400) {
  validation.warnings.push("answer_md exceeds 1400 chars, truncating");
  parsed.answer_md = parsed.answer_md.slice(0, 1400);
}

// 3. CORRECT: Aplicar Service Lock si violado
if (lead.service && parsed.cta_menu.kind !== "actions") {
  validation.errors.push("service_lock_violation");
  parsed.cta_menu.kind = "actions"; // Auto-corrección
}

// 4. FALLBACK: Si parsing total falla, usar regex
if (!parsed) {
  parsed = extractFieldsWithRegex(raw);
}
```

**Tasa de éxito**:
- 95% parsing directo
- 3% balanced object
- 2% regex extraction
- **>99.5% total**

---

### 3. Natural Flow Policy
**Ubicación**: ETAPA 5 (Node 51)
**Propósito**: Suprimir menús cuando el contexto indica que sería antinatural

**Implementación**:
```javascript
// Node 51: 5 casos de supresión de menú

const SUPPRESS_MENU =
  FORCE_ACK_ONLY ||          // WhatsApp out-of-band ack
  isBookingConfirm ||        // "Tu demo está agendada para..."
  isInfoOnlyRag ||           // Respuesta puramente informativa
  isSoftCloseUser ||         // Usuario dice "gracias, luego te contacto"
  masterNoMenu;              // Master Agent marca expect_menu: false

if (SUPPRESS_MENU) {
  showMenu = false;
  validation.notes.push(`natural_flow:suppress_menu(${reason})`);
}
```

**Beneficio**: Conversaciones más humanas, menos intrusivas

---

### 4. Dual Persistence
**Ubicación**: ETAPA 5 (Nodes 53-55)
**Propósito**: Mantener sincronizados Baserow (lead state) y Odoo (CRM)

**Implementación**:
```javascript
// Ejecución en paralelo (nodes 53-55 simultáneos)

// Node 53: Baserow StatePatchLead (~300ms)
PATCH /api/database/rows/table/12345/33/
{
  stage: "qualify",
  interests: ["whatsapp-chatbot"],
  counters: {...}
}

// Node 54: Odoo UpdateEmailLead (~150ms)
odoo.execute_kw('crm.lead', 'write', [[33], {
  email_from: 'juan@acme.com'
}])

// Node 55: Odoo RecordAgentResponse (~150ms)
odoo.execute_kw('mail.message', 'create', [{
  model: 'crm.lead',
  res_id: 33,
  body: '<p><strong>🤖 Leonobit</strong></p>...'
}])
```

**Ahorro de tiempo**: ~530ms (3 calls secuenciales = 600ms, paralelo = 300ms)

---

### 5. Robust Parsing (3-Strategy Fallback)
**Ubicación**: ETAPA 5 (Node 51)
**Propósito**: Garantizar parsing exitoso incluso con salida malformada de LLM

**Implementación**:
```javascript
function parseRobust(rawText) {
  // Strategy 1: Direct JSON parse (95% success)
  try {
    return JSON.parse(rawText);
  } catch (e1) {

    // Strategy 2: Balanced object extraction (3% success)
    const balanced = tryParseBalancedObject(rawText);
    if (balanced) return balanced;

    // Strategy 3: Regex field extraction (2% success)
    return extractFieldsWithRegex(rawText);
  }
}
```

**Tasas de éxito**:
- Strategy 1: 95% (GPT-4 sigue instrucciones bien)
- Strategy 2: 3% (JSON con prefijo/sufijo extra)
- Strategy 3: 2% (respuesta muy malformada pero campos presentes)
- **Total: >99.5%**

---

### 6. RAG with Semantic Search
**Ubicación**: ETAPA 2 (Nodes 21-24)
**Propósito**: Recuperar documentación relevante usando embeddings

**Implementación**:
```javascript
// Node 21: Qdrant query
POST /collections/leonobitech-docs/points/search
{
  vector: [0.123, -0.456, ...],  // Embedding del user message
  limit: 8,
  score_threshold: 0.7
}

// Response (top 5-8 chunks)
{
  result: [
    {
      score: 0.87,
      payload: {
        content: "El chatbot de WhatsApp permite...",
        metadata: { doc: "whatsapp-chatbot.md", section: "features" }
      }
    },
    // ...
  ]
}
```

**Latencia**: ~1.2-1.5s (query + embedding generation)

---

### 7. Cooldown Management
**Ubicación**: ETAPA 3 (Nodes 28-32)
**Propósito**: Evitar preguntar repetitivamente información sensible

**Implementación**:
```javascript
const COOLDOWNS = {
  email_ask: 3 * 24 * 60 * 60 * 1000,      // 3 días
  addressee_ask: 4 * 60 * 60 * 1000        // 4 horas
};

// Node 28: Email ask evaluation
const email_ask_ts = lead.cooldowns.email_ask_ts || 0;
const email_ask_elapsed = now - email_ask_ts;
const email_ask_ok = email_ask_elapsed >= COOLDOWNS.email_ask;

// Resultado en flags
{
  cooldowns: {
    email_ask_ok: true,
    email_ask_ms_left: 0,
    addressee_ask_ok: false,
    addressee_ask_ms_left: 14563000  // ~4 horas restantes
  }
}
```

**Beneficio**: Usuario no se siente interrogado repetitivamente

---

### 8. Auto-Proposal Trigger
**Ubicación**: ETAPA 3 (Nodes 33-36)
**Propósito**: Ofrecer propuesta automáticamente cuando el lead está calificado

**Implementación**:
```javascript
// Node 33: Proposal conditions
const services_seen = lead.counters.services_seen || 0;
const prices_asked = lead.counters.prices_asked || 0;
const proposal_offer_done = lead.proposal_offer_done || false;

// Node 34: Decision
const auto_offer =
  !proposal_offer_done &&
  services_seen >= 2 &&
  prices_asked >= 1;

// Resultado en flags
{
  proposal: {
    auto_offer: true,
    trigger: "auto(services>=2 && prices>=1)",
    reason: "Lead exploró 2+ servicios y preguntó precios, está listo"
  }
}
```

**Impacto**: Acelera el funnel de ventas, reduce tiempo de calificación

---

## Optimizaciones Identificadas

### 1. Caching de RAG
**Problema**: Qdrant query toma ~1.2-1.5s por cada mensaje
**Solución**: Implementar cache en Redis para queries frecuentes

**Implementación**:
```javascript
// Antes de Node 21
const cacheKey = `rag:${hash(userMessage)}`;
const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

// Después de Node 24
await redis.setex(cacheKey, 3600, JSON.stringify(ragResults)); // 1 hora TTL
```

**Ahorro estimado**: 1.2s en 30-40% de mensajes (preguntas repetidas)

---

### 2. GPT-3.5 para Casos Simples
**Problema**: GPT-4 cuesta ~$0.08/call y toma 2.5-3s
**Solución**: Usar GPT-3.5-turbo para respuestas simples (saludos, agradecimientos, FAQs)

**Implementación**:
```javascript
// Nuevo Node después de ETAPA 4
const isSimpleCase =
  intent === "greet" ||
  intent === "thank" ||
  intent === "faq_simple";

if (isSimpleCase) {
  // Ruta rápida con GPT-3.5 (~600ms, $0.002)
  masterModel = "gpt-3.5-turbo";
} else {
  // Ruta normal con GPT-4 (~2500ms, $0.08)
  masterModel = "gpt-4";
}
```

**Ahorro estimado**:
- 20-30% de mensajes son casos simples
- Ahorro de $0.078/msg en esos casos
- Reducción de latencia de 1.9s

**Impacto mensual** (5,000 msgs):
- Ahorro: $117-234/mes (30% reducción de costos LLM)
- Latencia promedio: 7.7s → 6.5s

---

### 3. Paralelización de Fetch en ETAPA 2
**Problema**: Baserow + Chatwoot history se ejecutan secuencialmente (~500ms)
**Solución**: Fetch paralelo de ambas fuentes

**Implementación actual**:
```
Node 11 (Baserow) → 300ms
  ↓
Node 15 (Chatwoot) → 200ms
Total: 500ms
```

**Implementación optimizada**:
```
Node 11 (Baserow) ─┐
                    ├→ Node 17 (Merge) → 300ms
Node 15 (Chatwoot)─┘
```

**Ahorro**: 200ms (reducción de 10%)

---

### 4. Reducir Contexto de Historial
**Problema**: Fetch de 8-10 mensajes previos de Chatwoot (~200ms + tokens extra)
**Solución**: Reducir a 5 mensajes más recientes para conversaciones nuevas

**Implementación**:
```javascript
const messageCount = (lead.counters.messages_since_last_offer < 5) ? 5 : 8;
```

**Ahorro**:
- Latencia: ~50ms
- Tokens: -500-800 input tokens
- Costo: -$0.005-0.008/call

---

### 5. Webhook Response Inmediata
**Problema**: Chatwoot espera 7-8s para recibir respuesta del webhook
**Solución**: Responder 200 OK inmediatamente, procesar en background

**Implementación**:
```javascript
// Node 1: Webhook response
return {
  status: 200,
  body: { received: true }
};

// Workflow continúa en background
// Node 56 hace POST final a Chatwoot cuando termina
```

**Beneficio**: Chatwoot no sufre timeouts, mejor UX para agentes humanos

---

### 6. Batch Updates a Odoo
**Problema**: 2 llamadas separadas a Odoo (write + message create) = 300ms
**Solución**: Usar `execute_kw` con múltiples operaciones

**Implementación**:
```python
# Single call con 2 operaciones
odoo.execute_kw(db, uid, password, 'crm.lead', 'write', [[33], {
  'email_from': 'juan@acme.com',
  'message_ids': [(0, 0, {
    'body': '<p>...</p>',
    'message_type': 'comment'
  })]
}])
```

**Ahorro**: ~100ms (1 round-trip menos)

---

### 7. Prompt Compression
**Problema**: System prompt del Master Agent es de ~800 líneas (~5000 tokens)
**Solución**: Reducir few-shot examples de 10 a 5 más representativos

**Ahorro**:
- Tokens input: -2000 tokens
- Costo: -$0.02/call
- Latencia: -300ms (menos procesamiento)

**Riesgo**: Posible degradación de calidad en casos edge

---

## Referencias

### Documentación de ETAPAs
- [ETAPA-1-RESUMEN.md](ETAPA-1-RESUMEN.md) - Ingesta (Nodos 1-10)
- [ETAPA-2-RESUMEN.md](ETAPA-2-RESUMEN.md) - Contexto & RAG (Nodos 11-27)
- [ETAPA-3-RESUMEN.md](ETAPA-3-RESUMEN.md) - Zona de FLAGS (Nodos 28-41)
- [ETAPA-4-RESUMEN.md](ETAPA-4-RESUMEN.md) - LLM Analyst (Nodos 42-48)
- [ETAPA-5-RESUMEN.md](ETAPA-5-RESUMEN.md) - Master AI Agent (Nodos 49-56)

### Prompts Standalone
- [prompts/llm-analyst-system-prompt.md](../prompts/llm-analyst-system-prompt.md) - GPT-3.5 Analyst (~200 líneas)
- [prompts/master-agent-system-prompt.md](../prompts/master-agent-system-prompt.md) - GPT-4 Master Agent (~800 líneas)

### Documentación de Nodos Individuales
- Ver carpeta `/docs/` para documentación detallada de cada uno de los 56 nodos

### Diagramas y Arquitectura
- Ver sección "Arquitectura General" en este documento
- Ver diagramas ASCII en cada ETAPA-*-RESUMEN.md

---

## Notas Finales

Este workflow representa un sistema complejo de **agente de ventas conversacional** con las siguientes características distintivas:

1. **Arquitectura de 5 capas** con separación de responsabilidades clara
2. **Dual-LLM approach**: GPT-3.5 para análisis, GPT-4 para generación
3. **RAG enterprise-grade** con Qdrant y embeddings
4. **Guardrails multi-nivel**: Cooldowns, service lock, natural flow, proposal triggers
5. **Parsing robusto** con 3 estrategias de fallback (>99.5% éxito)
6. **Persistencia dual** en Baserow + Odoo con ejecución paralela
7. **Costo-eficiencia**: ~$0.08-0.10 por mensaje procesado
8. **Latencia controlada**: ~7.7-8.8s con 7 optimizaciones identificadas para reducir a ~5-6s

**Próximos pasos recomendados**:
1. Implementar optimizaciones 1-7 (reducción de 30% en costos, 25% en latencia)
2. A/B testing de prompts con versiones más cortas
3. Monitoreo de métricas: tasa de conversión, tiempo de respuesta, satisfacción
4. Desarrollo de nuevas tools MCP para el Master Agent
5. Fine-tuning de modelo más económico para casos simples

---

**Última actualización**: 2025-10-31
**Mantenido por**: Leonobitech Engineering Team
