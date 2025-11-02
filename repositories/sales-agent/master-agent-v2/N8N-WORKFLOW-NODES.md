# N8N Workflow Nodes - MCP Integration

Guía completa para agregar los 3 nodos nuevos al workflow del Sales Agent v2.0 en n8n.

---

## Arquitectura del Workflow Actualizado

```
┌─────────────────────┐
│ Get/Update Baserow  │
│ Row                 │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ ComposeProfile      │
│ (Code)              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ LoadProfileAndState │
│ (Code)              │◄─────────────────┐
└──────────┬──────────┘                  │
           │                             │
           ▼                             │
┌─────────────────────┐                  │
│ Chat History Filter │                  │
│ (Code)              │                  │
└──────────┬──────────┘                  │
           │                             │
           ▼                             │
┌─────────────────────┐                  │
│ INPUT-MAIN          │                  │
│ (Code)              │                  │
│ + Fetch MCP Tools   │                  │
└──────────┬──────────┘                  │
           │                             │
           ▼                             │
┌─────────────────────┐                  │
│ Master AI Agent     │                  │
│ Main                │                  │
└──────────┬──────────┘                  │
           │                             │
           ▼                             │
┌─────────────────────┐                  │
│ OUTPUT-MAIN-v2      │                  │
│ (Code)              │                  │
│ + Detect Tool Calls │                  │
└──────────┬──────────┘                  │
           │                             │
           ▼                             │
┌─────────────────────┐                  │
│ 🆕 Switch           │                  │
│ (has_tool_calls?)   │                  │
└────┬───────────┬────┘                  │
     │           │                       │
     │ TRUE      │ FALSE                 │
     ▼           ▼                       │
┌─────────┐  ┌──────────────────┐       │
│🆕Execute│  │ Chatwoot/Odoo    │       │
│  MCP    │  │ (flujo normal)   │       │
│  Tool   │  └──────────────────┘       │
└────┬────┘                              │
     │                                   │
     ▼                                   │
┌─────────┐                              │
│🆕Process│                              │
│  Tool   │                              │
│  Result │                              │
└────┬────┘                              │
     │                                   │
     └───────────────────────────────────┘
```

---

## 1. Switch Node - "Check Tool Calls"

**Tipo**: Switch (n8n core node)

**Posición**: Después de "OUTPUT-MAIN-v2"

**Configuración**:

```json
{
  "name": "Check Tool Calls",
  "type": "n8n-nodes-base.switch",
  "position": [1200, 400],
  "parameters": {
    "mode": "expression",
    "output": "outputTwo",
    "rules": {
      "rules": [
        {
          "operation": "equal",
          "value1": "={{ $json.has_tool_calls }}",
          "value2": true,
          "output": 0
        }
      ]
    },
    "fallbackOutput": 1
  }
}
```

**Outputs**:
- **Output 0** (TRUE): Conectar a "Execute MCP Tool"
- **Output 1** (FALSE): Conectar a nodos existentes (Chatwoot/Odoo)

**Test Cases**:

```javascript
// Input with tool_calls
{
  "has_tool_calls": true,
  "tool_calls": [
    {
      "name": "odoo_schedule_meeting",
      "arguments": { ... }
    }
  ]
}
// → Output 0 (Execute MCP Tool)

// Input without tool_calls
{
  "has_tool_calls": false,
  "content_whatsapp": { ... }
}
// → Output 1 (flujo normal)
```

---

## 2. HTTP Request Node - "Execute MCP Tool"

**Tipo**: HTTP Request (n8n core node)

**Posición**: Conectado a Switch Output 0

**Configuración**:

```json
{
  "name": "Execute MCP Tool",
  "type": "n8n-nodes-base.httpRequest",
  "position": [1400, 300],
  "parameters": {
    "method": "POST",
    "url": "http://odoo_mcp:8100/internal/mcp/call-tool",
    "authentication": "none",
    "options": {
      "timeout": 30000
    },
    "headerParameters": {
      "parameters": [
        {
          "name": "X-Service-Token",
          "value": "aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37"
        },
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "bodyParameters": {
      "parameters": [
        {
          "name": "tool",
          "value": "={{ $json.tool_calls[0].name }}"
        },
        {
          "name": "arguments",
          "value": "={{ $json.tool_calls[0].arguments }}"
        }
      ]
    },
    "options": {}
  }
}
```

