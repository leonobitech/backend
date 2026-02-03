# Nodo 3: checkIfClientMessage

## Información General

- **Nombre del nodo**: `checkIfClientMessage`
- **Tipo**: Switch (Condicional)
- **Función**: Filtrar solo mensajes enviados por el cliente (incoming)
- **Entrada**: Salida del nodo `checkIfMessageCreated`

## Descripción

Este nodo actúa como **segundo filtro de validación**. Verifica que el mensaje sea de tipo "incoming" (enviado por el cliente), descartando mensajes "outgoing" (respuestas del agente) que también disparan webhooks en Chatwoot.

## Configuración del Nodo

### Conditions (Condiciones)

```javascript
{{ $json.body.message_type }} is equal to incoming
```

### Settings
- **Convert types where required**: ✅ Enabled

### Options
- No properties configuradas

## Lógica de Filtrado

### Condición Evaluada
```javascript
$json.body.message_type === "incoming"
```

### Valores posibles del campo `message_type`:
- ✅ `"incoming"` → Mensaje del cliente → Continúa el flujo
- ❌ `"outgoing"` → Respuesta del agente → Se detiene
- ❌ `"activity"` → Mensaje del sistema → Se detiene
- ❌ `"template"` → Mensaje de plantilla → Se detiene

## Estructura de Entrada

Recibe el objeto completo de los nodos anteriores:

```json
{
  "body": {
    "event": "message_created",
    "message_type": "incoming",  // ⭐ Campo evaluado
    "content": "Hola que tal",
    "content_type": "text",
    "sender": {
      "id": 186,
      "name": "Felix Figueroa",
      "phone_number": "+5491133851987"
    },
    "conversation": { /* ... */ }
  }
}
```

## Formato de Salida (JSON)

### ✅ Cuando la condición se cumple (message_type = "incoming")

El nodo pasa **exactamente el mismo objeto** sin modificaciones:

```json
[
  {
    "headers": { /* headers HTTP */ },
    "params": {},
    "query": {},
    "body": {
      "event": "message_created",
      "message_type": "incoming",
      "content": "Hola que tal",
      "content_type": "text",
      "sender": {
        "id": 186,
        "name": "Felix Figueroa",
        "phone_number": "+5491133851987",
        "blocked": false
      },
      "conversation": {
        "id": 190,
        "status": "open",
        "channel": "Channel::Whatsapp",
        "can_reply": true
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

## Diagrama de Flujo Acumulado

```
┌─────────────┐
│   webhook   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ checkIfMessageCreated   │
│ IF: event ==            │
│     "message_created"   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ checkIfClientMessage    │ ← ESTAMOS AQUÍ
│ IF: message_type ==     │
│     "incoming"          │
└──────┬──────────────────┘
       │
    ┌──┴──┐
    │     │
   ✅ SI  ❌ NO
    │     │
    │  (Stop)
    │
    ▼
[Siguiente Nodo]
```

## Propósito en el Workflow

1. **Evitar bucles infinitos**: Impide que el agente procese sus propias respuestas
2. **Filtrar ruido**: Solo procesa mensajes reales del cliente
3. **Eficiencia**: Ahorra procesamiento LLM en mensajes irrelevantes

## ¿Por qué es necesario?

Cuando el agente responde a través de Chatwoot/WhatsApp, el webhook también se dispara con `message_type: "outgoing"`. Sin este filtro, el workflow intentaría procesar sus propias respuestas, creando:
- ❌ Bucles infinitos
- ❌ Duplicación de datos en Baserow/Odoo
- ❌ Costos innecesarios de API (OpenAI, Qdrant, etc.)

## Casos de Uso Bloqueados

### Ejemplo de mensaje outgoing (bloqueado):
```json
{
  "event": "message_created",
  "message_type": "outgoing",  // ❌ No pasa el filtro
  "content": "¡Hola! Gracias por contactarnos...",
  "sender": {
    "id": 1,
    "name": "Sales Agent",
    "type": "agent_bot"  // No es un contacto
  }
}
```

### Ejemplo de mensaje de sistema (bloqueado):
```json
{
  "event": "message_created",
  "message_type": "activity",  // ❌ No pasa el filtro
  "content": "Conversation was assigned to Agent X"
}
```

## Estado Actual del Flujo

Después de pasar estos 3 nodos, tenemos garantizado:
1. ✅ Es un evento de mensaje creado
2. ✅ Es un mensaje entrante del cliente
3. ✅ El objeto contiene toda la información del webhook

## Datos Disponibles para el Siguiente Nodo

| Campo | Valor | Uso |
|-------|-------|-----|
| `body.sender.phone_number` | "+5491133851987" | Buscar lead en Baserow |
| `body.sender.name` | "Felix Figueroa" | Crear lead si no existe |
| `body.sender.id` | 186 | Contact ID de Chatwoot |
| `body.conversation.id` | 190 | Conversation ID |
| `body.content` | "Hola que tal" | Mensaje del cliente |
| `body.id` | 2704 | Message ID |
| `body.created_at` | "2025-10-31T12:33:39.918Z" | Timestamp |

## Próximo Nodo Esperado

Ahora que tenemos un mensaje válido del cliente, el siguiente paso lógico debería ser:

1. **Búsqueda en Baserow**: Consultar si existe un lead con ese `phone_number`
2. O **Extracción de datos**: Preparar variables limpias antes de consultar

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Salida**: Objeto webhook sin modificar (solo si `message_type === "incoming"`)
