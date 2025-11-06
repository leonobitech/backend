# Configuración del Nodo HTTP para MCP Connector

## Problema Actual

El nodo HTTP está enviando esto:
```json
{
  "tool": "odoo_send_email",
  "arguments": [object Object]  // ❌ NO SERIALIZADO
}
```

Necesitamos que envíe esto:
```json
{
  "tool": "odoo_send_email",
  "arguments": {
    "opportunityId": 43,
    "subject": "Propuesta Comercial",
    "templateType": "proposal",
    "templateData": { ... },
    "emailTo": "user@example.com"
  }
}
```

---

## Solución: Configurar el Nodo HTTP Correctamente

### Paso 1: Configuración del Nodo HTTP `odoo_send_email`

**Parameters**:
- **Method**: `POST`
- **URL**: `http://odoo_mcp:8100/internal/mcp/call-tool`

**Authentication**:
- **Type**: Header Auth
- **Credential**: `odoo-mcp` (con `X-Service-Token` configurado)

**Send Body**:
- ✅ **Activado**

**Body Content Type**:
- Seleccionar: `JSON`

**Specify Body**:
- Seleccionar: `Using JSON`

**JSON Field** - ⚠️ **CRÍTICO**:
1. Cambiar el dropdown de **Fixed** a **Expression**
2. En el campo de expression poner:

```javascript
{{ $json }}
```

**⚠️ IMPORTANTE**: NO poner `{{ $json.arguments }}` ni `{{ $input.item.json }}`, solo `{{ $json }}`

---

## ¿Por Qué Funciona?

### Con Fixed (modo JSON normal):
- n8n intenta serializar el objeto manualmente
- Falla en objetos anidados y los convierte a `[object Object]`
- Resultado: `{ "arguments": [object Object] }` ❌

### Con Expression `{{ $json }}`:
- n8n toma el output completo del nodo anterior (Code)
- Lo serializa automáticamente usando JSON.stringify()
- Mantiene toda la estructura anidada correctamente ✅

---

## Flujo Completo del Sub-Workflow

```
┌─────────────────────────────────────────┐
│ When Executed by Another Workflow      │
│ (trigger desde MCP Server Trigger)     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ Input Schema                            │
│ - Valida estructura del JSON            │
│ - Asegura que templateType existe       │
│ Output: $json (argumentos validados)    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ Code in JavaScript                      │
│ const args = $input.item.json;          │
│ return {                                │
│   json: {                               │
│     tool: "odoo_send_email",            │
│     arguments: args                     │
│   }                                     │
│ };                                      │
│ Output: $json (payload completo)        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ odoo_send_email (HTTP Request)          │
│ - Method: POST                          │
│ - URL: http://odoo_mcp:8100/...         │
│ - JSON Field: {{ $json }} (Expression!) │
│ Output: $json (response del connector)  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ Return (opcional)                       │
│ - Devuelve $json al MCP Server Trigger  │
└─────────────────────────────────────────┘
```

---

## Testing

### Verificar que el payload llegue correctamente:

1. **En el VPS**, monitorear logs:
```bash
docker logs odoo_mcp --tail 100 -f
```

2. **Ejecutar el workflow** desde n8n (trigger manual o desde Agent)

3. **Buscar en los logs** el mensaje:
```
[InternalMCP] Received tool call request {
  body: {
    tool: 'odoo_send_email',
    arguments: {
      opportunityId: 43,
      subject: 'Propuesta Comercial',
      templateType: 'proposal',
      templateData: { ... },
      emailTo: 'user@example.com'
    }
  }
}
```

4. **Si ves `[object Object]` en los logs**, el JSON field NO está configurado como Expression

---

## Troubleshooting

### ❌ Error: `[object Object]` en el body

**Causa**: JSON field configurado como Fixed

**Solución**: Cambiar a Expression con `{{ $json }}`

### ❌ Error: "Either templateType or body must be provided"

**Causa**: Input Schema no validó correctamente los argumentos, falta `templateType`

**Solución**: Verificar que el Input Schema tenga el ejemplo correcto con `templateType: "proposal"`

### ❌ Error: "Invalid or missing service token"

**Causa**: Credencial `odoo-mcp` no configurada o `X-Service-Token` incorrecto

**Solución**:
1. Ir a Credentials en n8n
2. Verificar que `odoo-mcp` tenga:
   - **Name**: `X-Service-Token`
   - **Value**: `leonobit2025-odoo-mcp-token` (del .env)

### ❌ Error: Network timeout o connection refused

**Causa**: Servicios no están en la misma red Docker

**Solución**: Verificar `docker compose ps` - ambos deben estar en `backend_leonobitech-net`

---

## Referencias

- Input Schema Example: `INPUT-SCHEMA-odoo_send_email.json`
- Code Node: `CODE-NODE-odoo_send_email.js`
- MCP Connector: `/Users/felix/leonobitech/backend/repositories/odoo-mcp`
- Dual Auth Middleware: `src/middlewares/dual-auth.middleware.ts`
