# Nodo 31: Create an item1

**Nombre del nodo**: `Create an item1`
**Tipo**: Odoo (Custom Resource - Message)
**Función**: Registrar respuesta del bot Leonobit en el chatter del lead
**Entrada**: body_html, lead_id desde Filter Output Initial
**Operación**: Create (mail.message)

---

## Descripción

Este nodo crea un **segundo mensaje en el chatter de Odoo** asociado al lead. Mientras que el nodo 28 ([Create an Item](./28-create-an-item.md)) registró el **mensaje inicial del cliente**, este nodo registra la **respuesta del bot Leonobit**.

**Función principal**:
- Almacenar la respuesta generada por el AI Agent en el historial del lead
- Mantener trazabilidad completa de la conversación en Odoo
- Permitir análisis posterior del historial (para ETAPA 4: LLM Analista)

**Diferencia con nodo 28**:
| **Aspecto**        | **Nodo 28 (Create an Item)** | **Nodo 31 (Create an item1)** |
|--------------------|------------------------------|-------------------------------|
| **Autor**          | Cliente                      | Bot (Leonobit)                |
| **Contenido**      | Mensaje del cliente          | Respuesta del bot             |
| **Source**         | `$('Webhook')`               | `$json.body_html`             |
| **Momento**        | Antes de generar respuesta   | Después de generar respuesta  |
| **Order**          | 1° mensaje en chatter        | 2° mensaje en chatter         |

---

## Configuración

### **Credential to connect with**
```
Odoo-Felix
```

### **Resource**
```
Custom Resource
```

### **Custom Resource Name or ID**
```
Message
```
**Nota**: Corresponde al modelo `mail.message` de Odoo (sistema de chatter/mensajería).

### **Operation**
```
Create
```

---

## Fields (Campos Configurados)

### **Field 1: Model**
```
Field Name or ID: Model
New Value: crm.lead
```

**Explicación**: Indica que este mensaje está asociado a un registro del modelo `crm.lead` (oportunidades/leads).

---

### **Field 2: Res Id**
```
Field Name or ID: Res Id
New Value: {{ $json.lead_id }}
```

**Explicación**: ID del lead específico al que se asocia este mensaje. Se obtiene del output de Filter Output Initial.

**Ejemplo de valor**:
```
33
```

**Tipo**: Integer (pero puede venir como string "33", Odoo lo convierte automáticamente)

---

### **Field 3: Body**
```
Field Name or ID: Body
New Value: {{ $json.body_html }}
```

**Explicación**: Contenido del mensaje en formato HTML. Este es el output formateado por Filter Output Initial.

**Ejemplo de valor**:
```html
<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?</p>
```

**Renderizado en Odoo**:
```
🤖 Leonobit:
¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?
```

---

### **Field 4: Message Type**
```
Field Name or ID: Message Type
New Value: comment
```

**Explicación**: Tipo de mensaje en Odoo.

**Valores posibles**:
- `email`: Mensaje enviado/recibido por email
- `comment`: Nota/comentario interno (este caso)
- `notification`: Notificación del sistema
- `user_notification`: Notificación para usuario específico

**Implicación**: `comment` indica que es un mensaje interno visible en el chatter pero no se envía por email automáticamente.

---

### **Field 5: Subtype Id**
```
Field Name or ID: Subtype Id
New Value: 1
```

**Explicación**: Subtipo de mensaje en Odoo.

**Valores comunes**:
- `1`: Discussions (conversaciones generales)
- `2`: Activities (actividades/tareas)
- `3`: Note (notas privadas)

**Uso**: `subtype_id: 1` marca este mensaje como parte de una conversación/discusión del lead.

---

## Input

### Estructura de entrada

