# Nodo 32: HTTP Request (Chatwoot)

**Nombre del nodo**: `HTTP Request`
**Tipo**: HTTP Request
**Función**: Enviar respuesta del bot a WhatsApp vía Chatwoot API
**Entrada**: content_whatsapp desde Filter Output Initial
**Método**: POST

---

## Descripción

Este nodo realiza una **llamada HTTP POST a la API de Chatwoot** para enviar la respuesta generada por el bot Leonobit al cliente vía WhatsApp.

**Función principal**:
- Enviar mensaje de texto al cliente en WhatsApp
- Usar la conversación existente (conversation_id del webhook)
- Marcar el mensaje como enviado por el usuario "Leonobit" en Chatwoot
- Retornar confirmación del mensaje enviado con ID, timestamp y status

**Flujo completo**:
```
Cliente (WhatsApp) → Chatwoot → n8n (webhook)
                                    ↓
                              [Procesamiento]
                                    ↓
                     n8n → Chatwoot → WhatsApp → Cliente
                     ↑ (Este nodo)
```

---

## Configuración

### **Method**
```
POST
```

### **URL**
```
http://chatwoot:3000/api/v1/accounts/{{ $('Webhook').item.json.body.account_id }}/conversations/{{ $('Webhook').item.json.body.conversation.messages[0].conversation_id }}/messages
```

**Breakdown de la URL**:
```
http://chatwoot:3000              # Host interno de Chatwoot (Docker)
/api/v1                           # API versión 1
/accounts/{account_id}            # ID de la cuenta Chatwoot
/conversations/{conversation_id}  # ID de la conversación específica
/messages                         # Endpoint para crear mensajes
```

**Valores reales** (ejemplo):
```
http://chatwoot:3000/api/v1/accounts/1/conversations/190/messages
```

**Data Reintegration**: Usa `$('Webhook')` para acceder a:
- `account_id`: ID de la cuenta Chatwoot (ej.: 1)
- `conversation_id`: ID de la conversación activa (ej.: 190)

---

### **Authentication**
```
Generic Credential Type: Generic Credential Type
Generic Auth Type: Header Auth
Header Auth: Chatwoot Auth account
```

**Detalles del credential**:
- **Name**: `Chatwoot Auth account`
- **Type**: Header Auth
- **Header Name**: `api_access_token` (inferido, estándar de Chatwoot)
- **Header Value**: Token de acceso de Chatwoot (ej.: `abc123...`)

**Formato del header** (enviado):
```http
api_access_token: abc123def456ghi789...
```

---

### **Send Query Parameters**
```
Activado (toggle ON)
```

**Especificación**:
```
Using Fields Below
```

**Query Parameters**:
- Name: (vacío)
- Value: (vacío)

**Nota**: Aunque está activado, no se especifican parámetros. Esto podría ser un residuo de configuración.

---

### **Send Headers**
```
Activado (toggle ON)
```

**Especificación**: No se muestran headers adicionales en la captura, pero se envía el header de autenticación.

---

### **Send Body**
```
Activado (toggle ON)
```

**Body Content Type**:
```
JSON
```

**Specify Body**:
```
Using JSON
```

**JSON**:
```json
{{ JSON.stringify({ content: $('Filter Output Initial').item.json.content_whatsapp }) }}
```

**Explicación**:
1. `$('Filter Output Initial')`: Accede al nodo anterior (Data Reintegration pattern)
2. `.item.json.content_whatsapp`: Extrae el campo con el texto formateado para WhatsApp
3. `{ content: ... }`: Estructura requerida por Chatwoot API
4. `JSON.stringify()`: Convierte el objeto JavaScript a string JSON

**Ejemplo de body enviado**:
```json
{
  "content": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
}
```

---

## Input

### Estructura de entrada

