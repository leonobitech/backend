# Flujo de Automatización - Reserva de Turno Estilos Leraysi

## Visión General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        JOURNEY DEL CLIENTE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   📱 WhatsApp        💬 Chatbot         📅 Turno          💳 Pago          │
│                                                                             │
│   "Hola quiero    →  Presupuesto   →  "Reservo      →  Link MP   →  ✅     │
│    un alisado"       + pide foto       el viernes"      $18,000     Turno  │
│                          ↓                                          Confirmado
│                      📸 Envía foto                                          │
│                          ↓                                                  │
│                    💰 Presupuesto                                           │
│                       exacto                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo Técnico Detallado

### ETAPA 1: Exploración → Presupuesto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 1: CLIENTE PREGUNTA POR SERVICIO                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Cliente WhatsApp]                                                         │
│        │                                                                    │
│        ▼                                                                    │
│  [Chatwoot Webhook] ──────────────────────────────────────┐                │
│        │                                                   │                │
│        ▼                                                   │                │
│  ┌─────────────────┐    ┌─────────────────┐               │                │
│  │  n8n: Leraysi   │    │    Baserow      │               │                │
│  │  Sales Agent    │◄───│  LeadsLeraysi   │               │                │
│  │  (Main)         │    │  (profile)      │               │                │
│  └────────┬────────┘    └─────────────────┘               │                │
│           │                                                │                │
│           ▼                                                │                │
│  ┌─────────────────┐                                      │                │
│  │   Input Main    │  Construye:                          │                │
│  │                 │  - userPrompt con historial          │                │
│  │                 │  - state completo                    │                │
│  └────────┬────────┘                                      │                │
│           │                                                │                │
│           ▼                                                │                │
│  ┌─────────────────┐                                      │                │
│  │ Master AI Agent │  LLM decide:                         │                │
│  │     (LLM)       │  - Responder con precios base        │                │
│  │                 │  - Pedir foto para presupuesto exacto│                │
│  └────────┬────────┘                                      │                │
│           │                                                │                │
│           ▼                                                │                │
│  ┌─────────────────┐                                      │                │
│  │  Output Main    │  Genera:                             │                │
│  │                 │  - content_whatsapp                  │                │
│  │                 │  - baserow_update (state_patch)      │                │
│  └────────┬────────┘                                      │                │
│           │                                                │                │
│           ├──────────────────────────────────────────────►│                │
│           │                              [Update Baserow] │                │
│           ▼                                                │                │
│  [Chatwoot: Enviar mensaje] ◄─────────────────────────────┘                │
│        │                                                                    │
│        ▼                                                                    │
│  [Cliente recibe mensaje con precios y pedido de foto]                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

State después de Etapa 1:
{
  "stage": "consulta",
  "servicio_interes": "Alisado brasileño",
  "waiting_image": true,
  "prices_asked": 1
}
```

---

### ETAPA 2: Recepción de Foto → Presupuesto Exacto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 2: CLIENTE ENVÍA FOTO                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Cliente envía 📸]                                                         │
│        │                                                                    │
│        ▼                                                                    │
│  [Chatwoot Webhook] ─── attachment detected ───┐                           │
│        │                                        │                           │
│        ▼                                        ▼                           │
│  ┌─────────────────┐                   ┌─────────────────┐                 │
│  │ LoadProfileAnd  │                   │  Vision Agent   │                 │
│  │ StateImage      │                   │  (Analiza foto) │                 │
│  └────────┬────────┘                   └────────┬────────┘                 │
│           │                                      │                          │
│           │◄─────────────────────────────────────┘                          │
│           │  image_analysis: {                                              │
│           │    length: "largo",                                             │
│           │    complexity: "alta",                                          │
│           │    texture: "rizado"                                            │
│           │  }                                                              │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │   Input Main    │  userPrompt incluye:                                  │
│  │    (Image)      │  - Sección "Foto Recibida"                            │
│  │                 │  - ⚠️ DAR PRESUPUESTO según complejidad               │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ Master AI Agent │  LLM calcula:                                         │
│  │                 │  - Precio base + % por complejidad                    │
│  │                 │  - Ej: $45,000 + 33% = $60,000                        │
│  │                 │  - Pregunta si quiere turno                           │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │  Output Main    │                                                       │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  [Cliente recibe: "Para tu cabello largo y rizado: $60,000. ¿Reservo?"]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

State después de Etapa 2:
{
  "stage": "presupuesto",
  "presupuesto_dado": true,
  "foto_recibida": true,
  "waiting_image": false,
  "image_analysis": { "length": "largo", "complexity": "alta", ... }
}
```