Desde **Filter Output Initial** (nodo 30):
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?</p>",
  "content_whatsapp": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech...",
  "lead_id": "33"
}
```

**Campos utilizados**:
- `body_html`: Para el campo Body
- `lead_id`: Para el campo Res Id

**Campo NO utilizado**:
- `content_whatsapp`: Se usa en otro nodo (envío a WhatsApp)

---

## Output

### Estructura de salida
```json
[
  {
    "id": 1042
  }
]
```

**Campos**:
- `id` (integer): ID del mensaje creado en `mail.message`

**Uso posterior**: Este ID podría usarse para:
- Referencia en logs/auditoría
- Actualizar el mensaje posteriormente (ej.: marcar como leído)
- Enlazar respuestas o reacciones

---

## Diagrama de Flujo

```
┌─────────────────────────────────────┐
│  Input: Filter Output Initial       │
│  {                                  │
│    body_html: "<p><strong>...",     │
│    lead_id: "33"                    │
│  }                                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Odoo Create Message (mail.message) │
│  ┌────────────────────────────────┐  │
│  │  model: "crm.lead"             │  │
│  │  res_id: 33                    │  │
│  │  body: "<p><strong>🤖..."      │  │
│  │  message_type: "comment"       │  │
│  │  subtype_id: 1                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  XML-RPC Call:                       │
│  ┌────────────────────────────────┐  │
│  │  models.execute_kw(             │  │
│  │    'mail.message',              │  │
│  │    'create',                    │  │
│  │    [{                           │  │
│  │      'model': 'crm.lead',       │  │
│  │      'res_id': 33,              │  │
│  │      'body': '<p>...',          │  │
│  │      'message_type': 'comment', │  │
│  │      'subtype_id': 1            │  │
│  │    }]                           │  │
│  │  )                              │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Output: Message ID                 │
│  { "id": 1042 }                     │
└─────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Odoo Chatter (lead_id: 33)         │
│  ┌───────────────────────────────┐  │
│  │ [1041] Cliente: Hola que tal  │  │ ← Mensaje del nodo 28
│  │ [1042] 🤖 Leonobit: ¡Hola!... │  │ ← Mensaje de este nodo (31)
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Detalles Técnicos

### **1. Modelo mail.message en Odoo**

El modelo `mail.message` es el **sistema de mensajería universal** de Odoo. Todos los mensajes del chatter se almacenan aquí.

**Campos principales**:
```python
class MailMessage(models.Model):
    _name = 'mail.message'

    model = fields.Char()              # Modelo asociado (ej: 'crm.lead')
    res_id = fields.Integer()          # ID del registro asociado
    body = fields.Html()               # Contenido del mensaje
    message_type = fields.Selection([  # Tipo de mensaje
        ('email', 'Email'),
        ('comment', 'Comment'),
        ('notification', 'System notification')
    ])
    subtype_id = fields.Many2one('mail.message.subtype')  # Subtipo
    author_id = fields.Many2one('res.partner')            # Autor del mensaje
    date = fields.Datetime()           # Fecha de creación (auto)
    tracking_value_ids = fields.One2many(...)  # Cambios rastreados
```

**Relación con crm.lead**:
```python
# En el modelo crm.lead
class Lead(models.Model):
    _name = 'crm.lead'
    _inherit = ['mail.thread']  # Hereda funcionalidad de chatter

    message_ids = fields.One2many('mail.message', 'res_id',
                                  domain=[('model', '=', 'crm.lead')])
```

---

### **2. Diferencia entre message_type: comment vs. email**

| **Aspecto**               | **comment** (usado aquí)     | **email**                    |
|---------------------------|------------------------------|------------------------------|
| **Visibilidad**           | Solo en chatter de Odoo      | Chatter + enviado por email  |
| **Notificaciones**        | No envía emails              | Envía a followers del record |
| **author_id**             | Usuario/sistema que lo creó  | Remitente del email          |
| **reply_to**              | No aplica                    | Email de respuesta           |
| **Uso típico**            | Notas internas, comentarios  | Comunicación externa         |

**Implicación**: Al usar `comment`, la respuesta del bot se guarda en Odoo pero **NO se envía por email** a ningún contacto. El envío a WhatsApp se maneja en otro nodo.

---

### **3. Subtype_id: 1 (Discussions)**

Los subtipos de mensaje permiten **filtrar notificaciones** en Odoo.

**Subtipos estándar**:
```sql
-- Odoo database: mail_message_subtype
id | name           | description            | internal
---+----------------+------------------------+---------
1  | Discussions    | Discussions            | False
2  | Activities     | Activities             | False
3  | Note           | Note                   | True
```

**Configuración en Odoo**:
- Los usuarios pueden **suscribirse selectivamente** a ciertos subtipos
- Ejemplo: Un usuario puede decir "Solo notificarme de Activities, no de Discussions"

**Uso en este nodo**: `subtype_id: 1` marca este mensaje como una "Discusión", permitiendo que los followers del lead lo vean.

