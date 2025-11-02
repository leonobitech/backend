# MCP Integration - Status Report

**Fecha**: 2025-11-02
**Status**: ✅ **READY FOR IMPLEMENTATION IN N8N**

---

## 🎯 Objetivo Completado

Integrar el **Odoo MCP Server** con el **Sales Agent v2.0** para permitir que el LLM ejecute acciones reales en Odoo mediante function calling:

- ✅ Agendar demos en Odoo Calendar
- ✅ Enviar propuestas comerciales por email
- ✅ Mover leads en el pipeline de CRM
- ✅ Crear/actualizar oportunidades
- ✅ Gestionar actividades y contactos

---

## 📊 Cambios Realizados

### 1. Backend - Odoo MCP Server

**Archivos Modificados**:
- ✅ `odoo-mcp/src/routes/internal-mcp.ts` (CREADO - 160 líneas)
- ✅ `odoo-mcp/src/config/env.ts` (5 variables nuevas)
- ✅ `odoo-mcp/src/index.ts` (2 líneas - registro del router)

**Funcionalidad**:
- ✅ GET `/internal/mcp/tools` - Lista las 11 tools disponibles con schemas
- ✅ POST `/internal/mcp/call-tool` - Ejecuta cualquier tool por nombre
- ✅ Autenticación con `X-Service-Token` (header-based)
- ✅ Service account Odoo preconfigured (no OAuth necesario)

**Testing**:
- ✅ Probado desde n8n HTTP Request node
- ✅ Devuelve correctamente las 11 tools
- ✅ Ejecuta tools sin errores

**Commits**:
```
fix(odoo-mcp): improve service auth middleware with better logging and validation
fix(odoo-mcp): correct ToolRegistry method calls (listAll, get)
fix(odoo-mcp): correct tool instance access pattern
```

---

### 2. Sales Agent v2.0 - Workflow Code

**Archivos Modificados**:
- ✅ `master-agent-v2/INPUT-MAIN.js` (+32 líneas)
- ✅ `master-agent-v2/OUTPUT-MAIN-v2.js` (+30 líneas)
- ✅ `master-agent-v2/SYSTEM-PROMPT.md` (+270 líneas)

**Funcionalidad**:

**INPUT-MAIN.js** (líneas 234-261):
```javascript
// Fetch MCP tools desde Odoo MCP Server
const mcpResponse = await fetch('http://odoo_mcp:8100/internal/mcp/tools', {
  method: 'GET',
  headers: {
    'X-Service-Token': 'aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37',
    'Content-Type': 'application/json'
  }
});

const smart_input = {
  history,
  profile,
  state,
  options,
  rules,
  meta,
  tools  // 🆕 MCP tools disponibles para el LLM
};
```

**OUTPUT-MAIN-v2.js** (líneas 73-96):
```javascript
// Detectar si el LLM devolvió tool_calls
if (tool_calls && Array.isArray(tool_calls) && tool_calls.length > 0) {
  console.log('[OutputMain] 🔧 Tool calls detected!');

  return [{
    json: {
      has_tool_calls: true,
      tool_calls: tool_calls,
      lead_id, profile, state,
      message, state_update, cta_menu
    }
  }];
}
```

**SYSTEM-PROMPT.md** (sección 5.5):
- ✅ Documentación de 3 tools principales (schedule_meeting, send_proposal, move_stage)
- ✅ Trigger phrases para cada tool
- ✅ Tool call format con argumentos requeridos
- ✅ 5 reglas críticas para usar tools
- ✅ Output format con tool_calls array

**Commits**:
```
feat(sales-agent): integrate MCP tools into Smart Input
feat(sales-agent): add tool_calls detection in Output Main v2.0
```

---

### 3. Documentación

**Archivos Creados**:
- ✅ `odoo-mcp/INTERNAL-MCP-API.md` (~320 líneas)
- ✅ `master-agent-v2/MCP-INTEGRATION-GUIDE.md` (~850 líneas)
- ✅ `master-agent-v2/MCP-INTEGRATION-SUMMARY.md` (~250 líneas)
- ✅ `master-agent-v2/N8N-WORKFLOW-NODES.md` (~550 líneas)
- ✅ `master-agent-v2/MCP-INTEGRATION-STATUS.md` (este archivo)

**Commits**:
```
docs(odoo-mcp): add internal MCP API documentation for n8n integration
docs(sales-agent): add comprehensive MCP integration guides
docs(sales-agent): add n8n workflow nodes configuration guide
```