---

### ETAPA 3: Cliente Quiere Turno → Pedir Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 3: CLIENTE DICE "SÍ QUIERO TURNO"                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Cliente: "Sí, quiero turno"]                                              │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────┐                                                       │
│  │ Master AI Agent │  LLM detecta:                                         │
│  │                 │  - Intención de agendar                               │
│  │                 │  - Faltan datos: nombre, email, fecha/hora            │
│  │                 │  - NO invoca tool todavía                             │
│  │                 │  - Pide los datos faltantes                           │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  [Cliente recibe: "¡Genial! Necesito tu nombre, email y qué día preferís"]│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

State después de Etapa 3:
{
  "stage": "turno_pendiente",
  "deep_interest": 1
}
```

---

### ETAPA 4: Cliente Da Datos → Crear Turno

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 4: CLIENTE PROPORCIONA DATOS COMPLETOS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Cliente: "Soy Andrea, andrea@gmail.com, el viernes a las 3pm"]           │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────┐                                                       │
│  │ Master AI Agent │  LLM:                                                 │
│  │                 │  1. Extrae datos del mensaje                          │
│  │                 │  2. Valida que tiene todo                             │
│  │                 │  3. INVOCA TOOL: agendar_turno_leraysi               │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           │  Tool Call:                                                     │
│           │  {                                                              │
│           │    "nombre_clienta": "Andrea",                                  │
│           │    "email": "andrea@gmail.com",                                 │
│           │    "telefono": "+5491133851987",  // del state                 │
│           │    "servicio": "Alisado brasileño",                            │
│           │    "fecha_deseada": "2026-01-24",                              │
│           │    "hora_deseada": "15:00",                                    │
│           │    "precio": 60000,                                            │
│           │    "complejidad": "alta",                                      │
│           │    "lead_id": 210,                                             │
│           │    "row_id": 73,                                               │
│           │    "conversation_id": 390                                      │
│           │  }                                                              │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │            SUB-WORKFLOW: Leraysi - Agente Calendario                │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌─────────────┐                                                    │   │
│  │  │ ParseInput  │ Valida + mapea servicio + calcula duración         │   │
│  │  └──────┬──────┘                                                    │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐    ┌─────────────────┐                            │   │
│  │  │GetTurnos    │───►│ Baserow:        │                            │   │
│  │  │Semana       │◄───│ TurnosLeraysi   │                            │   │
│  │  └──────┬──────┘    └─────────────────┘                            │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐                                                    │   │
│  │  │ Analizar    │ Calcula disponibilidad por día                     │   │
│  │  │Disponibil.  │                                                    │   │
│  │  └──────┬──────┘                                                    │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐                                                    │   │
│  │  │BuildAgent   │ Construye prompt con disponibilidad                │   │
│  │  │Prompt       │                                                    │   │
│  │  └──────┬──────┘                                                    │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐                                                    │   │
│  │  │  Agente     │ LLM decide:                                        │   │
│  │  │ Calendario  │ - ¿Hay disponibilidad? → Crear turno              │   │
│  │  │   (LLM)     │ - ¿No hay? → Ofrecer alternativas                 │   │
│  │  └──────┬──────┘                                                    │   │
│  │         │                                                           │   │
│  │         │ Si hay disponibilidad:                                    │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │              TOOL: leraysi_crear_turno                      │   │   │
│  │  ├─────────────────────────────────────────────────────────────┤   │   │
│  │  │                                                             │   │   │
│  │  │  ┌─────────────┐                                            │   │   │
│  │  │  │TransformFor │ Convierte query → {tool, arguments}        │   │   │
│  │  │  │MCP          │                                            │   │   │
│  │  │  └──────┬──────┘                                            │   │   │
│  │  │         │                                                   │   │   │
│  │  │         ▼                                                   │   │   │
│  │  │  ┌─────────────┐    ┌─────────────────┐                    │   │   │
│  │  │  │HTTP Request │───►│   odoo-mcp      │                    │   │   │
│  │  │  │POST /call-  │    │   :8100         │                    │   │   │
│  │  │  │tool         │◄───│                 │                    │   │   │
│  │  │  └──────┬──────┘    └────────┬────────┘                    │   │   │
│  │  │         │                    │                              │   │   │
│  │  │         │                    ▼                              │   │   │
│  │  │         │           ┌─────────────────┐                    │   │   │
│  │  │         │           │  Odoo Calendar  │ Crea evento        │   │   │
│  │  │         │           └────────┬────────┘                    │   │   │
│  │  │         │                    │                              │   │   │
│  │  │         │                    ▼                              │   │   │
│  │  │         │           ┌─────────────────┐                    │   │   │
│  │  │         │           │  Mercado Pago   │ Genera link pago   │   │   │
│  │  │         │           │  (seña 30%)     │ $18,000            │   │   │
│  │  │         │           └────────┬────────┘                    │   │   │
│  │  │         │                    │                              │   │   │
│  │  │         ◄────────────────────┘                              │   │   │
│  │  │         │                                                   │   │   │
│  │  │         │  Response:                                        │   │   │
│  │  │         │  {                                                │   │   │
│  │  │         │    "turnoId": 15,                                 │   │   │
│  │  │         │    "link_pago": "https://mpago.la/xxx",           │   │   │
│  │  │         │    "sena": 18000                                  │   │   │
│  │  │         │  }                                                │   │   │
│  │  │         │                                                   │   │   │
│  │  └─────────┼───────────────────────────────────────────────────┘   │   │
│  │            │                                                       │   │
│  │            ▼                                                       │   │
│  │  ┌─────────────┐                                                   │   │
│  │  │ParseAgent   │                                                   │   │
│  │  │Response     │                                                   │   │
│  │  └──────┬──────┘                                                   │   │
│  │         │                                                          │   │
│  │         ▼                                                          │   │
│  │  ┌─────────────┐                                                   │   │
│  │  │   Switch    │ accion === "turno_creado"                        │   │
│  │  │  (Router)   │                                                   │   │
│  │  └──────┬──────┘                                                   │   │
│  │         │                                                          │   │
│  │         ▼                                                          │   │
│  │  ┌─────────────┐                                                   │   │
│  │  │BuildSuccess │ Construye respuesta para Master                   │   │
│  │  │Response     │                                                   │   │
│  │  └──────┬──────┘                                                   │   │
│  │         │                                                          │   │
│  └─────────┼──────────────────────────────────────────────────────────┘   │
│            │                                                              │
│            │  Tool Response:                                              │
│            │  {                                                           │
│            │    "success": true,                                          │
│            │    "turno_id": 15,                                           │
│            │    "fecha": "2026-01-24",                                    │
│            │    "hora": "15:00",                                          │
│            │    "link_pago": "https://mpago.la/xxx",                      │
│            │    "sena": 18000,                                            │
│            │    "mensaje": "Turno reservado para viernes 24 a las 15hs"  │
│            │  }                                                           │
│            │                                                              │
│            ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │ Master AI Agent │  Recibe resultado de la tool                        │
│  │                 │  Genera mensaje final para cliente                  │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                     │
│  │  Output Main    │  baserow_update:                                    │
│  │                 │  - stage: "pago_pendiente"                          │
│  │                 │  - turno_agendado: true                             │
│  │                 │  - turno_fecha: "2026-01-24 15:00"                  │
│  │                 │  - full_name: "Andrea"                              │
│  │                 │  - email: "andrea@gmail.com"                        │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  [Cliente recibe:]                                                       │
│  "¡Listo Andrea! Tu turno de alisado está reservado para el viernes 24  │
│   a las 15:00. Para confirmarlo, pagá la seña de $18,000 acá:           │
│   https://mpago.la/xxx"                                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

State después de Etapa 4:
{
  "stage": "pago_pendiente",
  "full_name": "Andrea",
  "email": "andrea@gmail.com",
  "turno_agendado": true,
  "turno_fecha": "2026-01-24 15:00",
  "turno_id": 15,
  "deep_interest": 2
}
```

