# Nodo 19: FindByChatwootId

## Información General

- **Nombre del nodo**: `FindByChatwootId`
- **Tipo**: Baserow (Get Many)
- **Función**: Buscar lead existente en Baserow por chatwoot_id
- **Entrada**: Salida del nodo `Build Lead Row`
- **Credential**: Baserow account

## Descripción

Este nodo implementa la **búsqueda de lead existente** en la base de datos Baserow. Consulta la tabla `Leads` filtrando por `chatwoot_id` para determinar si el lead ya está registrado.

Es el primer paso del flujo de decisión:
- Si encuentra el lead → **Update** (actualizar registro existente)
- Si NO encuentra el lead → **Create** (crear nuevo registro)

## Configuración del Nodo

### Credential to connect with
- **Tipo**: `Baserow account`
- **Descripción**: Credenciales de acceso a Baserow

### Resource
- **Valor**: `Row`
- **Descripción**: Operación sobre filas de tabla

### Operation
- **Valor**: `Get Many`
- **Descripción**: Obtener múltiples filas (o ninguna si no existe)

### Database Name or ID
- **Valor**: `Leonobitech`
- **Descripción**: Nombre de la base de datos en Baserow

### Table Name or ID
- **Valor**: `Leads`
- **Descripción**: Tabla que almacena los leads del agente

### Return All
- **Valor**: ✅ Enabled
- **Descripción**: Retornar todas las filas que coincidan con el filtro

### Options

#### Filters

**Field Name or ID**: `chatwoot_id`
**Filter**: `Equal`
**Value**: `{{ $json.keys.chatwoot_id }}`
**Ejemplo**: `186`

**Query SQL generada**:
```sql
SELECT * FROM Leads WHERE chatwoot_id = 186
```

## Lógica de Funcionamiento

### Flujo de Búsqueda

```
Input: { keys: { chatwoot_id: 186 } }
↓
Baserow API: GET /api/database/rows/table/Leads/?filter__chatwoot_id__equal=186
↓
Respuesta:
  - Si existe: [{ id: 123, chatwoot_id: 186, full_name: "Felix Figueroa", ... }]
  - Si NO existe: []
```

### Comparación con SQL

```sql
-- Equivalente en SQL
SELECT * FROM Leads WHERE chatwoot_id = 186;

-- Si existe
-- Row count: 1
-- Result: { id: 123, chatwoot_id: 186, ... }

-- Si NO existe
-- Row count: 0
-- Result: (empty set)
```

## Estructura de Entrada

Recibe el output de `Build Lead Row`:

```json
{
  "keys": {
    "chatwoot_id": 186,
    "phone_number": "+5491133851987"
  },
  "row_on_create": { /* ... */ },
  "row_always": { /* ... */ },
  "row_upsert": { /* ... */ }
}
```

**Campo usado**: `$json.keys.chatwoot_id` → `186`

## Formato de Salida (JSON)

### Caso 1: Lead NO existe (nuevo)

**Input**:
```json
{ "keys": { "chatwoot_id": 999 } }
```

**Query Baserow**:
```
GET /api/database/rows/table/Leads/?filter__chatwoot_id__equal=999
```

**Output (array vacío)**:
```json
[
  {}
]
```

**Interpretación**: Array con un objeto vacío indica que **no se encontraron resultados**.

---

### Caso 2: Lead existe

**Input**:
```json
{ "keys": { "chatwoot_id": 186 } }
```

**Query Baserow**:
```
GET /api/database/rows/table/Leads/?filter__chatwoot_id__equal=186
```

**Output (lead encontrado)**:
```json
[
  {
    "id": 123,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "full_name": "Felix Figueroa",
    "phone_number": "+5491133851987",
    "email": "",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "first_interaction": "2025-10-30T14:25:10.000-03:00",
    "first_interaction_utc": "2025-10-30T17:25:10.000Z",
    "last_message": "Hola, quiero información",
    "last_message_id": 2700,
    "last_activity_iso": "2025-10-30T17:30:00.000Z",
    "stage": "qualify",
    "services_seen": 3,
    "prices_asked": 1,
    "deep_interest": 6,
    "proposal_offer_done": false,
    "interests": [
      "Diseño Web",
      "SEO"
    ],
    "email_ask_ts": null,
    "addressee_ask_ts": null,
    "lead_id": 45,
    "priority": "high"
  }
]
```

**Interpretación**: Lead encontrado con historial previo.

## Propósito en el Workflow

### 1. **Determinación de Flujo (Create vs Update)**

```
FindByChatwootId
    ↓
    ├─ [Si vacío] → Lead nuevo → Crear en Baserow
    └─ [Si tiene datos] → Lead existente → Actualizar en Baserow
```

---

### 2. **Preservación de Historial**

