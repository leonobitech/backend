# Quick Start - MCP Integration

Guia rapida para configurar la integracion MCP en 10 minutos.

---

## Resumen

El agente de ventas ahora puede ejecutar acciones reales en Odoo (enviar emails, agendar reuniones, actualizar pipeline) mediante MCP tools.

**Arquitectura**:
```
Sales Agent Workflow
  ↓ MCP Client
MCP Server Workflow (Odoo-MCP)
  ↓ HTTP
Backend odoo_mcp:8100
  ↓ XML-RPC
Odoo CRM
```

---

## Prerequisitos

✅ Backend odoo_mcp corriendo en VPS (puerto 8100)
✅ Sales Agent v2.0 con INPUT-MAIN, OUTPUT-MAIN-v2 actualizados
✅ n8n con nodos MCP Client y MCP Server Trigger disponibles

---

## Paso 1: Verificar Backend (2 min)

### En VPS:

```bash
# Verificar que el container esta corriendo
docker ps | grep odoo_mcp

# Verificar logs (deberia ver "Server listening on port 8100")
docker logs -f odoo_mcp

# Test endpoint tools
curl -H "X-Service-Token: aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37" \
  http://localhost:8100/internal/mcp/tools
```

**Expected response**:
```json
{
  "tools": [
    {
      "name": "odoo_send_email",
      "description": "Send email with template...",
      "inputSchema": {...}
    },
    ...
  ],
  "count": 11
}
```

Si falla: Rebuild container con el fix de MongoDB cleanup (ya esta en el codigo).

---

## Paso 2: Crear Workflow MCP Server en n8n (5 min)

### 2.1. Crear Nuevo Workflow

1. n8n → New Workflow
2. Nombre: "Odoo-MCP"

### 2.2. Agregar Nodo 1: MCP Server Trigger

**Tipo**: `@n8n/n8n-nodes-langchain.mcpServerTrigger`

**Config**:
- Server Name: `odoo-mcp`
- Tools: Agregar las 11 tools (ver lista abajo)

**Opcion Rapida**: Fetch tools desde backend:
```bash
curl -H "X-Service-Token: aea35e37..." http://odoo_mcp:8100/internal/mcp/tools
```

Copiar cada tool (name, description, inputSchema) al MCP Server Trigger.

**Lista de Tools**:
1. odoo_send_email
2. odoo_schedule_meeting
3. odoo_update_deal_stage
4. odoo_get_leads
5. odoo_create_lead
6. odoo_get_opportunities
7. odoo_search_contacts
8. odoo_create_contact
9. odoo_get_sales_report
10. odoo_create_activity
11. odoo_get_deal_details

### 2.3. Agregar Nodo 2: Code Node "MCP Server Proxy"

**Tipo**: `n8n-nodes-base.code`

**Config**:
- Mode: Run Once for All Items
- Language: JavaScript
- Code: Copiar TODO el contenido de `MCP-SERVER-PROXY.js`

### 2.4. Agregar Nodo 3: HTTP Request "Execute in Odoo MCP"

**Tipo**: `n8n-nodes-base.httpRequest`

**Config**:
- Method: POST
- URL: `http://odoo_mcp:8100/internal/mcp/call-tool`
- Authentication: None

**Headers**:
1. `X-Service-Token`: `aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37`
2. `Content-Type`: `application/json`

**Body**:
- Send Body: Yes
- Body Content Type: JSON
- Specify Body: Using Expression
- Body: `={{ $json }}`

### 2.5. Conectar Nodos

```
MCP Server Trigger
  ↓
MCP Server Proxy
  ↓
Execute in Odoo MCP
```

### 2.6. Guardar y Activar

1. Save workflow
2. Activate workflow (toggle ON)

---

## Paso 3: Conectar MCP Client al Sales Agent (3 min)

### 3.1. Abrir Sales Agent v2.0 Workflow

### 3.2. Agregar Switch Node despues de OUTPUT-MAIN-v2

**Tipo**: `n8n-nodes-base.switch`

**Config**:
- Mode: Rules
- Rule 1: `{{ $json.has_tool_calls }}` equals `true` → Output 0
- Fallback Output: 1

### 3.3. Agregar MCP Client Node

**Tipo**: `@n8n/n8n-nodes-langchain.mcpClient`

**Config**:
- Server Name: `odoo-mcp` (debe coincidir con el MCP Server Trigger)

**Conectar**:
- Switch Output 0 → MCP Client
- MCP Client → ? (TODO: Process Tool Result, por ahora dejar sin conectar)

### 3.4. Mantener Flujo Normal

- Switch Output 1 (Fallback) → Send Message to Chatwoot (flujo existente)

---

## Testing

### Test 1: Verificar que las tools llegan al LLM

1. Ejecutar Sales Agent workflow
2. Revisar logs de INPUT-MAIN
3. Buscar: `[InputMain] ✅ Fetched 11 MCP tools`

### Test 2: Probar tool call completo

1. Enviar mensaje: "Mandame una propuesta por mail"
2. Verificar en ejecuciones:
   - Master Agent genera `tool_calls` con `odoo_send_email`
   - OUTPUT-MAIN-v2 detecta `has_tool_calls: true`
   - Switch va a Output 0
   - MCP Client envia tool call al MCP Server workflow
3. Verificar ejecuciones del workflow "Odoo-MCP":
   - MCP Server Trigger recibe tool call
   - MCP Server Proxy construye body
   - HTTP Request ejecuta POST a odoo_mcp:8100
4. Verificar en Odoo:
   - Email aparece en el chatter de la oportunidad
   - Stage actualizado a "Proposal Sent"

---

## Troubleshooting Rapido

### "No se conecta al MCP Server"

**Fix**: Verificar que:
1. El workflow "Odoo-MCP" esta activado (toggle ON)
2. El Server Name en MCP Client y MCP Server Trigger coinciden exactamente

### "Tool not found"

**Fix**: Verificar que el nombre de la tool en el MCP Server Trigger es exactamente igual al backend (case-sensitive).

### "Invalid service token"

**Fix**: Copiar el token correcto desde `backend/repositories/odoo-mcp/.env` (variable `SERVICE_TOKEN`).

### "Connection refused to odoo_mcp:8100"

**Fix**:
```bash
# Verificar que el container esta en la misma red
docker network inspect leonobitech-net | grep odoo_mcp
docker network inspect leonobitech-net | grep n8n

# Si no estan en la misma red, agregar:
docker network connect leonobitech-net odoo_mcp
docker network connect leonobitech-net n8n
```

---

## Proximos Pasos

1. **Process Tool Result**: Crear nodo para manejar la respuesta del MCP Server
2. **Loop Back**: Implementar flujo para que el agente continue despues de ejecutar tool
3. **Error Handling**: Agregar nodos para errores
4. **Testing Completo**: Probar las 11 tools

---

## Referencias Completas

- [MCP-SERVER-WORKFLOW-SETUP.md](./MCP-SERVER-WORKFLOW-SETUP.md) - Setup detallado paso a paso
- [README.md](./README.md) - Seccion 7: MCP Integration (explicacion completa)
- [INTERNAL-MCP-API.md](../../odoo-mcp/INTERNAL-MCP-API.md) - Documentacion de endpoints backend

---

**Fecha**: 2025-01-03
**Tiempo estimado**: 10 minutos
**Version**: 1.0

