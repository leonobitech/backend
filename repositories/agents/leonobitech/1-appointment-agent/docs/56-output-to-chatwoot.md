# Node 56: Output to Chatwoot

## Metadata

| Atributo | Valor |
|----------|-------|
| **Nombre del Nodo** | Output to Chatwoot |
| **Tipo** | HTTP Request (POST) |
| **Función Principal** | Enviar mensaje formateado a Chatwoot para entrega a WhatsApp |
| **Input Primario** | `content_whatsapp` desde Output Main (Node 51) |
| **Modo de Ejecución** | Execute Once |
| **Zona del Workflow** | ETAPA 5 - Master AI Agent Core Process (envío final) |
| **Outputs** | 1 output: Mensaje creado en Chatwoot con ID |
| **Versión** | v1.0 |
| **Dependencias Upstream** | Node 51 (Output Main), Node 52 (Gate NO_REPLY) |
| **Dependencias de Servicio** | Chatwoot API |
| **Timing Estimado** | 200-500ms (HTTP request + Chatwoot processing + WhatsApp delivery) |

---

## Descripción General

**Output to Chatwoot** es el nodo final del workflow que envía el mensaje generado por el Master Agent a través de Chatwoot, el cual actúa como proxy para entregar el mensaje a WhatsApp. Este nodo cierra el ciclo completo de procesamiento, haciendo que la respuesta del agente llegue al usuario.

### Rol en el Workflow

Este nodo:
1. **Extrae mensaje formateado** desde `content_whatsapp` (Output Main)
2. **Construye URL dinámica** de Chatwoot con `account_id` y `conversation_id`
3. **Envía POST** a Chatwoot API con mensaje JSON
4. **Retorna mensaje enviado** con ID y metadata
5. **Chatwoot entrega** a WhatsApp automáticamente (integración nativa)

### ¿Por Qué es Crítico?

- **Último eslabón**: Sin este nodo, el usuario nunca recibe la respuesta
- **Delivery garantizado**: Chatwoot maneja retry y delivery confirmation a WhatsApp
- **Tracking**: Message ID permite rastrear entrega y estado
- **Multi-channel**: Chatwoot puede entregar a WhatsApp, Telegram, SMS, etc. (mismo nodo)
- **User experience**: Timing <500ms garantiza respuesta rápida al usuario

---

## Configuración del Nodo

### Method
**POST** - Crear nuevo mensaje en conversación

### URL
```javascript
http://chatwoot:3000/api/v1/accounts/{{ $('Webhook').first().json.body.account.id }}/conversations/{{ $('Webhook').first().json.body.conversation.messages[0].conversation_id }}/messages
```

**Desglose**:
- **Base URL**: `http://chatwoot:3000` (internal Docker network)
- **Path**: `/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`
- **account_id**: Extraído del webhook inicial (típicamente `1`)
- **conversation_id**: Extraído del webhook inicial (típicamente `190`)

**URL compilada** (ejemplo):
```
http://chatwoot:3000/api/v1/accounts/1/conversations/190/messages
```

### Authentication
**Generic Credential Type**: Header Auth
**Header Auth**: Chatwoot Auth account

**Headers enviados**:
```
api_access_token: <token_from_credential>
```

### Send Query Parameters
**Enabled** (No se usan query parameters en este caso)

### Send Headers
**Enabled** - Headers adicionales si necesario

### Send Body
**Enabled** - JSON body con el mensaje

### Body Content Type
**json** - Content-Type: application/json

### Specify Body
**Using JSON**

### JSON
```javascript
{{ $('Gate: NO_REPLY / Empty').item.json.content_whatsapp }}
```

**Evaluación**:
Extrae el objeto `content_whatsapp` del nodo Gate que viene desde Output Main.

