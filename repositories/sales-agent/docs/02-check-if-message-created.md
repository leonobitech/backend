# Nodo 2: checkIfMessageCreated

## Información General

- **Nombre del nodo**: `checkIfMessageCreated`
- **Tipo**: Switch (Condicional)
- **Función**: Filtrar solo eventos de tipo "message_created"
- **Entrada**: Salida del nodo `webhook`

## Descripción

Este nodo actúa como **primer filtro de validación**. Verifica que el webhook recibido sea efectivamente un evento de mensaje creado, descartando otros tipos de eventos que Chatwoot puede enviar (message_updated, conversation_status_changed, etc.).

## Configuración del Nodo

### Conditions (Condiciones)

```javascript
{{ $json.body.event }} is equal to message_created
```

### Settings
- **Convert types where required**: ✅ Enabled

### Options
- No properties configuradas

## Lógica de Filtrado

### Condición Evaluada
```javascript
$json.body.event === "message_created"
```

### Valores posibles del campo `event`:
- ✅ `"message_created"` → Continúa el flujo
- ❌ `"message_updated"` → Se detiene
- ❌ `"conversation_created"` → Se detiene
- ❌ `"conversation_status_changed"` → Se detiene
- ❌ Otros eventos → Se detiene

## Estructura de Entrada

Recibe el objeto completo del webhook (ver [Nodo 1: webhook](./01-webhook-entrada.md)):

```json
{
  "body": {
    "event": "message_created",  // ⭐ Campo evaluado
    "message_type": "incoming",
    "content": "Hola que tal",
    "sender": { /* ... */ },
    "conversation": { /* ... */ }
  }
}
```

## Formato de Salida (JSON)

### ✅ Cuando la condición se cumple (event = "message_created")

El nodo pasa **exactamente el mismo objeto** sin modificaciones:

```json
[
  {
    "headers": { /* headers HTTP */ },
    "params": {},
    "query": {},
    "body": {
      "event": "message_created",
      "account": { "id": 1, "name": "Leonobitech" },
      "content": "Hola que tal",
      "content_type": "text",
      "message_type": "incoming",
      "sender": {
        "id": 186,
        "name": "Felix Figueroa",
        "phone_number": "+5491133851987"
      },
      "conversation": {
        "id": 190,
        "status": "open",
        "channel": "Channel::Whatsapp"
      },
      "id": 2704,
      "created_at": "2025-10-31T12:33:39.918Z",
      "source_id": "wamid.HBg..."
    },
    "webhookUrl": "https://n8n.leonobitech.com/webhook-test/...",
    "executionMode": "test"
  }
]
```

### ❌ Cuando la condición NO se cumple

El flujo se detiene y no pasa datos al siguiente nodo.

## Diagrama de Flujo

```
┌─────────────┐
│   webhook   │
└──────┬──────┘
       │
       │ Todos los eventos
       │
       ▼
┌─────────────────────────┐
│ checkIfMessageCreated   │
│                         │
│ IF: event == "message_  │
│     created"            │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │         │
   ✅ SI     ❌ NO
    │         │
    │      (Stop)
    │
    ▼
[Siguiente Nodo]
```

## Propósito en el Workflow

1. **Seguridad**: Evita procesar webhooks no relacionados con mensajes nuevos
2. **Eficiencia**: No gasta recursos en eventos irrelevantes
3. **Claridad**: Separa la lógica de filtrado antes de procesar datos

## Mejoras Sugeridas

### Filtrado Adicional Recomendado
Podrías agregar más condiciones en un nodo Switch posterior:

```javascript
// Validar que sea mensaje entrante
{{ $json.body.message_type }} is equal to incoming

// Validar que sea de WhatsApp
{{ $json.body.conversation.channel }} is equal to Channel::Whatsapp

// Validar que sea mensaje de texto
{{ $json.body.content_type }} is equal to text
```

### Alternativa: Usar un solo nodo Switch con múltiples condiciones
```javascript
// Condición AND múltiple
{{
  $json.body.event === "message_created" &&
  $json.body.message_type === "incoming" &&
  $json.body.content_type === "text"
}}
```

## Notas Importantes

- ⚠️ **No hay transformación de datos**: El nodo solo filtra, no modifica
- 🔄 **Pasa todo el objeto**: Los nodos siguientes reciben la estructura completa
- 📊 **Sin código JavaScript**: Solo usa expresiones de n8n

## Próximo Nodo Esperado

Basándome en tu descripción inicial, el siguiente nodo debería:
1. **Consultar Baserow** para verificar si el lead existe (por número de teléfono)
2. O hacer una **extracción/transformación** de datos clave antes de consultar

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Salida**: Objeto webhook sin modificar (solo si `event === "message_created"`)
