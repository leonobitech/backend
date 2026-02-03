# Configurar odoo_schedule_meeting en n8n

Guía para agregar la herramienta `odoo_schedule_meeting` al Master AI Agent en n8n.

---

## 📋 Prerequisitos

✅ Conector odoo-mcp modificado para aceptar formato nativo de n8n (COMPLETADO)
✅ Tool `odoo_schedule_meeting` ya implementada en el conector
✅ Endpoint `/internal/mcp/call-tool` funcionando

---

## 🔧 Paso 1: Configurar la Tool en n8n AI Agent

### 1.1 Abrir el workflow "Master AI Agent Main"

En n8n, abre el workflow donde está configurado el nodo **"Master AI Agent Main"**.

### 1.2 Editar el nodo AI Agent

1. Click en el nodo **"Master AI Agent Main"**
2. En la sección **"Tools"**, click en **"Add Tool"**
3. Seleccionar **"Basic LLM Chain"** o **"Workflow Tool"**

### 1.3 Configurar la Tool

**Nombre de la tool:**
```
odoo_schedule_meeting
```

**Descripción:**
```
Schedule a meeting/demo in Odoo calendar linked to a sales opportunity. Use this when the user requests to schedule a demo, meeting, or call. Automatically moves the opportunity to Proposition stage and sends calendar invite.
```

**Schema (JSON Schema para los parámetros):**
```json
{
  "type": "object",
  "properties": {
    "opportunityId": {
      "type": "number",
      "description": "ID of the opportunity in Odoo (from state.lead_id or profile.lead_id)"
    },
    "title": {
      "type": "string",
      "description": "Meeting title (e.g., 'Demo Odoo CRM - Restaurante Felix')"
    },
    "startDatetime": {
      "type": "string",
      "description": "Start date and time in format YYYY-MM-DD HH:MM:SS (e.g., '2025-11-20 15:00:00')"
    },
    "durationHours": {
      "type": "number",
      "description": "Duration in hours (default: 1). Use 0.5 for 30 minutes, 1.5 for 90 minutes"
    },
    "description": {
      "type": "string",
      "description": "Meeting description/agenda (optional)"
    },
    "location": {
      "type": "string",
      "description": "Meeting location (e.g., 'Google Meet', 'Zoom', 'Office')"
    }
  },
  "required": ["opportunityId", "title", "startDatetime"]
}
```

---

## 🔄 Paso 2: Crear el Subworkflow

### 2.1 Crear nuevo workflow

1. En n8n, crear un nuevo workflow
2. Nombre: **"Odoo_Schedule_Meeting"**

### 2.2 Configurar el nodo "Execute Workflow Trigger"

**Configuración:**
- **Activar** el trigger
- **Nombre**: "When called by another workflow"

### 2.3 Agregar nodo HTTP Request

**Configuración del nodo:**

- **Method**: POST
- **URL**: `http://odoo_mcp:8100/internal/mcp/call-tool`
- **Authentication**: None (usamos header custom)
- **Headers**:
  ```
  X-Service-Token: {{$env.ODOO_MCP_SERVICE_TOKEN}}
  Content-Type: application/json
  ```
- **Body**: Raw (application/json)
  ```json
  {{ $json }}
  ```

**⚠️ IMPORTANTE**:
- **NO uses nodo Code para parsear**
- **NO transformes el JSON**
- El conector ahora recibe el formato nativo de n8n directamente

### 2.4 Conectar los nodos

```
Execute Workflow Trigger → HTTP Request → Output
```

### 2.5 Guardar el workflow

Guardar y activar el workflow "Odoo_Schedule_Meeting".

---

## 🔗 Paso 3: Conectar la Tool al Subworkflow

### 3.1 Volver al workflow "Master AI Agent Main"

### 3.2 En la configuración de la tool `odoo_schedule_meeting`

- **Workflow to execute**: Seleccionar **"Odoo_Schedule_Meeting"**
- **Pass input data**: ✅ Activado

---

## ✅ Paso 4: Actualizar el System Prompt

