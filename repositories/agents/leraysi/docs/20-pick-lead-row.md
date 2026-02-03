# Nodo 20: PickLeadRow

## Información General

- **Nombre del nodo**: `PickLeadRow`
- **Tipo**: Code (JavaScript)
- **Función**: Normalizar respuesta de Baserow y determinar existencia del lead
- **Entrada**: Salida del nodo `FindByChatwootId`
- **Mode**: Run Once for All Items

## Descripción

Este nodo es **crítico para la robustez del workflow**. Actúa como **normalizador de respuestas** que maneja múltiples formatos de salida de Baserow:

1. **Respuesta con `results` array**: `{ results: [...] }` (formato API estándar)
2. **Respuesta directa**: Array de items `[{...}, {...}]` (formato n8n)
3. **Empty item de n8n**: `[{}]` (objeto vacío cuando no hay resultados)
4. **Respuesta nula**: Items sin JSON válido

El nodo **filtra objetos válidos** (con identificadores) y retorna un objeto estandarizado con:
- `exists`: Boolean indicando si se encontró el lead
- `row_id`: ID del registro (si existe)
- `row`: Objeto completo del lead (si existe)
- `count`: Cantidad de registros encontrados

## Código Completo

```javascript
// PickLeadRow — robusto para "empty item" de n8n y para {results:[]}
const items = $input.all().map(i => i.json || {});

// Si viene en formato { results: [...] } lo aplanamos; si no, tomamos los items tal cual
let rows;
if (items.length === 1 && Array.isArray(items[0].results)) {
  rows = items[0].results;
} else {
  rows = items;
}

// Filtramos solo filas "reales": objeto no vacío con algún identificador
const real = rows.filter(r =>
  r && typeof r === 'object' &&
  (r.id != null || r.row_id != null || r.record_id != null) &&
  Object.keys(r).length > 0
);

const hit = real[0] || null;

return [{
  json: {
    exists: !!hit,
    row_id: hit ? (hit.id ?? hit.row_id ?? hit.record_id) : null,
    row: hit || null,
    count: real.length
  }
}];
```

## Lógica de Funcionamiento

### 1. Obtención de Items

```javascript
const items = $input.all().map(i => i.json || {});
```

**Propósito**: Obtener todos los items de entrada y extraer su JSON
**Manejo de errores**: Si `i.json` es `undefined`, usa `{}` (objeto vacío)

**Casos cubiertos**:
```javascript
// Caso 1: Item normal
{ json: { id: 123, ... } }  // → { id: 123, ... }

// Caso 2: Item sin JSON
{ json: undefined }  // → {}

// Caso 3: Empty item de n8n
{ json: {} }  // → {}
```

---

### 2. Aplanamiento de Formato API

```javascript
let rows;
if (items.length === 1 && Array.isArray(items[0].results)) {
  rows = items[0].results;
} else {
  rows = items;
}
```

**Propósito**: Normalizar formato de respuesta de Baserow

**Escenario 1: Formato API estándar**
```javascript
// Input
items = [{ results: [{ id: 123, ... }] }]

// Detección
items.length === 1  // ✅ true
Array.isArray(items[0].results)  // ✅ true

// Output
rows = [{ id: 123, ... }]  // Extrae el array results
```

**Escenario 2: Formato n8n directo**
```javascript
// Input
items = [{ id: 123, ... }, { id: 124, ... }]

// Detección
items.length === 1  // ❌ false (hay múltiples items)

// Output
rows = items  // Usa items tal cual
```

**Escenario 3: Empty item**
```javascript
// Input
items = [{}]

// Detección
items.length === 1  // ✅ true
Array.isArray(items[0].results)  // ❌ false (no tiene results)

// Output
rows = [{}]  // Mantiene el array vacío
```

---

### 3. Filtrado de Filas Válidas

```javascript
const real = rows.filter(r =>
  r && typeof r === 'object' &&
  (r.id != null || r.row_id != null || r.record_id != null) &&
  Object.keys(r).length > 0
);
```

**Propósito**: Filtrar solo objetos válidos con identificadores

**Condiciones de validación**:
1. `r` existe (no es `null` o `undefined`)
2. `typeof r === 'object'` (es un objeto)
3. Tiene al menos uno de los IDs: `id`, `row_id`, `record_id`
4. `Object.keys(r).length > 0` (no está vacío)

**Ejemplos**:

```javascript
// ✅ Válido - tiene id
{ id: 123, chatwoot_id: 186, full_name: "Felix" }
// Resultado: Pasa el filtro

// ✅ Válido - tiene row_id
{ row_id: 456, phone: "+549..." }
// Resultado: Pasa el filtro

// ❌ Inválido - objeto vacío
{}
// Resultado: Filtrado (no tiene ID y length === 0)

// ❌ Inválido - null
null
// Resultado: Filtrado (no pasa r check)

// ❌ Inválido - sin identificador
{ full_name: "Felix", phone: "+549..." }
// Resultado: Filtrado (no tiene id/row_id/record_id)
```

---

### 4. Selección del Primer Resultado

```javascript
const hit = real[0] || null;
```

**Propósito**: Seleccionar el primer registro válido (o `null` si no hay)

**Casos**:
```javascript
// Caso 1: Hay registros válidos
real = [{ id: 123, ... }, { id: 124, ... }]
hit = { id: 123, ... }  // ✅ Primer registro

// Caso 2: No hay registros válidos
real = []
hit = null  // ❌ Ningún resultado
```

**Nota**: Si hay múltiples registros, solo se usa el primero (esperado: máximo 1 por `chatwoot_id`).

---

### 5. Construcción de Output Estandarizado

```javascript
return [{
  json: {
    exists: !!hit,
    row_id: hit ? (hit.id ?? hit.row_id ?? hit.record_id) : null,
    row: hit || null,
    count: real.length
  }
}];
```

**Propósito**: Retornar objeto normalizado con metadata útil

**Campos del output**:

| Campo | Tipo | Descripción | Ejemplo (existe) | Ejemplo (no existe) |
|-------|------|-------------|------------------|---------------------|
| `exists` | Boolean | Si se encontró el lead | `true` | `false` |
| `row_id` | Number\|null | ID del registro | `123` | `null` |
| `row` | Object\|null | Objeto completo del lead | `{ id: 123, ... }` | `null` |
| `count` | Number | Cantidad de registros válidos | `1` | `0` |

**Lógica de `row_id`**:
```javascript
hit ? (hit.id ?? hit.row_id ?? hit.record_id) : null
```

- Si `hit` existe → usa `id`, o `row_id`, o `record_id` (en ese orden)
- Si `hit` es `null` → retorna `null`

**Operador `??` (Nullish Coalescing)**:
```javascript
hit.id ?? hit.row_id ?? hit.record_id

// Equivalente a:
if (hit.id != null) return hit.id;
else if (hit.row_id != null) return hit.row_id;
else return hit.record_id;
```

**Operador `!!` (Double Negation)**:
```javascript
!!hit

// Convierte a Boolean:
!!{ id: 123 }  // true
!!null         // false
!!undefined    // false
```

## Estructura de Entrada

Puede recibir múltiples formatos:

### Formato 1: API estándar (con `results`)

```json
[
  {
    "results": [
      {
        "id": 123,
        "chatwoot_id": 186,
        "full_name": "Felix Figueroa",
        "phone_number": "+5491133851987"
      }
    ]
  }
]
```

**Procesamiento**:
```javascript
items = [{ results: [...] }]
rows = items[0].results  // Extrae results
real = [{ id: 123, ... }]  // Filtra válidos
hit = { id: 123, ... }
```

---

### Formato 2: Array directo de n8n

```json
[
  {
    "id": 123,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa"
  }
]
```

**Procesamiento**:
```javascript
items = [{ id: 123, ... }]
rows = items  // Usa items tal cual
real = [{ id: 123, ... }]
hit = { id: 123, ... }
```

---

### Formato 3: Empty item de n8n

```json
[
  {}
]
```

**Procesamiento**:
```javascript
items = [{}]
rows = [{}]  // No tiene results, usa items
real = []  // Filter descarta {} (no tiene ID y length === 0)
hit = null
```

---

### Formato 4: Múltiples resultados (caso raro)

```json
[
  { "id": 123, "chatwoot_id": 186 },
  { "id": 124, "chatwoot_id": 186 }
]
```

**Procesamiento**:
```javascript
items = [{ id: 123 }, { id: 124 }]
rows = items
real = [{ id: 123 }, { id: 124 }]  // Ambos válidos
hit = { id: 123 }  // ⚠️ Solo toma el primero
count = 2  // Pero count indica que hay 2
```

**⚠️ Advertencia**: Si hay duplicados en Baserow, solo se usa el primer registro.

## Formato de Salida (JSON)

### Caso 1: Lead NO existe