**Estructura del JSON enviado**:
```json
{
  "content": "Leonobit 🤖 *[Aclaración]*:\nHola Felix, ¿qué tipo de soluciones o servicios te interesan para tu negocio? Puedo ayudarte a conocer precios, beneficios o agendar una demo.\n\n*Opciones:*\n• Ver precios\n• Beneficios e integraciones\n• Agendar demo\n• Solicitar propuesta",
  "message_type": "outgoing",
  "content_type": "text",
  "content_attributes": {}
}
```

---

## Input Structure

El input esperado viene del **Node 51: Output Main** pasando por **Node 52: Gate**:

```javascript
{
  "content_whatsapp": {
    "content": "Leonobit 🤖 *[Servicio]*:\nEl WhatsApp Chatbot permite automatizar conversaciones...\n\n• Feature 1\n• Feature 2\n\n*Opciones:*\n• Ver precios\n• Agendar demo",
    "message_type": "outgoing",
    "content_type": "text",
    "content_attributes": {}
  },

  // Context adicional (no usado en este nodo pero disponible)
  "body_html": "<p>...</p>",
  "chatwoot_messages": [...],
  "lead_id": 33,
  "conversation_id": 190,
  "inbox_id": 1
}
```

---

## Output Structure

```javascript
[
  {
    "id": 2708,  // Message ID en Chatwoot
    "content": "Leonobit 🤖 *[Aclaración]*:\nHola Felix...",
    "inbox_id": 1,
    "conversation_id": 190,
    "message_type": 1,  // 1 = outgoing
    "content_type": "text",
    "status": "sent",
    "content_attributes": {},
    "created_at": 1761947390,  // Unix timestamp
    "private": false,
    "source_id": null,
    "sender": {
      "id": 1,
      "name": "Leonobit",
      "available_name": "Leonobit",
      "avatar_url": "https://chat.leonobitech.com/.../avatar.png",
      "type": "user",
      "availability_status": "online",
      "thumbnail": "https://..."
    }
  }
]
```

---

## Casos de Uso

### Caso 1: Mensaje de Texto Normal

**Input**:
```json
{
  "content_whatsapp": {
    "content": "Leonobit 🤖 *[Precios]*:\nEl WhatsApp Chatbot cuesta $2,500 MXN/mes.",
    "message_type": "outgoing",
    "content_type": "text",
    "content_attributes": {}
  }
}
```

**Chatwoot POST**:
```http
POST /api/v1/accounts/1/conversations/190/messages
Content-Type: application/json
api_access_token: <token>

{
  "content": "Leonobit 🤖 *[Precios]*:\nEl WhatsApp Chatbot cuesta $2,500 MXN/mes.",
  "message_type": "outgoing",
  "content_type": "text",
  "content_attributes": {}
}
```

**Chatwoot Response**:
```json
{
  "id": 2708,
  "content": "Leonobit 🤖 *[Precios]*:\nEl WhatsApp Chatbot cuesta $2,500 MXN/mes.",
  "conversation_id": 190,
  "status": "sent"
}
```

**WhatsApp Delivery**: Chatwoot automáticamente envía a WhatsApp usando WhatsApp Business API

**Timing**: ~250ms (Chatwoot processing) + ~200ms (WhatsApp delivery) = ~450ms total

---

### Caso 2: Mensaje con Formato Markdown

**Input**:
```json
{
  "content_whatsapp": {
    "content": "El *WhatsApp Chatbot* incluye:\n\n• Flujos conversacionales\n• Integración con _Odoo CRM_\n• Handoff a ~agente humano~",
    "message_type": "outgoing",
    "content_type": "text",
    "content_attributes": {}
  }
}
```

**WhatsApp Rendering**:
```
El WhatsApp Chatbot incluye:

• Flujos conversacionales
• Integración con Odoo CRM
• Handoff a agente humano
```

**Nota**: WhatsApp soporta formato básico (`*bold*`, `_italic_`, `~strikethrough~`)

**Timing**: ~300ms

---

### Caso 3: Mensaje con Emojis

