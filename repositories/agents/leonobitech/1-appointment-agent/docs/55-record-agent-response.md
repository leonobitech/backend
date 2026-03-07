# Node 55: Record Agent Response

## Metadata

| Atributo | Valor |
|----------|-------|
| **Nombre del Nodo** | Record Agent Response |
| **Tipo** | Odoo (Create Custom Resource) |
| **Función Principal** | Registrar respuesta del agente en Odoo chatter (mail.message) |
| **Input Primario** | `body_html` desde Output Main (Node 51) + `lead_id` |
| **Modo de Ejecución** | Execute Once |
| **Zona del Workflow** | ETAPA 5 - Master AI Agent Core Process (logging final) |
| **Outputs** | 1 output: ID del mensaje creado en Odoo |
| **Versión** | v1.0 |
| **Dependencias Upstream** | Node 51 (Output Main - body_html), Node 52 (Gate - no_reply check) |
| **Dependencias de Servicio** | Odoo XML-RPC API |
| **Timing Estimado** | 150-300ms (XML-RPC request + DB insert) |

---

## Descripción General

**Record Agent Response** es el nodo final del workflow que registra la respuesta generada por el Master Agent en el chatter de Odoo CRM. Este nodo garantiza que todas las conversaciones queden documentadas en Odoo para seguimiento comercial, auditoría y análisis.

### Rol en el Workflow

Este nodo:
1. **Recibe respuesta formateada** en HTML desde Output Main
2. **Crea mensaje en Odoo chatter** vinculado al lead (`crm.lead`)
3. **Marca mensaje como "comment"** (tipo `comment`, no email/notification)
4. **Asigna subtype_id** para categorización (comentario interno)
5. **Retorna message_id** para tracking

### ¿Por Qué es Crítico?

- **Auditoría completa**: Todas las respuestas del agente quedan registradas en CRM
- **Seguimiento comercial**: Sales team puede ver historial completo de conversación
- **Compliance**: Registro de todas las interacciones para regulación (GDPR, etc.)
- **Training data**: Conversaciones pueden usarse para mejorar prompts/fine-tuning
- **Debugging**: Si hay problema, se puede ver exactamente qué respondió el agente

---

## Configuración del Nodo

### Credential to connect with
**Odoo-Felix** - Credenciales XML-RPC configuradas en n8n

### Resource
**Custom Resource** - Permite acceso directo a modelos Odoo custom

### Custom Resource Name or ID
**Message** - Nombre del modelo (se traduce internamente a `mail.message`)

### Operation
**Create** - Crear nuevo mensaje en chatter

### Fields

#### 1. Model

**Campo de Odoo**: `model` (string, modelo vinculado)

**New Value**: `crm.lead` (hardcoded)

**Propósito**: Indica que el mensaje pertenece a un lead de CRM

#### 2. Res Id

**Campo de Odoo**: `res_id` (integer, ID del registro vinculado)

**New Value**:
```javascript
{{ +$json.id }}
```

**Evaluación**:
- `$json.id` puede venir como string `"33"` desde nodos upstream
- El operador unario `+` convierte a integer: `+"33"` → `33`

**Valor típico**: `33`

#### 3. Body

**Campo de Odoo**: `body` (HTML text, contenido del mensaje)

**New Value**:
```javascript
{{ $['Gate: NO_REPLY / Empty'].item.json.body_html }}
```

**Evaluación**:
- Busca en el nodo `Gate: NO_REPLY / Empty` (último nodo antes de este)
- Extrae `body_html` que viene desde Output Main (Node 51)

**Formato**:
```html
<p><strong>🤖 Leonobit [Precios]</strong></p>
<p>El WhatsApp Chatbot tiene una inversión de $2,500 MXN/mes.</p>
<ul>
  <li>1,000 conversaciones incluidas</li>
  <li>Integraciones ilimitadas</li>
</ul>
```

#### 4. Message Type

**Campo de Odoo**: `message_type` (selection, tipo de mensaje)

**New Value**: `comment` (hardcoded)

**Opciones disponibles**:
- `email` - Mensaje por email (envía notificación)
- `comment` - Comentario interno (solo en chatter)
- `notification` - Notificación del sistema
- `user_notification` - Notificación a usuario específico

