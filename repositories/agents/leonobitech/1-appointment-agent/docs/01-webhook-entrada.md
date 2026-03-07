# Nodo 1: Webhook de Entrada

## Información General

- **Nombre del nodo**: `webhook`
- **Tipo**: Webhook (HTTP Listener)
- **Función**: Recibir mensajes entrantes de WhatsApp vía Chatwoot
- **URL**: `https://n8n.leonobitech.com/webhook-test/edbc5093-5b7d-4245-976f-6f0b9a355df7`

## Descripción

Este nodo actúa como punto de entrada del workflow. Recibe webhooks de Chatwoot cada vez que un mensaje de WhatsApp llega a la cuenta de Leonobitech.

## Configuración del Nodo

- **HTTP Method**: POST (implícito por el content de Chatwoot)
- **Path**: `/webhook-test/edbc5093-5b7d-4245-976f-6f0b9a355df7`
- **Authentication**: None (protegido por URL única)
- **Response Mode**: (Por definir según configuración)

## Estructura de Datos de Entrada

### Headers Relevantes
```json
{
  "host": "n8n.leonobitech.com",
  "content-type": "application/json",
  "cf-ipcountry": "FR",
  "x-forwarded-proto": "https"
}
```

### Body Principal

El webhook de Chatwoot envía un objeto con la siguiente estructura:

```json
{
  "event": "message_created",           // Tipo de evento
  "account": {
    "id": 1,
    "name": "Leonobitech"
  },
  "inbox": {
    "id": 1,
    "name": "WhatsApp"
  },
  "message_type": "incoming",            // Filtrar solo "incoming"
  "content": "Hola que tal",             // ⭐ MENSAJE DEL CLIENTE
  "content_type": "text",
  "id": 2704,                            // ID del mensaje en Chatwoot
  "created_at": "2025-10-31T12:33:39.918Z",
  "source_id": "wamid.HBg...",          // ID único de WhatsApp

  // Información del remitente
  "sender": {
    "id": 186,                           // ⭐ CONTACT_ID
    "name": "Felix Figueroa",            // ⭐ NOMBRE DEL LEAD
    "phone_number": "+5491133851987",    // ⭐ TELÉFONO
    "email": null,
    "thumbnail": "",
    "blocked": false,
    "custom_attributes": {},
    "additional_attributes": {}
  },

  // Información de la conversación
  "conversation": {
    "id": 190,                           // ⭐ CONVERSATION_ID
    "inbox_id": 1,
    "status": "open",
    "channel": "Channel::Whatsapp",
    "can_reply": true,
    "unread_count": 1,
    "last_activity_at": 1761914019,
    "created_at": 1761914019,
    "priority": null,
    "labels": [],

    "contact_inbox": {
      "id": 186,
      "contact_id": 186,
      "inbox_id": 1,
      "source_id": "5491133851987",     // Número sin +
      "pubsub_token": "JVaPntcL7N1q1xratHFLaggK"
    },

    "messages": [
      {
        "id": 2704,
        "content": "Hola que tal",
        "message_type": 0,               // 0 = incoming, 1 = outgoing
        "status": "sent",
        "sender_type": "Contact",
        "sender_id": 186,
        "processed_message_content": "Hola que tal"
      }
    ],

    "meta": {
      "sender": { /* mismo objeto que sender principal */ },
      "assignee": null,
      "team": null
    }
  }
}
```

## Datos Clave Extraídos

### Para el siguiente nodo necesitamos:

| Campo | Path JSON | Descripción | Ejemplo |
|-------|-----------|-------------|---------|
| **Mensaje** | `body.content` | Texto del mensaje del cliente | "Hola que tal" |
| **Teléfono** | `body.sender.phone_number` | Número con código internacional | "+5491133851987" |
| **Nombre** | `body.sender.name` | Nombre del contacto en Chatwoot | "Felix Figueroa" |
| **Contact ID** | `body.sender.id` | ID único del contacto en Chatwoot | 186 |
| **Conversation ID** | `body.conversation.id` | ID de la conversación activa | 190 |
| **Message ID** | `body.id` | ID del mensaje | 2704 |
| **Timestamp** | `body.created_at` | Fecha/hora del mensaje | "2025-10-31T12:33:39.918Z" |
| **Source ID** | `body.source_id` | ID único de WhatsApp | "wamid.HBg..." |

## Validaciones Recomendadas

1. **Filtrar solo mensajes entrantes**: `body.message_type === "incoming"`
2. **Verificar evento**: `body.event === "message_created"`
3. **Validar contenido**: `body.content_type === "text"` (por ahora)
4. **Verificar canal**: `body.conversation.channel === "Channel::Whatsapp"`

## Formato de Salida (JSON)

El nodo pasa **todo el objeto** al siguiente nodo sin transformación. El array contiene un único elemento:

```json
[
  {
    "headers": { /* headers HTTP */ },
    "params": {},
    "query": {},
    "body": { /* objeto completo de Chatwoot */ },
    "webhookUrl": "https://n8n.leonobitech.com/webhook-test/...",
    "executionMode": "test"
  }
]
```

## Notas Importantes

- **Ejecución en modo test**: El campo `executionMode: "test"` indica que fue activado manualmente. En producción será `"production"`.
- **Un mensaje = Una ejecución**: Cada mensaje entrante dispara una nueva ejecución del workflow.
- **No hay código JavaScript**: Este nodo es solo receptor, no procesa datos.

## Próximo Nodo

El siguiente nodo debería:
1. Extraer los campos clave del `body`
2. Validar que sea un mensaje entrante de texto
3. Preparar variables para consultar Baserow/Odoo

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
