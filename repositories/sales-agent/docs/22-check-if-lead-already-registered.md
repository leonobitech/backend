# Nodo 22: checkIfLeadAlreadyRegistered

## Información General

- **Nombre del nodo**: `checkIfLeadAlreadyRegistered`
- **Tipo**: Switch (IF)
- **Función**: Bifurcar flujo entre Create y Update según existencia del lead
- **Entrada**: Salida del nodo `MergeForUpdate`
- **Condición**: `{{ $json.exists }}` is true

## Descripción

Este nodo implementa la **bifurcación crítica** del workflow que determina si se debe:
- **Crear un nuevo lead** en Baserow (si `exists === false`)
- **Actualizar un lead existente** en Baserow (si `exists === true`)

Es un **punto de decisión** que separa dos flujos completamente diferentes:

```
checkIfLeadAlreadyRegistered
    ↓
    ├─ [exists: true] → Update Flow
    │   └─ Baserow Update (usa row_always)
    │
    └─ [exists: false] → Create Flow (fallback)
        └─ Baserow Create (usa row_on_create)
```

**Patrón de diseño**: Guard Clause / Routing Pattern

## Configuración del Nodo

### Conditions

#### Condition 1: Lead Exists?

**Expression**:
```javascript
{{ $json.exists }}
```

**Comparison**: `is true`

**Output**: Si la condición es verdadera, el flujo sale por la rama "true" (Update)

---

### Convert types where required
- **Valor**: ✅ Enabled (toggle activo)
- **Descripción**: Convertir tipos automáticamente para la comparación

### Options
- **Valor**: No properties
- **Descripción**: Sin opciones adicionales

## Lógica de Funcionamiento

### Evaluación de la Condición

```javascript
// Input
{
  exists: false,  // ← Campo evaluado
  row_id: null,
  row: null,
  // ...
}

// Evaluación
$json.exists  // false

// Comparación
false === true  // ❌ False

// Resultado
// Flujo va al Fallback (Create Flow)
```

---

### Casos de Evaluación

#### Caso 1: Lead NO existe (`exists: false`)

```javascript
// Input
{ exists: false }

// Evaluación
$json.exists === true  // false === true → ❌ False

// Output
// → Fallback route (Create Flow)
```

---

#### Caso 2: Lead existe (`exists: true`)

```javascript
// Input
{ exists: true }

// Evaluación
$json.exists === true  // true === true → ✅ True

// Output
// → True route (Update Flow)
```

---

### Flujo de Bifurcación

```
┌─────────────────────────────────┐
│ MergeForUpdate                  │
│ {                               │
│   exists: Boolean,              │
│   row_id: Number|null,          │
│   row: Object|null,             │
│   row_on_create: {...},         │
│   row_always: {...}             │
│ }                               │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ checkIfLeadAlreadyRegistered    │ ← ESTAMOS AQUÍ
│                                 │
│ Condition: {{ $json.exists }}   │
│ Comparison: is true             │
└──────────┬──────────────────────┘
           │
      ┌────┴────┐
      │         │
   [true]    [false/fallback]
      │         │
      ▼         ▼
┌──────────┐ ┌──────────┐
│ Update   │ │ Create   │
│ Flow     │ │ Flow     │
└──────────┘ └──────────┘
```

## Estructura de Entrada

Recibe el objeto merged completo del nodo anterior:

```json
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
```

**Campo clave evaluado**: `exists` (Boolean)

## Formato de Salida (JSON)

El nodo Switch **NO modifica el JSON**, solo lo **enruta** a diferentes ramas.

### Caso 1: Lead NO existe (Fallback - Create Flow)

**Input**:
```json
{
  "exists": false,
  "row_id": null,
  "row": null,
  "row_on_create": { /* ... */ },
  "row_always": { /* ... */ }
}
```

**Evaluación**:
```javascript
$json.exists === true  // false === true → ❌ False
```

**Output Route**: **Fallback** (Create Flow)

**Output JSON** (sin modificar):
```json
{
  "exists": false,
  "row_id": null,
  "row": null,
  "count": 0,
  "keys": { /* ... */ },
  "row_on_create": {
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "stage": "explore",  // ✅ Valor inicial
    "services_seen": 0,  // ✅ Contador inicial
    "first_interaction": "2025-10-31T09:33:39.000-03:00"  // ✅ Timestamp actual
  },
  "row_always": { /* ... */ },
  "row_upsert": { /* ... */ }
}
```

**Próximo nodo esperado**: Baserow Create (usa `$json.row_on_create`)

---

### Caso 2: Lead existe (True - Update Flow)

**Input**:
```json
{
  "exists": true,
  "row_id": 123,
  "row": {
    "id": 123,
    "stage": "qualify",  // ← Valor actual en DB
    "services_seen": 3,  // ← Contador actual
    "first_interaction": "2025-10-30T14:25:10.000-03:00"  // ← Fecha original
  },
  "row_on_create": { /* no se usará */ },
  "row_always": {
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z"
  }
}
```