#### Desde Filter Output Initial:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido...</p>",
  "content_whatsapp": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?",
  "lead_id": "33"
}
```

#### Desde Webhook (reintegración):
```json
{
  "account_id": 1,
  "conversation": {
    "messages": [
      {
        "conversation_id": 190
      }
    ]
  }
}
```

**Campos utilizados**:
- `content_whatsapp`: Para el body del request
- `account_id`: Para la URL
- `conversation_id`: Para la URL

---

## Output

### Estructura de salida
```json
[
  {
    "id": 2705,
    "content": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?",
    "inbox_id": 1,
    "conversation_id": 190,
    "message_type": 1,
    "content_type": "text",
    "status": "sent",
    "content_attributes": {},
    "created_at": 1761920590,
    "private": false,
    "source_id": null,
    "sender": {
      "id": 1,
      "name": "Leonobit",
      "available_name": "Leonobit",
      "avatar_url": "https://chat.leonobitech.com/rails/active_storage/representations/.../avatar.png",
      "type": "user",
      "availability_status": "online",
      "thumbnail": "https://chat.leonobitech.com/rails/active_storage/representations/.../avatar.png"
    }
  }
]
```

**Campos principales**:
- `id` (integer): ID del mensaje en Chatwoot (2705)
- `content` (string): Texto enviado al cliente
- `inbox_id` (integer): ID del inbox (canal) de Chatwoot (1 = WhatsApp)
- `conversation_id` (integer): ID de la conversación (190)
- `message_type` (integer): Tipo de mensaje (1 = outgoing/saliente)
- `content_type` (string): Tipo de contenido ("text")
- `status` (string): Estado del mensaje ("sent")
- `created_at` (timestamp): Fecha de creación (Unix timestamp: 1761920590 → 2025-10-31)
- `private` (boolean): ¿Es mensaje privado/interno? (false)
- `sender` (object): Información del remitente
  - `id`: ID del usuario en Chatwoot (1 = Leonobit)
  - `name`: Nombre del usuario ("Leonobit")
  - `avatar_url`: URL del avatar
  - `availability_status`: Estado ("online")

---

## Diagrama de Flujo

```
┌──────────────────────────────────────┐
│  Input: Filter Output Initial        │
│  {                                   │
│    content_whatsapp: "Leonobit..."   │
│  }                                   │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Data Reintegration: Webhook         │
│  - account_id: 1                     │
│  - conversation_id: 190              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  HTTP POST Request                   │
│  ┌────────────────────────────────┐  │
│  │ URL: http://chatwoot:3000/     │  │
│  │   api/v1/accounts/1/           │  │
│  │   conversations/190/messages   │  │
│  │                                │  │
│  │ Headers:                       │  │
│  │   api_access_token: ***        │  │
│  │                                │  │
│  │ Body (JSON):                   │  │
│  │   {                            │  │
│  │     "content": "Leonobit..."   │  │
│  │   }                            │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Chatwoot API Response               │
│  - Crea mensaje en DB                │
│  - Envía a WhatsApp Business API     │
│  - Retorna confirmación              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Output: Message Created             │
│  {                                   │
│    id: 2705,                         │
│    status: "sent",                   │
│    sender: { name: "Leonobit" }      │
│  }                                   │
└──────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  WhatsApp → Cliente                  │
│  ┌────────────────────────────────┐  │
│  │ Leonobit 🤖:                   │  │
│  │ ¡Hola! Bienvenido a            │  │
│  │ Leonobitech, donde usamos IA   │  │
│  │ para automatizar la atención   │  │
│  │ y procesos de tu negocio.      │  │
│  │ ¿Me puedes decir tu nombre     │  │
│  │ para ayudarte mejor?           │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

## Detalles Técnicos

### **1. Chatwoot API: POST /messages**

**Documentación oficial**:
```http
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
```

**Parámetros requeridos**:
- `account_id` (path): ID de la cuenta Chatwoot
- `conversation_id` (path): ID de la conversación

