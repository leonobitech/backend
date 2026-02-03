# Nodo 21: MergeForUpdate

## Información General

- **Nombre del nodo**: `MergeForUpdate`
- **Tipo**: Merge
- **Función**: Combinar datos de detección de existencia + estructura de lead
- **Entradas**:
  - `PickLeadRow` (exists, row_id, row, count)
  - `Build Lead Row` (keys, row_on_create, row_always, row_upsert)
- **Mode**: Combine
- **Combine By**: All Possible Combinations

## Descripción

Este nodo implementa el **patrón de merge** que unifica datos de dos fuentes:

1. **PickLeadRow** → Metadata de existencia (`exists`, `row_id`, `row`, `count`)
2. **Build Lead Row** → Estructuras de datos para crear/actualizar (`keys`, `row_on_create`, `row_always`, `row_upsert`)

El resultado es un **objeto completo** que contiene:
- ✅ Información de si el lead existe o no
- ✅ Datos del lead existente (si aplica)
- ✅ Estructuras preparadas para Create
- ✅ Estructuras preparadas para Update
- ✅ Claves de búsqueda

Este nodo **no toma decisiones**, solo **reúne información** para que el siguiente nodo pueda bifurcar el flujo según `exists`.

## Configuración del Nodo

### Mode
- **Valor**: `Combine`
- **Descripción**: Combinar inputs de múltiples nodos

### Combine By
- **Valor**: `All Possible Combinations`
- **Descripción**: Crear combinación de todos los inputs

### Options
- **Valor**: No properties
- **Descripción**: Sin opciones adicionales

## Lógica de Funcionamiento

### Merge de Dos Fuentes

```javascript
// Input 1: PickLeadRow
{
  exists: false,
  row_id: null,
  row: null,
  count: 0
}

// Input 2: Build Lead Row
{
  keys: { chatwoot_id: 186, phone_number: "+549..." },
  row_on_create: { ... },
  row_always: { ... },
  row_upsert: { ... }
}

// Output: Merge (Combine)
{
  // De PickLeadRow
  exists: false,
  row_id: null,
  row: null,
  count: 0,

  // De Build Lead Row
  keys: { ... },
  row_on_create: { ... },
  row_always: { ... },
  row_upsert: { ... }
}
```

**Operación**: Spread de ambos objetos en uno solo
```javascript
// Equivalente a:
const merged = {
  ...pickLeadRowOutput,
  ...buildLeadRowOutput
};
```

---

### Combinaciones Posibles

Con **Combine By: All Possible Combinations**, n8n crea el producto cartesiano:

```
Input 1: [item_a, item_b]
Input 2: [item_x, item_y]

Output: [
  { ...item_a, ...item_x },
  { ...item_a, ...item_y },
  { ...item_b, ...item_x },
  { ...item_b, ...item_y }
]
```

**En este caso**:
- PickLeadRow retorna **1 item**
- Build Lead Row retorna **1 item**
- **Resultado**: 1 × 1 = **1 item combinado**

## Estructura de Entrada

### Input 1: PickLeadRow

```json
{
  "exists": false,
  "row_id": null,
  "row": null,
  "count": 0
}
```

**Campos**:
- `exists`: Boolean (si el lead existe)
- `row_id`: Number|null (ID de Baserow)
- `row`: Object|null (datos del lead existente)
- `count`: Number (cantidad de registros encontrados)

---

### Input 2: Build Lead Row

```json
{
  "keys": {
    "chatwoot_id": 186,
    "phone_number": "+5491133851987"
  },
  "row_on_create": {
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "full_name": "Felix Figueroa",
    "phone_number": "+5491133851987",
    "email": "",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "first_interaction": "2025-10-31T09:33:39.000-03:00",
    "first_interaction_utc": "2025-10-31T12:33:39.000Z",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z",
    "stage": "explore",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "email_ask_ts": null,
    "addressee_ask_ts": null,
    "lead_id": 0,
    "priority": "normal"
  },
  "row_always": {
    "channel": "whatsapp",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z"
  },
  "row_upsert": {
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "full_name": "Felix Figueroa",
    "phone_number": "+5491133851987",
    "email": "",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "first_interaction": "2025-10-31T09:33:39.000-03:00",
    "first_interaction_utc": "2025-10-31T12:33:39.000Z",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z",
    "stage": "explore",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "email_ask_ts": null,
    "addressee_ask_ts": null,
    "lead_id": 0,
    "priority": "normal"
  }
}
```