---

### **4. Timestamp Automático**

Aunque no se especifica en la configuración, Odoo **automáticamente** asigna:
```python
date = fields.Datetime.now()  # Timestamp de creación
```

**Ejemplo**:
```json
{
  "id": 1042,
  "date": "2025-01-31 18:30:15",  // UTC
  "create_date": "2025-01-31 18:30:15"
}
```

Este timestamp es **crítico** para:
- Ordenar mensajes cronológicamente en el chatter
- Analizar tiempos de respuesta
- Filtrar conversaciones por fecha en ETAPA 4 (LLM Analista)

---

### **5. author_id (Campo No Configurado)**

**Pregunta**: ¿Quién aparece como autor del mensaje?

**Comportamiento en Odoo**:
```python
# Si no se especifica author_id, Odoo usa:
author_id = self.env.user.partner_id  # Partner del usuario actual
```

**Implicación**: El mensaje aparecerá como enviado por el usuario asociado al credential `Odoo-Felix`.

**Mejora propuesta**: Crear un **usuario virtual "Leonobit"** en Odoo y especificarlo:
```
Field Name or ID: Author Id
New Value: {{ 123 }}  # ID del partner "Leonobit"
```

**Beneficio**: Distinguir visualmente mensajes del bot vs. mensajes de usuarios reales.

---

### **6. Comparación: Nodo 28 vs. Nodo 31**

**Nodo 28 (Create an Item)**: Primer mensaje en chatter
```javascript
// Configuración
model: 'crm.lead'
res_id: {{ $json.lead_id }}
body: "<p><strong>Cliente: </strong>{{ $('Webhook').item.json.body.conversation.messages[0].content }}</p>"
message_type: 'comment'
subtype_id: 1

// Output
{ "id": 1041 }
```

**Nodo 31 (Create an item1)**: Segundo mensaje en chatter
```javascript
// Configuración
model: 'crm.lead'
res_id: {{ $json.lead_id }}
body: {{ $json.body_html }}  // Ya viene formateado desde Filter Output Initial
message_type: 'comment'
subtype_id: 1

// Output
{ "id": 1042 }
```

**Diferencias clave**:
1. **Source de body**: Nodo 28 accede al webhook directamente, Nodo 31 usa output formateado
2. **Prefijo**: Nodo 28 usa `<strong>Cliente: </strong>`, Nodo 31 usa `<strong>🤖 Leonobit:</strong>`
3. **Timing**: Nodo 28 se ejecuta antes del AI Agent, Nodo 31 después

---

### **7. Trazabilidad de la Conversación**

Después de este nodo, el chatter del lead en Odoo contiene:

```
Lead #33: Juan Pérez (whatsapp:+5491112345678)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Discussions (2)

[1042] 🤖 Leonobit                        2025-01-31 18:30:15
¡Hola! Bienvenido a Leonobitech, donde usamos IA para
automatizar la atención y procesos de tu negocio.
¿Me puedes decir tu nombre para ayudarte mejor?

[1041] Cliente                            2025-01-31 18:30:10
Hola que tal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Ventajas de este enfoque**:
1. **Historial completo**: Toda la conversación en un solo lugar
2. **Auditoría**: Quién dijo qué y cuándo
3. **Contexto para LLM Analista**: ETAPA 4 puede consultar estos mensajes para generar resúmenes
4. **Colaboración**: Otros usuarios de Odoo pueden ver el historial y continuar la conversación manualmente si necesario

---

## Casos de Uso Detallados

### **Caso 1: Respuesta de bienvenida simple (actual)**

**Input**:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?</p>",
  "lead_id": "33"
}
```

**Odoo XML-RPC Call** (interno):
```python
models.execute_kw(
    db, uid, password,
    'mail.message', 'create',
    [{
        'model': 'crm.lead',
        'res_id': 33,
        'body': '<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech...</p>',
        'message_type': 'comment',
        'subtype_id': 1
    }]
)
```

**Output**:
```json
{
  "id": 1042
}
```

**Chatter de Odoo**:
```
🤖 Leonobit
¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?
```

---

### **Caso 2: Respuesta con servicios mencionados (RAG usado)**

