# Leraysi - Webhook Pago Confirmado

## Flujo Completo

```
MercadoPago → Odoo Webhook → n8n Workflow → MCP Tool → Odoo/Email/Calendar
                                          ↓
                                    Baserow Update
                                          ↓
                                    WhatsApp (Chatwoot)
```

## Configuración Requerida

### 1. Variables de Entorno en Odoo

Configurar en **Settings → Technical → Parameters → System Parameters**:

| Key | Descripción | Ejemplo |
|-----|-------------|---------|
| `salon_turnos.n8n_webhook_url` | URL del webhook n8n | `https://n8n.leonobitech.com/webhook/leraysi-pago-confirmado` |
| `salon_turnos.n8n_webhook_secret` | Secret compartido (opcional) | `mi_secret_seguro_123` |
| `salon_turnos.mp_access_token` | Token de MercadoPago | `APP_USR-xxx` |
| `salon_turnos.mp_webhook_secret` | Secret del webhook MP (solo V2) | `xxx` |

### 2. Variables de Entorno en n8n

Configurar en n8n Settings → Variables:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `ODOO_MCP_URL` | URL base del servidor MCP | `https://mcp.leonobitech.com` |
| `BASEROW_API_URL` | URL de Baserow | `https://baserow.leonobitech.com` |
| `BASEROW_TURNOS_TABLE_ID` | ID de tabla de turnos | `123` |
| `CHATWOOT_API_URL` | URL de Chatwoot | `https://chatwoot.leonobitech.com` |
| `CHATWOOT_ACCOUNT_ID` | ID de cuenta Chatwoot | `1` |

### 3. Credenciales en n8n

Crear las siguientes credenciales tipo **HTTP Header Auth**:

#### MCP Service Token
- **Name**: `MCP Service Token`
- **Header Name**: `X-Service-Token`
- **Header Value**: (valor de `SERVICE_TOKEN` en odoo-mcp/.env)

#### Baserow API Token
- **Name**: `Baserow API Token`
- **Header Name**: `Authorization`
- **Header Value**: `Token YOUR_BASEROW_TOKEN`

#### Chatwoot API Token
- **Name**: `Chatwoot API Token`
- **Header Name**: `api_access_token`
- **Header Value**: `YOUR_CHATWOOT_ACCESS_TOKEN`

### 4. Variables en odoo-mcp/.env

```env
# Service Account for n8n
SERVICE_TOKEN=tu_token_seguro_de_32_caracteres_minimo
ODOO_SERVICE_URL=https://odoo.leonobitech.com
ODOO_SERVICE_DB=leraysi_prod
ODOO_SERVICE_USER=admin@leraysi.com
ODOO_SERVICE_API_KEY=tu_api_key_de_odoo
```

## Importar Workflow

1. Abrir n8n → Workflows → Import
2. Seleccionar archivo `leraysi-webhook-pago-confirmado.json`
3. Configurar credenciales en cada nodo HTTP Request
4. Activar el workflow

## Datos Recibidos del Webhook

El webhook de Odoo envía este payload:

```json
{
  "event": "payment_confirmed",
  "turno": {
    "id": 123,
    "clienta": "María García",
    "telefono": "+5491155551234",
    "email": "maria@email.com",
    "servicio": "tintura",
    "servicio_detalle": "Tintura completa con matizador",
    "fecha_hora": "2026-01-25T14:00:00",
    "duracion": 2,
    "precio": 15000,
    "sena": 4500,
    "monto_restante": 10500
  },
  "payment": {
    "mp_payment_id": "142207512959",
    "status": "approved",
    "status_detail": "accredited",
    "payer_email": "payer@email.com"
  }
}
```

## MCP Tool Response

La tool `leraysi_confirmar_pago_completo` retorna:

```json
{
  "success": true,
  "tool": "leraysi_confirmar_pago_completo",
  "data": {
    "success": true,
    "turno": {
      "id": 123,
      "clienta": "María García",
      "servicio": "tintura",
      "fecha_hora": "2026-01-25T14:00:00",
      "estado": "confirmado"
    },
    "partner_id": 456,
    "event_id": 789,
    "activity_id": 101,
    "invoice_id": 202,
    "invoice_name": "INV/2026/0001",
    "invoice_pdf_base64": "JVBERi0xLjQK...",
    "mensaje_whatsapp": "*Pago recibido!*\n\nHola María García!...",
    "message": "Pago confirmado exitosamente para María García..."
  }
}
```

## Troubleshooting

### Error: "Missing X-Service-Token header"
- Verificar que la credencial `MCP Service Token` está configurada
- Verificar que el header es `X-Service-Token` (case sensitive)

### Error: "Invalid X-Service-Token"
- Verificar que el token en n8n coincide con `SERVICE_TOKEN` en odoo-mcp/.env
- Reiniciar el servidor MCP después de cambiar el token

### Error: "Tool not found"
- Verificar que el servidor MCP tiene la tool registrada
- GET `{{ODOO_MCP_URL}}/internal/mcp/tools` para listar tools disponibles

### Webhook no llega a n8n
- Verificar `salon_turnos.n8n_webhook_url` en Odoo
- Revisar logs de Odoo: `docker logs odoo 2>&1 | grep n8n`
- El webhook de Odoo tiene timeout de 5 segundos (fire and forget)

## Testing

### Probar MCP Tool directamente

```bash
curl -X POST "https://mcp.leonobitech.com/internal/mcp/call-tool" \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: tu_token_aqui" \
  -d '{
    "tool": "leraysi_confirmar_pago_completo",
    "arguments": {
      "turno_id": 1,
      "mp_payment_id": "test_123",
      "lead_id": 1
    }
  }'
```

### Simular webhook desde Odoo

```bash
curl -X POST "https://n8n.leonobitech.com/webhook/leraysi-pago-confirmado" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: tu_secret_opcional" \
  -d '{
    "event": "payment_confirmed",
    "turno": {
      "id": 1,
      "clienta": "Test Cliente",
      "telefono": "+5491155551234",
      "email": "test@email.com",
      "servicio": "corte",
      "fecha_hora": "2026-01-25T14:00:00",
      "precio": 5000,
      "sena": 1500
    },
    "payment": {
      "mp_payment_id": "test_payment_123",
      "status": "approved"
    }
  }'
```