**Input (FindByChatwootId)**:
```json
[
  {}
]
```

**Output (PickLeadRow)**:
```json
[
  {
    "exists": false,
    "row_id": null,
    "row": null,
    "count": 0
  }
]
```

**Interpretación**:
- `exists: false` → Lead no encontrado
- `row_id: null` → Sin ID
- `row: null` → Sin datos
- `count: 0` → 0 registros válidos

---

### Caso 2: Lead existe (1 registro)

**Input (FindByChatwootId)**:
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
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:39.000Z",
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

**Output (PickLeadRow)**:
```json
[
  {
    "exists": true,
    "row_id": 123,
    "row": {
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
      "last_message": "Hola que tal",
      "last_message_id": 2704,
      "last_activity_iso": "2025-10-31T12:33:39.000Z",
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
    },
    "count": 1
  }
]
```

**Interpretación**:
- `exists: true` → Lead encontrado
- `row_id: 123` → ID de Baserow
- `row: {...}` → Objeto completo con todo el historial
- `count: 1` → 1 registro encontrado

---

### Caso 3: Múltiples registros (duplicados)

**Input**:
```json
[
  { "id": 123, "chatwoot_id": 186, "full_name": "Felix Figueroa" },
  { "id": 124, "chatwoot_id": 186, "full_name": "Felix Figueroa 2" }
]
```

**Output**:
```json
[
  {
    "exists": true,
    "row_id": 123,
    "row": {
      "id": 123,
      "chatwoot_id": 186,
      "full_name": "Felix Figueroa"
    },
    "count": 2
  }
]
```

**⚠️ Advertencia**: Solo usa el primer registro, pero `count: 2` indica duplicados.

## Propósito en el Workflow

### 1. **Normalización de Respuestas**

Baserow y n8n pueden retornar diferentes formatos:

```javascript
// Formato 1: API Response
{ results: [{...}] }

// Formato 2: n8n Direct
[{...}]

// Formato 3: Empty Item
[{}]
```

**Este nodo unifica** todo en:
```javascript
{
  exists: Boolean,
  row_id: Number|null,
  row: Object|null,
  count: Number
}
```

---

### 2. **Detección Robusta de Existencia**

En lugar de verificar manualmente `if (Object.keys($json).length === 0)`, el siguiente nodo solo necesita:

```javascript
if ($json.exists) {
  // Lead existe → Update flow
} else {
  // Lead NO existe → Create flow
}
```

**Ventajas**:
- Más legible
- Menos propenso a errores
- Maneja edge cases automáticamente

---

### 3. **Identificación Flexible de ID**

Baserow puede usar diferentes nombres de campo:
- `id` (estándar)
- `row_id` (custom)
- `record_id` (alternativo)

El nodo **normaliza** a `row_id` usando el primer ID disponible:

```javascript
row_id: hit.id ?? hit.row_id ?? hit.record_id
```

---

### 4. **Metadata de Debugging**

El campo `count` permite detectar problemas:

```javascript
if (count > 1) {
  console.warn(`⚠️ Duplicate leads found for chatwoot_id: ${chatwoot_id}`);
  // Sugerencia: Limpiar duplicados en Baserow
}
```

## Diagrama de Flujo

```
┌─────────────────────────────┐
│ FindByChatwootId            │
│ Output: [...] o [{}]        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ PickLeadRow                 │ ← ESTAMOS AQUÍ
│                             │
│ 1. Get items                │
│ 2. Flatten results          │
│ 3. Filter valid rows        │
│ 4. Pick first hit           │
│ 5. Return normalized        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Output Normalizado:         │
│                             │
│ {                           │
│   exists: Boolean,          │
│   row_id: Number|null,      │
│   row: Object|null,         │
│   count: Number             │
│ }                           │
└─────────────────────────────┘
```

## Casos de Uso Detallados

### Caso 1: Primer mensaje de un lead (no existe)

```javascript
// Input de FindByChatwootId
[{}]

// Procesamiento
items = [{}]
rows = [{}]  // No tiene results
real = []  // Filter descarta {} (no tiene ID)
hit = null

// Output
{
  exists: false,
  row_id: null,
  row: null,
  count: 0
}

// Siguiente nodo detecta: exists === false
// → Flujo de creación
```

---

### Caso 2: Lead que vuelve a escribir (existe)