**Input**:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! En Leonobitech automatizamos procesos con IA. Contamos con WhatsApp Business API (automatiza conversaciones) y nuestra integración con Odoo CRM (centraliza leads y ventas). ¿Me compartes tu nombre para continuar?</p>",
  "lead_id": "34"
}
```

**Output**:
```json
{
  "id": 1043
}
```

**Chatter de Odoo**:
```
🤖 Leonobit
¡Hola! En Leonobitech automatizamos procesos con IA. Contamos con WhatsApp Business API (automatiza conversaciones) y nuestra integración con Odoo CRM (centraliza leads y ventas). ¿Me compartes tu nombre para continuar?
```

**Implicación**: El historial en Odoo muestra qué servicios se mencionaron al cliente, útil para análisis de interés.

---

### **Caso 3: Respuesta con HTML complejo**

**Input**:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>Ofrecemos:<br>• <em>WhatsApp Chatbots</em> (respuestas automáticas 24/7)<br>• <em>Odoo Integration</em> (gestión completa de clientes)<br>¿Cuál te interesa?</p>",
  "lead_id": "35"
}
```

**Chatter de Odoo** (renderizado):
```
🤖 Leonobit
Ofrecemos:
• WhatsApp Chatbots (respuestas automáticas 24/7)
• Odoo Integration (gestión completa de clientes)
¿Cuál te interesa?
```

**Nota**: Odoo renderiza correctamente `<em>`, `<br>`, bullets Unicode.

---

### **Caso 4: lead_id inválido (error)**

**Input**:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>Hola</p>",
  "lead_id": "999999"  // Lead no existe
}
```

**Odoo Response** (error):
```json
{
  "error": {
    "code": 400,
    "message": "RecordNotFound: crm.lead with id 999999 does not exist"
  }
}
```

**Implicación**: El workflow falla. Debería haber validación previa o manejo de errores.

---

## Mejoras Propuestas

### **1. Agregar author_id explícito**
**Problema**: Mensaje aparece como enviado por el usuario del credential, no por "Leonobit".

**Solución**: Crear partner virtual en Odoo:
```sql
-- En Odoo database
INSERT INTO res_partner (name, email, is_company, active)
VALUES ('Leonobit Bot', 'bot@leonobitech.com', false, true);
-- Resultado: id = 500
```

Luego en n8n:
```
Field Name or ID: Author Id
New Value: 500
```

**Beneficio**: Mensajes del bot claramente identificados con avatar y nombre "Leonobit Bot".

---

### **2. Agregar tracking personalizado**
**Problema**: No hay forma de saber si un mensaje fue generado por AI vs. template.

**Solución**: Agregar campo custom en `mail.message` o usar `description`:
```
Field Name or ID: Description
New Value: Generated by AI Agent Welcome (GPT-3.5-turbo)
```

**Beneficio**: Auditoría de qué mensajes fueron generados por IA vs. humanos.

---

### **3. Implementar rate limiting para mensajes**
**Problema**: Si hay un loop o bug, podría crear miles de mensajes.

**Solución**: Agregar nodo Code antes de este nodo:
```javascript
const leadId = $json.lead_id;
const recentMessages = await $('Odoo').execute_kw(
  'mail.message', 'search_count',
  [[
    ['model', '=', 'crm.lead'],
    ['res_id', '=', leadId],
    ['create_date', '>=', new Date(Date.now() - 60000).toISOString()]  // Últimos 60s
  ]]
);

if (recentMessages > 5) {
  throw new Error(`Rate limit: ${recentMessages} mensajes en 1 minuto para lead ${leadId}`);
}

