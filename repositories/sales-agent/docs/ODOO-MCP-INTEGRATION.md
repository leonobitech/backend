# Odoo MCP Integration - Sales Agent

Integración del **Sales Agent (n8n WhatsApp)** con **Odoo CRM** a través del servidor **Odoo MCP**.

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Arquitectura](#arquitectura)
- [Tools Disponibles](#tools-disponibles)
- [Flujo de Integración](#flujo-de-integración)
- [Configuración](#configuración)
- [Uso desde Master Agent](#uso-desde-master-agent)
- [System Prompt Updates](#system-prompt-updates)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Descripción General

El Sales Agent en WhatsApp ahora puede realizar acciones avanzadas de CRM directamente en Odoo:

### Capacidades Nuevas

1. **Crear Leads Automáticamente** - Cuando un lead está calificado (email + interés claro)
2. **Agendar Demos/Reuniones** - Con detección de conflictos en calendario
3. **Enviar Propuestas Formales** - Templates profesionales con pricing
4. **Mover Oportunidades** - A través del pipeline (Qualified → Proposition → Won)
5. **Marcar Como Ganado** - Cuando el lead confirma la compra

### Beneficios

- **Automatización End-to-End**: Desde WhatsApp hasta deal cerrado en Odoo
- **Sin Intervención Humana**: Para leads calificados y listos
- **Datos Sincronizados**: Baserow ↔ Odoo en tiempo real
- **Tracking Completo**: Todas las acciones registradas en Chatter de Odoo

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     WhatsApp Business                           │
│  Usuario: "Quiero agendar un demo del chatbot WhatsApp"        │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Webhook
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Chatwoot (Inbox)                             │
│  Captura mensaje → Trigger n8n webhook                         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│              n8n Sales Agent Workflow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. FlagsAnalyzer (Node #48)                                   │
│     └─> intent: "schedule_demo"                                │
│     └─> purpose: "benefits_cta" | "schedule_request"           │
│     └─> allow_odoo_action: true                                │
│                                                                 │
│  2. Master Agent (Node #50) con Odoo MCP Tools                 │
│     ├─> Decide: "Lead calificado, agendar demo"                │
│     ├─> llama: odoo_schedule_meeting({                         │
│     │     opportunityId: 42,                                   │
│     │     title: "Demo: WhatsApp Chatbot - Juan Pérez",        │
│     │     startDatetime: "2025-11-05 10:00:00",                │
│     │     durationHours: 1                                     │
│     │   })                                                      │
│     └─> Resultado: eventId: 123 o conflict                     │
│                                                                 │
│  3. Output Main (Node #51)                                     │
│     └─> Renderiza respuesta: "¡Listo! Demo agendado para      │
│         el 5 de Nov a las 10:00. Recibirás email confirmación."│
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Odoo MCP Server                               │
│                   (localhost:8100)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tool: odoo_schedule_meeting                                   │
│    ├─> 1. Busca opportunity #42 en Odoo                        │
│    ├─> 2. Verifica disponibilidad calendario                   │
│    ├─> 3. Crea evento en calendar.event                        │
│    ├─> 4. Vincula a opportunity                                │
│    ├─> 5. Mueve stage: Qualified → Proposition                 │
│    ├─> 6. Envía email confirmación al lead                     │
│    └─> 7. Notifica a vendedor asignado                         │
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │ XML-RPC
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Odoo CRM                                   │
│               (https://odoo.leonobitech.com)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Opportunity #42: "Juan Pérez - WhatsApp Chatbot"              │
│    Stage: Qualified → Proposition ✅                            │
│    Calendar Event: Demo 5-Nov 10:00 ✅                          │
│    Chatter: "Meeting scheduled via Sales Agent" ✅              │
│    Email Queue: Confirmación enviada ✅                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tools Disponibles

### 1. `odoo_create_lead`

**Descripción**: Crea un nuevo lead en Odoo CRM desde conversación WhatsApp.

**Cuándo Usar**:
- Lead calificado: stage >= "qualify"
- Email capturado
- Business context claro (business_name o industria)
- Intent: "request_proposal" o "schedule_demo"

**Input**:
```typescript
{
  name: string;              // "Restaurante El Buen Sabor - WhatsApp Chatbot"
  partnerName?: string;      // "Restaurante El Buen Sabor"
  contactName?: string;      // "Juan Pérez"
  email?: string;            // "juan@elbuen sabor.com"
  phone?: string;            // "+5491133851987"
  description?: string;      // Contexto desde Sales Agent
  expectedRevenue?: number;  // Basado en servicios de interés
  type?: 'lead' | 'opportunity'; // 'opportunity' si stage=proposal_ready
}
```

**Output**:
```typescript
{
  leadId: number;      // ID del lead creado en Odoo
  partnerId?: number;  // ID del partner (si se creó o vinculó)
  message: string;     // "Lead created successfully"
}
```

**Side Effects**:
- Crea `crm.lead` en Odoo
- Auto-crea `res.partner` si no existe (busca por email)
- Vincula lead a partner
- Stage inicial: "New"

---

### 2. `odoo_schedule_meeting`

**Descripción**: Agenda reunión/demo con lead calificado.

**Cuándo Usar**:
- Lead solicita demo: "quiero ver cómo funciona"
- Lead acepta propuesta de demo del agente
- Ya existe `opportunity` en Odoo (creada previamente con `odoo_create_lead`)

**Input**:
```typescript
{
  opportunityId: number;         // ID de la oportunidad en Odoo
  title: string;                 // "Demo: WhatsApp Chatbot - Juan Pérez"
  startDatetime: string;         // "2025-11-05 10:00:00"
  durationHours?: number;        // Default: 1
  description?: string;          // Agenda del demo
  location?: string;             // "Google Meet"
  forceSchedule?: boolean;       // Default: false (detecta conflictos)
}
```

**Output**:
```typescript
{
  eventId?: number;  // ID del evento creado (si no hay conflicto)
  message: string;   // "Meeting scheduled successfully"
  conflict?: {       // Solo si hay conflicto y forceSchedule=false
    conflicts: string[];        // ["2025-11-05 10:00-11:00: Reunión con cliente X"]
    availableSlots: string[];   // ["2025-11-05 14:00", "2025-11-06 10:00"]
  };
}
```

**Side Effects**:
- Crea `calendar.event` vinculado a opportunity
- **Auto-avanza stage**: "Qualified" → "Proposition"
- Envía email confirmación al lead (desde Odoo)
- Notifica a vendedor asignado
- Registra en Chatter: "Meeting scheduled via Sales Agent"

**Manejo de Conflictos**:
```javascript
// En Master Agent (Node #50):
const result = await odoo_schedule_meeting({ ... });

if (result.conflict) {
  // Informar al usuario sobre conflictos
  const slots = result.conflict.availableSlots.join(', ');
  return {
    text: `Tengo conflicto en ese horario. Estoy disponible: ${slots}. ¿Cuál prefieres?`,
    rag_used: false
  };
}

// Si no hay conflicto, confirmar
return {
  text: `¡Perfecto! Demo agendado para ${fecha} a las ${hora}. Recibirás un email de confirmación con el link de Google Meet.`,
  rag_used: false
};
```

---

### 3. `odoo_send_email`

**Descripción**: Envía propuesta comercial profesional por email.

**Cuándo Usar**:
- Lead solicita propuesta formal
- Lead pregunta "cuánto cuesta todo esto"
- stage >= "qualify" y email capturado
- Servicios de interés identificados (interests >= 1)

**Templates Disponibles**:

#### a) `proposal` - Propuesta Comercial
```typescript
{
  opportunityId: 42,
  subject: "Propuesta Comercial - Restaurante El Buen Sabor",
  templateType: "proposal",
  templateData: {
    customerName: "Juan Pérez",
    companyName: "Restaurante El Buen Sabor",
    price: "$158/mes",
    customContent: "<ul><li>WhatsApp Chatbot - $79/mes</li><li>Smart Reservations - $79/mes</li></ul>"
  }
}
```

#### b) `demo` - Confirmación de Demo
```typescript
{
  opportunityId: 42,
  subject: "Confirmación Demo - WhatsApp Chatbot",
  templateType: "demo",
  templateData: {
    customerName: "Juan Pérez",
    productName: "WhatsApp Chatbot",
    demoDate: "5 de Noviembre, 2025",
    demoTime: "10:00 AM",
    meetingLink: "https://meet.google.com/xxx-yyyy-zzz"
  }
}
```

#### c) `followup` - Seguimiento Post-Demo
```typescript
{
  opportunityId: 42,
  subject: "Seguimiento - Demo WhatsApp Chatbot",
  templateType: "followup",
  templateData: {
    customerName: "Juan Pérez",
    customContent: "Gracias por el tiempo en el demo. Adjunto la propuesta comercial..."
  }
}
```

#### d) `custom` - Email Personalizado
```typescript
{
  opportunityId: 42,
  subject: "Información Adicional",
  body: "<p>Hola Juan,</p><p>...</p>",
  templateType: "custom"
}
```

**Output**:
```typescript
{
  mailId: number;           // ID del mail en Odoo queue
  message: string;          // "Email sent successfully"
  recipient: string;        // "juan@elbuensabor.com"
  queueProcessed: boolean;  // true si se envió inmediatamente
  templateUsed?: string;    // "proposal"
}
```

**Side Effects**:
- Email enqueue en `mail.mail` de Odoo
- **Auto-avanza stage** (si template=proposal o demo): "Qualified" → "Proposition"
- Registra en Chatter con email content
- Tracking de apertura (si Odoo configurado)

---

### 4. `odoo_update_deal_stage`

**Descripción**: Mueve opportunity a través del pipeline de Odoo.

**Cuándo Usar**:
- **Won**: Lead confirma compra ("sí, quiero contratar")
- **Lost**: Lead rechaza o no responde después de múltiples intentos
- **Manual**: Forzar cambio de stage si es necesario

**Input**:
```typescript
{
  opportunityId: number;
  stageName: 'New' | 'Qualified' | 'Proposition' | 'Won' | 'Lost';
}
```

**Output**:
```typescript
{
  success: boolean;
  opportunityId: number;
  newStage: string;
}
```

**Pipeline Típico**:
```
New → Qualified → Proposition → Won
                              ↘ Lost
```

**Ejemplo - Marcar Como Ganado**:
```javascript
// En Master Agent cuando lead confirma compra
if (intent === "confirm_purchase") {
  await odoo_update_deal_stage({
    opportunityId: 42,
    stageName: "Won"
  });

  return {
    text: "¡Excelente! Te contactaremos en las próximas horas para coordinar la implementación. Gracias por confiar en Leonobitech 🎉",
    rag_used: false
  };
}
```

---

### 5. `odoo_get_opportunities`

**Descripción**: Consulta oportunidades del pipeline.

**Cuándo Usar**:
- Verificar si lead ya existe antes de crear duplicado
- Obtener ID de opportunity existente
- Reportar estado del pipeline (solo para admin/testing)

**Input**:
```typescript
{
  limit?: number;      // Default: 20, max: 100
  stage?: string;      // Filtrar por etapa
  minAmount?: number;  // Monto mínimo esperado
}
```

**Output**:
```typescript
{
  total: number;
  totalRevenue: number;
  opportunities: [
    {
      id: number;
      name: string;
      partner: string;
      expectedRevenue: number;
      probability: number;
      stage: string;
      assignedTo: string;
      deadline?: string;
    }
  ]
}
```

---

## Flujo de Integración

### Escenario 1: Lead Solicita Demo

```
User (WhatsApp):
"Me interesa el chatbot de WhatsApp, ¿podemos agendar un demo?"

↓

FlagsAnalyzer (Node #48):
{
  intent: "schedule_demo",
  purpose: "schedule_request",
  allow_odoo_action: true,
  odoo_action_type: "schedule_meeting"
}

↓

Master Agent (Node #50):
1. Verifica: email capturado ✅, stage >= qualify ✅
2. Busca opportunity existente por email
   - Si no existe: llama odoo_create_lead primero
3. Propone fechas disponibles al usuario
4. Usuario confirma: "sí, el lunes 5 a las 10am"
5. Llama odoo_schedule_meeting({
     opportunityId: 42,
     title: "Demo: WhatsApp Chatbot - Juan Pérez",
     startDatetime: "2025-11-05 10:00:00"
   })
6. Responde: "¡Listo! Demo agendado..."

↓

Odoo MCP Server:
1. Crea calendar.event
2. Mueve stage: Qualified → Proposition
3. Envía email confirmación
4. Retorna: { eventId: 123, message: "..." }

↓

Output Main (Node #51):
Renderiza mensaje final para WhatsApp
```

### Escenario 2: Lead Solicita Propuesta

```
User (WhatsApp):
"¿Cuánto costaría todo esto? Envíame una propuesta formal"

↓

FlagsAnalyzer (Node #48):
{
  intent: "request_proposal",
  purpose: "price_cta",
  allow_odoo_action: true,
  odoo_action_type: "send_proposal"
}

↓

Master Agent (Node #50):
1. Verifica: email capturado ✅, interests >= 1 ✅
2. Consulta RAG para obtener servicios + precios
3. Calcula total: $158/mes (WhatsApp Chatbot + Smart Reservations)
4. Llama odoo_send_email({
     opportunityId: 42,
     subject: "Propuesta Comercial - Restaurante El Buen Sabor",
     templateType: "proposal",
     templateData: {
       customerName: "Juan Pérez",
       companyName: "Restaurante El Buen Sabor",
       price: "$158/mes",
       customContent: "<ul><li>WhatsApp Chatbot - $79/mes</li>...</ul>"
     }
   })
5. Responde: "¡Perfecto! Te envié la propuesta a tu email..."

↓

Odoo MCP Server:
1. Renderiza template HTML profesional
2. Crea mail.mail con template
3. Mueve stage: Qualified → Proposition
4. Envía email vía Odoo SMTP
5. Retorna: { mailId: 456, recipient: "juan@...", ... }
```

### Escenario 3: Lead Confirma Compra

```
User (WhatsApp):
"Perfecto, quiero contratar el chatbot"

↓

FlagsAnalyzer (Node #48):
{
  intent: "confirm_purchase",
  purpose: "close_deal",
  allow_odoo_action: true,
  odoo_action_type: "mark_won"
}

↓

Master Agent (Node #50):
1. Llama odoo_update_deal_stage({
     opportunityId: 42,
     stageName: "Won"
   })
2. Actualiza Baserow: proposal_offer_done = true
3. Responde: "¡Excelente! Te contactaremos en las próximas horas..."

↓

Odoo MCP Server:
1. Actualiza stage: Proposition → Won
2. Calcula revenue ganado
3. Registra en Chatter: "Deal closed via Sales Agent"
4. Trigger automation en Odoo (opcional):
   - Crear proyecto de implementación
   - Asignar PM
   - Enviar welcome email con accesos
```

---

## Configuración

### 1. Variables de Entorno

Agregar a `.env` del Sales Agent (o n8n global):

```env
# Odoo MCP Server
ODOO_MCP_URL=http://localhost:8100
ODOO_MCP_API_KEY=your-api-key-if-required

# Odoo Credentials (pasadas al MCP server)
ODOO_URL=https://odoo.leonobitech.com
ODOO_DB=leonobitech-prod
ODOO_USERNAME=felix@leonobitech.com
ODOO_API_KEY=your-odoo-api-key
```

### 2. Iniciar Odoo MCP Server

```bash
cd /Users/felix/leonobitech/backend/repositories/odoo-mcp

# Development
npm run dev

# Production
npm run build
npm run start
```

Verificar que está corriendo:
```bash
curl http://localhost:8100/health
# Expected: { "status": "ok", "service": "odoo-mcp" }
```

### 3. Configurar n8n Code Node

Importar el servicio en nodos de n8n que lo necesiten:

```javascript
// En Node #50 (Master Agent) o cualquier Code node
const { getOdooMCPService } = require('@/services/odoo-mcp.service');

const odooMCP = getOdooMCPService();

// Usar tools
const result = await odooMCP.odoo_create_lead({
  name: "Lead desde WhatsApp",
  email: "juan@example.com"
});
```

---

## Uso desde Master Agent

### System Prompt Update (Node #50)

Agregar sección al System Prompt actual:

```markdown
## 🔧 ODOO CRM TOOLS

Tienes acceso a herramientas de Odoo CRM para gestionar leads calificados:

### Tools Disponibles

1. **odoo_create_lead(params)** - Crea lead en Odoo CRM
   - Usar cuando: email capturado + stage >= qualify + business_context claro
   - Params: { name, partnerName, contactName, email, phone, description }
   - Retorna: { leadId, partnerId, message }

2. **odoo_schedule_meeting(params)** - Agenda demo/reunión
   - Usar cuando: lead solicita demo o acepta propuesta de demo
   - Params: { opportunityId, title, startDatetime, durationHours }
   - Retorna: { eventId, message } o { conflict: { conflicts, availableSlots } }
   - IMPORTANTE: Auto-mueve stage Qualified → Proposition

3. **odoo_send_email(params)** - Envía propuesta profesional
   - Usar cuando: lead solicita propuesta formal o pricing
   - Templates: 'proposal', 'demo', 'followup', 'custom'
   - Params: { opportunityId, subject, templateType, templateData }
   - Retorna: { mailId, recipient, message }
   - IMPORTANTE: Auto-mueve stage Qualified → Proposition (si template=proposal/demo)

4. **odoo_update_deal_stage(params)** - Mueve opportunity en pipeline
   - Usar cuando: lead confirma compra (Won) o rechaza (Lost)
   - Params: { opportunityId, stageName: 'Won' | 'Lost' | ... }
   - Retorna: { success, newStage }

5. **odoo_get_opportunities(params)** - Consulta pipeline
   - Usar para: verificar si lead ya existe, obtener opportunityId
   - Params: { limit?, stage?, minAmount? }
   - Retorna: { total, opportunities: [...] }

### Policy: Cuándo Usar Odoo Tools

#### Crear Lead (odoo_create_lead)
- ✅ Email capturado
- ✅ stage >= "qualify"
- ✅ Business context claro (business_name o industria)
- ✅ Intent: "request_proposal" o "schedule_demo"
- ❌ NO crear si ya existe (verificar primero con odoo_get_opportunities)

#### Agendar Demo (odoo_schedule_meeting)
- ✅ Lead solicita demo explícitamente
- ✅ Opportunity ya existe en Odoo (crear primero si no)
- ✅ Fecha/hora propuesta o sugerida
- ⚠️ Manejar conflictos: ofrecer slots alternativos

#### Enviar Propuesta (odoo_send_email)
- ✅ Email capturado
- ✅ stage >= "qualify"
- ✅ Interests >= 1 (servicios de interés identificados)
- ✅ Lead solicita propuesta o pricing
- Template 'proposal': incluir servicios + precios en templateData.customContent
- Template 'demo': después de agendar demo con odoo_schedule_meeting

#### Marcar Ganado (odoo_update_deal_stage → Won)
- ✅ Lead confirma compra explícitamente
- ✅ Intent: "confirm_purchase"
- Respuesta: agradecer y confirmar próximos pasos

### Ejemplo de Uso

```javascript
// Escenario: Lead solicita demo
if (intent === "schedule_demo" && email && stage >= "qualify") {
  // 1. Verificar si ya existe opportunity
  const opportunities = await odoo_get_opportunities({
    limit: 1,
    // Filtrar por email (si Odoo expone ese campo)
  });

  let opportunityId;
  if (opportunities.total === 0) {
    // No existe, crear lead primero
    const leadResult = await odoo_create_lead({
      name: `${business_name || full_name} - ${interests.join(', ')}`,
      partnerName: business_name,
      contactName: full_name,
      email: email,
      phone: phone_number,
      description: `Lead desde WhatsApp Sales Agent. Stage: ${stage}`,
      type: "opportunity" // Ya es calificado
    });
    opportunityId = leadResult.leadId;
  } else {
    opportunityId = opportunities.opportunities[0].id;
  }

  // 2. Proponer fechas al usuario
  return {
    text: "¡Perfecto! ¿Qué día te viene bien? Tengo disponibilidad lunes, miércoles y viernes de 10am a 4pm.",
    rag_used: false
  };
}

// Escenario: Usuario confirma fecha
if (intent === "confirm_demo_time" && scheduled_datetime) {
  const result = await odoo_schedule_meeting({
    opportunityId: opportunityId, // Obtenido previamente
    title: `Demo: ${service_name} - ${full_name}`,
    startDatetime: scheduled_datetime, // "2025-11-05 10:00:00"
    durationHours: 1,
    description: `Demo personalizado de ${service_name}`
  });

  if (result.conflict) {
    const slots = result.conflict.availableSlots.join(', ');
    return {
      text: `Tengo conflicto en ese horario. Estoy disponible: ${slots}. ¿Cuál prefieres?`,
      rag_used: false
    };
  }

  return {
    text: `¡Listo! Demo agendado para ${fecha} a las ${hora}. Recibirás un email de confirmación con el link de Google Meet.`,
    rag_used: false
  };
}
```

### Guardrails

- **NO crear leads duplicados**: Verificar existencia con `odoo_get_opportunities` antes de `odoo_create_lead`
- **NO agendar sin confirmar fecha**: Primero proponer opciones, esperar confirmación
- **NO enviar propuesta sin pricing**: Consultar RAG primero, calcular total
- **NO marcar Won sin confirmación explícita**: Solo cuando lead dice "sí, quiero contratar"
```

### Code Implementation (Master Agent Node #50)

Agregar al inicio del código del nodo:

```javascript
// Importar servicio Odoo MCP
const { getOdooMCPService } = require('@/services/odoo-mcp.service');
const odooMCP = getOdooMCPService();

// Helpers disponibles como tools para el LLM
const odoo_create_lead = async (params) => {
  return await odooMCP.odoo_create_lead(params);
};

const odoo_schedule_meeting = async (params) => {
  return await odooMCP.odoo_schedule_meeting(params);
};

const odoo_send_email = async (params) => {
  return await odooMCP.odoo_send_email(params);
};

const odoo_update_deal_stage = async (params) => {
  return await odooMCP.odoo_update_deal_stage(params);
};

const odoo_get_opportunities = async (params = {}) => {
  return await odooMCP.odoo_get_opportunities(params);
};

// Registrar tools para el LLM (similar a qdrant_query)
const odoo_tools = [
  odoo_create_lead,
  odoo_schedule_meeting,
  odoo_send_email,
  odoo_update_deal_stage,
  odoo_get_opportunities
];
```

---

## Testing

### Test 1: Crear Lead

```bash
# Desde n8n Code node o terminal
curl -X POST http://localhost:8100/tools/odoo_create_lead \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Lead - WhatsApp Chatbot",
    "partnerName": "Restaurante Test",
    "contactName": "Juan Test",
    "email": "juan.test@test.com",
    "phone": "+5491133851987",
    "description": "Lead de prueba desde Sales Agent",
    "type": "opportunity"
  }'

# Expected Response:
# {
#   "leadId": 42,
#   "partnerId": 123,
#   "message": "Lead created successfully"
# }
```

### Test 2: Agendar Demo

```bash
curl -X POST http://localhost:8100/tools/odoo_schedule_meeting \
  -H "Content-Type: application/json" \
  -d '{
    "opportunityId": 42,
    "title": "Demo: WhatsApp Chatbot - Juan Test",
    "startDatetime": "2025-11-05 10:00:00",
    "durationHours": 1,
    "description": "Demo personalizado",
    "location": "Google Meet"
  }'

# Expected Response (sin conflicto):
# {
#   "eventId": 789,
#   "message": "Meeting scheduled successfully"
# }

# Expected Response (con conflicto):
# {
#   "message": "Conflictos detectados",
#   "conflict": {
#     "conflicts": ["2025-11-05 10:00-11:00: Reunión con cliente X"],
#     "availableSlots": ["2025-11-05 14:00", "2025-11-06 10:00"]
#   }
# }
```

### Test 3: Enviar Propuesta

```bash
curl -X POST http://localhost:8100/tools/odoo_send_email \
  -H "Content-Type: application/json" \
  -d '{
    "opportunityId": 42,
    "subject": "Propuesta Comercial - Restaurante Test",
    "templateType": "proposal",
    "templateData": {
      "customerName": "Juan Test",
      "companyName": "Restaurante Test",
      "price": "$158/mes",
      "customContent": "<ul><li>WhatsApp Chatbot - $79/mes</li><li>Smart Reservations - $79/mes</li></ul>"
    }
  }'

# Expected Response:
# {
#   "mailId": 456,
#   "message": "Email sent successfully to opportunity #42...",
#   "recipient": "juan.test@test.com",
#   "queueProcessed": true,
#   "templateUsed": "proposal"
# }
```

### Test 4: Marcar Como Ganado

```bash
curl -X POST http://localhost:8100/tools/odoo_update_deal_stage \
  -H "Content-Type: application/json" \
  -d '{
    "opportunityId": 42,
    "stageName": "Won"
  }'

# Expected Response:
# {
#   "success": true,
#   "opportunityId": 42,
#   "newStage": "Won"
# }
```

### Test End-to-End (WhatsApp)

```
Mensaje 1 (Usuario):
"Hola, me interesa el chatbot de WhatsApp para mi restaurante"

→ Agente responde con info general + pregunta nombre
→ NO llama Odoo (falta email, no calificado)

Mensaje 2 (Usuario):
"Soy Juan Pérez, mi email es juan@test.com"

→ Agente captura datos
→ NO llama Odoo (aún no solicita demo/propuesta)

Mensaje 3 (Usuario):
"¿Podemos agendar un demo?"

→ Agente detecta intent: "schedule_demo"
→ Verifica: email ✅, stage=qualify ✅
→ Llama odoo_create_lead (crea opportunity)
→ Llama odoo_schedule_meeting
→ Responde: "Demo agendado para..."

Verificar en Odoo:
- Lead creado ✅
- Stage: Qualified → Proposition ✅
- Calendar event creado ✅
- Email confirmación enviado ✅
```

---

## Troubleshooting

### Error: "Odoo MCP server not reachable"

**Causa**: MCP server no está corriendo o URL incorrecta.

**Solución**:
```bash
# Verificar si está corriendo
curl http://localhost:8100/health

# Si no responde, iniciar:
cd /Users/felix/leonobitech/backend/repositories/odoo-mcp
npm run dev

# Verificar logs:
tail -f logs/odoo-mcp.log
```

### Error: "Opportunity not found"

**Causa**: `opportunityId` incorrecto o lead no existe en Odoo.

**Solución**:
```javascript
// Verificar existencia antes de usar
const opps = await odoo_get_opportunities({ limit: 50 });
console.log('Opportunities:', opps.opportunities.map(o => ({ id: o.id, name: o.name })));

// Usar ID correcto
const opportunityId = opps.opportunities.find(o => o.name.includes('Juan'))?.id;
```

### Error: "Calendar conflict detected"

**Causa**: Slot solicitado ya está ocupado.

**Solución**: Ofrecer slots alternativos al usuario.

```javascript
if (result.conflict) {
  const slots = result.conflict.availableSlots.slice(0, 3).join(', ');
  return {
    text: `Tengo conflicto en ese horario. ¿Te viene bien alguno de estos?: ${slots}`,
    rag_used: false
  };
}
```

### Error: "Email template not found"

**Causa**: `templateType` inválido o typo.

**Solución**: Usar solo templates válidos: `proposal`, `demo`, `followup`, `welcome`, `custom`.

### Error: "Stage transition not allowed"

**Causa**: Odoo puede tener restricciones de transición de stages.

**Solución**: Verificar pipeline configuration en Odoo. Asegurar que transiciones Qualified → Proposition → Won estén permitidas.

---

## Próximos Pasos

### Mejoras Futuras

1. **Auto-create Opportunity on Qualify**
   - Cuando stage pasa de "match" → "qualify", auto-crear en Odoo
   - Almacenar `odoo_opportunity_id` en Baserow leads table

2. **Webhook de Odoo → n8n**
   - Notificar a Sales Agent cuando:
     - Vendedor humano responde email del lead
     - Demo realizado (vendedor marca como completado)
     - Lead marca Won/Lost manualmente en Odoo
   - Sincronizar estado: Odoo → Baserow → Sales Agent

3. **Lead Scoring Automático**
   - Calcular score basado en: counters, interests, stage, email quality
   - Priorizar leads de alto score para contacto humano

4. **Propuestas Dinámicas**
   - Templates con pricing dinámico desde Services table (Baserow)
   - PDF attachment generado con Odoo reports

5. **Post-Sale Automation**
   - Cuando deal = Won:
     - Crear proyecto de implementación
     - Asignar PM
     - Enviar welcome pack con accesos
     - Programar kickoff meeting

---

## Referencias

- **Odoo MCP Server**: `/Users/felix/leonobitech/backend/repositories/odoo-mcp/`
- **Odoo Tools Docs**: `../repositories/odoo-mcp/docs/guides/odoo-tools.md`
- **Sales Agent Architecture**: `ARCHITECTURE-FLOW.md`
- **Master Agent System Prompt**: `../nodes-code-original/50-System-Prompt.md`
- **Testing Log**: `AGENT-TESTING-LOG.md`

---

**Última actualización**: 2025-11-01
**Autor**: Felix Figueroa + Claude Code
**Status**: ✅ Implementado, pendiente testing end-to-end