**Campos**:
- `keys`: Identificadores de búsqueda
- `row_on_create`: Campos para creación (con defaults)
- `row_always`: Campos seguros para update
- `row_upsert`: Merge de ambos

## Formato de Salida (JSON)

### Caso 1: Lead NO existe (Create Flow)

**Input 1 (PickLeadRow)**:
```json
{
  "exists": false,
  "row_id": null,
  "row": null,
  "count": 0
}
```

**Input 2 (Build Lead Row)**:
```json
{
  "keys": { "chatwoot_id": 186, "phone_number": "+5491133851987" },
  "row_on_create": { /* estructura completa con defaults */ },
  "row_always": { /* campos de update */ },
  "row_upsert": { /* merge de ambos */ }
}
```

**Output (Merged)**:
```json
[
  {
    "exists": false,
    "row_id": null,
    "row": null,
    "count": 0,
    "keys": {
      "chatwoot_id": 186,
      "phone_number": "+5491133851987"
    },
    "row_on_create": {
      "chatwoot_id": 186,
      "chatwoot_inbox_id": 186,
      "conversation_id": 190,
      "full_name": "Felix Figueroa",
      "phone_number": "+5491133851987",
      "email": "",
      "country": "Argentina",
      "tz": "-03:00",
      "channel": "whatsapp",
      "first_interaction": "2025-10-31T09:33:39.000-03:00",
      "first_interaction_utc": "2025-10-31T12:33:39.000Z",
      "last_message": "Hola que tal",
      "last_message_id": 2704,
      "last_activity_iso": "2025-10-31T12:33:41.372Z",
      "stage": "explore",
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0,
      "proposal_offer_done": false,
      "interests": [],
      "email_ask_ts": null,
      "addressee_ask_ts": null,
      "lead_id": 0,
      "priority": "normal"
    },
    "row_always": {
      "channel": "whatsapp",
      "last_message": "Hola que tal",
      "last_message_id": 2704,
      "last_activity_iso": "2025-10-31T12:33:41.372Z"
    },
    "row_upsert": {
      "chatwoot_id": 186,
      "chatwoot_inbox_id": 186,
      "conversation_id": 190,
      "full_name": "Felix Figueroa",
      "phone_number": "+5491133851987",
      "email": "",
      "country": "Argentina",
      "tz": "-03:00",
      "channel": "whatsapp",
      "first_interaction": "2025-10-31T09:33:39.000-03:00",
      "first_interaction_utc": "2025-10-31T12:33:39.000Z",
      "last_message": "Hola que tal",
      "last_message_id": 2704,
      "last_activity_iso": "2025-10-31T12:33:41.372Z",
      "stage": "explore",
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0,
      "proposal_offer_done": false,
      "interests": [],
      "email_ask_ts": null,
      "addressee_ask_ts": null,
      "lead_id": 0,
      "priority": "normal"
    }
  }
]
```

**Observación**: El siguiente nodo detectará `exists: false` y usará `row_on_create` para crear el lead.

---

### Caso 2: Lead existe (Update Flow)

**Input 1 (PickLeadRow)**:
```json
{
  "exists": true,
  "row_id": 123,
  "row": {
    "id": 123,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "stage": "qualify",
    "services_seen": 3,
    "first_interaction": "2025-10-30T14:25:10.000-03:00"
  },
  "count": 1
}
```

**Input 2 (Build Lead Row)**:
```json
{
  "keys": { "chatwoot_id": 186, "phone_number": "+5491133851987" },
  "row_on_create": { /* no se usará */ },
  "row_always": {
    "channel": "whatsapp",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z"
  },
  "row_upsert": { /* puede usarse para upsert */ }
}
```

**Output (Merged)**:
```json
[
  {
    "exists": true,
    "row_id": 123,
    "row": {
      "id": 123,
      "chatwoot_id": 186,
      "full_name": "Felix Figueroa",
      "stage": "qualify",
      "services_seen": 3,
      "first_interaction": "2025-10-30T14:25:10.000-03:00"
    },
    "count": 1,
    "keys": {
      "chatwoot_id": 186,
      "phone_number": "+5491133851987"
    },
    "row_on_create": { /* ... */ },
    "row_always": {
      "channel": "whatsapp",
      "last_message": "Hola que tal",
      "last_message_id": 2704,
      "last_activity_iso": "2025-10-31T12:33:41.372Z"
    },
    "row_upsert": { /* ... */ }
  }
]
```