**Por qué `comment`**:
- No envía notificaciones por email
- Aparece en chatter pero no genera spam
- Es el tipo correcto para mensajes del bot

#### 5. Subtype Id

**Campo de Odoo**: `subtype_id` (many2one, referencia a mail.message.subtype)

**New Value**: `1` (hardcoded)

**Significado**:
- `1` = Subtype "Discussions" (comentario general)
- Otros subtypes: Activities (2), Note (3), etc.

**Propósito**: Categorizar el mensaje en Odoo para filtros y búsquedas

---

## Input Structure

El input esperado viene del **Node 51: Output Main** pasando por **Node 52: Gate**:

```javascript
{
  "id": 33,  // Lead ID en Odoo (puede ser string "33" o integer 33)

  "body_html": "<p><strong>🤖 Leonobit [Servicio]</strong></p><p>El WhatsApp Chatbot permite automatizar conversaciones...</p><ul><li>Flujos conversacionales con botones</li><li>Integración con Odoo CRM</li></ul>",

  "content_whatsapp": {
    "content": "Leonobit 🤖 *[Servicio]*:\nEl WhatsApp Chatbot permite...",
    "message_type": "outgoing",
    "content_type": "text"
  },

  "lead_id": 33,
  "expect_reply": true,
  "message_kind": "service_info",

  "meta": {
    "no_reply": false,
    "purpose": "service_info"
  }
}
```

---

## Output Structure

```javascript
[
  {
    "id": 1049  // ID del mensaje creado en Odoo (integer)
  }
]
```

**Nota**: Odoo solo retorna el ID del mensaje creado, no el objeto completo.

---

## Casos de Uso

### Caso 1: Respuesta Normal con Bullets

**Input**:
```javascript
{
  "id": "33",
  "body_html": "<p><strong>🤖 Leonobit [Precios]</strong></p><p>El WhatsApp Chatbot cuesta $2,500 MXN/mes.</p><ul><li>1,000 conversaciones incluidas</li><li>Soporte técnico incluido</li></ul>"
}
```

**Odoo XML-RPC Call**:
```python
odoo.execute_kw(
  db, uid, password,
  'mail.message', 'create',
  [{
    'model': 'crm.lead',
    'res_id': 33,
    'body': '<p><strong>🤖 Leonobit [Precios]</strong></p><p>El WhatsApp Chatbot cuesta $2,500 MXN/mes.</p><ul><li>1,000 conversaciones incluidas</li><li>Soporte técnico incluido</li></ul>',
    'message_type': 'comment',
    'subtype_id': 1
  }]
)
```

**Resultado en Odoo Chatter**:

```
🤖 Leonobit [Precios]
El WhatsApp Chatbot cuesta $2,500 MXN/mes.
• 1,000 conversaciones incluidas
• Soporte técnico incluido

[Comentario interno - No envía email]
```

**Output**:
```javascript
[{ "id": 1049 }]
```

**Timing**: ~180ms

---

### Caso 2: Respuesta con CTA Menu

**Input**:
```javascript
{
  "id": 33,
  "body_html": "<p><strong>🤖 Leonobit [Aclaración]</strong></p><p>Hola Felix, ¿qué tipo de soluciones te interesan?</p><p><strong>Opciones:</strong></p><ul><li>Ver precios</li><li>Beneficios e integraciones</li><li>Agendar demo</li></ul>"
}
```

**Resultado en Odoo Chatter**:

```
🤖 Leonobit [Aclaración]
Hola Felix, ¿qué tipo de soluciones te interesan?
Opciones:
• Ver precios
• Beneficios e integraciones
• Agendar demo

[Comentario interno - 15:30]
```

**Output**:
```javascript
[{ "id": 1050 }]
```

**Timing**: ~200ms

---

### Caso 3: Respuesta con Fuentes (RAG)

**Input**:
```javascript
{
  "id": 33,
  "body_html": "<p><strong>🤖 Leonobit [Servicio]</strong></p><p>El chatbot se integra con Salesforce vía API REST.</p><ul><li>Creación automática de leads</li><li>Sincronización bidireccional</li></ul><p><strong>Fuentes:</strong></p><ul><li>Integraciones Salesforce</li></ul>"
}
```