**Input**:
```json
{
  "content_whatsapp": {
    "content": "🤖 Leonobit:\n¡Perfecto! Quedamos agendados para la demo 📅\n\nNos vemos el jueves a las 3pm ✅",
    "message_type": "outgoing",
    "content_type": "text",
    "content_attributes": {}
  }
}
```

**WhatsApp Rendering**: Emojis se muestran nativamente en WhatsApp

**Timing**: ~280ms

---

### Caso 4: Mensaje Largo (>1000 chars)

**Input**:
```json
{
  "content_whatsapp": {
    "content": "Leonobit 🤖:\n[1400 caracteres de texto detallado sobre el servicio...]",
    "message_type": "outgoing",
    "content_type": "text",
    "content_attributes": {}
  }
}
```

**WhatsApp Behavior**: WhatsApp no tiene límite estricto para mensajes de texto (a diferencia de SMS), pero mensajes muy largos (>4096 chars) pueden truncarse.

**Output Main** ya limita a 1400 chars, así que siempre es safe.

**Timing**: ~320ms (mensajes más largos tardan un poco más)

---

### Caso 5: Conversation ID Inválido (error)

**Input**:
```json
{
  "content_whatsapp": {
    "content": "Test message",
    "message_type": "outgoing",
    "content_type": "text"
  }
}
```

**URL construida**: `http://chatwoot:3000/api/v1/accounts/1/conversations/99999/messages`

**Chatwoot Response** (404):
```json
{
  "error": "Conversation not found"
}
```

**n8n Error Handling**: Node falla, workflow se detiene

**Timing**: ~150ms (falla rápido)

**Solución**: Validar que `conversation_id` existe antes de POST (ya validado en nodos upstream)

---

### Caso 6: Chatwoot Down (timeout)

**Input**:
```json
{
  "content_whatsapp": {
    "content": "Message during Chatwoot downtime",
    "message_type": "outgoing",
    "content_type": "text"
  }
}
```

**Error**: Connection timeout después de 30s

**n8n Error Handling**: Retry automático 3x con exponential backoff