return [{ json: $json }];
```

---

### **4. Agregar referencia a mensaje del cliente**
**Problema**: No hay enlace explícito entre pregunta (mensaje 1041) y respuesta (mensaje 1042).

**Solución**: Usar campo `parent_id` en `mail.message`:
```
Field Name or ID: Parent Id
New Value: {{ $('Create an Item').first().json.id }}
```

**Beneficio**: Odoo puede mostrar mensajes como hilos/threads (pregunta → respuesta).

---

### **5. Agregar notificaciones a followers**
**Problema**: Followers del lead no reciben notificación de la respuesta del bot.

**Solución**: Cambiar `message_type` a `notification`:
```
Field Name or ID: Message Type
New Value: notification
```

O configurar partners a notificar:
```
Field Name or ID: Notification Ids
New Value: [[0, 0, {'res_partner_id': 123, 'notification_type': 'inbox'}]]
```

**Beneficio**: Usuarios de Odoo son notificados en tiempo real de nuevas respuestas del bot.

---

### **6. Incluir metadata del modelo de IA**
**Problema**: No hay registro de qué modelo generó la respuesta.

**Solución**: Agregar campo personalizado en body:
```html
<p><strong>🤖 Leonobit:</strong><br>
¡Hola! Bienvenido a Leonobitech...<br>
<small style="color: #999; font-size: 0.8em;">
[GPT-3.5-turbo | Tokens: 45 | Latencia: 1.2s]
</small></p>
```

**Beneficio**: Debugging, análisis de costos, auditoría de modelos usados.

---

### **7. Implementar retry en caso de fallo**
**Problema**: Si Odoo está temporalmente no disponible, el mensaje se pierde.

**Solución**: Configurar retry en n8n:
```yaml
# En Settings del nodo
Continue On Fail: false
Retry On Fail: true
Max Tries: 3
Wait Between Tries: 5000  # 5 segundos
```

**Beneficio**: Resiliencia ante fallos transitorios de Odoo.

---

### **8. Agregar campo custom para tipo de agente**
**Problema**: No se distingue entre mensajes de "AI Agent Welcome" vs. "Agente Master" (ETAPA 5).

**Solución**: Crear campo custom en Odoo:
```python
# En crm.lead
x_agent_type = fields.Selection([
    ('welcome', 'Agente de Bienvenida'),
    ('master', 'Agente Master'),
    ('human', 'Humano')
])
```

Luego en n8n:
```
Field Name or ID: x_agent_type
New Value: welcome
```

**Beneficio**: Análisis de qué tipo de agente generó cada mensaje.

---

## Siguiente Nodo Esperado

Después de registrar el mensaje en Odoo, el flujo debería:

1. **Enviar a WhatsApp** usando `content_whatsapp` del nodo 30
2. **Actualizar Baserow** con el último mensaje enviado

**Nodos esperados**:
- **Nodo 32**: HTTP Request a Chatwoot API (POST `/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`)
- **Nodo 33**: Baserow Update (actualizar `last_message` del lead con la respuesta del bot)

O bien, si se ejecutan en paralelo:
```
Filter Output Initial (30)
    ├─→ Create an item1 (31) - Odoo chatter
    ├─→ HTTP Request (32) - Envío a WhatsApp
    └─→ Baserow Update (33) - Actualizar estado
```

---

## Relación con Arquitectura Global

```
ETAPA 1: Filter Process (5 nodos)
    ↓
ETAPA 2: Buffer Messages (12 nodos)
    ↓
ETAPA 3: Register Leads (14 nodos hasta aquí)
    ↓ [Create Flow]
    - Build Lead Row → ... → Create an Item (28) - Mensaje del cliente
    ↓
    - AI Agent Welcome (29) - Generación de respuesta
    ↓
    - Filter Output Initial (30) - Formateo dual
    ↓
**→ Create an item1 (31) ← Estamos aquí** - Mensaje del bot en chatter
    ↓
ETAPA 6: Almacenamiento y Respuesta (?)
    - Envío a WhatsApp (Chatwoot API)
    - Actualización Baserow
```

**Posición en el flujo**: Este nodo **cierra el ciclo de registro en Odoo**, asegurando que tanto el mensaje del cliente como la respuesta del bot estén almacenados en el historial del lead.

---

## Conclusión

El **Nodo 31: Create an item1** registra la **respuesta del bot Leonobit** en el chatter de Odoo, completando la trazabilidad de la conversación.

**Funciones clave**:
1. Crear mensaje en `mail.message` asociado al lead
2. Almacenar respuesta HTML formateada
3. Marcar como `comment` (no envía emails)
4. Usar `subtype_id: 1` (Discussions) para notificaciones
5. Generar ID único del mensaje (1042)

**Diferencias con nodo 28**:
- Nodo 28: Mensaje **del cliente** (input desde webhook)
- Nodo 31: Mensaje **del bot** (output del AI Agent)

**Mejoras prioritarias**:
1. Agregar `author_id` con partner "Leonobit Bot"
2. Incluir metadata del modelo de IA en el body
3. Implementar retry en caso de fallo de Odoo
4. Agregar campo custom para tipo de agente

**Próximo paso**: Enviar `content_whatsapp` a Chatwoot para que llegue al cliente por WhatsApp.
