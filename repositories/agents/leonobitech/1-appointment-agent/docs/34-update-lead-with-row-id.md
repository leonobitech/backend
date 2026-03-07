# Nodo 34: UpdateLeadWithRow_Id

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | UpdateLeadWithRow_Id |
| **Tipo** | Baserow (Update Row) |
| **Función** | Actualizar registro existente en Baserow con nuevos datos de actividad |
| **Entrada** | Payload limpio desde Node 33 (UpdatePayload) |
| **Operación** | UPDATE |

---

## Descripción

**UpdateLeadWithRow_Id** es el nodo de actualización de Baserow para leads existentes en **ETAPA 4**. A diferencia del Node 24 (createLeadBaserow) que crea nuevos registros, este nodo **actualiza campos específicos** de un lead ya existente, preservando datos históricos inmutables.

Su función principal es:
1. **Actualizar campos mutables** (`last_message`, `last_message_id`, `last_activity_iso`)
2. **Preservar campos inmutables** (`first_interaction`, `chatwoot_id`, `lead_id`)
3. **Mantener sincronización** entre mensajes de WhatsApp y estado en Baserow
4. **Registrar última actividad** para análisis de engagement

**Contraste con Node 24 (createLeadBaserow):**
- **Node 24**: Operación CREATE (leads nuevos, sin row_id)
- **Node 34**: Operación UPDATE (leads existentes, con row_id)

---

## Configuración

### Parámetros Principales

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| **Credential** | Baserow account | Autenticación API Baserow |
| **Resource** | Row | Tipo de recurso a actualizar |
| **Operation** | Update | Operación de escritura |
| **Database Name or ID** | Leonobitech | Base de datos principal |
| **Table Name or ID** | Leads | Tabla de leads/contactos |
| **Row ID** | `{{ $json.row_id }}` | ID del registro (198) |
| **Data to Send** | Define Below for Each Column | Campos individuales |

### Fields to Send (Campos Actualizados)

#### 1. channel
```javascript
Field Name: channel
Field Value: {{ $json.channel }}
Output: "whatsapp"
```

#### 2. last_message
```javascript
Field Name: last_message
Field Value: {{ $json.last_message }}
Output: "Si, claro me llamo Felix"
```

#### 3. last_message_id
```javascript
Field Name: last_message_id
Field Value: {{ $json.last_message_id }}
Output: "2706"
```

#### 4. last_activity_iso
```javascript
Field Name: last_activity_iso
Field Value: {{ $json.last_activity_iso }}
Output: "2025-10-31T16:39:43.908Z"
```

---

## Input

El nodo recibe el payload limpio desde **Node 33: UpdatePayload**:

```json
{
  "row_id": 198,
  "channel": "whatsapp",
  "last_message": "Si, claro me llamo Felix",
  "last_message_id": 2706,
  "last_activity_iso": "2025-10-31T16:39:43.908Z"
}
```

---

## Output

### Estructura de Salida (Registro Completo Actualizado)

```json
[
  {
    "id": 198,
    "order": "1.00000000000000000000",
    "chatwoot_id": "186",
    "phone_number": "+5491133851987",
    "email": "",
    "country": {
      "id": 3240,
      "value": "Argentina",
      "color": "cyan"
    },
    "internal_uid": "a412d4b2-78f4-4cfe-8533-e5da7cd0bd00",
    "priority": {
      "id": 3260,
      "value": "normal",
      "color": "darker-blue"
    },
    "last_message": "Si, claro me llamo Felix",
    "first_interaction": "2025-10-31T12:33:39Z",
    "lead_id": "33",
    "Odoo info": [],
    "full_name": "Felix Figueroa",
    "chatwoot_inbox_id": "186",
    "conversation_id": "190",
    "business_name": null,
    "tz": "-03:00",
    "channel": {
      "id": 3253,
      "value": "whatsapp",
      "color": "deep-dark-green"
    },
    "first_interaction_utc": "2025-10-31T12:33:39Z",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908000Z",
    "notes": null,
    "stage": {
      "id": 3262,
      "value": "explore",
      "color": "yellow"
    },
    "services_seen": "0",
    "prices_asked": "0",
    "deep_interest": "0",
    "proposal_offer_done": false,
    "interests": [],
    "email_ask_ts": null,
    "addressee_ask_ts": null
  }
]
```