**Evaluación**:
```javascript
$json.exists === true  // true === true → ✅ True
```

**Output Route**: **True** (Update Flow)

**Output JSON** (sin modificar):
```json
{
  "exists": true,
  "row_id": 123,
  "row": {
    "id": 123,
    "stage": "qualify",
    "services_seen": 3,
    "first_interaction": "2025-10-30T14:25:10.000-03:00"
  },
  "count": 1,
  "keys": { /* ... */ },
  "row_on_create": { /* ... */ },
  "row_always": {
    "channel": "whatsapp",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z"
  },
  "row_upsert": { /* ... */ }
}
```

**Próximo nodo esperado**: Baserow Update (usa `$json.row_always` y `$json.row_id`)

## Propósito en el Workflow

### 1. **Separación de Flujos Create vs Update**

Sin este nodo, sería imposible determinar qué operación ejecutar:

```
❌ Sin bifurcación:
  → ¿Crear o actualizar? No se sabe

✅ Con bifurcación:
  → exists: false → Create
  → exists: true → Update
```

---

### 2. **Prevención de Sobrescritura de Datos**

La bifurcación asegura que:

**Create Flow** (lead nuevo):
```javascript
// Usa row_on_create
{
  stage: "explore",  // ✅ Valor inicial correcto
  services_seen: 0,  // ✅ Contador inicial
  first_interaction: "2025-10-31T09:33:39.000-03:00"  // ✅ Timestamp actual
}
```

**Update Flow** (lead existente):
```javascript
// Usa row_always (solo campos seguros)
{
  last_message: "Hola que tal",  // ✅ Actualiza mensaje
  last_activity_iso: "2025-10-31T12:33:41.372Z"  // ✅ Actualiza timestamp
  // ❌ NO actualiza: stage, services_seen, first_interaction (preservados)
}
```

**Sin bifurcación correcta**:
```javascript
// ❌ Riesgo: Usar row_on_create en update
{
  stage: "explore",  // ❌ Sobrescribiría "qualify" → "explore" (pérdida de datos)
  services_seen: 0,  // ❌ Resetearía contador de 3 → 0
  first_interaction: "2025-10-31T09:33:39.000-03:00"  // ❌ Cambiaría fecha original
}
```

---

### 3. **Garantizar Integridad de Defaults**

Los valores iniciales (defaults) solo deben aplicarse en **Create**, no en **Update**:

| Campo | Default | Create | Update |
|-------|---------|--------|--------|
| `stage` | `"explore"` | ✅ Se aplica | ❌ NO se aplica |
| `services_seen` | `0` | ✅ Se aplica | ❌ NO se aplica |
| `first_interaction` | Timestamp actual | ✅ Se aplica | ❌ NO se aplica |
| `last_message` | Mensaje actual | ✅ Se aplica | ✅ Se aplica |

La bifurcación garantiza esta lógica.

---

### 4. **Auditabilidad del Flujo**

Con el Switch, el workflow es **transparente**:

```
Logs:
- checkIfLeadAlreadyRegistered → exists: false → Fallback route
  → Próximo nodo: Baserow Create

Logs:
- checkIfLeadAlreadyRegistered → exists: true → True route
  → Próximo nodo: Baserow Update
```

**Ventaja para debugging**: Fácil identificar qué flujo se ejecutó.

## Diagrama de Flujo Completo

```
┌─────────────────────────────────┐
│ Build Lead Row                  │
│ {                               │
│   keys,                         │
│   row_on_create,                │
│   row_always,                   │
│   row_upsert                    │
│ }                               │
└──────────┬──────────────────────┘
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
│ { exists, row_id }  │    │                     │
└──────────┬──────────┘    │                     │
           │               │                     │
           └───────────────┴─────────────────────┤
                           │                     │
                           ▼                     │
                ┌─────────────────────────────┐  │
                │ MergeForUpdate              │  │
                │ (combines both)             │  │
                └──────────┬──────────────────┘  │
                           │                     │
                           ▼                     │
                ┌─────────────────────────────┐  │
                │ checkIfLeadAlready          │ ← ESTAMOS AQUÍ
                │ Registered                  │  │
                │                             │  │
                │ Condition: exists === true  │  │
                └──────────┬──────────────────┘  │
                           │                     │
                      ┌────┴────┐                │
                      │         │                │
                   [true]    [false]             │
                      │         │                │
                      ▼         ▼                │
            ┌──────────────┐ ┌──────────────┐   │
            │ Update Flow  │ │ Create Flow  │   │
            │              │ │              │   │
            │ Baserow      │ │ Baserow      │   │
            │ Update       │ │ Create       │   │
            │              │ │              │   │
            │ Usa:         │ │ Usa:         │   │
            │ - row_always │ │ - row_on_    │   │
            │ - row_id     │ │   create     │   │
            └──────────────┘ └──────────────┘   │
                                                 │
                        (flujos continúan) ──────┘
```