Si el lead existe, se recuperan:
- ✅ `first_interaction` (fecha original, no se sobrescribe)
- ✅ `services_seen` (contador acumulado)
- ✅ `prices_asked` (contador acumulado)
- ✅ `stage` (etapa actual de la conversación)
- ✅ `interests` (servicios ya consultados)

**Sin esta búsqueda**: Cada mensaje crearía un lead duplicado.

---

### 3. **Contexto para el LLM**

Los datos recuperados se pasan al LLM Analista:

```javascript
// Contexto enriquecido
{
  lead_history: {
    stage: "qualify",
    services_seen: 3,
    prices_asked: 1,
    interests: ["Diseño Web", "SEO"]
  },
  current_message: "Hola que tal"
}

// El LLM puede responder:
// "Hola Felix! Veo que anteriormente consultaste sobre Diseño Web y SEO.
// ¿En qué más puedo ayudarte hoy?"
```

## Diagrama de Flujo

```
┌────────────────────────┐
│ Build Lead Row         │
│ Output: { keys: {...} }│
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ FindByChatwootId       │ ← ESTAMOS AQUÍ
│ Query: chatwoot_id=186 │
└──────────┬─────────────┘
           │
      ┌────┴────┐
      │         │
   [vacío]   [datos]
      │         │
      ▼         ▼
┌──────────┐ ┌──────────┐
│ Lead     │ │ Lead     │
│ Nuevo    │ │ Existe   │
└──────────┘ └──────────┘
      │         │
      ▼         ▼
  [Create]  [Update]
```

## Casos de Uso Detallados

### Caso 1: Primer mensaje de un lead (no existe)

```javascript
// Input
{ chatwoot_id: 999 }

// Baserow query
SELECT * FROM Leads WHERE chatwoot_id = 999;
// Result: (empty)

// Output n8n
[{ }]  // Objeto vacío

// Siguiente nodo detecta: Object.keys($json).length === 0
// → Flujo de creación
```

---

### Caso 2: Lead que vuelve a escribir (existe)

```javascript
// Input
{ chatwoot_id: 186 }

// Baserow query
SELECT * FROM Leads WHERE chatwoot_id = 186;
// Result: 1 row

// Output n8n
[{
  id: 123,
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  stage: "qualify",
  services_seen: 3
}]

// Siguiente nodo detecta: $json.id existe
// → Flujo de actualización
```

---

### Caso 3: Lead con múltiples conversaciones

```javascript
// Escenario:
// - Lead tiene chatwoot_id: 186
// - Primera conversación: conversation_id: 100
// - Segunda conversación: conversation_id: 190 (actual)

// Input
{ chatwoot_id: 186 }

// Baserow query (solo filtra por chatwoot_id, NO por conversation_id)
SELECT * FROM Leads WHERE chatwoot_id = 186;
// Result: 1 row (el mismo lead)

// Output
[{
  id: 123,
  chatwoot_id: 186,
  conversation_id: 100,  // ⚠️ ID de la primera conversación
  // ...
}]

// El nodo siguiente actualizará conversation_id a 190
```

**Nota**: El lead es único por `chatwoot_id`, no por `conversation_id`.

## Comparación: chatwoot_id vs phone_number

### Filtro por `chatwoot_id` (actual)

```javascript
// Filtro
chatwoot_id = 186

// Ventajas:
// ✅ Identificador único y estable
// ✅ No cambia aunque el lead cambie de número
// ✅ Más rápido (probablemente indexado en Baserow)

// Desventajas:
// ❌ Si el lead contacta por otro canal sin Chatwoot, no lo encuentra
```

---

### Filtro por `phone_number` (alternativa)

```javascript
// Filtro
phone_number = "+5491133851987"

// Ventajas:
// ✅ Funciona cross-canal (Chatwoot, WhatsApp API, SMS, etc.)
// ✅ Identificador real del lead (su número)

// Desventajas:
// ❌ El lead puede cambiar de número
// ❌ Más lento si no está indexado
```

---

### Filtro dual (mejor práctica)

```javascript
// Filtro OR
chatwoot_id = 186 OR phone_number = "+5491133851987"

// Baserow API:
GET /api/database/rows/table/Leads/
  ?filter__chatwoot_id__equal=186
  &filter_type=OR
  &filter__phone_number__equal=%2B5491133851987

// Ventajas:
// ✅ Encuentra el lead por cualquiera de los dos identificadores
// ✅ Más robusto ante cambios

// Desventaja:
// ❌ Más complejo
```

**Mejora sugerida**: Implementar filtro dual en el futuro.

## Respuesta de Baserow

### Estructura de la API

```json
// GET /api/database/rows/table/Leads/?filter__chatwoot_id__equal=186

{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 123,
      "chatwoot_id": 186,
      "full_name": "Felix Figueroa",
      "phone_number": "+5491133851987",
      // ... todos los campos de la tabla
    }
  ]
}
```

**n8n extrae**: `results[0]` → Primer (y único) resultado

---

### Caso sin resultados