---

## 🔄 Flujo Completo

```
1. LoadProfileAndState
   ↓
2. Chat History Filter
   ↓
3. INPUT-MAIN
   - 🆕 Fetch MCP tools desde http://odoo_mcp:8100/internal/mcp/tools
   - Construye smart_input con tools incluidos
   ↓
4. Master AI Agent Main
   - Recibe smart_input con tools
   - Decide si usar function calling según contexto
   - Devuelve message + tool_calls (si aplica)
   ↓
5. OUTPUT-MAIN-v2
   - 🆕 Detecta si hay tool_calls
   - Si tool_calls → return { has_tool_calls: true, tool_calls: [...] }
   - Si no → return { has_tool_calls: false, content_whatsapp: {...} }
   ↓
6. 🆕 Switch Node (Check Tool Calls)
   - Expression: {{ $json.has_tool_calls }}
   - Output 0 (TRUE) → Execute MCP Tool
   - Output 1 (FALSE) → Chatwoot/Odoo (flujo normal)
   ↓
7a. Execute MCP Tool (si TRUE)
    - HTTP POST a http://odoo_mcp:8100/internal/mcp/call-tool
    - Headers: X-Service-Token
    - Body: { tool: "...", arguments: {...} }
    ↓
8a. Process Tool Result
    - Actualiza state según tool ejecutado
    - Transitions de stage (qualify → proposal_ready)
    - Agrega metadata (odoo_meeting_id, last_tool_executed, etc)
    - 🔁 Loop back a LoadProfileAndState
    ↓
7b. Chatwoot/Odoo (si FALSE)
    - Envía mensaje a Chatwoot
    - Crea mail.message en Odoo
    - Actualiza Baserow
    - FIN
```

---

## 📝 Próximos Pasos (Para Implementar en n8n)

### ✅ Paso 1: Verificar que el código esté actualizado en VPS

```bash
# En VPS
cd /home/felix/leonobitech/backend/repositories/sales-agent
git pull origin main

cd /home/felix/leonobitech/backend/repositories/odoo-mcp
git pull origin main
make reset SERVICE=odoo_mcp
```

---

### ✅ Paso 2: Agregar los 3 nodos nuevos en n8n

**Instrucciones detalladas en**: `N8N-WORKFLOW-NODES.md`

1. **Switch Node** - "Check Tool Calls"
   - Después de OUTPUT-MAIN-v2
   - Expression: `{{ $json.has_tool_calls }}`
   - 2 outputs: TRUE (tool execution), FALSE (flujo normal)

2. **HTTP Request Node** - "Execute MCP Tool"
   - Conectado a Switch Output 0
   - POST `http://odoo_mcp:8100/internal/mcp/call-tool`
   - Headers: `X-Service-Token`
   - Body: `{ tool: "{{ $json.tool_calls[0].name }}", arguments: {{ $json.tool_calls[0].arguments }} }`

3. **Code Node** - "Process Tool Result"
   - Después de Execute MCP Tool
   - JavaScript completo en `N8N-WORKFLOW-NODES.md` (sección 3)
   - Output conecta a LoadProfileAndState (LOOP)

---

### ⚠️ Paso 3: Agregar campo odoo_opportunity_id a Baserow

**Problema**: Los tools de Odoo requieren `opportunityId` (Odoo ID), pero actualmente solo tenemos `lead_id` (Baserow row_id).

**Solución Temporal**:
- Crear oportunidad manualmente en Odoo
- Agregar el ID a Baserow en una columna nueva

**Solución Permanente**:
1. Agregar campo `odoo_opportunity_id` (Number) en Baserow tabla Leads
2. Modificar ComposeProfile para incluir este campo
3. El LLM usará `profile.odoo_opportunity_id` al llamar tools

**Alternativa**: Usar tool `odoo_create_opportunity` primero si no existe el ID.

---

### ✅ Paso 4: Testing End-to-End

**Test Case**: Lead pide agendar demo

**Input del Usuario**:
```
"Hola! Me gustaría agendar una demo de Odoo CRM para mañana a las 3pm"
```