### Campos Actualizados (Destacados)

| Campo | Valor Anterior | Valor Actualizado | Tipo |
|-------|----------------|-------------------|------|
| `last_message` | "Hola, necesito info" | **"Si, claro me llamo Felix"** | String |
| `last_message_id` | 2705 | **2706** | Number |
| `last_activity_iso` | 2025-10-31T16:39:25.000Z | **2025-10-31T16:39:43.908Z** | ISO Timestamp |
| `channel` | "whatsapp" | "whatsapp" | Select (sin cambio) |

### Campos Preservados (Inmutables)

| Campo | Valor | Estado |
|-------|-------|--------|
| `id` | 198 | Sin cambio (PK) |
| `chatwoot_id` | "186" | Sin cambio (create-only) |
| `first_interaction` | "2025-10-31T12:33:39Z" | Sin cambio (histórico) |
| `first_interaction_utc` | "2025-10-31T12:33:39Z" | Sin cambio (histórico) |
| `lead_id` | "33" | Sin cambio (enlace con Odoo) |
| `conversation_id` | "190" | Sin cambio (ID Chatwoot) |
| `full_name` | "Felix Figueroa" | Sin cambio |
| `phone_number` | "+5491133851987" | Sin cambio |

---

## Diagrama de Flujo

```
Node 33: UpdatePayload
         │
         │  { row_id: 198, last_message, last_message_id, last_activity_iso }
         │
         v
   Node 34: UpdateLeadWithRow_Id
         │
         │  Baserow UPDATE Operation
         │  Database: Leonobitech
         │  Table: Leads
         │  Row ID: 198
         │
         ├─> UPDATE channel = "whatsapp"
         ├─> UPDATE last_message = "Si, claro me llamo Felix"
         ├─> UPDATE last_message_id = 2706
         ├─> UPDATE last_activity_iso = "2025-10-31T16:39:43.908Z"
         │
         v
   Output: Registro completo con campos actualizados
         │
         v
   [Próximo nodo: Fetch historial desde Odoo]
```

---

## Comparación: Create vs Update

### Node 24: createLeadBaserow (Leads Nuevos)

**Operation:** CREATE

**Input:**
```json
{
  "chatwoot_id": 186,
  "phone_number": "+5491133851987",
  "full_name": "Felix Figueroa",
  "first_interaction": "2025-10-31T12:33:39Z",
  "last_message": "Hola, necesito info",
  "channel": "whatsapp",
  ...
}
```

**Output:** Nuevo registro con ID asignado (198)

**Campos escritos:** TODOS (create + always)

---

### Node 34: UpdateLeadWithRow_Id (Leads Existentes)

**Operation:** UPDATE

**Input:**
```json
{
  "row_id": 198,
  "channel": "whatsapp",
  "last_message": "Si, claro me llamo Felix",
  "last_message_id": 2706,
  "last_activity_iso": "2025-10-31T16:39:43.908Z"
}
```

**Output:** Registro existente con campos actualizados

**Campos escritos:** Solo `row_always` (4 campos mutables)

---

## Estado del Sistema Post-Ejecución

### Antes de Update (Estado Previo)

```json
{
  "id": 198,
  "last_message": "Hola, necesito info",
  "last_message_id": 2705,
  "last_activity_iso": "2025-10-31T16:39:25.000Z",
  "first_interaction": "2025-10-31T12:33:39Z",
  "lead_id": "33"
}
```

### Después de Update (Estado Actual)

```json
{
  "id": 198,
  "last_message": "Si, claro me llamo Felix",        // ✅ Actualizado
  "last_message_id": 2706,                           // ✅ Actualizado
  "last_activity_iso": "2025-10-31T16:39:43.908Z",   // ✅ Actualizado
  "first_interaction": "2025-10-31T12:33:39Z",       // ⛔ Preservado
  "lead_id": "33"                                     // ⛔ Preservado
}
```