**IMPORTANTE**: Este nodo solo procesa el PRIMER tool call. Si en el futuro el LLM devuelve múltiples tool_calls, agregar un Loop node antes.

**Request Body Example**:

```json
{
  "tool": "odoo_schedule_meeting",
  "arguments": {
    "opportunityId": 123,
    "title": "Demo Odoo CRM",
    "startDatetime": "2025-11-05 15:00:00",
    "duration": 1.0,
    "description": "Demo solicitada por Felix Figueroa"
  }
}
```

**Expected Response**:

```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "result": {
    "success": true,
    "meeting": {
      "id": 456,
      "name": "Demo Odoo CRM",
      "start": "2025-11-05 15:00:00",
      "duration": 1.0,
      "opportunity_id": 123
    },
    "message": "Meeting scheduled successfully"
  }
}
```

**Error Response**:

```json
{
  "error": "tool_execution_failed",
  "message": "Opportunity not found",
  "details": "..."
}
```

---

## 3. Code Node - "Process Tool Result"

**Tipo**: Code (n8n core node)

**Posición**: Después de "Execute MCP Tool"

**Configuración**:

```javascript
// ============================================================================
// PROCESS TOOL RESULT - Manejo de resultado de MCP tool execution
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de Execute MCP Tool
//
// Recibe: Response de odoo_mcp (success, tool, result) + datos anteriores
// Output: profile, state actualizados + volver a LoadProfileAndState
// ============================================================================

const inputData = $input.first().json;

// Obtener datos del tool call anterior (vienen del Switch node)
const switchData = $('Check Tool Calls').first().json;
const { profile, state, lead_id, message } = switchData;

console.log('[ProcessToolResult] Processing result for tool:', inputData.tool);
console.log('[ProcessToolResult] Success:', inputData.success);

// ============================================================================
// 1. VALIDAR RESPUESTA
// ============================================================================

if (!inputData.success) {
  console.error('[ProcessToolResult] ❌ Tool execution failed:', inputData.error);

  // En caso de error, devolver estado sin cambios
  // El flujo continúa pero no se actualizó nada en Odoo
  return [{
    json: {
      lead_id: lead_id,
      profile: profile,
      state: state,
      tool_error: true,
      tool_error_message: inputData.message || inputData.error
    }
  }];
}

// ============================================================================
// 2. PROCESAR RESULTADO SEGÚN TOOL
// ============================================================================

const toolName = inputData.tool;
const result = inputData.result;

let updatedState = { ...state };
let updatedProfile = { ...profile };

console.log('[ProcessToolResult] Processing tool:', toolName);

// Actualizar state según el tool ejecutado
switch (toolName) {
  case 'odoo_schedule_meeting':
    console.log('[ProcessToolResult] ✅ Meeting scheduled:', result.meeting?.id);

    // Actualizar state: agregar meeting_id
    updatedState.odoo_meeting_id = result.meeting?.id || null;
    updatedState.last_tool_executed = toolName;
    updatedState.last_tool_ts = new Date().toISOString();

    // Si el lead está en qualify, moverlo a proposal_ready
    if (updatedState.stage === 'qualify') {
      updatedState.stage = 'proposal_ready';
      console.log('[ProcessToolResult] Stage updated: qualify → proposal_ready');
    }
    break;

  case 'odoo_send_commercial_proposal':
    console.log('[ProcessToolResult] ✅ Proposal sent');

    updatedState.proposal_offer_done = true;
    updatedState.last_proposal_offer_ts = new Date().toISOString();
    updatedState.last_tool_executed = toolName;
    updatedState.last_tool_ts = new Date().toISOString();

    // Mover a proposal_ready si no está ahí
    if (updatedState.stage !== 'proposal_ready') {
      updatedState.stage = 'proposal_ready';
      console.log('[ProcessToolResult] Stage updated → proposal_ready');
    }
    break;

  case 'odoo_move_stage':
    console.log('[ProcessToolResult] ✅ Opportunity stage moved');

    updatedState.last_tool_executed = toolName;
    updatedState.last_tool_ts = new Date().toISOString();
    // El stage se actualiza en el siguiente sync con Baserow
    break;

  case 'odoo_create_opportunity':
    console.log('[ProcessToolResult] ✅ Opportunity created:', result.opportunity?.id);

    // Actualizar profile con el opportunity_id
    updatedProfile.odoo_opportunity_id = result.opportunity?.id || null;
    updatedState.last_tool_executed = toolName;
    updatedState.last_tool_ts = new Date().toISOString();
    break;

  case 'odoo_send_email':
    console.log('[ProcessToolResult] ✅ Email sent');

    updatedState.last_tool_executed = toolName;
    updatedState.last_tool_ts = new Date().toISOString();
    break;

  default:
    console.log('[ProcessToolResult] ⚠️ Unknown tool, no state updates applied');
    updatedState.last_tool_executed = toolName;
    updatedState.last_tool_ts = new Date().toISOString();
}

// ============================================================================
// 3. OUTPUT - Volver a LoadProfileAndState para continuar ciclo
// ============================================================================

console.log('[ProcessToolResult] ✅ Tool result processed successfully');
console.log('[ProcessToolResult] Updated stage:', updatedState.stage);
console.log('[ProcessToolResult] Last tool:', updatedState.last_tool_executed);

return [{
  json: {
    lead_id: lead_id,
    profile: updatedProfile,
    state: updatedState,

    // Metadata del tool execution
    tool_executed: toolName,
    tool_result: result,
    tool_success: true,

    // Para debugging
    tool_execution_ts: new Date().toISOString()
  }
}];
```