Ya está actualizado en [SYSTEM-PROMPT-V5.md](SYSTEM-PROMPT-V5.md#L462-L468):

```markdown
**2. Scheduling Demos (`odoo_schedule_meeting`)**

✅ **MUST CALL** when:
- User requests demo ("quiero una demo", "agendame una reunión")
- AND `state.email` is populated
- AND `state.business_name !== null`
- AND `state.business_type !== null`
```

**La LLM ya sabe cómo y cuándo llamar esta tool.**

---

## 🧪 Paso 5: Probar la Funcionalidad

### 5.1 Test manual en n8n

1. Ejecutar manualmente el subworkflow "Odoo_Schedule_Meeting"
2. En el nodo "Execute Workflow Trigger", usar este JSON de prueba:

```json
{
  "query": "{\"opportunityId\":74,\"title\":\"Demo Process Automation - Felix Figueroa\",\"startDatetime\":\"2025-11-20 15:00:00\",\"durationHours\":0.5,\"description\":\"Demo de Odoo CRM y automatización de procesos\",\"location\":\"Google Meet\"}"
}
```

3. Verificar que el HTTP Request retorna:
```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "data": {
    "eventId": 456,
    "message": "Meeting \"Demo Process Automation - Felix Figueroa\" scheduled successfully"
  }
}
```

### 5.2 Test desde conversación

Simulación de conversación:

**Usuario:** "Quiero agendar una demo"
**LLM:** (verifica fields) → si tiene email, business_name, business_type → llama tool
**n8n:** intercepta → ejecuta subworkflow → llama conector
**Conector:** parsea, infiere tool, ejecuta, retorna resultado
**LLM:** "✅ Perfecto Felix! Te agendé la demo para el miércoles 20 de noviembre a las 15:00hs (Google Meet)."

---

## 🛠️ Troubleshooting

### Error: "tool_not_found"

**Causa**: El conector no pudo inferir el nombre de la tool desde los argumentos.

**Solución**: Verificar que el JSON contenga `startDatetime` o `title` (campos únicos de schedule_meeting).

### Error: "invalid_query_format"

**Causa**: El JSON en `query` está malformado.

**Solución**: Verificar que el LLM genera JSON válido. Ver logs del conector.

### Error: "Stage 'Demo Scheduled' not found in Odoo"

**Causa**: El stage de Odoo no está configurado.

**Solución**: Verificar en Odoo CRM que existan los stages necesarios.

### Error: "Conflictos detectados al agendar la reunión"

**Causa**: El horario solicitado tiene conflictos en el calendario.

**Respuesta del conector**:
```json
{
  "message": "Conflictos detectados al agendar la reunión",
  "conflict": {
    "conflicts": [...],
    "availableSlots": [
      { "start": "2025-11-20 16:00:00", "end": "2025-11-20 17:00:00" }
    ]
  }
}
```

**Acción**: La LLM debe ofrecer horarios alternativos al usuario.

---

## 📊 Logs útiles

**En el conector** (`docker logs odoo_mcp -f`):

```
[InternalMCP] Detected n8n AI Agent native format
[InternalMCP] Parsed n8n native format
  inferredTool: "odoo_schedule_meeting"
  hasOpportunityId: true
  argumentKeys: ["opportunityId", "title", "startDatetime", "durationHours", "location"]
[InternalMCP] Calling tool
[InternalMCP] Tool executed successfully
```

---

## 🎯 Resumen

| Componente | Estado | Acción |
|------------|--------|--------|
| Tool en conector | ✅ Implementada | Ninguna |
| Endpoint `/internal/mcp/call-tool` | ✅ Modificado | Ninguna |
| Detección automática de tool | ✅ Funcionando | Ninguna |
| Subworkflow n8n | ⏳ Por crear | Seguir Paso 2 |
| Configuración AI Agent | ⏳ Por configurar | Seguir Paso 1 |
| System Prompt | ✅ Actualizado | Ninguna |

**Ventaja de esta arquitectura:**

- ✅ **1 subworkflow** = 2 líneas de config (trigger + HTTP request)
- ✅ **Sin parsers hardcodeados** para cada tool
- ✅ **Escalable**: Agregar las otras 9 tools es igual de simple
- ✅ **Formato único**: El conector maneja la inferencia automática

---

## 📚 Referencias

- Schema completo: [schedule-meeting.schema.ts](../../odoo-mcp/src/tools/odoo/calendar/schedule-meeting/schedule-meeting.schema.ts)
- Tool implementation: [schedule-meeting.tool.ts](../../odoo-mcp/src/tools/odoo/calendar/schedule-meeting/schedule-meeting.tool.ts)
- Endpoint interno: [internal-mcp.ts](../../odoo-mcp/src/routes/internal-mcp.ts)
- System Prompt: [SYSTEM-PROMPT-V5.md](SYSTEM-PROMPT-V5.md)
