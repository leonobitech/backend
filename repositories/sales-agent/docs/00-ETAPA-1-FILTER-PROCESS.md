# ETAPA 1: Filter Process (Filtrado y Validación)

## Resumen Ejecutivo

La **Etapa 1** del workflow del Sales Agent es una **cadena de filtros secuenciales** que valida cada mensaje entrante antes de procesarlo. Esta etapa garantiza que solo los mensajes válidos y procesables lleguen a la lógica de negocio.

## Objetivo de esta Etapa

Filtrar el tráfico de webhooks de Chatwoot para procesar únicamente:
- ✅ Eventos de mensajes creados (no actualizaciones ni otros eventos)
- ✅ Mensajes enviados por clientes (no respuestas del agente)
- ✅ Leads activos (no desactivados manualmente)
- ✅ Contenido de texto plano (no multimedia)

## Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ETAPA 1: FILTER PROCESS                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│  Webhook    │ ← Entrada desde Chatwoot (todos los eventos)
└──────┬──────┘
       │
       │ POST https://n8n.leonobitech.com/webhook-test/...
       │ Body: { event, message_type, content, sender, conversation }
       │
       ▼
┌─────────────────────────────────┐
│ checkIfMessageCreated           │
│ Filtro 1: Tipo de evento        │
│                                 │
│ IF: $json.body.event ==         │
│     "message_created"           │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
   ✅ SI     ❌ NO → STOP (event != "message_created")
    │
    ▼
┌─────────────────────────────────┐
│ checkIfClientMessage            │
│ Filtro 2: Dirección del mensaje │
│                                 │
│ IF: $json.body.message_type ==  │
│     "incoming"                  │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
   ✅ SI     ❌ NO → STOP (mensaje del agente/sistema)
    │
    ▼
┌─────────────────────────────────┐
│ If_Estado_!=_OFF                │
│ Filtro 3: Estado del lead       │
│                                 │
│ IF: custom_attributes.estado    │
│     !== "OFF"                   │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
   ✅ SI     ❌ NO → STOP (lead desactivado)
    │
    ▼
┌─────────────────────────────────┐
│ isTexto?                        │
│ Filtro 4: Tipo de contenido     │
│                                 │
│ IF: content_type == "text"      │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
   ✅ SI     ❌ NO → STOP (imagen/video/audio/documento)
    │
    ▼
┌─────────────────────────────────┐
│    FIN DE ETAPA 1               │
│    ✅ Mensaje validado          │
└────────┬────────────────────────┘
         │
         ▼
    [ ETAPA 2 ]
