# Nodo 5: isTexto?

## Información General

- **Nombre del nodo**: `isTexto?`
- **Tipo**: Switch (Condicional)
- **Función**: Filtrar solo mensajes de tipo texto (no multimedia)
- **Entrada**: Salida del nodo `If_Estado_!=_OFF`

## Descripción

Este nodo verifica que el mensaje sea de tipo **"text"**, descartando mensajes multimedia como imágenes, videos, audios, documentos, stickers, ubicaciones, etc.

El agente actual está optimizado para procesar solo texto. Este filtro evita errores al intentar analizar contenido multimedia con LLMs.

## Configuración del Nodo

### Conditions (Condiciones)

```javascript
{{
  $json.body.conversation?.messages[0]?.attachments
  ? $json.body.conversation.messages[0].attachments[0].file_type
  : $json.body.content_type
}}
is equal to
text
```

### Lógica de la Condición

El nodo usa un **operador ternario** para verificar dos posibles fuentes del tipo de contenido:

1. **Si hay attachments**: Usa `attachments[0].file_type`
2. **Si NO hay attachments**: Usa `content_type` del body principal

### Settings
- **Convert types where required**: ✅ Enabled

### Options
- No properties configuradas

## Lógica de Filtrado

### Condición Evaluada (Pseudocódigo)
```javascript
const contentType = $json.body.conversation?.messages[0]?.attachments?.length > 0
  ? $json.body.conversation.messages[0].attachments[0].file_type
  : $json.body.content_type;

if (contentType === "text") {
  // ✅ Continúa el flujo
} else {
  // ❌ Se detiene
}
```

### Valores posibles de `content_type`:

| Tipo | ¿Continúa? | Descripción |
|------|-----------|-------------|
| `"text"` | ✅ SI | Mensaje de texto plano |
| `"image"` | ❌ NO | Imagen enviada |
| `"video"` | ❌ NO | Video enviado |
| `"audio"` | ❌ NO | Audio/nota de voz |
| `"file"` | ❌ NO | Documento/PDF |
| `"location"` | ❌ NO | Ubicación compartida |
| `"sticker"` | ❌ NO | Sticker/emoji animado |
| `"contact"` | ❌ NO | Contacto compartido |

## Estructura de Entrada

### Caso 1: Mensaje de texto simple (sin attachments)
```json
{
  "body": {
    "content": "Hola que tal",
    "content_type": "text",  // ⭐ Campo evaluado
    "conversation": {
      "messages": [
        {
          "content": "Hola que tal",
          "attachments": []  // Array vacío o no existe
        }
      ]
    }
  }
}
```

### Caso 2: Mensaje con archivo adjunto
```json
{
  "body": {
    "content": "",
    "content_type": "image",
    "conversation": {
      "messages": [
        {
          "content": "",
          "attachments": [
            {
              "file_type": "image",  // ⭐ Campo evaluado cuando hay attachments
              "data_url": "https://...",
              "thumb_url": "https://..."
            }
          ]
        }
      ]
    }
  }
}
```

## Formato de Salida (JSON)

### ✅ Cuando la condición se cumple (content_type = "text")

El nodo pasa **exactamente el mismo objeto** sin modificaciones:

```json
[
  {
    "headers": { /* ... */ },
    "body": {
      "event": "message_created",
      "message_type": "incoming",
      "content": "Hola que tal",
      "content_type": "text",  // ✅ Es texto
      "sender": {
        "id": 186,
        "name": "Felix Figueroa",
        "phone_number": "+5491133851987"
      },
      "conversation": {
        "id": 190,
        "messages": [
          {
            "id": 2704,
            "content": "Hola que tal",
            "content_type": "text",
            "attachments": []  // Sin archivos adjuntos
          }
        ]
      }
    }
  }
]
```

### ❌ Cuando la condición NO se cumple (no es texto)

El flujo se detiene. El cliente no recibe respuesta automática para contenido multimedia.