**Body requerido**:
```json
{
  "content": "Texto del mensaje",
  "message_type": "outgoing",  // opcional: "incoming" o "outgoing"
  "private": false,             // opcional: true para mensajes internos
  "content_type": "text"        // opcional: "text", "image", "file", etc.
}
```

**Response** (201 Created):
```json
{
  "id": 2705,
  "content": "...",
  "message_type": 1,  // 0=incoming, 1=outgoing, 2=activity
  "status": "sent",   // "sent", "delivered", "read", "failed"
  "sender": {...}
}
```

---

### **2. message_type en Chatwoot**

| **Valor** | **Tipo**     | **Descripción**                  |
|-----------|--------------|----------------------------------|
| 0         | incoming     | Mensaje recibido del cliente     |
| 1         | outgoing     | Mensaje enviado al cliente (bot) |
| 2         | activity     | Mensaje de actividad del sistema |

**En este caso**: `message_type: 1` indica que es un mensaje **saliente** (del bot al cliente).

**Inferencia**: Aunque no se especifica `message_type` en el body del request, Chatwoot lo infiere como `1` (outgoing) porque el mensaje es creado por un usuario autenticado (Leonobit) en una conversación existente.

---

### **3. Status del Mensaje**

El campo `status: "sent"` en la respuesta indica el estado del mensaje en el ciclo de vida de WhatsApp:

```
sent → delivered → read
  ↓
failed (si hay error)
```

**Estados posibles**:
- `sent`: Mensaje enviado a WhatsApp Business API
- `delivered`: WhatsApp confirmó que llegó al dispositivo del cliente
- `read`: Cliente abrió el chat y leyó el mensaje
- `failed`: Error en el envío

**Webhook de status**: Chatwoot puede recibir webhooks de WhatsApp Business API para actualizar el status a `delivered` y `read`.

---

### **4. Docker Network: chatwoot:3000**

La URL usa `http://chatwoot:3000` en lugar de `localhost:3000` o una URL pública.

**Explicación**:
- `chatwoot` es el **nombre del servicio** en Docker Compose
- Docker crea una red interna donde los servicios se comunican por nombre
- `3000` es el puerto interno de Chatwoot

**Ventajas**:
- No requiere exponer Chatwoot públicamente
- Comunicación más rápida (no pasa por reverse proxy)
- Aislamiento de red (solo servicios en la misma red Docker pueden acceder)

**Equivalente** si se llamara desde fuera de Docker:
```
https://chat.leonobitech.com/api/v1/accounts/1/conversations/190/messages
```

---

### **5. Autenticación: api_access_token**

Chatwoot soporta dos tipos de autenticación en la API:

#### a) **User Token** (usado aquí)
```http
api_access_token: abc123...
```
- Token asociado a un usuario específico (Leonobit)
- Los mensajes aparecen como enviados por ese usuario
- Scope completo de permisos del usuario

#### b) **Platform App Token**
```http
api_access_token: platform_abc123...
```
- Token de aplicación (sin usuario específico)
- Los mensajes aparecen como enviados por "Chatwoot Bot"
- Scope limitado a operaciones de la plataforma

**Recomendación**: El uso de User Token (opción a) es correcto porque permite que el mensaje aparezca como enviado por "Leonobit" (con avatar y nombre personalizados).

---

### **6. content vs. content_whatsapp**

**Pregunta**: ¿Por qué el output muestra `content` sin el emoji 🤖?

**Respuesta**: No, el output SÍ incluye el emoji. Analicemos:

**Input (content_whatsapp)**:
```
"Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech..."
```

**Output (content)**:
```
"Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech..."
```

Son idénticos. Chatwoot almacena el `content` tal cual se envió en el request.

**Renderizado en WhatsApp**:
```
Leonobit 🤖:
¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?
```

El emoji se renderiza correctamente en WhatsApp.

---

### **7. Timestamp: created_at**