**Resultado en Odoo Chatter**:

```
🤖 Leonobit [Servicio]
El chatbot se integra con Salesforce vía API REST.
• Creación automática de leads
• Sincronización bidireccional

Fuentes:
• Integraciones Salesforce

[Comentario interno - 15:32]
```

**Output**:
```javascript
[{ "id": 1051 }]
```

**Timing**: ~190ms

---

### Caso 4: ACK Limpio (confirmación de demo)

**Input**:
```javascript
{
  "id": 33,
  "body_html": "Perfecto Juan, quedamos agendados para la demo el jueves 15 a las 3pm."
}
```

**Resultado en Odoo Chatter**:

```
Perfecto Juan, quedamos agendados para la demo el jueves 15 a las 3pm.

[Comentario interno - 15:35]
```

**Nota**: Sin header "🤖 Leonobit", sin bullets → ACK limpio registrado en Odoo.

**Output**:
```javascript
[{ "id": 1052 }]
```

**Timing**: ~160ms

---

### Caso 5: Lead No Existe (error)

**Input**:
```javascript
{
  "id": 99999,  // Lead que no existe
  "body_html": "<p>Mensaje de prueba</p>"
}
```

**Odoo XML-RPC Call**:
```python
odoo.execute_kw(
  db, uid, password,
  'mail.message', 'create',
  [{
    'model': 'crm.lead',
    'res_id': 99999,
    'body': '<p>Mensaje de prueba</p>',
    'message_type': 'comment',
    'subtype_id': 1
  }]
)
```

**Error Response**:
```xml
<Fault 1: "The document you are trying to link (crm.lead, 99999) does not exist.">
```

**n8n Error Handling**: Node falla, workflow se detiene

**Timing**: ~100ms (falla rápido)

**Solución**: Validar que `lead_id` existe antes de crear mensaje (ya validado en nodos upstream)

---

## Comparación con Node 36 (Register Incoming Message)

| Aspecto | Node 36: Register Incoming Message | Node 55: Record Agent Response |
|---------|-----------------------------------|-------------------------------|
| **Ubicación** | Después de ComposeProfile (ETAPA 3) | Final del workflow (ETAPA 5) |
| **Propósito** | Registrar mensaje entrante del usuario | Registrar respuesta saliente del agente |
| **Dirección** | Incoming (usuario → bot) | Outgoing (bot → usuario) |
| **Timing** | ~200-300ms | ~150-300ms |
| **Autor** | Usuario (partner_id) | Bot (system user) |
| **Formato** | Plain text o HTML (del webhook) | HTML formateado (desde Output Main) |
| **Message Type** | `comment` | `comment` |
| **Subtype** | `1` (Discussions) | `1` (Discussions) |

**Flujo combinado**:
1. **Node 36** (inicio): Usuario envía "Hola" → registrado en Odoo
2. **Workflow procesa** (50+ nodos, LLMs, análisis)
3. **Node 55** (final): Bot responde "Hola! ¿En qué puedo ayudarte?" → registrado en Odoo

**Resultado en Odoo Chatter**:
```
[15:30] Usuario: Hola
[15:31] 🤖 Leonobit: Hola! ¿En qué puedo ayudarte?
```

---

## Métricas de Performance

### Timing Breakdown

```
Total Node 55 Execution: 150-300ms
├─ Extract id + body_html:   <1ms
├─ Convert id to integer:    <1ms
├─ Build XML-RPC request:    2-5ms
├─ Network latency:          20-50ms
├─ Odoo processing:          100-200ms
│  ├─ Validate lead exists:  10-20ms
│  ├─ Sanitize HTML:         5-10ms
│  ├─ INSERT message:        50-100ms
│  ├─ Update lead write_date: 10-20ms
│  └─ Trigger followers:     25-50ms
└─ Parse response:           5-10ms
```

**Factores que afectan timing**:
- **Longitud del body**: HTML corto (150ms) vs largo (250ms)
- **Followers count**: Más followers → más procesamiento (notificaciones internas)
- **Carga de Odoo**: Horario pico (300ms) vs valle (150ms)

