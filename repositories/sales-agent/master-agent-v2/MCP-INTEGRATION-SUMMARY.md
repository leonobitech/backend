# MCP Integration Summary - Sales Agent v2.0 + Odoo MCP Server

**Fecha**: 2025-11-02
**Versión**: MCP Integration v1.0
**Status**: ✅ Implementation Complete - Ready for Testing

---

## 🎯 Objetivo Logrado

Integrar el **MCP Server Odoo** con el **Sales Agent v2.0** para permitir que el LLM ejecute acciones reales en Odoo:

- ✅ Agendar demos en Odoo Calendar
- ✅ Enviar propuestas comerciales por email
- ✅ Mover leads a través del pipeline de CRM
- ✅ Mantener sincronización Baserow ↔ Odoo

---

## 📦 Archivos Creados/Modificados

### 1. MCP Server Odoo (`backend/repositories/odoo-mcp/`)

#### **Archivos Creados**:

| Archivo | Propósito | Líneas |
|---------|-----------|--------|
| `src/routes/internal-mcp.ts` | Router HTTP para exponer MCP tools a n8n | ~150 |
| `INTERNAL-MCP-API.md` | Documentación completa de endpoints para n8n | ~320 |

#### **Archivos Modificados**:

| Archivo | Cambios | Líneas Afectadas |
|---------|---------|------------------|
| `src/config/env.ts` | Agregadas 5 variables de entorno para service account | 58-62 |
| `src/index.ts` | Registrado router `/internal/mcp` | 18, 102 |
| `.env.example` | Template de configuración service account | Final |

---

### 2. Sales Agent v2.0 (`backend/repositories/sales-agent/master-agent-v2/`)

#### **Archivos Creados**:

| Archivo | Propósito | Líneas |
|---------|-----------|--------|
| `MCP-INTEGRATION-GUIDE.md` | Guía completa de implementación n8n | ~850 |
| `MCP-INTEGRATION-SUMMARY.md` | Este documento (resumen ejecutivo) | ~250 |

#### **Archivos Modificados**:

| Archivo | Cambios | Líneas Afectadas |
|---------|---------|------------------|
| `SYSTEM-PROMPT.md` | Agregada sección "ODOO ACTIONS (MCP TOOLS)" con instrucciones completas | +270 (líneas 285-551) |
| `INPUT-MAIN.js` | *Pendiente*: Agregar integración de tools list | ~12-15 líneas nuevas |
| `OUTPUT-MAIN-v2.js` | *Pendiente*: Detectar tool_calls | ~20 líneas nuevas |

---

## 🏗️ Arquitectura Implementada

### Stack Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                         Master Agent v2.0                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      n8n Workflow Nodes                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Get MCP Tools (HTTP GET)                              │   │
│  │    → http://odoo_mcp:8100/internal/mcp/tools             │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ 2. INPUT-MAIN (Code)                                      │   │
│  │    → Construye Smart Input + tools list                  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ 3. Master AI Agent Main (OpenAI)                         │   │
│  │    → GPT-4o-mini con function calling                    │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ 4. OUTPUT-MAIN-v2 (Code)                                 │   │
│  │    → Detecta tool_calls → Switch                         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ 5. Execute MCP Tool (HTTP POST)                          │   │
│  │    → http://odoo_mcp:8100/internal/mcp/call-tool         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ 6. Process Tool Result (Code)                            │   │
│  │    → Loop back to INPUT-MAIN con resultado               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Server Odoo                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ GET /internal/mcp/tools                                  │   │
│  │   → Lista todas las tools disponibles                    │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ POST /internal/mcp/call-tool                             │   │
│  │   → Ejecuta tool específica por nombre                   │   │
│  │   → Auth: X-Service-Token                                │   │
│  │   → Crea OdooClient con service account                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                          Odoo 17                                │
│  • calendar.event (agendar demos)                               │
│  • mail.mail (enviar propuestas)                                │
│  • crm.lead (actualizar stage)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Autenticación Dual