El campo `created_at: 1761920590` es un **Unix timestamp** (segundos desde 1970-01-01).

**Conversión**:
```javascript
new Date(1761920590 * 1000).toISOString()
// "2025-10-31T15:43:10.000Z"
```

**Uso**:
- Ordenar mensajes cronológicamente en Chatwoot
- Analizar tiempos de respuesta del bot
- Auditoría de cuándo se envió cada mensaje

---

### **8. sender.id: 1 (Usuario Leonobit)**

El campo `sender.id: 1` indica que el mensaje fue enviado por el usuario con ID 1 en Chatwoot.

**Configuración en Chatwoot**:
```sql
-- Chatwoot database
SELECT id, name, email FROM users WHERE id = 1;
-- id | name      | email
-- 1  | Leonobit  | bot@leonobitech.com
```

**Avatar personalizado**:
```
avatar_url: "https://chat.leonobitech.com/rails/active_storage/.../avatar.png"
```

**Implicación**: En la interfaz de Chatwoot, el mensaje aparece con:
- Nombre: "Leonobit"
- Avatar: Imagen personalizada del bot
- Badge: "Online" (availability_status)

---

### **9. inbox_id: 1 (WhatsApp Channel)**

El campo `inbox_id: 1` identifica el **canal de comunicación** en Chatwoot.

**Tipos de inbox**:
- WhatsApp (usado aquí)
- Email
- Website Live Chat
- Facebook Messenger
- Telegram
- API Channel

**Configuración en Chatwoot**:
```sql
SELECT id, name, channel_type FROM inboxes WHERE id = 1;
-- id | name             | channel_type
-- 1  | WhatsApp Support | Channel::Whatsapp
```

---

### **10. private: false (Mensaje Público)**

El campo `private: false` indica que el mensaje **NO es una nota interna**.

**Diferencia**:
- `private: false`: Mensaje enviado al cliente (visible en WhatsApp)
- `private: true`: Nota interna (solo visible en Chatwoot, NO se envía al cliente)

**Uso de notas internas**:
```json
{
  "content": "Cliente parece interesado en Odoo CRM",
  "private": true
}
```

Esto crearía una nota visible solo para el equipo en Chatwoot, sin enviarse a WhatsApp.

---

## Casos de Uso Detallados

### **Caso 1: Envío exitoso (actual)**

**Input**:
```json
{
  "content_whatsapp": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech..."
}
```

**HTTP Request**:
```http
POST http://chatwoot:3000/api/v1/accounts/1/conversations/190/messages
Content-Type: application/json
api_access_token: abc123...

{
  "content": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech..."
}
```

**Chatwoot Response** (201):
```json
{
  "id": 2705,
  "status": "sent",
  "content": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech..."
}
```

**WhatsApp**: Cliente recibe el mensaje inmediatamente.

---

### **Caso 2: Conversación no encontrada (error 404)**

**Escenario**: `conversation_id` no existe en Chatwoot.

**HTTP Request**:
```http
POST http://chatwoot:3000/api/v1/accounts/1/conversations/99999/messages
```

**Chatwoot Response** (404):
```json
{
  "error": "Conversation not found"
}
```

**n8n**: El workflow falla en este nodo.

**Solución**: Validar que la conversación existe antes de enviar el mensaje.

---

### **Caso 3: Token inválido (error 401)**

**Escenario**: `api_access_token` expiró o es incorrecto.

**Chatwoot Response** (401):
```json
{
  "error": "Unauthorized"
}
```

**n8n**: El workflow falla.

**Solución**: Usar token de larga duración o implementar refresh automático.

---

### **Caso 4: Mensaje muy largo (error 422)**

**Escenario**: `content` excede el límite de WhatsApp (4096 caracteres).

**Chatwoot Response** (422):
```json
{
  "error": "Message content is too long"
}
```

**Solución**: Implementar truncamiento en nodo 30 (Filter Output Initial).

