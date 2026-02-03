# MCP Integration Guide - Sales Agent v2.0

Este documento describe cómo integrar las herramientas del **MCP Server Odoo** con el **Sales Agent v2.0** para permitir que el LLM ejecute acciones reales en Odoo (agendar demos, enviar propuestas, actualizar pipeline).

---

## 📋 Tabla de Contenidos

1. [Arquitectura General](#arquitectura-general)
2. [Prerequisitos](#prerequisitos)
3. [Paso 1: Obtener Tools del MCP Server](#paso-1-obtener-tools-del-mcp-server)
4. [Paso 2: Integrar Tools en INPUT-MAIN.js](#paso-2-integrar-tools-en-input-mainjs)
5. [Paso 3: Actualizar SYSTEM-PROMPT.md](#paso-3-actualizar-system-promptmd)
6. [Paso 4: Detectar Tool Calls en OUTPUT-MAIN-v2.js](#paso-4-detectar-tool-calls-en-output-main-v2js)
7. [Paso 5: Ejecutar Tool y Retornar Resultado](#paso-5-ejecutar-tool-y-retornar-resultado)
8. [Flujo Completo End-to-End](#flujo-completo-end-to-end)
9. [Testing y Debugging](#testing-y-debugging)

---

## Arquitectura General

```
┌──────────────────────────────────────────────────────────────────┐
│                    Master Agent v2.0 Workflow                    │
└──────────────────────────────────────────────────────────────────┘

1. Get/Update Baserow Row
   ↓
2. ComposeProfile (transforma row → profile)
   ↓
3. LoadProfileAndState (construye profile + state)
   ↓
4. 🆕 GET MCP Tools (fetch del MCP Server)
   ↓
5. INPUT-MAIN (construye Smart Input + tools list)
   ↓
6. Master AI Agent Main (OpenAI model con function calling)
   ↓
7. OUTPUT-MAIN-v2 (detecta si hay tool_calls)
   ↓
   ├─ Si tool_calls → 🆕 Call MCP Tool + Loop Back
   └─ Si mensaje normal → Continue to Persist
```

**Clave**: El LLM recibe la lista de tools disponibles en el Smart Input y puede decidir llamarlas usando la función `tool_calls` de OpenAI.

---

## Prerequisitos

### 1. MCP Server Configurado

Verificar que el MCP Server Odoo está corriendo y accesible:

```bash
# Dentro del contenedor n8n o desde cualquier servicio en leonobitech-net
curl -H "X-Service-Token: $ODOO_MCP_SERVICE_TOKEN" \
  http://odoo_mcp:8100/internal/mcp/tools
```

Respuesta esperada:
```json
{
  "tools": [
    {
      "name": "odoo_schedule_meeting",
      "description": "Schedule a meeting in Odoo calendar...",
      "inputSchema": { ... }
    },
    ...
  ],
  "count": 10
}
```

### 2. Campo `lead_id` en Baserow

⚠️ **CRÍTICO**: El campo correcto en Baserow es `lead_id`, NO `odoo_opportunity_id`

Verificar en la tabla **Leads**:
- **Nombre**: `lead_id` (este es el ID de la oportunidad en Odoo)
- **Tipo**: Number
- **Nullable**: Sí
- **Default**: null

**Para Felix Figueroa**: Actualizar `lead_id` de 33 a **34** (ID correcto en Odoo)

### 3. Variables de Entorno en n8n

Configurar en el workflow o globalmente:
- `ODOO_MCP_SERVICE_TOKEN`: Token de autenticación para MCP Server
- `ODOO_MCP_URL`: `http://odoo_mcp:8100` (URL interna)

---

## Paso 1: Obtener Tools del MCP Server

### Nodo: **HTTP Request - Get MCP Tools**

**Configuración**:
- **Tipo**: HTTP Request
- **Método**: GET
- **URL**: `http://odoo_mcp:8100/internal/mcp/tools`
- **Headers**:
  ```json
  {
    "X-Service-Token": "={{$env.ODOO_MCP_SERVICE_TOKEN}}"
  }
  ```

**Output Esperado**:
```json
{
  "tools": [
    {
      "name": "odoo_schedule_meeting",
      "description": "Schedule a meeting in Odoo calendar linked to an opportunity",
      "inputSchema": {
        "type": "object",
        "properties": {
          "opportunityId": { "type": "number", "description": "ID of the opportunity (required)" },
          "title": { "type": "string", "description": "Meeting title (required)" },
          "startDatetime": { "type": "string", "description": "ISO datetime (required)" },
          "durationHours": { "type": "number", "description": "Duration in hours (optional)" },
          "description": { "type": "string", "description": "Meeting description (optional)" },
          "location": { "type": "string", "description": "Location (optional)" },
          "forceSchedule": { "type": "boolean", "description": "Force schedule even if conflicts (optional)" }
        },
        "required": ["opportunityId", "title", "startDatetime"]
      }
    },
    {
      "name": "odoo_send_email",
      "description": "Send a professional email to an opportunity's contact",
      "inputSchema": {
        "type": "object",
        "properties": {
          "opportunityId": { "type": "number", "description": "ID of the opportunity (required)" },
          "subject": { "type": "string", "description": "Email subject (required)" },
          "body": { "type": "string", "description": "Email body (HTML or plain text, optional if using templateType)" },
          "emailTo": { "type": "string", "description": "Override recipient email (optional)" },
          "templateType": {
            "type": "string",
            "enum": ["proposal", "demo", "followup", "welcome", "custom"],
            "description": "Use a professional HTML template (optional)"
          },
          "templateData": {
            "type": "object",
            "description": "Data to populate the template (optional)",
            "properties": {
              "customerName": { "type": "string" },
              "productName": { "type": "string" },
              "price": { "type": "string" },
              "demoDate": { "type": "string" },
              "demoTime": { "type": "string" },
              "meetingLink": { "type": "string" },
              "customContent": { "type": "string" }
            }
          }
        },
        "required": ["opportunityId", "subject"]
      }
    },
    {
      "name": "odoo_update_deal_stage",
      "description": "Move an opportunity to a different stage in the pipeline",
      "inputSchema": {
        "type": "object",
        "properties": {
          "opportunityId": { "type": "number", "description": "ID of the opportunity (required)" },
          "stageName": {
            "type": "string",
            "description": "Name of the target stage (e.g., 'Won', 'Lost', 'Proposition', 'Qualified')"
          }
        },
        "required": ["opportunityId", "stageName"]
      }
    }
  ],
  "count": 3
}
```

**Posición en Workflow**: Justo después de **LoadProfileAndState**, antes de **INPUT-MAIN**.

---

## Paso 2: Integrar Tools en INPUT-MAIN.js

Modificar [INPUT-MAIN.js](./INPUT-MAIN.js) para incluir la lista de tools en el Smart Input.

### Cambios en INPUT-MAIN.js

#### 2.1. Recibir Tools List

```javascript
// ANTES (línea 12):
const inputData = $input.first().json;
const { history, lead_id, profile, state } = inputData;

// DESPUÉS:
const inputData = $input.first().json;
const { history, lead_id, profile, state } = inputData;

// Obtener tools list del nodo anterior (Get MCP Tools)
const mcpToolsNode = $('HTTP Request - Get MCP Tools').first().json;
const mcpTools = mcpToolsNode?.tools || [];

console.log('[InputMain] MCP Tools available:', mcpTools.length);
```

#### 2.2. Agregar Tools al Meta Object

```javascript
// ANTES (línea 220):
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

// DESPUÉS:
const meta = {
  history_len: history.length,
  truncated: history.length > 50,
  locale_hint: "es",
  channel: profile.channel || "whatsapp",
  country: profile.country || "Argentina",
  tz: profile.tz || "-03:00",
  now_ts: new Date().toISOString(),
  anti_loop_window_min: 5,
  version: "smart-input@2",
  // 🆕 Nuevo campo
  mcp_tools_available: mcpTools.length,
  odoo_opportunity_id: profile.odoo_opportunity_id || null
};
```

#### 2.3. Agregar Tools Section al Smart Input

```javascript
// ANTES (línea 238):
const smart_input = {
  history,
  profile,
  state,
  options,
  rules,
  meta
};

// DESPUÉS:
const smart_input = {
  history,
  profile,
  state,
  options,
  rules,
  meta,
  // 🆕 Nueva sección
  tools: mcpTools
};
```

#### 2.4. Actualizar User Prompt

```javascript
// Agregar después de línea 275 (dentro de buildUserPrompt):

## Available Tools

You have access to the following Odoo tools via function calling:

${smartInput.tools.map(tool => `
### ${tool.name}
**Description**: ${tool.description}
**Input Schema**:
\`\`\`json
${JSON.stringify(tool.inputSchema, null, 2)}
\`\`\`
`).join('\n')}

**Important Notes**:
- All tools require \`opportunityId\` (Odoo opportunity ID)
- Current opportunity ID: ${smartInput.meta.odoo_opportunity_id || 'NOT SET - cannot use tools yet'}
- Use these tools when the user explicitly requests actions (schedule demo, send proposal, etc.)
- After calling a tool, you will receive the result and can continue the conversation
```

**Resultado**: El LLM ahora conoce qué tools están disponibles y sus esquemas completos.

---

## Paso 3: Actualizar SYSTEM-PROMPT.md

Agregar instrucciones sobre cuándo y cómo usar MCP tools.

### Agregar Sección "ODOO ACTIONS (MCP TOOLS)"

Insertar después de la sección "OUTPUT FORMAT" en [SYSTEM-PROMPT.md](./SYSTEM-PROMPT.md):

```markdown
---

## ODOO ACTIONS (MCP TOOLS)

You have access to **Odoo MCP Tools** for executing real actions in the CRM. These tools are provided in the Smart Input under the `tools` section.

### Available Tools

1. **odoo_schedule_meeting**: Schedule a demo/meeting in Odoo Calendar
2. **odoo_send_email**: Send commercial proposal via email
3. **odoo_update_deal_stage**: Move opportunity through CRM pipeline

### When to Use Tools

**Schedule Meeting** (`odoo_schedule_meeting`):
- User says: "quiero agendar una demo", "agendame una reunión", "cuando podemos hacer una demo"
- Requirements:
  - `opportunityId` must exist in profile
  - User must have shared at least their name
  - You need to extract date/time from conversation or suggest options

**Send Email** (`odoo_send_email`):
- User says: "envíame la propuesta", "quiero recibir la propuesta por email"
- Requirements:
  - `opportunityId` must exist
  - User email must be in profile
  - Use `templateType: "proposal"` for commercial proposals
  - Use `templateType: "demo"` for demo confirmations

**Update Deal Stage** (`odoo_update_deal_stage`):
- Automatically called when:
  - Moving from "match" → "Qualified" (user shows deep interest)
  - Moving from "Qualified" → "Proposition" (proposal sent)
  - Moving to "Won" (user confirms purchase)
  - Moving to "Lost" (user explicitly rejects)

### Stage Mapping (Baserow → Odoo)

| Baserow Stage | Odoo Stage | When |
|---------------|------------|------|
| explore | New | Initial contact |
| match | Qualified | Service selected, interest confirmed |
| price | Qualified | Price discussed |
| qualify | Qualified | Deep interest, demo requested |
| proposal_ready | Proposition | Proposal sent |

### Tool Call Format

Use OpenAI function calling syntax:

```json
{
  "message": {
    "role": "assistant",
    "content": "Perfecto Felix! Voy a agendar la demo para el martes 5 de noviembre a las 15:00hs.",
    "tool_calls": [
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "odoo_schedule_meeting",
          "arguments": "{\"opportunityId\":123,\"title\":\"Demo Odoo CRM - Restaurante Felix\",\"startDatetime\":\"2025-11-05T15:00:00-03:00\",\"durationHours\":0.5,\"description\":\"Demo de Process Automation (Odoo/ERP)\",\"location\":\"Google Meet\"}"
        }
      }
    ]
  },
  "profile_for_persist": { ... },
  "state_for_persist": { ... }
}
```

### Important Rules

1. **Always check `profile.lead_id`**:
   - If `null` → Cannot use tools yet → Inform user "Primero voy a registrar tu información en nuestro CRM"
   - If exists → Can use tools (este es el `opportunityId` en Odoo)

2. **Never invent data**:
   - Don't fabricate meeting dates/times
   - Don't create email content without user confirmation
   - Don't change stages arbitrarily

3. **Confirm before executing**:
   - For demo scheduling: "Te parece bien el martes 5 a las 15:00hs?"
   - For email: "Te envío la propuesta a tu email. ¿Es correcto?"

4. **Handle tool responses**:
   - If tool succeeds → Acknowledge and continue conversation
   - If tool fails → Explain issue and ask user how to proceed
   - If calendar conflict → Suggest alternative slots returned by tool

5. **Update state after tool use**:
   - After `odoo_schedule_meeting` → Set `state.demo_scheduled = true`
   - After `odoo_send_email` (proposal) → Set `state.proposal_offer_done = true`, update `last_proposal_offer_ts`

---
```

---

## Paso 4: Detectar Tool Calls en OUTPUT-MAIN-v2.js

Modificar [OUTPUT-MAIN-v2.js](./OUTPUT-MAIN-v2.js) para detectar cuando el LLM retorna `tool_calls` en lugar de un mensaje normal.

### Cambios en OUTPUT-MAIN-v2.js

#### 4.1. Detectar Tool Calls

Agregar después de línea 43 (después de validar agentOutput):

```javascript
// NUEVO: Detectar si el LLM quiere llamar tools
const hasToolCalls = agentOutput.message?.tool_calls && agentOutput.message.tool_calls.length > 0;

if (hasToolCalls) {
  console.log('[OutputMain] 🔧 Tool calls detected:', agentOutput.message.tool_calls.length);

  // Retornar indicador de que hay tool calls pendientes
  return [{
    json: {
      action: 'call_tool',
      tool_calls: agentOutput.message.tool_calls,
      lead_id: lead_id,
      profile: agentOutput.profile_for_persist,
      state: agentOutput.state_for_persist,
      assistant_message: agentOutput.message.content || '' // Mensaje para mostrar al usuario mientras se ejecuta
    }
  }];
}

// Si no hay tool calls, continuar con lógica normal...
console.log('[OutputMain] No tool calls, processing message...');
```

**Resultado**: Si hay tool calls, OUTPUT-MAIN devuelve `action: 'call_tool'` con los detalles. Si no, continúa con el flujo normal de formateo de mensajes.

---

## Paso 5: Ejecutar Tool y Retornar Resultado

### 5.1. Agregar Nodo Switch (Router)

Después de **OUTPUT-MAIN-v2**, agregar un nodo **Switch** que decida el flujo:

**Configuración Switch**:
- **Nombre**: "Check Action Type"
- **Reglas**:
  1. Si `json.action === 'call_tool'` → Ir a "Execute MCP Tool"
  2. Si `json.action === 'send_message'` → Ir a "Persist to Baserow" (flujo normal)

### 5.2. Nodo: Prepare MCP Tool Call

**Tipo**: Code (JavaScript)
**Nombre**: "Prepare MCP Tool Call"
**Posición**: Entre Switch Node y Execute MCP Tool

**Propósito**: Construir dinámicamente el body para el HTTP Request al MCP Server. NO podemos usar expresiones `={{ }}` dentro del JSON body directamente porque n8n requiere JSON válido.

**Código completo**: Ver [PREPARE-MCP-TOOL-CALL.js](./PREPARE-MCP-TOOL-CALL.js)

**Resumen del código**:
```javascript
const inputData = $input.first().json;

// Extraer primer tool call
const toolCall = inputData.tool_calls[0];
const toolName = toolCall.function?.name || toolCall.name;

// Parsear arguments (viene como JSON string desde LLM)
let toolArguments;
const argsString = toolCall.function?.arguments || toolCall.arguments;

if (typeof argsString === 'string') {
  toolArguments = JSON.parse(argsString);
} else {
  toolArguments = argsString;
}

// Construir body dinámicamente
const mcpBody = {
  tool: toolName,
  arguments: toolArguments
};

return [{
  json: {
    mcp_body: mcpBody,  // ✅ Usar como {{ $json.mcp_body }} en HTTP Request
    lead_id: inputData.lead_id,
    profile: inputData.profile,
    state: inputData.state,
    // ... más campos
  }
}];
```

### 5.3. Nodo: Execute MCP Tool

**Tipo**: HTTP Request
**Método**: POST
**URL**: `http://odoo_mcp:8100/internal/mcp/call-tool`

**Headers**:
```json
{
  "X-Service-Token": "aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37",
  "Content-Type": "application/json"
}
```

**Body** (Expression mode):
```javascript
={{ $json.mcp_body }}
```

⚠️ **IMPORTANTE**: NO escribir JSON manualmente en el body. El nodo anterior (Prepare MCP Tool Call) ya construyó el objeto completo. Simplemente usar `={{ $json.mcp_body }}`.

**Ejemplo de Body enviado**:
```json
{
  "tool": "odoo_schedule_meeting",
  "arguments": {
    "opportunityId": 123,
    "title": "Demo Odoo CRM - Restaurante Felix",
    "startDatetime": "2025-11-05T15:00:00-03:00",
    "durationHours": 0.5,
    "description": "Demo de Process Automation (Odoo/ERP)",
    "location": "Google Meet"
  }
}
```

**Output Esperado** (success):
```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "result": {
    "eventId": 456,
    "message": "Meeting \"Demo Odoo CRM - Restaurante Felix\" scheduled successfully"
  }
}
```

**Output Esperado** (conflict):
```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "result": {
    "message": "Conflictos detectados al agendar la reunión",
    "conflict": {
      "conflicts": [
        {
          "start": "2025-11-05 15:00:00",
          "end": "2025-11-05 16:00:00",
          "name": "Reunión existente"
        }
      ],
      "availableSlots": [
        {
          "start": "2025-11-05 16:30:00",
          "end": "2025-11-05 17:30:00"
        }
      ]
    }
  }
}
```

### 5.4. Nodo: Process Tool Result (TODO - Próxima implementación)

**Tipo**: Code (JavaScript)

**Código** (ejemplo):
```javascript
// Obtener resultado del tool
const toolResult = $json;
const toolCall = $('Check Action Type').first().json.tool_calls[0];
const profile = $('Check Action Type').first().json.profile;
const state = $('Check Action Type').first().json.state;
const assistantMessage = $('Check Action Type').first().json.assistant_message;

// Construir mensaje de feedback para el LLM
let toolResultMessage = '';

if (toolResult.success) {
  // Tool ejecutado exitosamente
  if (toolResult.result.conflict) {
    // Conflicto de calendario
    const availableSlots = toolResult.result.conflict.availableSlots
      .map(slot => `- ${slot.start} a ${slot.end}`)
      .join('\n');

    toolResultMessage = `[TOOL RESULT] Conflicto al agendar: ${toolResult.result.message}\n\nHorarios disponibles:\n${availableSlots}\n\nPor favor sugiere uno de estos horarios al usuario.`;
  } else {
    // Success normal
    toolResultMessage = `[TOOL RESULT] ${toolResult.result.message || 'Acción completada exitosamente'}`;
  }
} else {
  // Error al ejecutar tool
  toolResultMessage = `[TOOL ERROR] ${toolResult.message || 'Error desconocido al ejecutar la acción'}`;
}

console.log('[ProcessToolResult] Tool result:', toolResultMessage);

// Agregar el resultado al historial como mensaje del sistema
const updatedHistory = [
  ...$('Check Action Type').first().json.state.history || [],
  {
    role: 'assistant',
    text: assistantMessage,
    ts: new Date().toISOString()
  },
  {
    role: 'system',
    text: toolResultMessage,
    ts: new Date().toISOString()
  }
];

// Retornar para loop back al INPUT-MAIN
return [{
  json: {
    action: 'continue_conversation',
    history: updatedHistory,
    lead_id: $('Check Action Type').first().json.lead_id,
    profile: profile,
    state: {
      ...state,
      history: updatedHistory
    }
  }
}];
```

**Resultado**: Este nodo construye un mensaje de feedback que el LLM verá en el próximo ciclo, y retorna para hacer loop back.

### 5.4. Loop Back al INPUT-MAIN

Después de **Process Tool Result**, conectar de vuelta a **LoadProfileAndState** para que el agente pueda responder con el resultado del tool.

**Flujo Loop**:
```
Execute MCP Tool → Process Tool Result → LoadProfileAndState → INPUT-MAIN → Master Agent → ...
```

---

## Flujo Completo End-to-End

### Ejemplo: Usuario Pide Agendar Demo

**1. Usuario**: "Quiero agendar una demo para la semana que viene"

**2. INPUT-MAIN**:
- Construye Smart Input con tools list
- Profile tiene `lead_id: 34` (ID de la oportunidad en Odoo)

**3. Master Agent (LLM)**:
- Recibe Smart Input con tools disponibles
- Decide usar `odoo_schedule_meeting`
- Retorna:
```json
{
  "message": {
    "role": "assistant",
    "content": "Perfecto Felix! Te puedo agendar la demo para el martes 5 de noviembre a las 15:00hs. ¿Te viene bien ese horario?",
    "tool_calls": [
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "odoo_schedule_meeting",
          "arguments": "{\"opportunityId\":123,\"title\":\"Demo Odoo CRM - Restaurante Felix\",\"startDatetime\":\"2025-11-05T15:00:00-03:00\",\"durationHours\":0.5}"
        }
      }
    ]
  },
  "profile_for_persist": { ... },
  "state_for_persist": { ... }
}
```

**4. OUTPUT-MAIN-v2**:
- Detecta `tool_calls`
- Retorna `action: 'call_tool'`

**5. Switch Router**:
- Detecta `action === 'call_tool'`
- Enruta a "Execute MCP Tool"

**6. Execute MCP Tool**:
- POST a `http://odoo_mcp:8100/internal/mcp/call-tool`
- Body:
```json
{
  "tool": "odoo_schedule_meeting",
  "arguments": {
    "opportunityId": 123,
    "title": "Demo Odoo CRM - Restaurante Felix",
    "startDatetime": "2025-11-05T15:00:00-03:00",
    "durationHours": 0.5
  }
}
```

**7. MCP Server**:
- Autentica con Odoo usando service account
- Llama a `odoo.execute('calendar.event', 'create', ...)`
- Retorna:
```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "result": {
    "eventId": 456,
    "message": "Meeting \"Demo Odoo CRM - Restaurante Felix\" scheduled successfully"
  }
}
```

**8. Process Tool Result**:
- Construye mensaje de feedback
- Loop back a INPUT-MAIN con history actualizado

**9. Master Agent (2do ciclo)**:
- Ve el resultado del tool en el history
- Responde al usuario:
```json
{
  "message": {
    "role": "assistant",
    "content": "¡Listo Felix! Te agendé la demo para el martes 5 de noviembre a las 15:00hs. Te llegará una confirmación por email. ¿Hay algo más en lo que te pueda ayudar?"
  },
  "profile_for_persist": { ... },
  "state_for_persist": {
    ...state,
    "demo_scheduled": true
  }
}
```

**10. OUTPUT-MAIN-v2**:
- No hay tool_calls
- Formatea mensaje normal
- Envía a WhatsApp/Chatwoot y Odoo

---

## Testing y Debugging

### 1. Verificar MCP Tools Disponibles

```bash
curl -H "X-Service-Token: $TOKEN" http://odoo_mcp:8100/internal/mcp/tools | jq '.tools[].name'
```

Debe retornar:
```
odoo_schedule_meeting
odoo_send_email
odoo_update_deal_stage
...
```

### 2. Test Manual de Tool Call

```bash
curl -X POST http://odoo_mcp:8100/internal/mcp/call-tool \
  -H "X-Service-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "odoo_schedule_meeting",
    "arguments": {
      "opportunityId": 123,
      "title": "Test Demo",
      "startDatetime": "2025-11-10T10:00:00-03:00"
    }
  }'
```

### 3. Verificar Logs en n8n

En cada nodo de Code, agregar:
```javascript
console.log('[NodeName] Data:', JSON.stringify($json, null, 2));
```

### 4. Common Issues

| Issue | Causa | Solución |
|-------|-------|----------|
| `opportunityId` null | Lead no tiene Odoo opportunity | Crear opportunity primero usando `odoo_create_lead` |
| Tool not found | Nombre incorrecto | Verificar nombre exacto con GET /tools |
| Authentication failed | Token inválido | Verificar `ODOO_MCP_SERVICE_TOKEN` en .env |
| Calendar conflict | Horario ocupado | LLM debe sugerir slots del `availableSlots` array |
| Loop infinito | LLM no reconoce tool result | Verificar formato de system message en Process Tool Result |

### 5. Monitoring

Logs importantes a revisar:
- `[InputMain] MCP Tools available: X` → Confirma que tools llegaron
- `[OutputMain] 🔧 Tool calls detected: X` → Confirma que LLM quiere llamar tool
- `[ProcessToolResult] Tool result: ...` → Resultado de la ejecución

---

## Próximos Pasos

1. ✅ Implementar GET MCP Tools node
2. ✅ Modificar INPUT-MAIN.js para incluir tools
3. ✅ Actualizar SYSTEM-PROMPT.md con instrucciones de tools
4. ✅ Modificar OUTPUT-MAIN-v2.js para detectar tool_calls
5. ✅ Crear Execute MCP Tool node
6. ✅ Crear Process Tool Result node
7. ✅ Implementar loop back
8. 🔄 **Testing end-to-end**: Probar con lead real
9. 🔄 **Sincronización Odoo**: Implementar creación automática de opportunity si no existe
10. 🔄 **Error handling**: Manejar todos los edge cases (conflicts, failures, missing data)

---

## Referencias

- [INTERNAL-MCP-API.md](../../odoo-mcp/INTERNAL-MCP-API.md) - Documentación completa de endpoints MCP
- [MCP Server Source](../../odoo-mcp/src/routes/internal-mcp.ts) - Código fuente del router
- [INPUT-MAIN.js](./INPUT-MAIN.js) - Smart Input builder
- [OUTPUT-MAIN-v2.js](./OUTPUT-MAIN-v2.js) - Output formatter
- [SYSTEM-PROMPT.md](./SYSTEM-PROMPT.md) - Instrucciones del LLM

---

**Última actualización**: 2025-11-02
**Versión**: MCP Integration v1.0