## Casos de Uso Detallados

### Caso 1: Primer mensaje de un lead (Create Flow)

```javascript
// Input
{
  exists: false,  // ← Lead NO existe
  row_id: null,
  row: null,
  row_on_create: {
    chatwoot_id: 186,
    full_name: "Felix Figueroa",
    stage: "explore",
    services_seen: 0,
    first_interaction: "2025-10-31T09:33:39.000-03:00"
  }
}

// Evaluación
$json.exists === true  // false === true → ❌ False

// Output Route: Fallback (Create Flow)

// Próximo nodo: Baserow Create
// Operation: INSERT INTO Leads VALUES (...)
// Data: row_on_create

// Resultado en Baserow:
{
  id: 125,  // ✅ Nuevo ID asignado
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  stage: "explore",  // ✅ Valor inicial
  services_seen: 0,  // ✅ Contador inicial
  first_interaction: "2025-10-31T09:33:39.000-03:00"  // ✅ Timestamp de creación
}
```

---

### Caso 2: Lead que vuelve a escribir (Update Flow)

```javascript
// Input
{
  exists: true,  // ← Lead existe
  row_id: 123,
  row: {
    id: 123,
    stage: "qualify",  // ← Valor actual en DB
    services_seen: 3,  // ← Contador actual
    first_interaction: "2025-10-30T14:25:10.000-03:00"  // ← Fecha original
  },
  row_always: {
    last_message: "Hola que tal",
    last_message_id: 2704,
    last_activity_iso: "2025-10-31T12:33:41.372Z"
  }
}

// Evaluación
$json.exists === true  // true === true → ✅ True

// Output Route: True (Update Flow)

// Próximo nodo: Baserow Update
// Operation: UPDATE Leads SET ... WHERE id = 123
// Data: row_always

// Resultado en Baserow:
{
  id: 123,  // ← Mismo ID
  chatwoot_id: 186,
  stage: "qualify",  // ✅ Preservado (NO actualizado)
  services_seen: 3,  // ✅ Preservado (NO actualizado)
  first_interaction: "2025-10-30T14:25:10.000-03:00",  // ✅ Preservado
  last_message: "Hola que tal",  // ✅ Actualizado
  last_message_id: 2704,  // ✅ Actualizado
  last_activity_iso: "2025-10-31T12:33:41.372Z"  // ✅ Actualizado
}
```

---

### Caso 3: Lead con duplicados (count > 1)

```javascript
// Input
{
  exists: true,
  row_id: 123,  // ⚠️ ID del primer registro
  row: { id: 123, chatwoot_id: 186 },
  count: 2  // ⚠️ Indica duplicados
}

// Evaluación
$json.exists === true  // true === true → ✅ True

// Output Route: True (Update Flow)

// Próximo nodo: Baserow Update
// Operation: UPDATE Leads SET ... WHERE id = 123
// ⚠️ Solo actualiza el primer registro (id: 123)
// ⚠️ El segundo registro (id: 999) NO se actualiza

// Acción recomendada:
// 1. Limpiar duplicados en Baserow
// 2. Agregar constraint único en chatwoot_id
```

## Comparación: Switch vs IF vs Code

### Switch (actual)

```javascript
// Configuración
Type: Switch (IF)
Condition: {{ $json.exists }} is true
Outputs: 2 (true, fallback)
```

**Ventajas**:
- ✅ Visual, claro
- ✅ Fácil de entender el flujo
- ✅ n8n maneja el routing automáticamente

**Desventajas**:
- ❌ Solo evalúa una condición simple

---

### IF Node (alternativa)

```javascript
// Configuración
Type: IF
Condition: {{ $json.exists }}
Outputs: 2 (true, false)
```

**Ventajas**:
- ✅ Semánticamente más claro (IF/ELSE)
- ✅ Mismo resultado que Switch

**Desventajas**:
- ❌ Similar al Switch, sin diferencias significativas

---

### Code Node (más complejo)

```javascript
// Nodo Code
const exists = $input.item.json.exists;

if (exists) {
  // Route to Update
  return {
    json: {
      ...$input.item.json,
      _route: "update"
    }
  };
} else {
  // Route to Create
  return {
    json: {
      ...$input.item.json,
      _route: "create"
    }
  };
}
```

**Ventajas**:
- ✅ Puede agregar lógica adicional
- ✅ Puede añadir metadata (ej: `_route`)

**Desventajas**:
- ❌ Más complejo
- ❌ Requiere routing manual en nodos siguientes

**Conclusión**: Switch es la opción más adecuada para este caso.