**Expected Behavior**:
1. Chat History Filter → agrega mensaje a history
2. INPUT-MAIN → fetch 11 tools desde MCP Server
3. Master Agent → detecta trigger phrase "agendar demo"
4. Master Agent → genera tool_call:
   ```json
   {
     "tool_calls": [{
       "name": "odoo_schedule_meeting",
       "arguments": {
         "opportunityId": 123,
         "title": "Demo Odoo CRM",
         "startDatetime": "2025-11-06 15:00:00",
         "duration": 1.0,
         "description": "Demo solicitada por Felix Figueroa"
       }
     }],
     "message": {
       "text": "¡Perfecto! Te agendé una demo para mañana 6 de noviembre a las 15:00. Te llegará confirmación por email."
     }
   }
   ```
5. OUTPUT-MAIN-v2 → detecta tool_calls → return { has_tool_calls: true, ... }
6. Switch → Output 0 (TRUE)
7. Execute MCP Tool → POST /internal/mcp/call-tool
8. Odoo MCP Server → ejecuta odoo_schedule_meeting
9. Odoo → crea meeting en calendario + envía invitación por email
10. Process Tool Result → actualiza state:
    - `state.odoo_meeting_id = 456`
    - `state.stage = "proposal_ready"`
    - `state.last_tool_executed = "odoo_schedule_meeting"`
11. Loop back a LoadProfileAndState
12. **Segunda Iteración**: Envía mensaje de confirmación a Chatwoot/Odoo

**Expected Logs**:
```
[InputMain] ✅ Fetched 11 MCP tools
[Master Agent] Tool call detected: odoo_schedule_meeting
[OutputMain] 🔧 Tool calls detected! LLM wants to execute Odoo actions.
[OutputMain] Tools to execute: odoo_schedule_meeting
[MCP Server] Calling tool: odoo_schedule_meeting
[MCP Server] Tool executed successfully
[ProcessToolResult] ✅ Meeting scheduled: 456
[ProcessToolResult] Stage updated: qualify → proposal_ready
```

---

## 🔐 Security Considerations

- ✅ Service Token authentication (header-based)
- ✅ Token hardcoded en .env (VPS) y n8n nodes (local)
- ✅ Docker internal network (no exposición externa)
- ✅ Service account Odoo con permisos limitados
- ⚠️ **NOTA**: No exponer `/internal/mcp` endpoints públicamente (solo acceso interno desde n8n_main)

---

## 📚 Referencias

**Código Backend**:
- [internal-mcp.ts](../odoo-mcp/src/routes/internal-mcp.ts) - Internal MCP router
- [INPUT-MAIN.js](./INPUT-MAIN.js#L234-L261) - Fetch MCP tools
- [OUTPUT-MAIN-v2.js](./OUTPUT-MAIN-v2.js#L73-L96) - Detect tool_calls
- [SYSTEM-PROMPT.md](./SYSTEM-PROMPT.md#L285-L551) - LLM instructions

**Documentación**:
- [INTERNAL-MCP-API.md](../odoo-mcp/INTERNAL-MCP-API.md) - API reference
- [MCP-INTEGRATION-GUIDE.md](./MCP-INTEGRATION-GUIDE.md) - Implementation guide
- [MCP-INTEGRATION-SUMMARY.md](./MCP-INTEGRATION-SUMMARY.md) - Executive summary
- [N8N-WORKFLOW-NODES.md](./N8N-WORKFLOW-NODES.md) - n8n configuration

**Tools Disponibles**:
```
CRM (4): get_leads, create_opportunity, update_opportunity, move_stage
Calendar (2): schedule_meeting, list_meetings
Email (2): send_email, send_commercial_proposal
Contacts (1): get_contact
Activities (2): create_activity, list_activities
```

---

## 🎉 Estado Final

**Backend**: ✅ COMPLETO Y FUNCIONAL

- Endpoints creados y probados
- Authentication configurada
- Service account Odoo conectado
- Tools registry accesible

**Sales Agent Code**: ✅ COMPLETO Y LISTO

- INPUT-MAIN.js fetch tools correctamente
- OUTPUT-MAIN-v2.js detecta tool_calls
- SYSTEM-PROMPT.md con instrucciones LLM

**Documentación**: ✅ COMPLETA

- 5 documentos (1970+ líneas)
- Guías paso a paso
- Test cases
- Troubleshooting

**Pendiente en n8n**: ⏳ 3 NODOS POR AGREGAR

- Switch (Check Tool Calls)
- HTTP Request (Execute MCP Tool)
- Code (Process Tool Result)

**Tiempo estimado de implementación en n8n**: 30-45 minutos

---

**Felix, ahora tienes todo listo para agregar los 3 nodos en n8n siguiendo la guía N8N-WORKFLOW-NODES.md. ¿Quieres que te ayude con algo más antes de implementar?**

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
