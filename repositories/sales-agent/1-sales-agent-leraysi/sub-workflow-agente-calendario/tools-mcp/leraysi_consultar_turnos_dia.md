# leraysi_consultar_turnos_dia

## Workflow
- Trigger: When Executed by Another Workflow
- HTTP Request: POST http://odoo_mcp:8100/internal/mcp/call-tool

## Input Recibido (desde Agente Calendario)
```json
{
  "query": "{\"fecha\": \"2026-01-22\"}"
}
```

## Problema Actual
El HTTP Request envía `{{ $json }}` directamente, pero el MCP espera otra estructura.

**Lo que se envía:**
```json
{"query": "{\"fecha\": \"2026-01-22\"}"}
```

**Lo que el MCP espera:**
```json
{
  "tool": "leraysi_consultar_turnos_dia",
  "arguments": {
    "fecha": "2026-01-22"
  }
}
```

## Error
```
400 - {"error":"invalid_request","message":"Missing 'tool' or 'arguments' in request body"}
```

## Solución Propuesta
Agregar nodo Code para transformar:

```javascript
// Transform input for MCP
const input = $input.first().json;
const query = typeof input.query === 'string' ? JSON.parse(input.query) : input.query;

return [{
  json: {
    tool: "leraysi_consultar_turnos_dia",
    arguments: query
  }
}];
```

## Parámetros Esperados por MCP
- `fecha` (string): YYYY-MM-DD - requerido
- `estado` (string): opcional (pendiente_pago, confirmado, completado, cancelado, todos)
