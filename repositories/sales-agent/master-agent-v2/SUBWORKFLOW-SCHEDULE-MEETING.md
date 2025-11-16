# Crear Subworkflow Odoo_Schedule_Meeting

Guía rápida para crear el subworkflow en n8n (sin parser, formato nativo).

---

## 🚀 Pasos en n8n

### 1. Crear nuevo workflow

1. En n8n, click en **"New workflow"**
2. Nombre: `Odoo_Schedule_Meeting`

---

### 2. Agregar nodo "Execute Workflow Trigger"

**Configuración:**
- Arrastrar el nodo **"Execute Workflow Trigger"** al canvas
- **Activar** el trigger (switch ON)
- No requiere configuración adicional

---

### 3. Agregar nodo "HTTP Request"

**Configuración:**

#### Pestaña "Parameters":
- **Method**: `POST`
- **URL**: `http://odoo_mcp:8100/internal/mcp/call-tool`

#### Pestaña "Headers":
Click en **"Add Header"** (2 veces):

**Header 1:**
- **Name**: `X-Service-Token`
- **Value**: `{{$env.ODOO_MCP_SERVICE_TOKEN}}`

**Header 2:**
- **Name**: `Content-Type`
- **Value**: `application/json`

#### Pestaña "Body":
- **Body Content Type**: `JSON`
- **Specify Body**: `Using Fields Below`
- En el campo de texto, poner:
  ```
  {{ $json }}
  ```

**⚠️ IMPORTANTE:**
- NO uses Expression para el body, usa el modo JSON
- NO agregues ningún nodo Code para parsear
- Solo pasa `{{ $json }}` directamente

---

### 4. Conectar los nodos

```
[Execute Workflow Trigger] → [HTTP Request]
```

Arrastra la línea desde el trigger al HTTP Request.

---

### 5. Guardar y activar

1. Click en **"Save"** (arriba a la derecha)
2. **Activar** el workflow (toggle en la esquina superior derecha)

---

## ✅ Resultado esperado

El workflow debe verse así:

```
┌──────────────────────────────┐
│ Execute Workflow Trigger     │
│ When called by another       │
│ workflow                     │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│ HTTP Request                 │
│ POST /internal/mcp/call-tool │
│ Body: {{ $json }}            │
└──────────────────────────────┘
```

---

## 🧪 Probar el subworkflow

### Opción 1: Test manual en n8n

1. Click en el nodo **"Execute Workflow Trigger"**
2. Click en **"Test workflow"**
3. En el campo JSON, pegar:

```json
{
  "query": "{\"opportunityId\":74,\"title\":\"Demo Process Automation - Felix Figueroa\",\"startDatetime\":\"2025-11-20 15:00:00\",\"durationHours\":0.5,\"description\":\"Demo de Odoo CRM y automatización\",\"location\":\"Google Meet\"}"
}
```

4. Click en **"Execute workflow"**

### Resultado esperado:

El nodo HTTP Request debe retornar:

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

### Si hay error:

**Error 500**: Verificar que el conector odoo-mcp esté corriendo
**Error 401**: Verificar `ODOO_MCP_SERVICE_TOKEN` en variables de entorno
**Error 404**: Verificar URL del endpoint

---

## 🔗 Conectar con el AI Agent

Después de crear el subworkflow, ir al workflow principal **"Master AI Agent Main"**:

### 1. Editar el nodo AI Agent

1. Click en el nodo **"Master AI Agent Main"**
2. En la sección **"Tools"**, click **"Add Tool"**

### 2. Configurar la tool

**Name:**
```
odoo_schedule_meeting
```

**Description:**
```
Schedule a meeting/demo in Odoo calendar. Use when user requests demo or meeting. Moves opportunity to Proposition stage. Requires: opportunityId, title, startDatetime (YYYY-MM-DD HH:MM:SS). Optional: durationHours (default 1), location, description.
```