```

## Nodos de esta Etapa

| # | Nombre | Tipo | Función | Doc |
|---|--------|------|---------|-----|
| 1 | `webhook` | Webhook | Recibir webhooks de Chatwoot | [📄 Ver doc](./01-webhook-entrada.md) |
| 2 | `checkIfMessageCreated` | Switch | Filtrar solo eventos "message_created" | [📄 Ver doc](./02-check-if-message-created.md) |
| 3 | `checkIfClientMessage` | Switch | Filtrar solo mensajes "incoming" | [📄 Ver doc](./03-check-if-client-message.md) |
| 4 | `If_Estado_!=_OFF` | Switch | Filtrar leads activos (estado ≠ OFF) | [📄 Ver doc](./04-if-estado-not-off.md) |
| 5 | `isTexto?` | Switch | Filtrar solo contenido tipo "text" | [📄 Ver doc](./05-is-texto.md) |

## Datos de Entrada (Nodo 1: webhook)

### Estructura del Webhook de Chatwoot
```json
{
  "event": "message_created",
  "message_type": "incoming",
  "content": "Hola que tal",
  "content_type": "text",
  "id": 2704,
  "source_id": "wamid.HBg...",
  "created_at": "2025-10-31T12:33:39.918Z",

  "sender": {
    "id": 186,
    "name": "Felix Figueroa",
    "phone_number": "+5491133851987",
    "email": null,
    "custom_attributes": {
      "estado": "ON"  // o undefined
    }
  },

  "conversation": {
    "id": 190,
    "status": "open",
    "channel": "Channel::Whatsapp",
    "inbox_id": 1,
    "messages": [...]
  },

  "inbox": {
    "id": 1,
    "name": "WhatsApp"
  },

  "account": {
    "id": 1,
    "name": "Leonobitech"
  }
}
```

## Datos de Salida (Fin de Etapa 1)

**Objeto sin modificar**: El último nodo (`isTexto?`) pasa exactamente el mismo objeto que recibió del webhook, sin ninguna transformación.

### Datos Clave Validados Disponibles

| Campo | Path JSON | Ejemplo | Validado |
|-------|-----------|---------|----------|
| **Mensaje del cliente** | `body.content` | "Hola que tal" | ✅ Es texto |
| **Teléfono** | `body.sender.phone_number` | "+5491133851987" | ✅ Disponible |
| **Nombre** | `body.sender.name` | "Felix Figueroa" | ✅ Disponible |
| **Contact ID** | `body.sender.id` | 186 | ✅ Disponible |
| **Conversation ID** | `body.conversation.id` | 190 | ✅ Disponible |
| **Message ID** | `body.id` | 2704 | ✅ Disponible |
| **Timestamp** | `body.created_at` | "2025-10-31T12:33:39.918Z" | ✅ Disponible |
| **Estado del lead** | `body.sender.custom_attributes.estado` | undefined o "ON" | ✅ No es "OFF" |

## Casos de Bloqueo (Workflow se Detiene)

### ❌ Caso 1: Evento diferente a "message_created"
```json
{ "event": "conversation_status_changed" }
```
**Bloqueado en**: Nodo 2 (checkIfMessageCreated)

### ❌ Caso 2: Mensaje saliente (respuesta del agente)
```json
{ "message_type": "outgoing" }
```
**Bloqueado en**: Nodo 3 (checkIfClientMessage)
**Razón**: Evitar bucles infinitos

### ❌ Caso 3: Lead desactivado
```json
{ "sender": { "custom_attributes": { "estado": "OFF" } } }
```
**Bloqueado en**: Nodo 4 (If_Estado_!=_OFF)
**Razón**: Opt-out manual o lead de baja calidad

### ❌ Caso 4: Mensaje multimedia
```json
{ "content_type": "image" }
{ "content_type": "audio" }
{ "content_type": "video" }
```
**Bloqueado en**: Nodo 5 (isTexto?)
**Razón**: El agente solo procesa texto por ahora

## Métricas y Eficiencia

### Tasa de Filtrado Estimada

| Filtro | % Pasa | % Bloqueado | Razón Principal |
|--------|--------|-------------|-----------------|
| checkIfMessageCreated | ~70% | ~30% | Eventos de estado, actualizaciones |
| checkIfClientMessage | ~50% | ~50% | Respuestas del agente (outgoing) |
| If_Estado_!=_OFF | ~95% | ~5% | Leads desactivados manualmente |
| isTexto? | ~85% | ~15% | Notas de voz, imágenes, stickers |

**Tasa de aprobación final**: ~28% de todos los webhooks llegan a la Etapa 2

### Optimizaciones Posibles

1. **Combinar filtros 1-3 en un solo Switch**:
```javascript
// Un solo nodo con condición AND
{{
  $json.body.event === "message_created" &&
  $json.body.message_type === "incoming" &&
  $json.body.sender.custom_attributes?.estado !== "OFF"
}}
```

2. **Validar en el webhook de Chatwoot**:
- Configurar Chatwoot para solo enviar webhooks de `message_created` + `incoming`
- Reducir carga en n8n

## Seguridad y Robustez

### ✅ Protecciones Implementadas

1. **Prevención de bucles**: Filtro de `message_type = incoming`
2. **Control de acceso**: Filtro de `estado != OFF`
3. **Validación de formato**: Filtro de `content_type = text`
4. **Idempotencia**: Cada ejecución procesa un solo mensaje

### ⚠️ Puntos de Mejora

1. **Validación de webhook signature**: Verificar que el webhook viene realmente de Chatwoot
2. **Rate limiting**: Proteger contra spam o flooding
3. **Logging de filtrados**: Registrar cuántos mensajes se bloquean y por qué
4. **Alertas**: Notificar cuando un lead en "OFF" intenta contactar

## Próxima Etapa

### ETAPA 2: Gestión de Estado (Baserow/Odoo)

El siguiente paso del workflow será:
1. **Consultar Baserow**: Verificar si el lead existe por `phone_number`
2. **Bifurcación**:
   - **Lead nuevo** → Flujo de registro
   - **Lead existente** → Flujo de conversación continua

---

## Documentación de Nodos

- [Nodo 1: webhook](./01-webhook-entrada.md)
- [Nodo 2: checkIfMessageCreated](./02-check-if-message-created.md)
- [Nodo 3: checkIfClientMessage](./03-check-if-client-message.md)
- [Nodo 4: If_Estado_!=_OFF](./04-if-estado-not-off.md)
- [Nodo 5: isTexto?](./05-is-texto.md)

---

**Etapa documentada el**: 2025-10-31
**Estado**: ✅ Completada y validada
**Próximo paso**: Documentar ETAPA 2 (Gestión de Estado)