```json
{
  "count": 0,
  "next": null,
  "previous": null,
  "results": []
}
```

**n8n retorna**: `[{}]` → Array con objeto vacío

## Detección de Lead Existente

### En el siguiente nodo (Switch o Code)

```javascript
// Opción 1: Verificar si tiene ID
if ($json.id) {
  // Lead existe
  // Flujo: Update
} else {
  // Lead NO existe
  // Flujo: Create
}

// Opción 2: Verificar si el objeto está vacío
if (Object.keys($json).length === 0) {
  // Lead NO existe
} else {
  // Lead existe
}

// Opción 3: Verificar chatwoot_id
if ($json.chatwoot_id) {
  // Lead existe
} else {
  // Lead NO existe
}
```

**Más robusto**: Verificar `id` (campo único de Baserow).

## Performance y Optimización

### Índices Recomendados en Baserow

```sql
-- Si Baserow soporta índices explícitos
CREATE INDEX idx_chatwoot_id ON Leads(chatwoot_id);
CREATE INDEX idx_phone_number ON Leads(phone_number);
```

**Ventaja**: Consulta instantánea (O(log n) en vez de O(n)).

---

### Cache (Mejora Futura)

```javascript
// Redis cache antes de consultar Baserow
const cachedLead = await redis.get(`lead:chatwoot:${chatwoot_id}`);

if (cachedLead) {
  return JSON.parse(cachedLead);  // ✅ Hit (0ms)
} else {
  const lead = await baserow.query(...);  // ❌ Miss (~100ms)
  await redis.set(`lead:chatwoot:${chatwoot_id}`, JSON.stringify(lead), 'EX', 300);  // 5 min TTL
  return lead;
}
```

**Ventaja**: Reduce latencia de 100ms a <1ms en mensajes consecutivos.

## Datos Disponibles para Siguiente Nodo

### Si lead NO existe (caso 1)

```json
{
  // Objeto vacío, sin propiedades
}
```

**Acceso**:
```javascript
$json.id           // undefined
Object.keys($json).length  // 0
```

---

### Si lead existe (caso 2)

```json
{
  "id": 123,
  "chatwoot_id": 186,
  "full_name": "Felix Figueroa",
  "stage": "qualify",
  "services_seen": 3,
  // ... todos los campos
}
```

**Acceso**:
```javascript
$json.id                    // 123
$json.stage                 // "qualify"
$json.services_seen         // 3
$json.first_interaction     // "2025-10-30T14:25:10.000-03:00"
```

## Próximos Nodos Esperados

El workflow debería bifurcarse según el resultado:

### Opción 1: Switch Node

```javascript
// Switch: "Lead Exists?"
Conditions:
  - Rule 1: {{ $json.id }} is not empty → Output: "Update"
  - Fallback → Output: "Create"
```

---

### Opción 2: IF Node

```javascript
// IF: Lead exists?
Condition: {{ $json.id }}

// True branch → Update flow
// False branch → Create flow
```

---

### Opción 3: Code Node (Merge)

```javascript
// Merge data from Build Lead Row + FindByChatwootId
const leadData = $('Build Lead Row').item.json;
const existingLead = $input.item.json;

if (existingLead.id) {
  // Lead existe → usar row_always para update
  return {
    json: {
      operation: "update",
      lead_id: existingLead.id,
      data: leadData.row_always,
      existing: existingLead  // Historial para LLM
    }
  };
} else {
  // Lead NO existe → usar row_on_create
  return {
    json: {
      operation: "create",
      data: leadData.row_on_create
    }
  };
}
```

## Mejoras Sugeridas

### 1. Filtro dual (chatwoot_id OR phone_number)

```javascript
// Buscar por ambos identificadores
Filters:
  - Field: chatwoot_id, Filter: Equal, Value: 186
  - Combine with: OR
  - Field: phone_number, Filter: Equal, Value: "+5491133851987"
```

**Ventaja**: Encuentra el lead incluso si cambió de `chatwoot_id`.

---

### 2. Seleccionar solo campos necesarios

```javascript
// En lugar de SELECT *
// SELECT id, stage, services_seen, prices_asked, interests

// Reduce payload y mejora performance
```

---

### 3. Caché en Redis

```javascript
// Antes de consultar Baserow
const cached = await redis.get(`lead:${chatwoot_id}`);
if (cached) return JSON.parse(cached);
```

---

### 4. Logging de búsquedas

```javascript
console.log({
  action: "search_lead",
  chatwoot_id: 186,
  found: !!$json.id,
  timestamp: new Date().toISOString()
});
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación Baserow**: Get Many (SELECT con filtro)
**Filtro**: `chatwoot_id = {{ $json.keys.chatwoot_id }}`
**Output**: Array con 1 objeto (lead o vacío)
**Próximo paso**: Switch o Code para bifurcar (Create vs Update)
**Mejora crítica**: Implementar filtro dual (chatwoot_id OR phone_number)