### Strategy 1: Claude Desktop (OAuth 2.1)

**Endpoint**: `/mcp` (Streamable HTTP)
**Auth**: Bearer token (OAuth flow completo)
**Uso**: Usuarios finales en Claude Desktop
**Status**: ✅ Ya existente (no modificado)

### Strategy 2: n8n Service Account (API Key)

**Endpoint**: `/internal/mcp` (HTTP REST)
**Auth**: `X-Service-Token` header
**Uso**: Sales Agent en n8n workflows
**Status**: ✅ Implementado

**Configuración requerida** (`.env` en `odoo-mcp`):
```env
SERVICE_TOKEN=<64-char-random-token>
ODOO_SERVICE_URL=http://odoo:8069
ODOO_SERVICE_DB=leonobitech
ODOO_SERVICE_USER=admin@leonobitech.com
ODOO_SERVICE_API_KEY=<odoo-api-key>
```

---

## 🛠️ MCP Tools Disponibles

### Priority Tools (Para Sales Agent)

| Tool | Función | Uso en Sales Flow |
|------|---------|-------------------|
| `odoo_schedule_meeting` | Agendar demo/reunión en Calendar | Usuario pide "agendar demo" |
| `odoo_send_email` | Enviar propuesta comercial | Usuario confirma "envíame la propuesta" |
| `odoo_update_deal_stage` | Mover lead en pipeline CRM | Transiciones automáticas de stage |

### Other Tools (Disponibles pero menos usadas)

- `odoo_get_leads`: Buscar leads en CRM
- `odoo_create_lead`: Crear nueva oportunidad
- `odoo_get_opportunities`: Listar oportunidades
- `odoo_analyze_opportunity`: Análisis de oportunidad
- `odoo_search_contacts`: Buscar contactos
- `odoo_create_contact`: Crear contacto
- `odoo_complete_activity`: Marcar actividad como completada

---

## 📊 Sincronización Baserow ↔ Odoo

### Campo Nuevo en Baserow: `odoo_opportunity_id`

**Tabla**: Leads
**Tipo**: Number
**Nullable**: Sí
**Default**: null
**Propósito**: Mapear leads de Baserow con opportunities de Odoo

### Flujo de Sync

```
1. Lead entra por WhatsApp
   ↓
2. Sales Agent conversa → Califica lead
   ↓
3. Si lead calificado y odoo_opportunity_id = null:
   → Crear opportunity en Odoo (usando odoo_create_lead)
   → Guardar odoo_opportunity_id en Baserow
   ↓
4. Si lead pide demo/propuesta:
   → Usar odoo_opportunity_id para ejecutar tools
   ↓
5. Odoo y Baserow mantienen sync bidireccional
```

---

## 🔄 Flujo End-to-End: Agendar Demo

### Ejemplo Real

