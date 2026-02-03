# Configuracion del Workflow MCP Server en n8n

Guia paso a paso para configurar el workflow "Odoo-MCP" que recibe tool calls del MCP Client y las ejecuta en el backend odoo_mcp:8100.

---

## Arquitectura

```
Sales Agent Workflow (MCP Client)
  ↓ tool call via MCP protocol
MCP Server Workflow (este workflow)
  ↓ HTTP POST
Backend odoo_mcp:8100 (/internal/mcp/call-tool)
  ↓ XML-RPC
Odoo CRM (acciones reales)
```

---

## Nodos Necesarios (3 nodos)

### 1. MCP Server Trigger
**Tipo**: `@n8n/n8n-nodes-langchain.mcpServerTrigger`

**Posicion**: Primer nodo del workflow

### 2. Code Node "MCP Server Proxy"
**Tipo**: `n8n-nodes-base.code`

**Posicion**: Despues del MCP Server Trigger

### 3. HTTP Request "Execute in Odoo MCP"
**Tipo**: `n8n-nodes-base.httpRequest`

**Posicion**: Despues del Code Node

---

## Paso 1: Configurar MCP Server Trigger

### Configuracion Basica

**Nombre del Nodo**: `MCP Server Trigger`

**Server Name**: `odoo-mcp` (o el nombre que quieras)

**Tools**: Agregar las 11 tools disponibles

### Lista de Tools a Agregar

Para cada tool, agregar con estos datos:

#### 1. odoo_send_email
- **Name**: `odoo_send_email`
- **Description**: `Send email with template to opportunity (auto-advances pipeline stage to "Proposal Sent")`
- **Schema**: Copiar de MCP backend (ver [INTERNAL-MCP-API.md](INTERNAL-MCP-API.md))

#### 2. odoo_schedule_meeting
- **Name**: `odoo_schedule_meeting`
- **Description**: `Schedule a meeting in Odoo calendar linked to an opportunity`
- **Schema**: Copiar de MCP backend

#### 3. odoo_update_deal_stage
- **Name**: `odoo_update_deal_stage`
- **Description**: `Update the stage of a CRM opportunity`
- **Schema**: Copiar de MCP backend

#### 4. odoo_get_leads
- **Name**: `odoo_get_leads`
- **Description**: `Fetch leads from Odoo CRM with filters`
- **Schema**: Copiar de MCP backend

#### 5. odoo_create_lead
- **Name**: `odoo_create_lead`
- **Description**: `Create a new lead in Odoo CRM`
- **Schema**: Copiar de MCP backend

#### 6. odoo_get_opportunities
- **Name**: `odoo_get_opportunities`
- **Description**: `Fetch opportunities from Odoo CRM pipeline`
- **Schema**: Copiar de MCP backend

#### 7. odoo_search_contacts
- **Name**: `odoo_search_contacts`
- **Description**: `Search contacts by name, email or phone`
- **Schema**: Copiar de MCP backend

#### 8. odoo_create_contact
- **Name**: `odoo_create_contact`
- **Description**: `Create a new contact in Odoo`
- **Schema**: Copiar de MCP backend

#### 9. odoo_get_sales_report
- **Name**: `odoo_get_sales_report`
- **Description**: `Generate sales report with metrics`
- **Schema**: Copiar de MCP backend

#### 10. odoo_create_activity
- **Name**: `odoo_create_activity`
- **Description**: `Schedule an activity (call, meeting, email, task)`
- **Schema**: Copiar de MCP backend

#### 11. odoo_get_deal_details
- **Name**: `odoo_get_deal_details`
- **Description**: `Get detailed information about a specific opportunity`
- **Schema**: Copiar de MCP backend

### Como Obtener los Schemas

**Opcion 1: Fetch desde el backend**

```bash
curl -H "X-Service-Token: aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37" \
  http://odoo_mcp:8100/internal/mcp/tools
```

**Opcion 2: Copiar desde el codigo**

Ver archivos en:
```
backend/repositories/odoo-mcp/src/tools/odoo/
├── calendar/
│   └── schedule-meeting/
│       ├── schedule-meeting.tool.ts
│       └── schedule-meeting.schema.ts  ← Aqui esta el schema
├── crm/
│   ├── create-lead/
│   ├── get-leads/
│   ├── get-opportunities/
│   └── update-deal-stage/
├── email/
│   └── send-email/
└── ...
```

### Ejemplo de Schema (odoo_send_email)

```json
{
  "type": "object",
  "properties": {
    "opportunityId": {
      "type": "number",
      "description": "Odoo CRM opportunity ID to link the email to"
    },
    "subject": {
      "type": "string",
      "description": "Email subject line"
    },
    "emailTo": {
      "type": "string",
      "description": "Recipient email address (overrides opportunity contact email)"
    },
    "templateType": {
      "type": "string",
      "enum": ["proposal", "demo", "followup", "welcome", "custom"],
      "description": "Type of email template to use"
    },
    "templateData": {
      "type": "object",
      "description": "Data to populate template variables"
    },
    "body": {
      "type": "string",
      "description": "Custom email body (used when templateType is 'custom')"
    }
  },
  "required": ["opportunityId", "subject"]
}
```

---

## Paso 2: Configurar Code Node "MCP Server Proxy"

### Configuracion

**Nombre del Nodo**: `MCP Server Proxy`

**Mode**: `Run Once for All Items`

**Language**: `JavaScript`

### Codigo

Copiar TODO el contenido de [MCP-SERVER-PROXY.js](./MCP-SERVER-PROXY.js) al campo de codigo.

### Que Hace Este Nodo

1. Extrae el `tool name` del input (soporta multiples formatos MCP)
2. Extrae los `arguments` del input
3. Construye objeto `{ tool: "...", arguments: {...} }` para el backend
4. Valida que existan los campos requeridos
5. Retorna el objeto formateado

