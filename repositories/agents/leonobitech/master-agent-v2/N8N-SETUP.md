# Configuracion de Nodos en n8n - MCP Integration

Guia paso a paso para agregar los nodos necesarios al workflow Sales Agent v2.0 en n8n.

---

## Resumen

Agregar 3 nodos nuevos al workflow:
1. **Switch Node**: Detecta si hay tool_calls
2. **Code Node**: Prepara el body dinamico para MCP
3. **HTTP Request Node**: Ejecuta la tool en el servidor MCP

---

## Paso 1: Agregar Switch Node

**Posicion**: Despues de `OUTPUT-MAIN-v2`

### Configuracion

**Nombre**: `Check Tool Calls`

**Mode**: Rules

**Rule 1**:
- Condition: `{{ $json.has_tool_calls }}` equals `true`
- Output: 0

**Fallback Output**: 1

### Conexiones

- **Output 0** (TRUE) → Prepare MCP Tool Call (nuevo nodo)
- **Output 1** (FALSE) → Send Message to Chatwoot (nodo existente)

---

## Paso 2: Agregar Code Node "Prepare MCP Tool Call"

**Posicion**: Despues de Switch Output 0

### Configuracion

**Nombre**: `Prepare MCP Tool Call`

**Type**: Code

**Mode**: Run Once for All Items

**Language**: JavaScript

**Code**: Copiar TODO el contenido de `master-agent-v2/PREPARE-MCP-TOOL-CALL.js`

(El archivo tiene ~130 lineas, copiar completo)

### Que hace este nodo

1. Extrae `tool_calls` del output del Master Agent
2. Parsea el `arguments` JSON string
3. Construye objeto `mcp_body` con formato correcto
4. Valida campos requeridos
5. Pass-through de todos los datos (profile, state, etc.)

### Output esperado

```json
{
  "mcp_body": {
    "tool": "odoo_send_email",
    "arguments": {
      "opportunityId": 34,
      "subject": "Propuesta Comercial",
      "emailTo": "felix@leonobitech.com",
      "templateType": "proposal",
      "templateData": { ... }
    }
  },
  "lead_id": 33,
  "profile": { ... },
  "state": { ... },
  "tool_name": "odoo_send_email"
}
```

---

## Paso 3: Agregar HTTP Request Node "Execute MCP Tool"

**Posicion**: Despues de Prepare MCP Tool Call

### Configuracion

**Nombre**: `Execute MCP Tool`

**Method**: `POST`

**URL**: `http://odoo_mcp:8100/internal/mcp/call-tool`

**Authentication**: None

**Send Body**: Yes

**Body Content Type**: JSON

**Specify Body**: Using Fields Below

**Body Parameters** (Expression mode):

⚠️ **MUY IMPORTANTE**: NO usar JSON mode. Usar "Expression" mode y poner:

```
={{ $json.mcp_body }}
```

Esto pasa el objeto completo que construyo el nodo anterior.

### Headers

Agregar 2 headers:

**Header 1**:
- Name: `X-Service-Token`
- Value: `aea35e37a04fc6aa26cbf8a2f8155beb4692c59cd6a68c4392165715e7bf4765f29e2c582dbdd6de6ad70827547513b7b36cfe0c176c8c74d03a75cc167c2d37`

**Header 2**:
- Name: `Content-Type`
- Value: `application/json`

### Response esperado

```json
{
  "success": true,
  "tool": "odoo_send_email",
  "result": {
    "mailId": 123,
    "message": "Email sent successfully to opportunity #34...",
    "recipient": "felix@leonobitech.com",
    "queueProcessed": true,
    "templateUsed": "proposal"
  }
}
```

---

## Paso 4: Conectar el flujo completo

Despues de `Execute MCP Tool`, conectar a:

**Por ahora**: `Send Message to Chatwoot` (flujo existente)

**Futuro** (TODO): Crear nodo "Process Tool Result" que:
- Actualice state con `proposal_offer_done: true`
- Construya mensaje de confirmacion
- Continue el flujo normal

---

## Verificacion

Antes de probar, verificar:

### 1. Archivos actualizados

- [x] `INPUT-MAIN.js` - Lines 234-261 (fetch MCP tools)
- [x] `OUTPUT-MAIN-v2.js` - Lines 77-96 (detecta tool_calls)
- [x] `SYSTEM-PROMPT.md` - Usa `profile.lead_id` (no odoo_opportunity_id)
- [x] `PREPARE-MCP-TOOL-CALL.js` - Codigo del nodo creado

### 2. Servidor MCP corriendo

En VPS, verificar que odoo_mcp esta UP:

```bash
docker ps | grep odoo_mcp
```

### 3. Baserow actualizado

Verificar que el lead de prueba tiene `lead_id = 34` (ID correcto en Odoo)

---

## Testing

### Test 1: Verificar que tools llegan al LLM

1. Enviar mensaje cualquiera al agente
2. Revisar execution de `INPUT-MAIN`
3. Verificar que `smart_input.tools` tiene 11 tools

### Test 2: Probar tool call completo

1. Enviar: "Mandame una propuesta por mail"
2. Expected flow:
   - Master Agent genera tool_call con `odoo_send_email`
   - OUTPUT-MAIN-v2 detecta `has_tool_calls: true`
   - Switch va a Output 0
   - Prepare MCP Tool Call construye mcp_body
   - HTTP Request ejecuta la tool
   - MCP Server envia email via Odoo
3. Verificar en Odoo que el email aparece en el chatter

---

## Troubleshooting

### Error: "JSON parameter needs to be valid JSON"

**Causa**: Estas usando JSON mode en el HTTP Request body

**Fix**: Cambiar a Expression mode y usar `={{ $json.mcp_body }}`

### Error: "tool not found"

**Causa**: El nombre de la tool no coincide

**Fix**: Verificar que `tool_name` es exactamente como aparece en `/internal/mcp/tools`

### Error: "opportunityId required"

**Causa**: El `lead_id` en Baserow es null o incorrecto

**Fix**:
1. Verificar que el lead tiene `lead_id` en Baserow
2. Verificar que ese ID existe en Odoo CRM

### Error: "Connection refused"

**Causa**: odoo_mcp no esta corriendo o no esta en la misma red

**Fix**:
```bash
docker ps | grep odoo_mcp
docker network inspect leonobitech-net | grep odoo_mcp
```

---

## Proximos pasos

Una vez que funcione el flujo basico:

1. Crear nodo "Process Tool Result"
2. Implementar loop back para multi-turn (tool result → INPUT-MAIN)
3. Agregar soporte para multiples tools en secuencia
4. Testing de todas las 11 tools disponibles

---

**Fecha**: 2025-01-03
**Version**: 1.0