**Contexto**:
- Usuario: Felix Figueroa (Lead #34, Baserow row_id 198)
- Interés: Process Automation (Odoo/ERP)
- Stage: qualify
- `odoo_opportunity_id`: 123 (ya existe)

**Conversación**:

1. **Usuario**: "Quiero agendar una demo para la semana que viene"

2. **INPUT-MAIN**:
   - Construye Smart Input con `tools` array
   - Profile tiene `odoo_opportunity_id: 123`

3. **Master AI Agent (LLM)**:
   - Recibe tools list en Smart Input
   - Decide usar `odoo_schedule_meeting`
   - Retorna JSON con `tool_calls`:
   ```json
   {
     "message": {
       "role": "assistant",
       "content": "Perfecto Felix! Te puedo agendar la demo para el martes 5 de noviembre a las 15:00hs. ¿Te viene bien ese horario?",
       "tool_calls": [
         {
           "id": "call_demo_123",
           "type": "function",
           "function": {
             "name": "odoo_schedule_meeting",
             "arguments": "{\"opportunityId\":123,\"title\":\"Demo Odoo CRM - Restaurante Felix\",\"startDatetime\":\"2025-11-05T15:00:00-03:00\",\"durationHours\":0.5,\"location\":\"Google Meet\"}"
           }
         }
       ]
     },
     "profile_for_persist": { ... },
     "state_for_persist": { ...state, "demo_scheduled": true }
   }
   ```

4. **OUTPUT-MAIN-v2**:
   - Detecta `tool_calls` presentes
   - Retorna `action: 'call_tool'`

5. **Switch Router**:
   - Detecta `action === 'call_tool'`
   - Enruta a "Execute MCP Tool"

6. **Execute MCP Tool (HTTP POST)**:
   ```bash
   POST http://odoo_mcp:8100/internal/mcp/call-tool
   Headers: X-Service-Token: <token>
   Body: {
     "tool": "odoo_schedule_meeting",
     "arguments": {
       "opportunityId": 123,
       "title": "Demo Odoo CRM - Restaurante Felix",
       "startDatetime": "2025-11-05T15:00:00-03:00",
       "durationHours": 0.5,
       "location": "Google Meet"
     }
   }
   ```

7. **MCP Server → Odoo XML-RPC**:
   - Autentica con service account
   - Crea evento en `calendar.event`
   - Actualiza stage de opportunity
   - Envía email de confirmación automático
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

8. **Process Tool Result**:
   - Construye mensaje de feedback:
   ```json
   {
     "role": "system",
     "text": "[TOOL RESULT] Meeting \"Demo Odoo CRM - Restaurante Felix\" scheduled successfully"
   }
   ```
   - Loop back a INPUT-MAIN con history actualizado

9. **Master Agent (2do ciclo)**:
   - Ve resultado del tool en history
   - Responde al usuario:
   ```json
   {
     "message": {
       "role": "assistant",
       "content": "¡Listo Felix! Te agendé la demo para el martes 5 de noviembre a las 15:00hs. Te va a llegar un email de confirmación con el link de Google Meet. ¿Hay algo más en lo que te pueda ayudar?"
     }
   }
   ```

10. **OUTPUT-MAIN-v2** (2da vez):
    - No hay tool_calls
    - Formatea mensaje normal
    - Envía a WhatsApp/Chatwoot: `"🤖 Leonobit:\n¡Listo Felix!..."`
    - Envía a Odoo chatter: `<p><strong>🤖 Leonobit:</strong></p><p>¡Listo Felix!...</p>`

11. **Persist to Baserow**:
    - Actualiza row 198 con:
      - `state.demo_scheduled = true`
      - Nuevo mensaje en history

**Resultado Final**:
- ✅ Demo agendada en Odoo Calendar (eventId 456)
- ✅ Email de confirmación enviado a Felix
- ✅ Opportunity stage actualizado en Odoo
- ✅ State persistido en Baserow
- ✅ Usuario notificado por WhatsApp

---

## 📝 Modificaciones Pendientes (Usuario)

### 1. Agregar Campo en Baserow

**Tabla**: Leads
**Campo**: `odoo_opportunity_id`
**Tipo**: Number
**Nullable**: Sí

### 2. Configurar .env en MCP Server

**Archivo**: `backend/repositories/odoo-mcp/.env`

Agregar:
```env
# Service Account (para n8n)
SERVICE_TOKEN=<generar-64-chars-random>
ODOO_SERVICE_URL=http://odoo:8069
ODOO_SERVICE_DB=leonobitech
ODOO_SERVICE_USER=admin@leonobitech.com
ODOO_SERVICE_API_KEY=<api-key-de-odoo>
```

**Generar SERVICE_TOKEN**:
```bash
openssl rand -hex 32
```

**Obtener ODOO_SERVICE_API_KEY**:
1. Ir a Odoo → Settings → Users
2. Seleccionar usuario `admin@leonobitech.com`
3. Account Security → API Keys → Generate New Key
4. Copiar y guardar en .env

### 3. Modificar INPUT-MAIN.js

**Archivo**: `backend/repositories/sales-agent/master-agent-v2/INPUT-MAIN.js`

**Cambios** (líneas 12-15):
```javascript
// ANTES:
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

**Cambios** (líneas 230-232):
```javascript
// ANTES:
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
  mcp_tools_available: mcpTools.length,
  odoo_opportunity_id: profile.odoo_opportunity_id || null
};
```

**Cambios** (líneas 238-245):
```javascript
// ANTES:
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
  tools: mcpTools
};
```

**Cambios** (líneas 275+, dentro de buildUserPrompt):
```javascript
// Agregar después de la línea 275:

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