---

### **Caso 5: Envío de imagen (futuro)**

**Request**:
```json
{
  "content": "Aquí está nuestro catálogo",
  "attachments": [
    {
      "file_url": "https://leonobitech.com/catalogo.pdf"
    }
  ]
}
```

**Response**:
```json
{
  "id": 2706,
  "content_type": "file",
  "attachments": [...]
}
```

**WhatsApp**: Cliente recibe texto + archivo PDF.

---

## Mejoras Propuestas

### **1. Agregar retry automático**
**Problema**: Si Chatwoot está temporalmente no disponible, el mensaje se pierde.

**Solución**: Configurar retry en n8n:
```yaml
# En Settings del nodo
Continue On Fail: false
Retry On Fail: true
Max Tries: 3
Wait Between Tries: 5000  # 5 segundos
```

---

### **2. Validar status de la conversación**
**Problema**: Si la conversación está cerrada (`status: "resolved"`), Chatwoot podría rechazar el mensaje.

**Solución**: Agregar nodo HTTP Request previo:
```http
GET /api/v1/accounts/1/conversations/190
```

Verificar `status: "open"` antes de enviar mensaje.

---

### **3. Implementar fallback a email**
**Problema**: Si WhatsApp falla (cliente bloqueó el número, etc.), no hay forma alternativa de contacto.

**Solución**: En caso de error 422 o 404, intentar enviar por email:
```javascript
// En nodo Code después de HTTP Request
if ($json.error) {
  // Activar rama de email fallback
  return [{ json: { use_email: true, email: $('Build Lead Row').item.json.email } }];
}
```

---

### **4. Agregar logging del mensaje enviado**
**Problema**: No hay registro de qué mensajes se enviaron exitosamente.

**Solución**: Agregar nodo Code después de HTTP Request:
```javascript
const messageId = $json.id;
const status = $json.status;
const timestamp = new Date($json.created_at * 1000).toISOString();

console.log(`[CHATWOOT] Message ${messageId} sent with status: ${status} at ${timestamp}`);

return [{ json: $json }];
```

---

### **5. Implementar rate limiting**
**Problema**: WhatsApp Business API tiene límites de mensajes por segundo.

**Solución**: Agregar nodo Wait antes de HTTP Request:
```yaml
# Wait node
Amount: 200  # 200ms entre mensajes
Unit: Milliseconds
```

**Beneficio**: Evita errores 429 (Too Many Requests) de WhatsApp.

---

### **6. Agregar tracking de delivery y read**
**Problema**: No se sabe si el mensaje fue entregado o leído por el cliente.

**Solución**: Configurar webhook de Chatwoot para recibir status updates:
```javascript
// Webhook endpoint en n8n
POST /webhook/chatwoot-status
{
  "message_id": 2705,
  "status": "read",  // o "delivered"
  "read_at": "2025-10-31T15:45:00Z"
}
```

Actualizar Baserow con `last_message_read_at`.

---

### **7. Sanitizar content para WhatsApp**
**Problema**: WhatsApp no soporta algunos caracteres especiales o emojis complejos.

**Solución**: Agregar sanitización en nodo 30:
```javascript
// Remover emojis no soportados
content = content.replace(/[\u{1F900}-\u{1F9FF}]/gu, '');

// Limitar a 4000 caracteres (margen de seguridad)
if (content.length > 4000) {
  content = content.slice(0, 3980) + '\n\n[Mensaje truncado]';
}
```

---

### **8. Agregar metadata al mensaje**
**Problema**: No hay forma de saber qué modelo de IA generó el mensaje.

**Solución**: Usar campo `content_attributes` de Chatwoot:
```json
{
  "content": "Leonobit 🤖:\n¡Hola!...",
  "content_attributes": {
    "ai_model": "gpt-3.5-turbo",
    "tokens_used": 45,
    "latency_ms": 1200,
    "agent_type": "welcome"
  }
}
```