**Observación**: El siguiente nodo detectará `exists: true` y usará `row_always` para actualizar **solo los campos seguros** sin sobrescribir `first_interaction`, `stage`, `services_seen`, etc.

## Propósito en el Workflow

### 1. **Unificación de Contexto**

Antes del merge, los datos están dispersos en dos nodos:

```
PickLeadRow          Build Lead Row
┌────────────┐       ┌────────────┐
│ exists     │       │ keys       │
│ row_id     │       │ row_on_... │
│ row        │       │ row_always │
│ count      │       │ row_upsert │
└────────────┘       └────────────┘
```

Después del merge, todo está en un solo objeto:

```
MergeForUpdate
┌────────────────────┐
│ exists             │
│ row_id             │
│ row                │
│ count              │
│ keys               │
│ row_on_create      │
│ row_always         │
│ row_upsert         │
└────────────────────┘
```

**Ventaja**: El siguiente nodo tiene **acceso completo** a toda la información sin necesidad de referenciar nodos anteriores.

---

### 2. **Preparación para Bifurcación**

El merge prepara el terreno para la decisión Create vs Update:

```javascript
// Siguiente nodo (Switch o Code)
if ($json.exists) {
  // ✅ Lead existe → usar row_always
  const updateData = $json.row_always;
  const existingData = $json.row;
  const baserowId = $json.row_id;

  // → Baserow Update
} else {
  // ✅ Lead NO existe → usar row_on_create
  const createData = $json.row_on_create;

  // → Baserow Create
}
```

**Sin el merge**, el código sería más complejo:
```javascript
// ❌ Sin merge (acceso a múltiples nodos)
const exists = $('PickLeadRow').item.json.exists;
const createData = $('Build Lead Row').item.json.row_on_create;
const updateData = $('Build Lead Row').item.json.row_always;
```

---

### 3. **Simplificación de Referencias**

Con el merge, las referencias son más simples:

```javascript
// ✅ Con merge
$json.exists
$json.row_id
$json.row_always.last_message

// ❌ Sin merge
$('PickLeadRow').item.json.exists
$('PickLeadRow').item.json.row_id
$('Build Lead Row').item.json.row_always.last_message
```

---

### 4. **Disponibilidad de Datos Históricos**

Si el lead existe, `row` contiene los datos anteriores:

```javascript
// Comparar valores anteriores vs nuevos
const previousStage = $json.row.stage;  // "qualify"
const newMessage = $json.row_always.last_message;  // "Hola que tal"

// Detectar cambios
if (previousStage === "explore" && /* detectar interés avanzado */) {
  // Actualizar stage a "qualify"
}
```

## Diagrama de Flujo

```
┌─────────────────────────────┐
│ Build Lead Row              │
│ Output: {                   │
│   keys,                     │
│   row_on_create,            │
│   row_always,               │
│   row_upsert                │
│ }                           │
└──────────┬──────────────────┘
           │
           ├──────────────────────────┐
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│ FindByChatwootId    │    │                     │
└──────────┬──────────┘    │                     │
           │               │                     │
           ▼               │                     │
┌─────────────────────┐    │                     │
│ PickLeadRow         │    │                     │
│ Output: {           │    │                     │
│   exists,           │    │                     │
│   row_id,           │    │                     │
│   row,              │    │                     │
│   count             │    │                     │
│ }                   │    │                     │
└──────────┬──────────┘    │                     │
           │               │                     │
           └───────────────┴─────────────────────┤
                           │                     │
                           ▼                     │
                ┌─────────────────────────────┐  │
                │ MergeForUpdate              │ ← ESTAMOS AQUÍ
                │ Mode: Combine               │  │
                │ Combine By: All Possible    │  │
                │                             │  │
                │ Merge ambos inputs          │  │
                └──────────┬──────────────────┘  │
                           │                     │
                           ▼                     │
                ┌─────────────────────────────┐  │
                │ Output Merged:              │  │
                │ {                           │  │
                │   exists,                   │  │
                │   row_id,                   │  │
                │   row,                      │  │
                │   count,                    │  │
                │   keys,                     │  │
                │   row_on_create,            │  │
                │   row_always,               │  │
                │   row_upsert                │  │
                │ }                           │  │
                └─────────────────────────────┘  │
                                                 │
                        (flujo continúa) ────────┘
```

## Casos de Uso Detallados

### Caso 1: Lead nuevo (Create Flow)