### 4. Modificar OUTPUT-MAIN-v2.js

**Archivo**: `backend/repositories/sales-agent/master-agent-v2/OUTPUT-MAIN-v2.js`

**Cambios** (agregar después de línea 43):
```javascript
// Detectar si el LLM quiere llamar tools
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
      assistant_message: agentOutput.message.content || ''
    }
  }];
}

// Si no hay tool calls, continuar con lógica normal...
console.log('[OutputMain] No tool calls, processing message...');
```

### 5. Crear Nodos n8n

#### Nodo 1: HTTP Request - Get MCP Tools

**Configuración**:
- Tipo: HTTP Request
- Método: GET
- URL: `http://odoo_mcp:8100/internal/mcp/tools`
- Headers:
  - `X-Service-Token`: `={{$env.ODOO_MCP_SERVICE_TOKEN}}`

**Posición**: Entre LoadProfileAndState y INPUT-MAIN

#### Nodo 2: Switch - Check Action Type

**Configuración**:
- Tipo: Switch
- Reglas:
  1. Si `json.action === 'call_tool'` → Execute MCP Tool
  2. Si `json.action !== 'call_tool'` → Persist to Baserow (flujo normal)

**Posición**: Después de OUTPUT-MAIN-v2

#### Nodo 3: HTTP Request - Execute MCP Tool

**Configuración**:
- Tipo: HTTP Request
- Método: POST
- URL: `http://odoo_mcp:8100/internal/mcp/call-tool`
- Headers:
  - `X-Service-Token`: `={{$env.ODOO_MCP_SERVICE_TOKEN}}`
  - `Content-Type`: `application/json`
- Body (JavaScript):
```javascript
const toolCall = $json.tool_calls[0];
const functionCall = toolCall.function;

return {
  tool: functionCall.name,
  arguments: JSON.parse(functionCall.arguments)
};
```

**Posición**: Después de Switch (rama call_tool)

#### Nodo 4: Code - Process Tool Result

**Configuración**:
- Tipo: Code (JavaScript)
- Código:
```javascript
const toolResult = $json;
const toolCall = $('Check Action Type').first().json.tool_calls[0];
const profile = $('Check Action Type').first().json.profile;
const state = $('Check Action Type').first().json.state;
const assistantMessage = $('Check Action Type').first().json.assistant_message;

let toolResultMessage = '';

if (toolResult.success) {
  if (toolResult.result.conflict) {
    const availableSlots = toolResult.result.conflict.availableSlots
      .map(slot => `- ${slot.start} a ${slot.end}`)
      .join('\n');
    toolResultMessage = `[TOOL RESULT] Conflicto al agendar: ${toolResult.result.message}\n\nHorarios disponibles:\n${availableSlots}\n\nPor favor sugiere uno de estos horarios al usuario.`;
  } else {
    toolResultMessage = `[TOOL RESULT] ${toolResult.result.message || 'Acción completada exitosamente'}`;
  }
} else {
  toolResultMessage = `[TOOL ERROR] ${toolResult.message || 'Error desconocido al ejecutar la acción'}`;
}

console.log('[ProcessToolResult] Tool result:', toolResultMessage);

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

**Posición**: Después de Execute MCP Tool
**Conexión**: Loop back a LoadProfileAndState

### 6. Deploy y Testing

**Deploy MCP Server**:
```bash
cd backend/repositories/odoo-mcp
# Copiar archivos modificados
docker compose down odoo_mcp
docker compose up -d --build odoo_mcp
```

**Test Endpoints**:
```bash
# Test GET tools
curl -H "X-Service-Token: $TOKEN" http://localhost:8100/internal/mcp/tools