**Schema:**
```json
{
  "type": "object",
  "properties": {
    "opportunityId": {
      "type": "number",
      "description": "ID of the opportunity in Odoo (from profile.lead_id)"
    },
    "title": {
      "type": "string",
      "description": "Meeting title (e.g., 'Demo Odoo CRM - Restaurante Felix')"
    },
    "startDatetime": {
      "type": "string",
      "description": "Start datetime in format YYYY-MM-DD HH:MM:SS (e.g., '2025-11-20 15:00:00')"
    },
    "durationHours": {
      "type": "number",
      "description": "Duration in hours (0.5 = 30min, 1 = 1hour, 1.5 = 90min)"
    },
    "description": {
      "type": "string",
      "description": "Meeting description/agenda"
    },
    "location": {
      "type": "string",
      "description": "Location (Google Meet, Zoom, Office, etc.)"
    }
  },
  "required": ["opportunityId", "title", "startDatetime"]
}
```

**Workflow to execute:**
- Seleccionar: `Odoo_Schedule_Meeting`

**Pass input data:**
- ✅ Activado

### 3. Guardar

Click en **"Save"** para guardar el workflow principal.

---

## 📊 Verificar logs del conector

Para ver si el conector está procesando correctamente:

```bash
cd /Users/felix/leonobitech/backend/repositories/odoo-mcp
docker logs odoo_mcp -f
```

**Logs esperados:**

```
[InternalMCP] Detected n8n AI Agent native format
[InternalMCP] Parsed n8n native format
  inferredTool: "odoo_schedule_meeting"
  hasOpportunityId: true
  argumentKeys: ["opportunityId", "title", "startDatetime", "durationHours", "location", "description"]
[InternalMCP] Calling tool
  tool: "odoo_schedule_meeting"
  arguments: { opportunityId: 74, title: "...", startDatetime: "..." }
[InternalMCP] Tool executed successfully
  tool: "odoo_schedule_meeting"
  result: { eventId: 456, message: "..." }
```

---

## ✨ Listo!

Ahora cuando un usuario diga **"quiero agendar una demo"**, el flujo será:

1. **LLM** detecta intención de agendar
2. **LLM** verifica campos requeridos (email, business_name, business_type)
3. **LLM** llama `odoo_schedule_meeting` via function calling
4. **n8n** intercepta → ejecuta subworkflow `Odoo_Schedule_Meeting`
5. **Subworkflow** pasa `{{ $json }}` nativo al conector
6. **Conector** parsea, detecta tool, ejecuta en Odoo
7. **Odoo** crea evento en calendario + actualiza oportunidad
8. **LLM** recibe resultado → responde al usuario

**Ejemplo de respuesta:**
> "✅ Perfecto Felix! Te agendé la demo para el miércoles 20 de noviembre a las 15:00hs por Google Meet. Te llegará la invitación a tu email."

---

## 🎯 Resumen de cambios

| Componente | Estado |
|------------|--------|
| Conector odoo-mcp | ✅ Modificado (acepta formato nativo) |
| Subworkflow Odoo_Send_Email | ✅ Simplificado (sin parser) |
| Subworkflow Odoo_Schedule_Meeting | ⏳ Por crear (seguir esta guía) |
| Tool configurada en AI Agent | ⏳ Por configurar |
| System Prompt | ✅ Ya actualizado |

---

## 📚 Referencias

- Tool schema: [schedule-meeting.schema.ts](../../odoo-mcp/src/tools/odoo/calendar/schedule-meeting/schedule-meeting.schema.ts)
- Conector modificado: [internal-mcp.ts](../../odoo-mcp/src/routes/internal-mcp.ts#L107-L143)
- System Prompt: [SYSTEM-PROMPT-V5.md](SYSTEM-PROMPT-V5.md#L462-L468)
- Guía completa: [CONFIGURAR-SCHEDULE-MEETING-N8N.md](CONFIGURAR-SCHEDULE-MEETING-N8N.md)