## Validaciones y Edge Cases

### Edge Case 1: `exists` es `undefined`

```javascript
// Input (campo exists faltante)
{
  row_id: null,
  row: null
  // ❌ Falta exists
}

// Evaluación
$json.exists === true  // undefined === true → ❌ False

// Output Route: Fallback (Create Flow)
// ⚠️ Comportamiento correcto (asume que no existe)
```

**Protección**: El nodo asume `false` si `exists` es `undefined` (seguro).

---

### Edge Case 2: `exists` es string `"true"`

```javascript
// Input (tipo incorrecto)
{
  exists: "true"  // ← String en vez de Boolean
}

// Sin "Convert types where required"
"true" === true  // ❌ False (comparación estricta)

// Con "Convert types where required" ✅
// n8n convierte "true" → true
true === true  // ✅ True
```

**Protección**: El toggle "Convert types where required" está **activado** (✅), convierte automáticamente.

---

### Edge Case 3: Múltiples condiciones (futuro)

Si se necesitan múltiples condiciones:

```javascript
// Switch con múltiples condiciones
Condition 1: {{ $json.exists }} is true → Update
Condition 2: {{ $json.count }} > 1 → Warning (duplicates)
Fallback → Create
```

**Ventaja**: Switch soporta múltiples condiciones (escalable).

## Datos Disponibles para Nodos Siguientes

Ambos flujos reciben **el mismo JSON** (sin modificar):

| Campo | Tipo | Disponible en | Descripción |
|-------|------|---------------|-------------|
| `exists` | Boolean | Ambos | Si existe el lead |
| `row_id` | Number\|null | Ambos | ID de Baserow (null en Create) |
| `row` | Object\|null | Ambos | Datos anteriores (null en Create) |
| `count` | Number | Ambos | Cantidad de registros |
| `keys` | Object | Ambos | Identificadores |
| `row_on_create` | Object | **Create Flow** | Datos para creación |
| `row_always` | Object | **Update Flow** | Datos para actualización |
| `row_upsert` | Object | Ambos | Merge de ambos |

**Acceso en nodo siguiente**:

```javascript
// Create Flow (Fallback)
const createData = $json.row_on_create;
// Baserow Create con createData

// Update Flow (True)
const updateData = $json.row_always;
const baserowId = $json.row_id;
// Baserow Update (id: baserowId) con updateData
```

## Próximos Nodos Esperados

### True Route (Update Flow)

**Nodo esperado**: Baserow Update

**Configuración**:
```javascript
Operation: Update
Database: Leonobitech
Table: Leads
Row ID: {{ $json.row_id }}
Fields to Send: row_always
```

**Ejemplo**:
```sql
UPDATE Leads
SET
  channel = 'whatsapp',
  last_message = 'Hola que tal',
  last_message_id = 2704,
  last_activity_iso = '2025-10-31T12:33:41.372Z'
WHERE id = 123;
```

---

### Fallback Route (Create Flow)

**Nodo esperado**: Baserow Create

**Configuración**:
```javascript
Operation: Create
Database: Leonobitech
Table: Leads
Fields to Send: row_on_create
```

**Ejemplo**:
```sql
INSERT INTO Leads (
  chatwoot_id, full_name, stage, services_seen,
  first_interaction, last_message, ...
) VALUES (
  186, 'Felix Figueroa', 'explore', 0,
  '2025-10-31T09:33:39.000-03:00', 'Hola que tal', ...
);
```

## Mejoras Sugeridas

### 1. Logging de routing

```javascript
// Nodo Code antes del Switch
console.log({
  action: "routing_decision",
  exists: $json.exists,
  row_id: $json.row_id,
  count: $json.count,
  route: $json.exists ? "update" : "create"
});

return [$input.item];
```

**Ventaja**: Trazabilidad del flujo en logs.

---

### 2. Validación de duplicados

```javascript
// Condición adicional en Switch
Condition 1: {{ $json.exists }} is true AND {{ $json.count }} === 1 → Update
Condition 2: {{ $json.exists }} is true AND {{ $json.count }} > 1 → DuplicateWarning
Fallback → Create
```

**Ventaja**: Manejo explícito de duplicados.

---

### 3. Añadir metadata de operación

```javascript
// Nodo Code que reemplaza Switch
const exists = $input.item.json.exists;

return [{
  json: {
    ...$input.item.json,
    _operation: exists ? "update" : "create",
    _timestamp: new Date().toISOString()
  }
}];
```

**Ventaja**: Siguiente nodo puede usar `$json._operation` en vez de detectar manualmente.

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Bifurcación Create vs Update según `exists`
**Rutas**: True (Update) | Fallback (Create)
**Próximos nodos**: Baserow Update (true) | Baserow Create (fallback)
**Mejora crítica**: Logging de routing y validación de duplicados