---

### ETAPA 5: Cliente Paga → Confirmar Turno (Webhook)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 5: CLIENTE PAGA LA SEÑA                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Cliente paga $18,000 en Mercado Pago]                                    │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────┐                                                       │
│  │ Mercado Pago    │ Estado: "approved"                                    │
│  │ Webhook         │ external_reference: "turno_15_lead_210"               │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │        n8n: Leraysi - Webhook Pago Mercado Pago                     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌─────────────┐                                                    │   │
│  │  │Parse Webhook│ Extrae turno_id, lead_id, payment_id              │   │
│  │  └──────┬──────┘                                                    │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐    ┌─────────────────┐                            │   │
│  │  │Confirmar    │───►│   odoo-mcp      │                            │   │
│  │  │Turno MCP    │    │leraysi_confirmar│                            │   │
│  │  │             │◄───│_turno           │                            │   │
│  │  └──────┬──────┘    └─────────────────┘                            │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐    ┌─────────────────┐                            │   │
│  │  │Update       │───►│    Baserow      │                            │   │
│  │  │Baserow      │    │  LeadsLeraysi   │                            │   │
│  │  │             │    │stage:"turno_    │                            │   │
│  │  │             │    │ confirmado"     │                            │   │
│  │  │             │    │sena_pagada:true │                            │   │
│  │  └──────┬──────┘    └─────────────────┘                            │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐    ┌─────────────────┐                            │   │
│  │  │Enviar       │───►│    Chatwoot     │                            │   │
│  │  │Confirmación │    │   (WhatsApp)    │                            │   │
│  │  └──────┬──────┘    └─────────────────┘                            │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  ┌─────────────┐    ┌─────────────────┐                            │   │
│  │  │Enviar       │───►│     Odoo        │                            │   │
│  │  │Recibo Email │    │  (Send Email)   │                            │   │
│  │  └─────────────┘    └─────────────────┘                            │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Cliente recibe en WhatsApp:]                                             │
│  "¡Pago recibido! ✅ Tu turno para el viernes 24 a las 15:00 está         │
│   CONFIRMADO. Te esperamos en Estilos Leraysi. Te envié el recibo         │
│   a andrea@gmail.com"                                                      │
│                                                                             │
│  [Cliente recibe email con recibo PDF]                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