### Diferencia Delta

```diff
{
  "id": 198,
- "last_message": "Hola, necesito info",
+ "last_message": "Si, claro me llamo Felix",
- "last_message_id": 2705,
+ "last_message_id": 2706,
- "last_activity_iso": "2025-10-31T16:39:25.000Z",
+ "last_activity_iso": "2025-10-31T16:39:43.908Z",
  "first_interaction": "2025-10-31T12:33:39Z",
  "lead_id": "33"
}
```

---

## Casos de Uso

### Caso 1: Lead Responde Mensaje de Bienvenida

**Contexto:**
1. Lead nuevo registrado en ETAPA 3 (Create Flow)
2. Bot envía bienvenida: "Hola, ¿en qué puedo ayudarte?"
3. Lead responde: "Si, claro me llamo Felix"
4. Webhook entra nuevamente, Node 22 detecta `exists=true`
5. ETAPA 4 actualiza actividad en Baserow

**Resultado:**
- `last_message` actualizado con respuesta del lead
- `last_activity_iso` actualizado con timestamp del mensaje
- `first_interaction` permanece sin cambios (dato histórico)

### Caso 2: Lead Retorna Después de Días

**Contexto:**
1. Lead tuvo conversación hace 3 días
2. Lead retorna: "Hola, quisiera más detalles sobre el servicio"
3. Sistema actualiza actividad para tracking de reengagement

**Resultado:**
- Baserow registra nueva actividad (útil para métricas de retención)
- Historial completo se mantiene en Odoo (no en Baserow)
- Campo `stage` puede cambiar de "explore" a "qualified" en nodos posteriores

### Caso 3: Conversación Multi-Mensaje

**Contexto:**
1. Lead envía varios mensajes en una conversación activa
2. Buffer de Redis agrupa mensajes (ETAPA 2)
3. Cada grupo actualiza Baserow con último mensaje

**Resultado:**
- Solo el último mensaje del buffer se guarda en `last_message`
- El historial completo está en Odoo (chatter)
- Baserow mantiene snapshot del estado más reciente

---

## Análisis de Campos de Output

### Campos de Baserow (Contexto Completo)

#### Identificadores
- `id`: 198 (PK de Baserow)
- `chatwoot_id`: "186" (ID en Chatwoot)
- `conversation_id`: "190" (ID de conversación en Chatwoot)
- `lead_id`: "33" (ID en Odoo CRM)
- `internal_uid`: UUID interno de Baserow

#### Datos del Lead
- `full_name`: "Felix Figueroa"
- `phone_number`: "+5491133851987"
- `email`: "" (vacío)
- `business_name`: null

#### Localización
- `country`: Select field (Argentina, color cyan)
- `tz`: "-03:00" (timezone offset)

#### Canal y Actividad
- `channel`: Select field (whatsapp, color deep-dark-green)
- `first_interaction`: "2025-10-31T12:33:39Z" (inmutable)
- `first_interaction_utc`: "2025-10-31T12:33:39Z" (inmutable)
- `last_message`: "Si, claro me llamo Felix" (actualizable)
- `last_message_id`: "2706" (actualizable)
- `last_activity_iso`: "2025-10-31T16:39:43.908Z" (actualizable)

#### Scoring y Cualificación
- `stage`: Select field ("explore", color yellow)
- `priority`: Select field ("normal", color darker-blue)
- `services_seen`: "0" (contador)
- `prices_asked`: "0" (contador)
- `deep_interest`: "0" (score)
- `proposal_offer_done`: false (boolean)

#### Engagement Tracking
- `interests`: [] (array de servicios de interés)
- `email_ask_ts`: null (timestamp cuando se pidió email)
- `addressee_ask_ts`: null (timestamp cuando se pidió nombre)

#### Relaciones
- `Odoo info`: [] (linked records a tabla de Odoo)

#### Notas
- `notes`: null (campo de texto libre)

---

## Arquitectura de Datos: Baserow como Estado

### Principio de Diseño

**Baserow NO es historial completo, es ESTADO ACTUAL:**