**Output Example**:

```json
{
  "lead_id": 34,
  "profile": {
    "row_id": 198,
    "odoo_opportunity_id": 123,
    ...
  },
  "state": {
    "stage": "proposal_ready",
    "odoo_meeting_id": 456,
    "last_tool_executed": "odoo_schedule_meeting",
    "last_tool_ts": "2025-11-05T14:30:00.000Z",
    ...
  },
  "tool_executed": "odoo_schedule_meeting",
  "tool_result": {
    "meeting": { "id": 456, ... }
  },
  "tool_success": true
}
```

**Connection**: Output conecta de vuelta a **LoadProfileAndState** para continuar el ciclo.

---

## 4. Conexiones del Workflow

**Nuevas Conexiones a Crear**:

1. `OUTPUT-MAIN-v2` → `Check Tool Calls` (input)

2. `Check Tool Calls` (output 0 - TRUE) → `Execute MCP Tool`

3. `Check Tool Calls` (output 1 - FALSE) → `[nodos existentes de Chatwoot/Odoo]`

4. `Execute MCP Tool` → `Process Tool Result`

5. `Process Tool Result` → `LoadProfileAndState` (LOOP)

---

## 5. Testing Strategy

### Test Case 1: Sin Tool Calls (Flujo Normal)

**Input a OUTPUT-MAIN-v2**:
```json
{
  "message": {
    "text": "¡Hola Felix! ¿En qué puedo ayudarte?"
  },
  "state_update": {...},
  "cta_menu": {...}
}
```

**Expected Flow**:
- OUTPUT-MAIN-v2 → `has_tool_calls: false`
- Switch → Output 1 (FALSE)
- Continúa a Chatwoot/Odoo (flujo normal)

---

### Test Case 2: Con Tool Call (Agendar Demo)

**Input a Master AI Agent**:
```json
{
  "smart_input": {
    "history": [
      { "role": "user", "text": "Quiero agendar una demo para mañana a las 3pm" }
    ],
    "state": { "stage": "qualify", ... },
    "tools": [
      {
        "name": "odoo_schedule_meeting",
        "description": "Schedule a demo or meeting in Odoo Calendar",
        "inputSchema": {...}
      }
    ]
  }
}
```