State FINAL:
{
  "stage": "turno_confirmado",
  "full_name": "Andrea",
  "email": "andrea@gmail.com",
  "turno_agendado": true,
  "turno_fecha": "2026-01-24 15:00",
  "turno_id": 15,
  "sena_pagada": true,
  "deep_interest": 2
}
```

---

## Resumen de Componentes

### Workflows n8n

| Workflow | Función | Trigger |
|----------|---------|---------|
| **Leraysi - Sales Agent (Main)** | Chatbot principal | Chatwoot webhook |
| **Leraysi - Agente Calendario** | Sub-agente para turnos | Execute Workflow (tool) |
| **Leraysi - Crear Turno** | Llama MCP crear turno | Execute Workflow (tool) |
| **Leraysi - Consultar Disponibilidad** | Llama MCP disponibilidad | Execute Workflow (tool) |
| **Leraysi - Consultar Turnos Día** | Llama MCP turnos día | Execute Workflow (tool) |
| **Leraysi - Confirmar Turno** | Llama MCP confirmar | Execute Workflow (tool) |
| **Leraysi - Cancelar Turno** | Llama MCP cancelar | Execute Workflow (tool) |
| **Leraysi - Webhook Pago MP** | Procesa pagos | Mercado Pago webhook |

### Integraciones

| Sistema | Función |
|---------|---------|
| **Chatwoot** | Recibe/envía mensajes WhatsApp |
| **Baserow** | Almacena leads y estado del funnel |
| **Odoo (via odoo-mcp)** | Calendario, turnos, emails, recibos |
| **Mercado Pago** | Generación de links y procesamiento de pagos |
| **OpenAI** | LLM para Master Agent y Agente Calendario |

### Tablas Baserow

| Tabla | Campos clave |
|-------|--------------|
| **LeadsLeraysi** | row_id, lead_id, stage, full_name, email, phone, turno_*, image_analysis |
| **TurnosLeraysi** | id, clienta, fecha, hora, servicio, precio, estado, sena_pagada |

---

## Stages del Funnel

```
explore → consulta → presupuesto → turno_pendiente → pago_pendiente → turno_confirmado
   │          │           │              │                │                 │
   │          │           │              │                │                 │
   ▼          ▼           ▼              ▼                ▼                 ▼
 Saludo    Pregunta    Presupuesto   Quiere         Link de            Pagó
 inicial   servicio    exacto dado   agendar        pago enviado       confirmado