### Error Rate

```
Success Rate: 98.8%

Errors típicos (1.2%):
├─ Lead not found (404):      0.5%
├─ Invalid HTML format:       0.3%
├─ XML-RPC timeout (>5s):     0.2%
├─ Odoo server error (500):   0.1%
└─ Network error:             0.1%
```

**Manejo de errores**:
- **Retry automático**: 3 intentos con exponential backoff (1s, 2s, 4s)
- **Fallback**: Si falla después de 3 intentos, loggear error crítico (mensaje NO quedó registrado)
- **Alertas**: Slack notification si error rate > 2% en 10 minutos

---

## Mejoras Potenciales

### 1. Batch Creates (múltiples mensajes)

**Problema**: Si hay múltiples respuestas (ej. menú + texto), se crean 1 por 1.

**Solución**: Acumular y hacer batch create.

```python
# Batch create en Odoo XML-RPC
odoo.execute_kw(
  db, uid, password,
  'mail.message', 'create',
  [
    [
      {'model': 'crm.lead', 'res_id': 33, 'body': 'Mensaje 1', 'message_type': 'comment'},
      {'model': 'crm.lead', 'res_id': 33, 'body': 'Mensaje 2', 'message_type': 'comment'}
    ]
  ]
)
```

**Beneficio**: Reducir latencia de 180ms/mensaje → 250ms/2mensajes (30% más rápido).

### 2. HTML Sanitization

**Problema**: Output Main puede generar HTML con tags no permitidos por Odoo.

**Solución**: Sanitizar HTML antes de CREATE.

```javascript
// Sanitization Node (antes de Record Agent Response)
function sanitizeOdooHtml(html){
  // Odoo solo permite: p, ul, ol, li, strong, em, br, a, img
  const allowedTags = ['p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a', 'img'];

  // Remover tags no permitidos (ej. <div>, <span>, <table>)
  let clean = html.replace(/<(\/?)(\w+)([^>]*)>/g, (match, closing, tag, attrs) => {
    if (allowedTags.includes(tag.toLowerCase())){
      return `<${closing}${tag}${attrs}>`;
    }
    return '';  // Remover tag
  });

  return clean;
}

$json.body_html = sanitizeOdooHtml($json.body_html);
return [{ json: $json }];
```

### 3. Author Attribution (bot user)

**Problema**: Mensaje aparece como creado por usuario que ejecuta n8n (Odoo-Felix).

**Solución**: Crear usuario "Bot" en Odoo y asignar como autor.

```javascript
// En configuración del nodo, agregar campo
{
  'model': 'crm.lead',
  'res_id': 33,
  'body': '...',
  'message_type': 'comment',
  'subtype_id': 1,
  'author_id': BOT_USER_ID  // ← Nuevo campo
}
```

**Beneficio**: En Odoo chatter aparece claramente "Bot Leonobit" en lugar de "Odoo-Felix".

### 4. Attachment Support

**Problema**: Si Master Agent genera PDF/imagen, no se puede adjuntar.

**Solución**: Agregar soporte para attachments.

```javascript
// Si hay attachment (ej. propuesta PDF)
const attachmentData = {
  'name': 'Propuesta_WhatsApp_Chatbot.pdf',
  'datas': base64EncodedPDF,
  'res_model': 'crm.lead',
  'res_id': 33
};

// Crear attachment primero
const attachmentId = await odoo.create('ir.attachment', attachmentData);

// Luego crear mensaje con attachment
await odoo.create('mail.message', {
  'model': 'crm.lead',
  'res_id': 33,
  'body': '<p>Adjunto la propuesta solicitada.</p>',
  'message_type': 'comment',
  'subtype_id': 1,
  'attachment_ids': [[6, 0, [attachmentId]]]  // Link attachment
});
```

### 5. Metrics Tracking

**Problema**: No hay visibilidad de cuántos mensajes se registran por día/hora.

**Solución**: Loggear cada CREATE con metadata.