```javascript
// Input 1: PickLeadRow
{
  exists: false,
  row_id: null,
  row: null,
  count: 0
}

// Input 2: Build Lead Row
{
  keys: { chatwoot_id: 186, phone_number: "+549..." },
  row_on_create: {
    chatwoot_id: 186,
    full_name: "Felix Figueroa",
    stage: "explore",  // ✅ Valor inicial
    services_seen: 0,  // ✅ Contador en 0
    first_interaction: "2025-10-31T09:33:39.000-03:00"  // ✅ Timestamp actual
  },
  row_always: { last_message: "Hola que tal" }
}

// Output: Merged
{
  exists: false,  // → Siguiente nodo detecta: CREATE
  row_on_create: { /* ... */ }  // → Se usará para crear el lead
}

// Siguiente nodo ejecuta:
// Baserow CREATE con row_on_create
```

---

### Caso 2: Lead existente (Update Flow)

```javascript
// Input 1: PickLeadRow
{
  exists: true,
  row_id: 123,
  row: {
    id: 123,
    chatwoot_id: 186,
    stage: "qualify",  // ✅ Ya tenía stage
    services_seen: 3,  // ✅ Ya tenía contador
    first_interaction: "2025-10-30T14:25:10.000-03:00"  // ✅ Fecha original
  },
  count: 1
}

// Input 2: Build Lead Row
{
  keys: { chatwoot_id: 186 },
  row_on_create: {
    stage: "explore",  // ❌ NO se usará (valor inicial para nuevos)
    services_seen: 0   // ❌ NO se usará
  },
  row_always: {
    last_message: "Hola que tal",  // ✅ Campo seguro
    last_message_id: 2704,         // ✅ Campo seguro
    last_activity_iso: "2025-10-31T12:33:41.372Z"  // ✅ Campo seguro
  }
}

// Output: Merged
{
  exists: true,  // → Siguiente nodo detecta: UPDATE
  row_id: 123,   // → ID para actualizar
  row: { stage: "qualify", services_seen: 3, ... },  // → Datos anteriores
  row_always: { last_message: "Hola que tal", ... }  // → Se usará para update
}

// Siguiente nodo ejecuta:
// Baserow UPDATE (id: 123) con row_always
// Resultado: stage y services_seen NO se sobrescriben
```

**Preservación de datos**:
```javascript
// ANTES del update (en Baserow)
{
  id: 123,
  stage: "qualify",  // 🔒 Inmutable en update
  services_seen: 3,  // 🔒 Inmutable en update
  last_message: "Mensaje anterior"
}

// Después del update
{
  id: 123,
  stage: "qualify",  // ✅ Preservado
  services_seen: 3,  // ✅ Preservado
  last_message: "Hola que tal"  // ✅ Actualizado
}
```

---

### Caso 3: Lead con duplicados (count > 1)

```javascript
// Input 1: PickLeadRow
{
  exists: true,
  row_id: 123,  // ⚠️ Solo el primer ID
  row: { id: 123, chatwoot_id: 186 },
  count: 2  // ⚠️ Indica duplicados
}

// Input 2: Build Lead Row
{ /* ... */ }

// Output: Merged
{
  exists: true,
  row_id: 123,
  row: { id: 123, ... },
  count: 2,  // ⚠️ count > 1 indica problema
  keys: { chatwoot_id: 186 }
}

// Siguiente nodo puede detectar:
if ($json.count > 1) {
  console.warn("⚠️ Duplicate leads found!");
  // Sugerencia: Limpiar duplicados manualmente en Baserow
}
```

## Comparación: Merge vs Code

### Merge (actual)

```javascript
// Configuración visual
Mode: Combine
Combine By: All Possible Combinations
```

**Ventajas**:
- ✅ Sin código, visual
- ✅ Automático
- ✅ Performance nativo de n8n

**Desventajas**:
- ❌ No permite transformaciones
- ❌ Solo hace spread de objetos

---

### Code (alternativa)

```javascript
// Nodo Code alternativo
const pickData = $('PickLeadRow').item.json;
const buildData = $('Build Lead Row').item.json;

return [{
  json: {
    ...pickData,
    ...buildData,
    // ✅ Puede agregar transformaciones
    operation: pickData.exists ? "update" : "create",
    timestamp: new Date().toISOString()
  }
}];
```

**Ventajas**:
- ✅ Más flexible
- ✅ Puede agregar lógica custom

**Desventajas**:
- ❌ Requiere código
- ❌ Más complejo de debugging

## Datos Disponibles para Siguiente Nodo