- **Historial completo**: Odoo (mail.message en chatter)
- **Estado y perfil**: Baserow (última actividad + scoring)
- **Buffer temporal**: Redis (mensajes en ventana de 8s)

### Flujo de Datos

```
WhatsApp → Chatwoot → n8n → Redis (buffer) → Baserow (estado) → Odoo (historial)
                                    ↓                                    ↓
                              last_message                         Todos los mensajes
                              last_activity                        con timestamps
                              scoring                              con contexto
```

### Ejemplo de Separación de Responsabilidades

**Conversación real:**
1. Lead: "Hola, necesito info"
2. Bot: "Hola, ¿en qué puedo ayudarte?"
3. Lead: "Si, claro me llamo Felix"

**En Baserow (Node 34):**
```json
{
  "last_message": "Si, claro me llamo Felix",  // ← Solo el último
  "last_activity_iso": "2025-10-31T16:39:43.908Z"
}
```

**En Odoo (Chatter):**
```
[2025-10-31 16:39:25] Cliente: Hola, necesito info
[2025-10-31 16:39:30] Bot: Hola, ¿en qué puedo ayudarte?
[2025-10-31 16:39:43] Cliente: Si, claro me llamo Felix
```

---

## Próximo Nodo Esperado

Después de actualizar Baserow, el flujo probablemente continúa con:

1. **Fetch History from Odoo** - Obtener todos los mensajes previos del chatter
2. **LLM Analista** - Analizar conversación completa y generar resumen
3. **Context Builder** - Preparar contexto para Agente Master
4. **RAG Query** - Consultar Qdrant si el mensaje pregunta por servicios

---

## Notas Técnicas

### 1. Baserow SELECT Fields (Tipos Especiales)

Los campos `country`, `channel`, `priority`, `stage` son **Single Select Fields** en Baserow:

```json
{
  "country": {
    "id": 3240,        // ID interno de la opción
    "value": "Argentina", // Texto visible
    "color": "cyan"    // Color en UI
  }
}
```

**Implicación:** Al actualizar estos campos, se debe enviar el `value` (string), no el `id`.

### 2. Timestamps en Baserow

Baserow devuelve timestamps en formato ISO 8601 con sufijo `Z` (UTC):

```json
{
  "first_interaction": "2025-10-31T12:33:39Z",           // Sin milisegundos
  "last_activity_iso": "2025-10-31T16:39:43.908000Z"    // Con milisegundos
}
```

**Inconsistencia:** `first_interaction` sin ms, `last_activity_iso` con ms.

**Recomendación:** Usar `last_activity_iso` para cálculos de tiempo, ya que tiene mayor precisión.

### 3. Campos de Scoring (Engagement Metrics)

```json
{
  "services_seen": "0",
  "prices_asked": "0",
  "deep_interest": "0",
  "proposal_offer_done": false
}
```

Estos campos NO se actualizan en Node 34. Probablemente se actualizan en:
- **ETAPA 5** (Agente Master) después de analizar el mensaje
- **Nodos posteriores** que detectan intenciones específicas

### 4. Performance

**Operación UPDATE en Baserow:**
- **Latency**: ~200-500ms (API REST)
- **Payload size**: ~1.5KB (4 campos)
- **Response size**: ~2KB (registro completo)

**Optimización posible:** Solo devolver campos actualizados en lugar de registro completo (reduce ancho de banda).

---

## Mejoras Propuestas

### 1. Validación de Respuesta

```javascript
// Después de Node 34, agregar validación
if (!$json.id || $json.id !== 198) {
  throw new Error('[UpdateLeadWithRow_Id] UPDATE failed or returned unexpected record');
}

if ($json.last_message_id !== 2706) {
  console.warn('[UpdateLeadWithRow_Id] last_message_id mismatch, possible race condition');
}
```

### 2. Tracking de Cambios

```javascript
// Antes de UPDATE, guardar valores previos
const prevState = {
  last_message: $('PickLeadRow').first().json.last_message,
  last_activity: $('PickLeadRow').first().json.last_activity_iso
};

// Después de UPDATE
const changes = {
  message_changed: prevState.last_message !== $json.last_message,
  time_diff_seconds: (new Date($json.last_activity_iso) - new Date(prevState.last_activity)) / 1000
};

console.log(`[UpdateLeadWithRow_Id] Changes:`, changes);
```