### Output Esperado

```json
{
  "tool": "odoo_send_email",
  "arguments": {
    "opportunityId": 34,
    "subject": "Propuesta Comercial - Leonobitech",
    "emailTo": "felix@leonobitech.com",
    "templateType": "proposal",
    "templateData": {
      "customerName": "Felix Figueroa",
      "productName": "CRM + Odoo",
      "price": "USD 1200"
    }
  }
}
```

---

## Paso 3: Configurar HTTP Request "Execute in Odoo MCP"

### Configuracion Basica

**Nombre del Nodo**: `Execute in Odoo MCP`

**Method**: `POST`

**URL**: `http://odoo_mcp:8100/internal/mcp/call-tool`

**Authentication**: `None` (usa header X-Service-Token)

### Headers

Agregar 2 headers:

**Header 1**:
- **Name**: `X-Service-Token`
- **Value**: `aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37`

**Header 2**:
- **Name**: `Content-Type`
- **Value**: `application/json`

### Body

**Send Body**: `Yes`

**Body Content Type**: `JSON`

**Specify Body**: `Using Expression`

**Body (Expression mode)**:
```
={{ $json }}
```

Esto pasa el objeto completo que construyo el nodo anterior (`{ tool: "...", arguments: {...} }`).

### Response Esperado

**Exito**:
```json
{
  "success": true,
  "tool": "odoo_send_email",
  "result": {
    "mailId": 123,
    "message": "Email sent successfully to opportunity #34",
    "recipient": "felix@leonobitech.com",
    "queueProcessed": true,
    "templateUsed": "proposal"
  }
}
```

**Error**:
```json
{
  "error": "tool_execution_failed",
  "message": "Stage 'Demo Scheduled' not found in Odoo",
  "details": "..."
}
```

---

## Flujo Completo

```
1. Sales Agent Workflow
   ↓ MCP Client llama tool "odoo_send_email"

2. MCP Server Trigger (Odoo-MCP workflow)
   ↓ Recibe: { name: "odoo_send_email", input: {...} }

3. MCP Server Proxy (Code Node)
   ↓ Transforma a: { tool: "odoo_send_email", arguments: {...} }

4. HTTP Request
   ↓ POST http://odoo_mcp:8100/internal/mcp/call-tool

5. Backend odoo_mcp
   ↓ Ejecuta tool via OdooClient

6. Odoo CRM
   ↓ Envia email, actualiza stage, registra en chatter

7. Response
   ↓ Retorna resultado al MCP Client

8. Sales Agent Workflow
   ↓ Recibe resultado y continua conversacion
```

---

## Conexiones Entre Nodos

```
MCP Server Trigger
  ↓ (conectar output 0)
MCP Server Proxy (Code Node)
  ↓ (conectar output 0)
Execute in Odoo MCP (HTTP Request)
  ↓ (fin del workflow)
```

---

## Testing

### Test 1: Verificar que el MCP Server esta funcionando

1. Abrir workflow "Odoo-MCP" en n8n
2. Click en "Test workflow"
3. El MCP Server Trigger deberia estar esperando conexiones

### Test 2: Probar desde Sales Agent

1. Abrir workflow "Sales Agent v2.0"
2. Enviar mensaje: "Mandame una propuesta por mail"
3. El Master Agent deberia generar un `tool_call` con `odoo_send_email`
4. El MCP Client deberia enviar el tool call al MCP Server
5. Verificar ejecuciones del workflow Odoo-MCP

### Test 3: Verificar logs

**Backend odoo_mcp**:
```bash
docker logs -f odoo_mcp
```

**n8n**:
```bash
docker logs -f n8n
```

---

## Troubleshooting

### Error: "Tool not found"

**Causa**: El nombre de la tool en el MCP Server Trigger no coincide con el backend

**Fix**:
1. Verificar que el nombre es exactamente igual (case-sensitive)
2. Verificar que la tool existe en el backend: `GET /internal/mcp/tools`

### Error: "Missing X-Service-Token header"

**Causa**: El HTTP Request no esta enviando el header correctamente

**Fix**:
1. Verificar que el header `X-Service-Token` esta configurado
2. Verificar que el valor es el correcto (sin espacios extra)

### Error: "Invalid service token"

**Causa**: El token no coincide con el configurado en el backend (.env)

**Fix**:
1. Verificar que el token en n8n es igual al token en `backend/repositories/odoo-mcp/.env`
2. Si cambiaste el token, reiniciar el container odoo_mcp

### Error: "Connection refused"

**Causa**: El backend odoo_mcp no esta corriendo o no esta en la misma red Docker

**Fix**:
```bash
# Verificar que el container esta corriendo
docker ps | grep odoo_mcp

# Verificar que esta en la misma red
docker network inspect leonobitech-net | grep odoo_mcp
docker network inspect leonobitech-net | grep n8n
```

### Error: "JSON parameter needs to be valid JSON"

**Causa**: Estas usando JSON mode en el HTTP Request body en lugar de Expression mode

**Fix**:
1. Cambiar "Specify Body" a "Using Expression"
2. Usar `={{ $json }}` como body

---

## Proximos Pasos

Una vez que el workflow funcione:

1. **Process Tool Result**: Crear nodo para manejar la respuesta de la tool
   - Actualizar state con `proposal_offer_done: true`
   - Construir mensaje de confirmacion
   - Continuar el flujo del Sales Agent

2. **Multi-turn Support**: Implementar loop back para que el agente pueda ejecutar multiples tools en secuencia

3. **Error Handling**: Agregar nodos para manejar errores de ejecucion

4. **Testing Completo**: Probar todas las 11 tools disponibles

---

**Fecha**: 2025-01-03
**Version**: 1.0