**Beneficio**: Análisis de costos y performance por mensaje.

---

### **9. Implementar queue para mensajes**
**Problema**: Si hay ráfaga de mensajes simultáneos, podrían llegar desordenados.

**Solución**: Usar Redis queue:
```javascript
// En nodo Code antes de HTTP Request
const queueKey = `chatwoot:queue:${conversationId}`;
await redis.rpush(queueKey, JSON.stringify(message));

// Worker procesando cola cada 500ms
```

---

### **10. Agregar monitoreo de fallos**
**Problema**: Si Chatwoot falla frecuentemente, no hay alerta.

**Solución**: Agregar nodo HTTP Request a servicio de monitoreo:
```javascript
// En caso de error
if ($json.error) {
  // POST a Sentry/Datadog/etc.
  await fetch('https://sentry.io/api/log', {
    body: JSON.stringify({
      error: $json.error,
      context: { conversation_id, message_id }
    })
  });
}
```

---

## Siguiente Nodo Esperado

Después de enviar el mensaje a WhatsApp, el flujo debería:

1. **Actualizar Baserow** con el último mensaje enviado y timestamp
2. **Finalizar el workflow** (si es primer mensaje) o continuar con análisis de historial (si es conversación existente)

**Nodos esperados**:
- **Nodo 33**: Baserow Update (actualizar `last_message`, `last_activity_iso` del lead)
- **Nodo 34**: (Opcional) Merge o Switch para determinar si hay más procesamiento

O bien, este podría ser el **último nodo del Create Flow**, con el workflow finalizando aquí.

---

## Relación con Arquitectura Global

```
ETAPA 1: Filter Process (5 nodos)
    ↓
ETAPA 2: Buffer Messages (12 nodos)
    ↓
ETAPA 3: Register Leads (15 nodos hasta aquí)
    ↓ [Create Flow]
    - Build Lead Row → ... → Create an Item (28) - Mensaje cliente en Odoo
    ↓
    - AI Agent Welcome (29) - Generación respuesta
    ↓
    - Filter Output Initial (30) - Formateo dual
    ↓
    - Create an item1 (31) - Mensaje bot en Odoo
    ↓
**→ HTTP Request (32) ← Estamos aquí** - Envío a WhatsApp vía Chatwoot
    ↓
ETAPA 6: Almacenamiento y Respuesta (?)
    - Actualización Baserow con last_message
    - (Fin del workflow)
```

**Posición en el flujo**: Este nodo **cierra el ciclo de comunicación**, enviando la respuesta generada al cliente vía WhatsApp. Es el punto donde el mensaje sale del sistema de n8n hacia el mundo exterior.

---

## Conclusión

El **Nodo 32: HTTP Request (Chatwoot)** envía la respuesta del bot al cliente vía WhatsApp usando la API de Chatwoot.

**Funciones clave**:
1. POST a `/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`
2. Enviar `content_whatsapp` formateado para WhatsApp
3. Autenticación con `api_access_token` del usuario Leonobit
4. Recibir confirmación con `message_id`, `status: "sent"` y metadata del mensaje
5. Mensaje aparece en WhatsApp como enviado por "Leonobit"

**Características técnicas**:
- Usa Docker network interno (`chatwoot:3000`)
- Data reintegration de `account_id` y `conversation_id` desde webhook
- Mensaje creado con `message_type: 1` (outgoing)
- Status inicial: "sent" (luego puede cambiar a "delivered"/"read")

**Mejoras prioritarias**:
1. Implementar retry automático (resilencia)
2. Validar status de conversación (prevención de errores)
3. Agregar logging de mensajes enviados (auditoría)
4. Implementar rate limiting (cumplir límites de WhatsApp)

**Próximo paso**: Actualizar Baserow con el mensaje enviado y finalizar el workflow (o continuar con análisis de historial si es conversación existente).