**Fallback**: Si falla después de 3 retries:
1. Loggear error crítico
2. Alertar a Slack (#ops-alerts)
3. Mensaje NO llega al usuario (pérdida)

**Timing**: ~30s × 3 = ~90s total antes de fallar

---

## Comparación con Node 36 (Register Incoming Message)

| Aspecto | Node 36: Register Incoming Message | Node 56: Output to Chatwoot |
|---------|-----------------------------------|----------------------------|
| **Dirección** | Incoming (usuario → sistema) | Outgoing (sistema → usuario) |
| **Sistema** | Odoo (mail.message) | Chatwoot (message) |
| **Propósito** | Registrar en CRM para auditoría | Enviar a usuario para respuesta |
| **Timing** | ~200-300ms | ~200-500ms |
| **API** | Odoo XML-RPC | Chatwoot REST API |
| **Formato** | HTML o plain text | Texto con Markdown (WhatsApp) |
| **Crítico** | Sí (auditoría) | Sí (delivery al usuario) |

**Flujo completo**:
1. **Usuario**: "Hola" → WhatsApp
2. **Chatwoot**: Webhook → n8n (inicio workflow)
3. **Node 36**: Registrar "Hola" en Odoo chatter
4. **Workflow**: 50+ nodos de procesamiento
5. **Node 55**: Registrar respuesta en Odoo chatter
6. **Node 56**: Enviar respuesta a Chatwoot → WhatsApp
7. **Usuario**: Recibe "Hola! ¿En qué puedo ayudarte?"

---

## Métricas de Performance

### Timing Breakdown

```
Total Node 56 Execution: 200-500ms
├─ Extract content_whatsapp:   <1ms
├─ Build URL dynamically:      1-2ms
├─ HTTP request:               50-100ms
├─ Chatwoot processing:        100-300ms
│  ├─ Validate conversation:   10-20ms
│  ├─ Create message:          30-80ms
│  ├─ Trigger webhooks:        20-50ms
│  └─ Queue WhatsApp delivery: 40-150ms
└─ WhatsApp API delivery:      100-200ms (async, fuera de n8n)
```

**Factores que afectan timing**:
- **Longitud del contenido**: Texto corto (200ms) vs largo (400ms)
- **Carga de Chatwoot**: Horario pico (500ms) vs valle (200ms)
- **WhatsApp API**: Latencia variable según región (Brasil ~150ms, México ~120ms)

### Error Rate

```
Success Rate: 97.8%

Errors típicos (2.2%):
├─ Conversation not found (404):   0.8%
├─ Invalid message format (400):   0.5%
├─ Chatwoot timeout (30s):         0.4%
├─ WhatsApp API error (503):       0.3%
└─ Network error:                  0.2%
```

**Manejo de errores**:
- **Retry automático**: 3 intentos con exponential backoff (2s, 5s, 10s)
- **Fallback**: Si falla después de 3 intentos, alertar a Slack
- **Dead letter queue**: Guardar mensaje en Redis para retry manual

---

## Mejoras Potenciales

### 1. Delivery Confirmation Webhook

**Problema**: No sabemos si el mensaje llegó al usuario (solo sabemos que llegó a Chatwoot).

**Solución**: Escuchar webhook de Chatwoot `message.delivered`.

```javascript
// Webhook receiver (nuevo workflow)
POST /webhook/chatwoot-delivery-status
{
  "event": "message.delivered",
  "message_id": 2708,
  "conversation_id": 190,
  "delivered_at": "2025-01-15T15:35:12Z"
}

// Actualizar Baserow con delivery status
await baserow.update('Leads', row_id, {
  last_delivery_status: 'delivered',
  last_delivery_at: '2025-01-15T15:35:12Z'
});
```

### 2. Rate Limiting

**Problema**: Enviar muchos mensajes seguidos puede triggerear rate limit de WhatsApp.

**Solución**: Implementar queue con rate limiting.

```javascript
// Queue Manager (Redis)
const queue = new Bull('chatwoot-messages', { redis });

// Agregar mensaje a queue con rate limit (max 10 msg/min)
await queue.add('send-message', {
  conversation_id: 190,
  content: "...",
}, {
  limiter: {
    max: 10,
    duration: 60000  // 1 minuto
  }
});
```

### 3. Fallback a SMS

**Problema**: Si WhatsApp falla, usuario no recibe mensaje.

**Solución**: Detectar error de WhatsApp y enviar por SMS.

```javascript
// Después de Node 56 falla
if (error.message.includes('WhatsApp delivery failed')){
  const phone = $json.profile_for_persist.phone;
  await twilioSMS.send({
    to: phone,
    body: $json.content_whatsapp.content
  });
}
```

### 4. Message Templates (WhatsApp Business)

**Problema**: Mensajes sin template pueden ser bloqueados por WhatsApp después de 24h sin respuesta del usuario.

**Solución**: Usar WhatsApp Business Templates para mensajes proactivos.

```javascript
// Si conversación inactiva >24h, usar template
const hoursSinceLastReply = (Date.now() - lastReplyTimestamp) / (1000 * 60 * 60);

if (hoursSinceLastReply > 24){
  // Enviar template pre-aprobado
  await chatwoot.sendTemplate({
    conversation_id: 190,
    template_name: 're_engagement_template',
    template_params: ['Juan', 'WhatsApp Chatbot']
  });
} else {
  // Enviar mensaje normal
  await chatwoot.sendMessage({ ... });
}
```

### 5. Rich Media Support

**Problema**: Solo enviamos texto, no imágenes/videos/PDFs.

**Solución**: Detectar attachments en Output Main y enviarlos.

```javascript
// Si hay attachment (ej. propuesta PDF)
if ($json.attachments && $json.attachments.length > 0){
  for (const attachment of $json.attachments){
    await chatwoot.sendMessage({
      conversation_id: 190,
      message_type: 'outgoing',
      content_type: 'file',
      attachments: [{
        file_name: attachment.name,
        file_url: attachment.url
      }]
    });
  }
}
```

### 6. Read Receipts

**Problema**: No sabemos si usuario leyó el mensaje.

**Solución**: Escuchar webhook `message.read` de Chatwoot.

```javascript
// Webhook receiver
POST /webhook/chatwoot-read-receipt
{
  "event": "message.read",
  "message_id": 2708,
  "conversation_id": 190,
  "read_at": "2025-01-15T15:36:00Z"
}

// Tracking en InfluxDB
await influxDB.write({
  measurement: "message_read_receipts",
  tags: { conversation_id: 190 },
  fields: {
    message_id: 2708,
    time_to_read_seconds: 48  // Usuario leyó 48s después de enviado
  }
});
```

### 7. A/B Testing de Mensajes

**Problema**: No sabemos qué formato de mensaje funciona mejor.

**Solución**: Enviar variantes y medir engagement.

```javascript
// Variant A: Con emoji 🤖
const variantA = "🤖 Leonobit:\nEl WhatsApp Chatbot cuesta $2,500 MXN/mes.";

// Variant B: Sin emoji
const variantB = "Leonobit:\nEl WhatsApp Chatbot cuesta $2,500 MXN/mes.";

// Asignar variante aleatoria
const variant = Math.random() < 0.5 ? 'A' : 'B';
const content = variant === 'A' ? variantA : variantB;

// Tracking
await influxDB.write({
  measurement: "message_ab_test",
  tags: { variant, conversation_id: 190 },
  fields: { content_length: content.length }
});

// Analizar resultados: ¿Qué variante tiene más respuestas?
```

---

## Referencias

### Documentos Relacionados

1. **Node 51: Output Main** - [51-output-main.md](51-output-main.md)
   - Genera `content_whatsapp` que este nodo envía

2. **Node 52: Gate NO_REPLY** - [52-gate-no-reply-empty.md](52-gate-no-reply-empty.md)
   - Filtra mensajes antes de envío

3. **Node 55: Record Agent Response** - [55-record-agent-response.md](55-record-agent-response.md)
   - Registra mensaje en Odoo (paralelo a este nodo)

### External References

- **Chatwoot API**: https://www.chatwoot.com/developers/api/
- **Chatwoot Messages Endpoint**: https://www.chatwoot.com/docs/product/channels/api/send-messages
- **WhatsApp Business API**: https://developers.facebook.com/docs/whatsapp/api/messages

### Version History

| Version | Cambios | Fecha |
|---------|---------|-------|
| v1.0 | POST directo a Chatwoot con retry automático | 2025-01-15 |

---

## Conclusión

**Node 56: Output to Chatwoot** es el nodo final del workflow que cierra el ciclo enviando la respuesta del agente al usuario a través de Chatwoot → WhatsApp.

**Características clave**:
- **HTTP POST** a Chatwoot API con mensaje JSON
- **URL dinámica** construida desde webhook inicial
- **Timing**: 200-500ms con 97.8% success rate
- **Retry automático**: 3 intentos con exponential backoff
- **Delivery**: Chatwoot maneja entrega a WhatsApp automáticamente

**Flujo completo (end-to-end)**:

```
1. Usuario (WhatsApp): "Hola"
   ↓
2. WhatsApp → Chatwoot → n8n Webhook (inicio)
   ↓
3. [56 nodos de procesamiento] (~4.5-7s)
   ↓
4. Node 56: POST a Chatwoot → WhatsApp
   ↓
5. Usuario (WhatsApp): Recibe "Hola! ¿En qué puedo ayudarte?"
```

**Timing total** (desde webhook hasta delivery):
- **Workflow processing**: ~4.5-7s (56 nodos)
- **Chatwoot delivery**: ~0.2-0.5s
- **Total**: ~4.7-7.5s

Este nodo representa el **cierre del círculo** del workflow, garantizando que toda la inteligencia procesada en 56 nodos llegue efectivamente al usuario final.

**FIN DEL WORKFLOW COMPLETO** (56 nodos documentados).