Después del merge, el siguiente nodo tiene **acceso completo** a:

| Sección | Campo | Tipo | Fuente | Descripción |
|---------|-------|------|--------|-------------|
| **Metadata** | `exists` | Boolean | PickLeadRow | Si el lead existe |
| | `row_id` | Number\|null | PickLeadRow | ID de Baserow |
| | `row` | Object\|null | PickLeadRow | Datos del lead existente |
| | `count` | Number | PickLeadRow | Cantidad de registros |
| **Identificadores** | `keys` | Object | Build Lead Row | Claves de búsqueda |
| **Estructuras** | `row_on_create` | Object | Build Lead Row | Datos para CREATE |
| | `row_always` | Object | Build Lead Row | Datos para UPDATE |
| | `row_upsert` | Object | Build Lead Row | Merge de ambos |

**Acceso**:
```javascript
// Metadata de existencia
$json.exists                    // true | false
$json.row_id                    // 123 | null
$json.count                     // 0 | 1 | 2+

// Datos del lead existente (si existe)
$json.row.stage                 // "qualify"
$json.row.services_seen         // 3
$json.row.first_interaction     // "2025-10-30T14:25:10.000-03:00"

// Claves
$json.keys.chatwoot_id          // 186
$json.keys.phone_number         // "+5491133851987"

// Estructuras de datos
$json.row_on_create             // { chatwoot_id: 186, stage: "explore", ... }
$json.row_always                // { last_message: "Hola que tal", ... }
$json.row_upsert                // { ...row_on_create, ...row_always }
```

## Próximo Nodo Esperado

El siguiente nodo debería **bifurcar el flujo** según `exists`:

### Opción 1: Switch Node

```javascript
// Switch: "Lead Exists?"
Rules:
  - Rule 1: {{ $json.exists }} equals true → Output: "Update"
  - Fallback → Output: "Create"
```

**Flujos**:
- Output "Update" → Baserow Update node (usa `row_always` y `row_id`)
- Output "Create" → Baserow Create node (usa `row_on_create`)

---

### Opción 2: IF Node

```javascript
// IF: Lead exists?
Condition: {{ $json.exists }}

// True branch → Baserow Update
// False branch → Baserow Create
```

---

### Opción 3: Upsert Directo (si Baserow lo soporta)

```javascript
// Baserow Upsert node (hipotético)
Operation: Upsert
Match Fields: {{ $json.keys }}
Data: {{ $json.row_upsert }}

// Si existe → Update
// Si NO existe → Create
```

**Ventaja**: No necesita bifurcación, Baserow decide automáticamente.

## Mejoras Sugeridas

### 1. Agregar campo `operation`

```javascript
// Nodo Code en lugar de Merge
return [{
  json: {
    ...pickData,
    ...buildData,
    operation: pickData.exists ? "update" : "create"  // ✅ Decisión explícita
  }
}];
```

**Ventaja**: El siguiente nodo puede usar `$json.operation` directamente.

---

### 2. Validar conflictos de claves

```javascript
// Code node
const pickData = $('PickLeadRow').item.json;
const buildData = $('Build Lead Row').item.json;

// Verificar si hay campos duplicados
const pickKeys = Object.keys(pickData);
const buildKeys = Object.keys(buildData);
const conflicts = pickKeys.filter(k => buildKeys.includes(k));

if (conflicts.length > 0) {
  console.warn("⚠️ Key conflicts in merge:", conflicts);
}

return [{ json: { ...pickData, ...buildData } }];
```

**Ventaja**: Detecta si ambos inputs tienen campos con el mismo nombre (riesgo de sobrescritura).

---

### 3. Incluir timestamp de merge

```javascript
return [{
  json: {
    ...pickData,
    ...buildData,
    merged_at: new Date().toISOString()
  }
}];
```

**Ventaja**: Útil para debugging y auditoría.

## Performance

### Complejidad

```
Operación: Object spread
Complejidad: O(n + m)
  n = número de campos en PickLeadRow (~4 campos)
  m = número de campos en Build Lead Row (~4 campos)

Tiempo: ~0ms (operación en memoria)
```

**Conclusión**: Extremadamente eficiente, sin overhead.

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Merge de metadata + estructuras de datos
**Output**: Objeto unificado con toda la información necesaria
**Próximo paso**: Switch/IF para bifurcar entre Create y Update flows
**Mejora sugerida**: Agregar campo `operation` explícito para simplificar siguiente nodo