### 3. Conditional Update (Solo si Hay Cambios)

```javascript
// En Node 33, antes de UPDATE
const existingMessage = $('PickLeadRow').first().json.last_message;
const newMessage = $json.row_always.last_message;

if (existingMessage === newMessage) {
  console.log('[UpdatePayload] No changes detected, skipping UPDATE');
  return [{ json: { skip_update: true, row_id: $json.row_id } }];
}

// Node 34 podría verificar skip_update flag
```

### 4. Retry Logic para Baserow API

```javascript
// Configurar retry en settings de Node 34
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "waitBetween": 1000
  }
}
```

---

## Seguridad y Validación

### 1. Protección de Campos Inmutables

**Campos que NUNCA deben actualizarse via Node 34:**
- `first_interaction` - Dato histórico
- `chatwoot_id` - Identificador externo
- `lead_id` - Enlace con Odoo (solo se actualiza en Node 27)
- `conversation_id` - ID inmutable de Chatwoot

**Implementación:** Node 33 (UpdatePayload) garantiza que solo `row_always` llegue a Node 34.

### 2. Validación de row_id

```javascript
// En Node 33, antes de construir payload
if (!$json.row_id || $json.row_id <= 0) {
  throw new Error('[UpdatePayload] Invalid row_id: cannot update non-existent lead');
}
```

### 3. SQL Injection (No Aplica)

Baserow usa API REST, no SQL directo. Sin embargo, validar tipos:

```javascript
// Validar que last_message_id sea número
if (typeof $json.last_message_id !== 'number') {
  throw new Error('[UpdatePayload] last_message_id must be a number');
}
```

---

## Debugging y Troubleshooting

### Error: "Row not found"

**Causa:** `row_id` no existe en Baserow.

**Solución:**
1. Verificar que Node 19 (FindByChatwootId) devolvió `row_id` válido
2. Verificar que Node 20 (PickLeadRow) extrajo `row_id` correctamente
3. Revisar logs de Baserow para detectar eliminaciones manuales

### Error: "Invalid field value"

**Causa:** Tipo de dato incorrecto para campo Baserow.

**Solución:**
1. Verificar schema de tabla Leads en Baserow
2. Asegurar que `last_message_id` es Number, no String
3. Asegurar que `last_activity_iso` es formato ISO 8601

### Warning: "Timestamp in the future"

**Causa:** `last_activity_iso` tiene timestamp futuro (error de zona horaria).

**Solución:**
1. Verificar que Node 6 (Normalize_Inbound) usa UTC
2. Validar que `Date.now()` del servidor está sincronizado (NTP)

---

## Métricas y Observabilidad

### KPIs del Nodo

| Métrica | Valor Esperado | Alertar Si |
|---------|----------------|------------|
| **Latency** | 200-500ms | > 2s |
| **Success Rate** | 99.5% | < 98% |
| **Payload Size** | ~1.5KB | > 10KB |
| **Updates/min** | Variable | > 100/min (posible loop) |

### Logging Recomendado

```javascript
console.log('[UpdateLeadWithRow_Id] Updating lead', {
  row_id: $json.row_id,
  fields_updated: Object.keys($json).filter(k => k !== 'row_id'),
  last_message_preview: $json.last_message?.substring(0, 50)
});
```

---

## Referencias

- **Node 18**: [Build Lead Row](./18-build-lead-row.md) - Definición de `row_always`
- **Node 20**: [PickLeadRow](./20-pick-lead-row.md) - Origen de `row_id`
- **Node 22**: [checkIfLeadAlreadyRegistered](./22-check-if-lead-already-registered.md) - Bifurcación Update Flow
- **Node 24**: [createLeadBaserow](./24-create-lead-baserow.md) - Operación CREATE para comparación
- **Node 33**: [UpdatePayload](./33-update-payload.md) - Preparación del payload limpio

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Baserow API**: v1
- **Status**: ✅ Activo en producción