```javascript
// Input de FindByChatwootId
[{
  id: 123,
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  stage: "qualify"
}]

// Procesamiento
items = [{ id: 123, ... }]
rows = items  // No hay results, usa items
real = [{ id: 123, ... }]  // Válido (tiene id)
hit = { id: 123, ... }

// Output
{
  exists: true,
  row_id: 123,
  row: { id: 123, chatwoot_id: 186, ... },
  count: 1
}

// Siguiente nodo detecta: exists === true
// → Flujo de actualización
```

---

### Caso 3: Respuesta con formato API estándar

```javascript
// Input de FindByChatwootId (formato API)
[{
  results: [
    { id: 123, chatwoot_id: 186 }
  ]
}]

// Procesamiento
items = [{ results: [...] }]
rows = items[0].results  // ✅ Detecta results y extrae
real = [{ id: 123, ... }]
hit = { id: 123, ... }

// Output
{
  exists: true,
  row_id: 123,
  row: { id: 123, ... },
  count: 1
}
```

---

### Caso 4: Campo ID alternativo (`row_id`)

```javascript
// Input (Baserow usa row_id en vez de id)
[{
  row_id: 456,
  chatwoot_id: 186
}]

// Procesamiento
items = [{ row_id: 456, ... }]
rows = items
real = [{ row_id: 456, ... }]  // ✅ Válido (tiene row_id)
hit = { row_id: 456, ... }

// Output
{
  exists: true,
  row_id: 456,  // ✅ hit.id ?? hit.row_id → 456
  row: { row_id: 456, ... },
  count: 1
}
```

---

### Caso 5: Duplicados en Baserow

```javascript
// Input (2 registros con mismo chatwoot_id)
[
  { id: 123, chatwoot_id: 186, full_name: "Felix Figueroa" },
  { id: 999, chatwoot_id: 186, full_name: "Felix Duplicate" }
]

// Procesamiento
items = [{ id: 123 }, { id: 999 }]
rows = items
real = [{ id: 123 }, { id: 999 }]  // Ambos válidos
hit = real[0]  // ⚠️ Solo toma el primero

// Output
{
  exists: true,
  row_id: 123,  // ⚠️ ID del primer registro
  row: { id: 123, full_name: "Felix Figueroa" },
  count: 2  // ⚠️ Indica que hay duplicados
}

// Acción recomendada:
if (count > 1) {
  console.warn("Duplicate leads detected in Baserow!");
  // Sugerencia: Agregar constraint único en chatwoot_id
}
```

## Comparación: Con vs Sin PickLeadRow

### Sin PickLeadRow (detección manual)

```javascript
// Nodo siguiente (Switch o Code)
if (Object.keys($json).length === 0) {
  // Lead NO existe
} else if ($json.id) {
  // Lead existe
} else {
  // ??? Qué pasa si viene en formato { results: [] }?
}
```

**Problemas**:
- ❌ No maneja formato API `{ results: [] }`
- ❌ No detecta objetos sin ID
- ❌ No unifica nombres de ID (`id`, `row_id`, `record_id`)
- ❌ Difícil de leer

---

### Con PickLeadRow (detección estandarizada)

```javascript
// Nodo siguiente (Switch o Code)
if ($json.exists) {
  // ✅ Lead existe
  const leadId = $json.row_id;
  const leadData = $json.row;
} else {
  // ✅ Lead NO existe
}
```

**Ventajas**:
- ✅ Maneja todos los formatos
- ✅ Filtra objetos inválidos
- ✅ Unifica IDs
- ✅ Código simple y legible
- ✅ Incluye metadata (`count`)

## Validaciones y Edge Cases

### Edge Case 1: Item sin JSON

```javascript
// Input (item corrupto)
[
  { json: undefined }
]

// Protección
const items = $input.all().map(i => i.json || {});
// items = [{}]

// Resultado: exists = false (objeto vacío filtrado)
```

---

### Edge Case 2: Array vacío de Baserow

```javascript
// Input
[]

// Procesamiento
items = []
rows = []
real = []
hit = null

// Output
{
  exists: false,
  row_id: null,
  row: null,
  count: 0
}
```

---

### Edge Case 3: Objeto con campos pero sin ID

```javascript
// Input (registro sin identificador)
[{
  full_name: "Felix",
  phone: "+549..."
  // ❌ No tiene id, row_id, ni record_id
}]

// Procesamiento
items = [{ full_name: "Felix", ... }]
rows = items
real = []  // ❌ Filter descarta (no tiene ID)
hit = null

// Output
{
  exists: false,
  row_id: null,
  row: null,
  count: 0
}
```