```

---

## Datos que Fluyen

### Desde Chatwoot → Main Workflow
```json
{
  "message": "Soy Andrea, andrea@gmail.com, el viernes a las 3pm",
  "conversation_id": 390,
  "contact": {
    "phone": "+5491133851987"
  }
}
```

### Desde Main → Sub-Workflow Agente Calendario
```json
{
  "nombre_clienta": "Andrea",
  "telefono": "+5491133851987",
  "email": "andrea@gmail.com",
  "servicio": "Alisado brasileño",
  "fecha_deseada": "2026-01-24",
  "hora_deseada": "15:00",
  "precio": 60000,
  "complejidad": "alta",
  "lead_id": 210,
  "row_id": 73,
  "conversation_id": 390
}
```

### Desde Sub-Workflow → MCP (leraysi_crear_turno)
```json
{
  "tool": "leraysi_crear_turno",
  "arguments": {
    "clienta": "Andrea",
    "telefono": "+5491133851987",
    "email": "andrea@gmail.com",
    "servicio": "tratamiento",
    "fecha_hora": "2026-01-24 15:00",
    "precio": 60000,
    "duracion": 2,
    "servicio_detalle": "Alisado brasileño"
  }
}
```

### Desde MCP → Sub-Workflow (Response)
```json
{
  "success": true,
  "data": {
    "turnoId": 15,
    "link_pago": "https://mpago.la/2aB3cD4",
    "sena": 18000,
    "estado": "pendiente_pago"
  }
}
```

### Desde Sub-Workflow → Main (Tool Response)
```json
{
  "success": true,
  "action": "turno_creado",
  "turno_id": 15,
  "fecha": "2026-01-24",
  "hora": "15:00",
  "link_pago": "https://mpago.la/2aB3cD4",
  "sena": 18000,
  "mensaje_para_clienta": "¡Listo Andrea! Tu turno..."
}
```

### Baserow Update Final
```json
{
  "row_id": 73,
  "stage": "pago_pendiente",
  "full_name": "Andrea",
  "email": "andrea@gmail.com",
  "turno_agendado": true,
  "turno_fecha": "2026-01-24 15:00",
  "turno_id": 15
}
```

---

*Documento creado: 2026-01-19*