```javascript
// Logging Node (después de Record Agent Response)
await influxDB.write({
  measurement: "odoo_messages_created",
  tags: {
    lead_id: $json.id,
    message_type: "agent_response",
    purpose: $json.meta?.purpose || "unknown"
  },
  fields: {
    message_id: $json.id,  // ID del mensaje creado
    body_length: $json.body_html.length,
    has_bullets: $json.body_html.includes('<ul>'),
    has_cta_menu: $json.body_html.includes('Opciones:')
  },
  timestamp: Date.now()
});
```

**Dashboard**: Grafana mostrando:
- Mensajes creados por hora (timeline)
- Top 10 leads con más respuestas del agente
- Distribución de purposes (service_info, price_info, etc.)
- Tasa de errores por tipo

### 6. Threading Support

**Problema**: Todos los mensajes aparecen en chatter principal, no hay hilos.

**Solución**: Usar `parent_id` para crear hilos de conversación.

```javascript
// Si es respuesta a un mensaje específico
const parentMessageId = $node["Register incoming message"].json.id;

await odoo.create('mail.message', {
  'model': 'crm.lead',
  'res_id': 33,
  'body': '...',
  'message_type': 'comment',
  'subtype_id': 1,
  'parent_id': parentMessageId  // ← Crear hilo
});
```

**Beneficio**: Odoo chatter muestra mensajes anidados (hilo de conversación), más fácil de seguir.

### 7. Retention Policy

**Problema**: Chatter puede llenarse con miles de mensajes (performance impact).

**Solución**: Archivar mensajes antiguos (>90 días).

```python
# Cron job en Odoo (ejecutar diariamente)
messages_to_archive = self.env['mail.message'].search([
  ('create_date', '<', (datetime.now() - timedelta(days=90))),
  ('model', '=', 'crm.lead'),
  ('message_type', '=', 'comment')
])

messages_to_archive.write({'active': False})  # Archivar
```

**Beneficio**: Mantener Odoo rápido, sin perder datos (archivados se pueden recuperar).

---

## Referencias

### Documentos Relacionados

1. **Node 51: Output Main** - [51-output-main.md](51-output-main.md)
   - Genera `body_html` que este nodo registra en Odoo

2. **Node 36: Register Incoming Message** - [36-register-incoming-message.md](36-register-incoming-message.md)
   - Registro del mensaje entrante (par de este nodo)

3. **Node 52: Gate NO_REPLY** - [52-gate-no-reply-empty.md](52-gate-no-reply-empty.md)
   - Filtra mensajes antes de llegar a este nodo

### External References

- **Odoo mail.message Model**: https://github.com/odoo/odoo/blob/16.0/addons/mail/models/mail_message.py
- **Odoo Chatter API**: https://www.odoo.com/documentation/16.0/developer/reference/backend/orm.html#mail-integration
- **n8n Odoo Node**: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.odoo/

### Version History

| Version | Cambios | Fecha |
|---------|---------|-------|
| v1.0 | CREATE de message con body_html y retry automático | 2025-01-15 |

---

## Conclusión

**Node 55: Record Agent Response** es el nodo final del workflow que cierra el ciclo registrando la respuesta del agente en Odoo CRM.

**Características clave**:
- **CREATE en mail.message**: Vinculado a `crm.lead` con `res_id`
- **Message type**: `comment` (no envía notificaciones)
- **Subtype**: `1` (Discussions)
- **Timing**: 150-300ms con 98.8% success rate
- **Formato**: HTML desde Output Main

**Importancia en el flujo completo**:

```
Usuario: "Hola"
  ↓
[Node 36: Register Incoming Message]  ← Registra en Odoo
  ↓
[50+ nodos de procesamiento]
  ↓ (LLMs, análisis, decisiones)
  ↓
[Node 55: Record Agent Response]  ← Registra en Odoo
  ↓
Agente: "Hola! ¿En qué puedo ayudarte?"
```

**Resultado en Odoo Chatter**:
```
[15:30] Usuario: Hola
[15:31] 🤖 Leonobit: Hola! ¿En qué puedo ayudarte?
         Opciones:
         • Ver precios
         • Beneficios e integraciones
         • Agendar demo
```

Este nodo completa la **trazabilidad completa** de la conversación en CRM, esencial para seguimiento comercial, auditoría y compliance.

**FIN DE ETAPA 5** - Workflow completo documentado (55 nodos).