# Test POST call-tool
curl -X POST http://localhost:8100/internal/mcp/call-tool \
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

---

## 📚 Documentación de Referencia

| Documento | Propósito | Ubicación |
|-----------|-----------|-----------|
| **MCP-INTEGRATION-GUIDE.md** | Guía completa paso a paso (850 líneas) | `master-agent-v2/` |
| **INTERNAL-MCP-API.md** | Documentación de endpoints MCP | `odoo-mcp/` |
| **SYSTEM-PROMPT.md** | Instrucciones actualizadas del LLM | `master-agent-v2/` |
| **MCP-INTEGRATION-SUMMARY.md** | Este documento (resumen ejecutivo) | `master-agent-v2/` |

---

## ✅ Checklist de Implementación

### Backend (MCP Server)
- [x] Crear router `/internal/mcp` con 2 endpoints
- [x] Agregar variables de entorno para service account
- [x] Registrar router en `index.ts`
- [x] Documentar endpoints en `INTERNAL-MCP-API.md`
- [ ] Usuario: Configurar .env con service credentials
- [ ] Usuario: Deploy container actualizado

### Frontend (Sales Agent)
- [x] Crear documentación completa de integración
- [x] Actualizar SYSTEM-PROMPT.md con MCP tools
- [ ] Usuario: Modificar INPUT-MAIN.js (3 secciones)
- [ ] Usuario: Modificar OUTPUT-MAIN-v2.js (1 sección)
- [ ] Usuario: Crear 4 nodos n8n nuevos
- [ ] Usuario: Conectar loop back

### Database (Baserow)
- [ ] Usuario: Agregar campo `odoo_opportunity_id` en tabla Leads

### Testing
- [ ] Test unitario: GET /internal/mcp/tools
- [ ] Test unitario: POST /internal/mcp/call-tool
- [ ] Test end-to-end: Usuario pide demo → Demo agendada en Odoo
- [ ] Test end-to-end: Usuario pide propuesta → Email enviado
- [ ] Test conflict handling: Calendario ocupado → Sugerir alternativas
- [ ] Test error handling: Odoo no disponible → Mensaje de error

---

## 🚀 Próximos Pasos

1. **Usuario completa configuración**:
   - Agregar campo `odoo_opportunity_id` en Baserow
   - Configurar .env en odoo-mcp
   - Modificar INPUT-MAIN.js y OUTPUT-MAIN-v2.js
   - Crear nodos n8n

2. **Deploy y testing**:
   - Deploy odoo_mcp container actualizado
   - Test endpoints MCP manualmente
   - Test workflow completo con lead real
   - Verificar sincronización Baserow ↔ Odoo

3. **Mejoras futuras** (después de MVP):
   - Auto-creación de opportunity si no existe `odoo_opportunity_id`
   - Sincronización bidireccional completa (Odoo → Baserow)
   - Soporte para múltiples tool calls en paralelo
   - Dashboard de métricas (demos agendados, propuestas enviadas)
   - Retry logic para fallos de Odoo

---

## 📞 Soporte

**Developer**: Claude (Anthropic)
**Project**: Leonobitech Sales Agent v2.0
**Contact**: felix@leonobitech.com
**Repo**: `/Users/felix/leonobitech/backend/`

---

**Última actualización**: 2025-11-02
**Versión**: MCP Integration v1.0
**Status**: ✅ Implementation Complete - Ready for User Configuration