**Expected LLM Response**:
```json
{
  "message": {
    "text": "¡Perfecto Felix! Te agendé una demo para mañana 5 de noviembre a las 15:00. Te llegará una confirmación por email."
  },
  "tool_calls": [
    {
      "name": "odoo_schedule_meeting",
      "arguments": {
        "opportunityId": 123,
        "title": "Demo Odoo CRM",
        "startDatetime": "2025-11-05 15:00:00",
        "duration": 1.0,
        "description": "Demo solicitada por Felix Figueroa"
      }
    }
  ],
  "state_update": {...}
}
```

**Expected Flow**:
- OUTPUT-MAIN-v2 → `has_tool_calls: true` + `tool_calls: [...]`
- Switch → Output 0 (TRUE)
- Execute MCP Tool → POST /internal/mcp/call-tool
- MCP Server → Ejecuta tool en Odoo
- Process Tool Result → Actualiza state.odoo_meeting_id + stage → proposal_ready
- Loop back a LoadProfileAndState → Continúa workflow

---

## 6. Troubleshooting

### Error: "registry.listAll is not a function"

**Causa**: Código desactualizado en VPS

**Solución**:
```bash
cd /home/felix/leonobitech/backend/repositories/odoo-mcp
git pull origin main
make reset SERVICE=odoo_mcp
```

---

### Error: "Missing X-Service-Token header"

**Causa**: Token no configurado en HTTP Request node

**Solución**: Agregar header en "Execute MCP Tool":
```
X-Service-Token: aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37
```

---

### Error: "Opportunity not found"

**Causa**: `profile.odoo_opportunity_id` no existe o es null

**Solución Temporal**: Crear opportunity primero con `odoo_create_opportunity` tool

**Solución Permanente**: Agregar campo `odoo_opportunity_id` a Baserow y sincronizar

---

### Loop Infinito

**Causa**: Process Tool Result siempre devuelve a LoadProfileAndState sin condición de salida

**Solución**: Agregar un contador de tool executions en state:
```javascript
updatedState.tool_execution_count = (state.tool_execution_count || 0) + 1;

if (updatedState.tool_execution_count > 5) {
  throw new Error('[ProcessToolResult] Max tool executions reached');
}
```

---

## 7. Monitoring y Logs

**Logs a Monitorear en n8n**:

```
[InputMain] ✅ Fetched 11 MCP tools
[OutputMain] Tool calls: 1
[OutputMain] 🔧 Tool calls detected! LLM wants to execute Odoo actions.
[OutputMain] Tools to execute: odoo_schedule_meeting
[ProcessToolResult] ✅ Meeting scheduled: 456
[ProcessToolResult] Stage updated: qualify → proposal_ready
```

**Logs a Monitorear en Odoo MCP Server**:

```bash
docker logs odoo_mcp -f --tail 100
```

Buscar:
```
[InternalMCP] Calling tool: odoo_schedule_meeting
[InternalMCP] Tool executed successfully
```

---

## 8. Próximos Pasos

1. **Agregar campo odoo_opportunity_id a Baserow**
2. **Implementar sincronización bidireccional** (Baserow ↔ Odoo)
3. **Soportar múltiples tool_calls** (agregar Loop node antes de Execute MCP Tool)
4. **Agregar retry logic** en caso de fallo de MCP Server
5. **Implementar rate limiting** para evitar abuse

---

## Referencias

- **MCP Integration Guide**: `master-agent-v2/MCP-INTEGRATION-GUIDE.md`
- **Internal MCP API**: `odoo-mcp/INTERNAL-MCP-API.md`
- **System Prompt**: `master-agent-v2/SYSTEM-PROMPT.md` (sección 5.5)
- **INPUT-MAIN.js**: Líneas 234-261 (fetch MCP tools)
- **OUTPUT-MAIN-v2.js**: Líneas 73-96 (detect tool_calls)

---

**Última actualización**: 2025-11-02
**Versión**: 1.0
**Autor**: Claude Code + Felix Figueroa