## Diagrama de Flujo Acumulado

```
┌─────────────┐
│   webhook   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ checkIfMessageCreated   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ checkIfClientMessage    │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ If_Estado_!=_OFF        │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ isTexto?                │ ← ESTAMOS AQUÍ
│ IF: content_type ==     │
│     "text"              │
└──────┬──────────────────┘
       │
    ┌──┴──┐
    │     │
   ✅ SI  ❌ NO
    │     │
    │  (Stop - Contenido multimedia)
    │
    ▼
[Siguiente Nodo]
```

## Casos de Uso Bloqueados

### Ejemplo 1: Cliente envía una imagen
```json
{
  "content": "",
  "content_type": "image",  // ❌ No pasa el filtro
  "conversation": {
    "messages": [
      {
        "attachments": [
          {
            "file_type": "image",
            "data_url": "https://chatwoot.com/storage/image.jpg"
          }
        ]
      }
    ]
  }
}
```
**Resultado**: El workflow se detiene. No hay respuesta automática.

### Ejemplo 2: Cliente envía una nota de voz
```json
{
  "content": "",
  "content_type": "audio",  // ❌ No pasa el filtro
  "conversation": {
    "messages": [
      {
        "attachments": [
          {
            "file_type": "audio",
            "data_url": "https://chatwoot.com/storage/voice.ogg"
          }
        ]
      }
    ]
  }
}
```
**Resultado**: El workflow se detiene. Posible mejora futura: transcribir audio con Whisper API.

## Propósito en el Workflow

1. **Compatibilidad LLM**: Los modelos de lenguaje actuales procesan solo texto
2. **Evitar errores**: Previene fallos al intentar analizar archivos multimedia
3. **Experiencia de usuario**: Define límites claros de lo que el agente puede procesar
4. **Costos**: Evita gastos innecesarios en análisis de contenido no textual

## Mejoras Futuras Sugeridas

### Opción 1: Soporte para imágenes (Vision API)
```javascript
if (content_type === "image") {
  // Usar OpenAI GPT-4 Vision para analizar la imagen
  // Extraer texto o descripción
  // Continuar el flujo con el texto extraído
}
```

### Opción 2: Transcripción de audio
```javascript
if (content_type === "audio") {
  // Usar Whisper API para transcribir
  // Convertir audio a texto
  // Continuar el flujo con la transcripción
}
```

### Opción 3: Mensaje automático de respuesta
```javascript
if (content_type !== "text") {
  // Enviar mensaje: "Lo siento, solo puedo procesar mensajes de texto por ahora."
  // Detener el flujo
}
```

## Estado Actual del Flujo

Después de pasar estos 5 nodos, tenemos garantizado:
1. ✅ Es un evento de mensaje creado
2. ✅ Es un mensaje entrante del cliente
3. ✅ El lead NO está en estado "OFF"
4. ✅ El mensaje es de tipo **texto plano**
5. ✅ El contenido puede ser procesado por LLMs

## Datos Validados Disponibles

| Campo | Valor Ejemplo | Estado |
|-------|---------------|--------|
| `body.content` | "Hola que tal" | ✅ Texto válido |
| `body.content_type` | "text" | ✅ Validado |
| `body.sender.phone_number` | "+5491133851987" | ✅ Disponible |
| `body.sender.name` | "Felix Figueroa" | ✅ Disponible |
| `body.conversation.id` | 190 | ✅ Disponible |

## Próximo Nodo Esperado

Ahora que tenemos un **mensaje de texto válido** de un **lead activo**, el siguiente paso lógico es:

1. **Consultar Baserow**: Buscar si existe un lead con ese `phone_number`
2. O **Preparar variables**: Nodo Code para extraer y limpiar datos antes de consultar

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Salida**: Objeto webhook sin modificar (solo si `content_type === "text"`)
**Mejora sugerida**: Implementar soporte para multimedia (Vision API, Whisper)