**Motivo**: El filtro requiere al menos uno de `id`, `row_id`, `record_id`.

---

### Edge Case 4: ID con valor 0

```javascript
// Input (ID = 0, edge case raro)
[{
  id: 0,
  chatwoot_id: 186
}]

// Procesamiento
items = [{ id: 0, ... }]
rows = items

// Validación de ID
r.id != null  // ✅ true (0 != null)

real = [{ id: 0, ... }]  // ✅ Pasa el filtro
hit = { id: 0, ... }

// Output
{
  exists: true,
  row_id: 0,  // ✅ ID válido (aunque sea 0)
  row: { id: 0, ... },
  count: 1
}
```

**Nota**: `!= null` detecta `null` y `undefined`, pero **permite 0** (correcto).

## Datos Disponibles para Siguiente Nodo

Después de PickLeadRow, el siguiente nodo tiene acceso a:

| Campo | Tipo | Descripción | Acceso |
|-------|------|-------------|--------|
| `exists` | Boolean | Si el lead existe | `$json.exists` |
| `row_id` | Number\|null | ID del registro | `$json.row_id` |
| `row` | Object\|null | Objeto completo | `$json.row` |
| `count` | Number | Cantidad de registros | `$json.count` |

**Si el lead existe**, también se puede acceder a:

```javascript
$json.row.id                    // 123
$json.row.chatwoot_id           // 186
$json.row.full_name             // "Felix Figueroa"
$json.row.stage                 // "qualify"
$json.row.services_seen         // 3
$json.row.interests             // ["Diseño Web", "SEO"]
$json.row.first_interaction     // "2025-10-30T14:25:10.000-03:00"
```

## Próximo Nodo Esperado

El workflow debería bifurcarse según `exists`:

### Opción 1: Switch Node

```javascript
// Switch: "Lead Exists?"
Rules:
  - Rule 1: {{ $json.exists }} equals true → Output: "Update"
  - Fallback → Output: "Create"
```

---

### Opción 2: IF Node

```javascript
// IF: Lead exists?
Condition: {{ $json.exists }}

// True branch → Update flow
// False branch → Create flow
```

---

### Opción 3: Code Node (Merge)

```javascript
// Merge data from Build Lead Row + PickLeadRow
const leadRowData = $('Build Lead Row').item.json;
const leadExists = $input.item.json.exists;
const existingRow = $input.item.json.row;

if (leadExists) {
  // Lead existe → usar row_always para update
  return {
    json: {
      operation: "update",
      baserow_id: $input.item.json.row_id,
      update_data: leadRowData.row_always,
      existing_data: existingRow  // Para comparar cambios
    }
  };
} else {
  // Lead NO existe → usar row_on_create
  return {
    json: {
      operation: "create",
      create_data: leadRowData.row_on_create
    }
  };
}
```

## Mejoras Sugeridas

### 1. Logging de duplicados

```javascript
// Después de calcular real
if (real.length > 1) {
  console.warn(`⚠️ Duplicate leads found:`, {
    count: real.length,
    ids: real.map(r => r.id ?? r.row_id),
    chatwoot_id: real[0].chatwoot_id
  });
}
```

---

### 2. Validación de estructura esperada

```javascript
// Verificar que row tenga campos mínimos
if (hit && !hit.chatwoot_id) {
  console.error("⚠️ Lead encontrado pero sin chatwoot_id:", hit);
}
```

---

### 3. Retornar todos los duplicados (no solo el primero)

```javascript
return [{
  json: {
    exists: !!hit,
    row_id: hit ? (hit.id ?? hit.row_id ?? hit.record_id) : null,
    row: hit || null,
    count: real.length,
    all_rows: real  // ✅ Retornar todos los duplicados
  }
}];
```

**Ventaja**: El siguiente nodo puede decidir cómo manejar duplicados.

---

### 4. Timestamp de búsqueda

```javascript
return [{
  json: {
    exists: !!hit,
    row_id: hit ? (hit.id ?? hit.row_id ?? hit.record_id) : null,
    row: hit || null,
    count: real.length,
    searched_at: new Date().toISOString()  // ✅ Timestamp de búsqueda
  }
}];
```

**Ventaja**: Útil para debugging y logs.

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Normalización de respuesta Baserow + detección de existencia
**Output**: `{ exists, row_id, row, count }`
**Próximo paso**: Switch/IF para bifurcar entre Create y Update
**Mejora crítica**: Logging de duplicados si `count > 1`
