# TODO: Integrar `leraysi_confirmar_pago_completo` con Webhook de Odoo

## Contexto

Actualmente cuando llega un pago confirmado de MercadoPago:
1. Odoo recibe el webhook y actualiza el turno (`sena_pagada=true`, `estado=confirmado`)
2. Odoo envía webhook a n8n con datos básicos
3. n8n actualiza Baserow y envía WhatsApp

**Objetivo:** Que Odoo llame a la tool `leraysi_confirmar_pago_completo` vía MCP para ejecutar todo el proceso post-pago en Odoo (contacto, factura, calendario, email) antes de notificar a n8n.

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

## Problema: Falta `lead_id` en `salon.turno`

El modelo `salon.turno` no tiene campo `lead_id`. La tool lo necesita para:
- Vincular contacto al Lead
- Mover Lead a "Calificado"
- Crear evento vinculado al Lead
- Postear en chatter del Lead

---

## Tareas Pendientes

### 1. Agregar `lead_id` al modelo `salon.turno`

**Archivo:** `backend/repositories/odoo/addons/salon_turnos/models/salon_turno.py`

```python
# Agregar después de la línea 29 (email)

# Relación con CRM
lead_id = fields.Many2one(
    'crm.lead',
    string='Oportunidad',
    ondelete='set null',
    tracking=True,
    help='Lead/Oportunidad asociada en el CRM',
)
```

### 2. Actualizar `api_crear_turno` para aceptar `lead_id`

**Archivo:** `backend/repositories/odoo/addons/salon_turnos/models/salon_turno.py`

En el método `api_crear_turno` (línea ~281), agregar `lead_id`:

```python
turno = self.create({
    'clienta': data['clienta'],
    # ... otros campos ...
    'lead_id': data.get('lead_id'),  # <-- Agregar
})
```

### 3. Actualizar `_to_dict` para incluir `lead_id`

**Archivo:** `backend/repositories/odoo/addons/salon_turnos/models/salon_turno.py`

En el método `_to_dict` (línea ~354), agregar:

```python
return {
    'id': self.id,
    # ... otros campos ...
    'lead_id': self.lead_id.id if self.lead_id else None,  # <-- Agregar
}
```

### 4. Actualizar `leraysi_crear_turno` tool

**Archivo:** `backend/repositories/odoo-mcp/src/tools/odoo/leraysi/crear-turno/crear-turno.tool.ts`

- Agregar `lead_id` al input schema
- Pasar `lead_id` al crear el turno en Odoo

### 5. Modificar webhook para llamar al MCP

**Archivo:** `backend/repositories/odoo/addons/salon_turnos/controllers/mercadopago_webhook.py`

Modificar `_notify_n8n_payment_confirmed` para:

1. Primero llamar al MCP:
```python
mcp_url = request.env['ir.config_parameter'].sudo().get_param('salon_turnos.mcp_url')
mcp_token = request.env['ir.config_parameter'].sudo().get_param('salon_turnos.mcp_service_token')

response = requests.post(
    f'{mcp_url}/internal/mcp/call-tool',
    json={
        'tool': 'leraysi_confirmar_pago_completo',
        'arguments': {
            'turno_id': turno.id,
            'mp_payment_id': str(payment_id),
            'lead_id': turno.lead_id.id if turno.lead_id else None,
        }
    },
    headers={
        'Content-Type': 'application/json',
        'X-Service-Token': mcp_token,
    },
    timeout=30,
)
```

2. Incluir datos enriquecidos (partner_id, invoice_id, event_id) en el webhook a n8n

### 6. Agregar parámetros de sistema en Odoo

En Odoo > Ajustes > Parámetros del Sistema, agregar:
- `salon_turnos.mcp_url` = URL del servidor MCP (ej: `http://odoo-mcp:3002`)
- `salon_turnos.mcp_service_token` = Token de servicio del MCP

---

## Flujo Final

```
MercadoPago → Odoo Webhook
                    ↓
              Valida pago
                    ↓
              Llama MCP (leraysi_confirmar_pago_completo)
                    ↓
              MCP ejecuta en Odoo:
              - Crea contacto
              - Vincula a Lead
              - Mueve Lead a Calificado
              - Crea evento calendario
              - Crea factura
              - Genera PDF
              - Envía email
                    ↓
              Retorna resultado a Odoo
                    ↓
              Odoo envía webhook a n8n con datos enriquecidos
                    ↓
              n8n actualiza Baserow y envía WhatsApp
```

---

## Archivos a Modificar

1. `backend/repositories/odoo/addons/salon_turnos/models/salon_turno.py`
2. `backend/repositories/odoo/addons/salon_turnos/controllers/mercadopago_webhook.py`
3. `backend/repositories/odoo-mcp/src/tools/odoo/leraysi/crear-turno/crear-turno.tool.ts`
4. `backend/repositories/odoo-mcp/src/tools/odoo/leraysi/crear-turno/crear-turno.schema.ts`

---

## Notas Adicionales

- El MCP ya tiene el endpoint `/internal/mcp/call-tool` funcionando
- La autenticación es via header `X-Service-Token`
- La tool `leraysi_confirmar_pago_completo` ya está completa y testeada
- Solo falta el campo `lead_id` para conectar todo

---

## Fecha

Documentado: 2026-01-22 ~01:00 Argentina
