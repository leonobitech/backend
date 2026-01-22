# COMPLETADO: Integrar `leraysi_confirmar_pago_completo` con Webhook de Odoo

## Estado: IMPLEMENTADO (2026-01-22)

## Contexto

Flujo actual cuando llega un pago confirmado de MercadoPago:
1. Odoo recibe el webhook y actualiza el turno (`sena_pagada=true`, `estado=confirmado`)
2. **NUEVO:** Odoo llama al MCP (`leraysi_confirmar_pago_completo`) para ejecutar proceso completo
3. Odoo envía webhook a n8n con datos enriquecidos
4. n8n actualiza Baserow y envía WhatsApp

---

## La Tool Ya Existe

**Archivo:** `src/tools/odoo/leraysi/confirmar-pago-completo/confirmar-pago-completo.tool.ts`

**Ejecuta:**
1. ✅ Confirmar turno (estado=confirmado, sena_pagada=true)
2. ✅ Crear contacto en `res.partner` (si no existe)
3. ✅ Vincular contacto al Lead `crm.lead`
4. ✅ Registrar en chatter del Lead
5. ✅ Mover Lead a "Calificado"
6. ✅ Crear evento en `calendar.event`
7. ✅ Crear actividad vinculada
8. ✅ Crear factura en `account.move`
9. ✅ Generar PDF de factura (reporte nativo Odoo)
10. ✅ Enviar email con factura adjunta
11. ✅ Construir mensaje para WhatsApp

**Input requerido:**
```typescript
{
  turno_id: number,      // ID del turno en Odoo
  mp_payment_id: string, // ID del pago MP
  lead_id: number,       // ID del Lead CRM  <-- PROBLEMA: no existe en salon.turno
  conversation_id?: number,
  email_override?: string
}
```

---

## Tareas Completadas

### 1. ✅ Agregar `lead_id` al modelo `salon.turno`

**Archivo:** `backend/repositories/odoo/addons/salon_turnos/models/salon_turno.py`

```python
# Relación con CRM
lead_id = fields.Many2one(
    'crm.lead',
    string='Oportunidad',
    ondelete='set null',
    tracking=True,
    help='Lead/Oportunidad asociada en el CRM',
)
```

### 2. ✅ Actualizar `api_crear_turno` para aceptar `lead_id`

Se actualizo para recibir `lead_id` y pasarlo al crear el turno.

### 3. ✅ Actualizar `_to_dict` para incluir `lead_id`

El método ahora retorna `lead_id` en el diccionario.

### 4. ✅ Actualizar `leraysi_crear_turno` tool

**Archivos actualizados:**
- `crear-turno.schema.ts` - Agregado `lead_id` al schema Zod
- `crear-turno.tool.ts` - Agregado `lead_id` a valores y al inputSchema

### 5. ✅ Modificar webhook para llamar al MCP

**Archivo:** `backend/repositories/odoo/addons/salon_turnos/controllers/mercadopago_webhook.py`

Se agregó el método `_call_mcp_confirmar_pago` que:
1. Lee parámetros `salon_turnos.mcp_url` y `salon_turnos.mcp_service_token`
2. Llama a `leraysi_confirmar_pago_completo` vía HTTP POST
3. Pasa resultado enriquecido a `_notify_n8n_payment_confirmed`

---

## ⚠️ Configuración Pendiente en Odoo

### Agregar parámetros de sistema en Odoo

En **Odoo > Ajustes > Técnico > Parámetros del Sistema**, agregar:

| Clave | Valor | Descripción |
|-------|-------|-------------|
| `salon_turnos.mcp_url` | `http://odoo_mcp:8100` | URL del servidor MCP (nombre del container Docker + puerto interno) |
| `salon_turnos.mcp_service_token` | `<token>` | Token del MCP (ver `.env` del odoo-mcp) |

**Nota:** El token se configura en `backend/repositories/odoo-mcp/.env` como `SERVICE_TOKEN`

---

## Flujo Implementado

```
MercadoPago → POST /salon_turnos/webhook/mercadopago
                    ↓
              _process_payment_notification()
              - Valida pago con API de MP
              - Actualiza turno (estado=confirmado)
                    ↓
              _call_mcp_confirmar_pago()
              POST /internal/mcp/call-tool
              X-Service-Token: <token>
                    ↓
              MCP ejecuta leraysi_confirmar_pago_completo:
              ✓ Crea contacto (res.partner)
              ✓ Vincula contacto a Lead
              ✓ Mueve Lead a "Calificado"
              ✓ Crea evento en calendario
              ✓ Crea factura (account.move)
              ✓ Genera PDF de factura
              ✓ Envía email con PDF adjunto
                    ↓
              Retorna resultado a Odoo (mcp_result)
                    ↓
              _notify_n8n_payment_confirmed()
              POST <n8n_webhook_url>
              Incluye: turno, payment, mcp (datos enriquecidos)
                    ↓
              n8n actualiza Baserow y envía WhatsApp
```

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `backend/repositories/odoo/addons/salon_turnos/models/salon_turno.py` | ✅ Agregado `lead_id`, actualizado `api_crear_turno` y `_to_dict` |
| `backend/repositories/odoo/addons/salon_turnos/controllers/mercadopago_webhook.py` | ✅ Agregado `_call_mcp_confirmar_pago`, actualizado `_notify_n8n_payment_confirmed` |
| `backend/repositories/odoo-mcp/src/tools/odoo/leraysi/crear-turno/crear-turno.tool.ts` | ✅ Agregado `lead_id` a values e inputSchema |
| `backend/repositories/odoo-mcp/src/tools/odoo/leraysi/crear-turno/crear-turno.schema.ts` | ✅ Agregado `lead_id` al schema Zod |

---

## Notas Técnicas

- El MCP endpoint `/internal/mcp/call-tool` está funcionando
- La autenticación es via header `X-Service-Token`
- La tool `leraysi_confirmar_pago_completo` está completa y testeada
- El campo `lead_id` ha sido agregado y conecta todo el flujo

---

## Historial

- **2026-01-22 ~01:00** - Documentación inicial del TODO
- **2026-01-22 ~03:00** - Implementación completada:
  - Agregado `lead_id` al modelo `salon.turno`
  - Actualizado `api_crear_turno` y `_to_dict`
  - Actualizado `crear-turno.tool.ts` y schema
  - Agregado `_call_mcp_confirmar_pago` al webhook
