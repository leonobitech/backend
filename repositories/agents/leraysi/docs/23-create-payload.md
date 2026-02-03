# Nodo 23: CreatePayload

## Información General

- **Nombre del nodo**: `CreatePayload`
- **Tipo**: Code (JavaScript)
- **Función**: Aplanar y limpiar datos para operación Baserow (Create o Update)
- **Entrada**: Salida del nodo `checkIfLeadAlreadyRegistered` (ambas rutas)
- **Mode**: Run Once for All Items

## Descripción

Este nodo es **crítico para la integridad de datos** en Baserow. Actúa como **sanitizador y normalizador** que:

1. **Selecciona la estructura correcta** (`row_upsert` o `row_on_create`)
2. **Elimina valores nulos/undefined** (Baserow rechaza estos valores)
3. **Valida campos Single Select** (`stage`, `priority`)
4. **Normaliza campos Multi Select** (`interests` como array)
5. **Limpia campos problemáticos** (`email` vacío, `lead_id` en 0)
6. **Deduplica arrays** (elimina valores repetidos en `interests`)

Es un **punto de validación final** antes de la operación en Baserow, asegurando que los datos cumplan con el esquema de la tabla.

## Código Completo

```javascript
// CreatePayload — aplana row_upsert/row_on_create y normaliza selects
const src = $json.row_upsert || $json.row_on_create || {};
const out = Object.fromEntries(
  Object.entries(src).filter(([k, v]) => v !== undefined && v !== null)
);

// ---------- SINGLE SELECTS ----------
const stageAllowed = new Set(['explore','qualify','proposal','won','lost']);
if (out.stage != null) {
  const s = String(out.stage).trim();
  if (!stageAllowed.has(s)) delete out.stage; // no mandes valor inválido
}

const priorityAllowed = new Set(['normal','high','low']);
if (out.priority != null) {
  const p = String(out.priority).trim();
  if (!priorityAllowed.has(p)) delete out.priority;
}

// ---------- MULTI SELECT (interests) ----------
// Si "interests" es Multiple select en Baserow, debe ser un ARRAY de strings;
// si está vacío, mandá [] (no la string "[]").
if (Array.isArray(out.interests)) {
  out.interests = [...new Set(out.interests.map(v => String(v).trim()))]; // dedupe
} else if (typeof out.interests === 'string') {
  // si te llega "[]" o "a,b,c", convertimos a array
  const t = out.interests.trim();
  if (t.startsWith('[')) {
    try { out.interests = JSON.parse(t); } catch { out.interests = []; }
  } else if (t === '') {
    out.interests = [];
  } else {
    out.interests = t.split(',').map(s => s.trim()).filter(Boolean);
  }
} else if (out.interests == null) {
  // no tocar; simplemente no enviar
}

// Si tu campo "interests" fuera Long text en vez de Multiple select, descomentá:
// if (Array.isArray(out.interests)) out.interests = JSON.stringify(out.interests);

// ---------- LIMPIEZAS ----------
if (out.email === '') delete out.email;        // evita string vacío si no querés
if (out.lead_id === 0) delete out.lead_id;     // mejor null/omitir que 0

return [{ json: out }];
```

## Lógica de Funcionamiento

### 1. Selección de Estructura Base

```javascript
const src = $json.row_upsert || $json.row_on_create || {};
```

**Propósito**: Seleccionar automáticamente la estructura correcta

**Orden de prioridad**:
1. `row_upsert` (si existe, tiene todos los campos)
2. `row_on_create` (fallback para Create Flow)
3. `{}` (objeto vacío si ambos faltan - edge case)

**Casos**:

```javascript
// Caso 1: Update Flow (tiene row_upsert)
{
  row_upsert: { chatwoot_id: 186, stage: "qualify", ... },
  row_on_create: { stage: "explore", ... }
}
// → Usa row_upsert (prioridad)

// Caso 2: Create Flow (solo row_on_create)
{
  row_on_create: { chatwoot_id: 186, stage: "explore", ... }
}
// → Usa row_on_create

// Caso 3: Datos faltantes (edge case)
{}
// → Usa {} (evita error)
```

**Operador `||` (OR lógico)**:
```javascript
A || B || C
// Retorna el primer valor "truthy":
// - A si A es truthy
// - B si A es falsy y B es truthy
// - C si A y B son falsy
```

---

### 2. Filtrado de Valores Nulos/Undefined

```javascript
const out = Object.fromEntries(
  Object.entries(src).filter(([k, v]) => v !== undefined && v !== null)
);
```

**Propósito**: Eliminar campos con valores nulos o undefined

**Proceso**:

```javascript
// Input
const src = {
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  email: null,           // ← Será eliminado
  lead_id: undefined,    // ← Será eliminado
  stage: "explore"
};

// Paso 1: Object.entries(src)
[
  ["chatwoot_id", 186],
  ["full_name", "Felix Figueroa"],
  ["email", null],
  ["lead_id", undefined],
  ["stage", "explore"]
]

// Paso 2: filter(([k, v]) => v !== undefined && v !== null)
[
  ["chatwoot_id", 186],          // ✅ Pasa
  ["full_name", "Felix Figueroa"], // ✅ Pasa
  // ["email", null],             // ❌ Filtrado
  // ["lead_id", undefined],      // ❌ Filtrado
  ["stage", "explore"]           // ✅ Pasa
]

// Paso 3: Object.fromEntries(...)
{
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  stage: "explore"
}
```

**Razón**: Baserow puede rechazar campos con `null` o `undefined` explícitos.

---

### 3. Validación de Single Select: `stage`

```javascript
const stageAllowed = new Set(['explore','qualify','proposal','won','lost']);
if (out.stage != null) {
  const s = String(out.stage).trim();
  if (!stageAllowed.has(s)) delete out.stage; // no mandes valor inválido
}
```

**Propósito**: Validar que `stage` tenga un valor permitido

**Valores permitidos**: `explore`, `qualify`, `proposal`, `won`, `lost`

**Proceso de validación**:

```javascript
// Input válido
out.stage = "qualify";
const s = String("qualify").trim();  // "qualify"
stageAllowed.has("qualify")  // ✅ true
// → stage se mantiene

// Input inválido
out.stage = "invalid_stage";
const s = String("invalid_stage").trim();  // "invalid_stage"
stageAllowed.has("invalid_stage")  // ❌ false
delete out.stage;  // ← Se elimina del payload
// → Baserow usará el valor existente (Update) o null (Create)

// Input null
out.stage = null;
if (null != null)  // ❌ false (condición no se ejecuta)
// → stage ya fue eliminado en el filtro anterior
```

**Ventaja de `Set`**:
```javascript
// Búsqueda O(1) en Set vs O(n) en Array
const allowed = new Set(['explore','qualify','proposal','won','lost']);
allowed.has('qualify')  // O(1) - instantáneo

// vs Array
const allowedArray = ['explore','qualify','proposal','won','lost'];
allowedArray.includes('qualify')  // O(n) - itera
```

---

### 4. Validación de Single Select: `priority`

```javascript
const priorityAllowed = new Set(['normal','high','low']);
if (out.priority != null) {
  const p = String(out.priority).trim();
  if (!priorityAllowed.has(p)) delete out.priority;
}
```

**Propósito**: Validar que `priority` tenga un valor permitido

**Valores permitidos**: `normal`, `high`, `low`

**Proceso de validación** (idéntico a `stage`):

```javascript
// Input válido
out.priority = "high";
// → se mantiene

// Input inválido
out.priority = "urgent";
// → se elimina

// Input vacío/null
out.priority = null;
// → no se procesa (ya filtrado)
```

---

### 5. Normalización de Multi Select: `interests`

```javascript
if (Array.isArray(out.interests)) {
  out.interests = [...new Set(out.interests.map(v => String(v).trim()))]; // dedupe
} else if (typeof out.interests === 'string') {
  // si te llega "[]" o "a,b,c", convertimos a array
  const t = out.interests.trim();
  if (t.startsWith('[')) {
    try { out.interests = JSON.parse(t); } catch { out.interests = []; }
  } else if (t === '') {
    out.interests = [];
  } else {
    out.interests = t.split(',').map(s => s.trim()).filter(Boolean);
  }
} else if (out.interests == null) {
  // no tocar; simplemente no enviar
}
```

**Propósito**: Convertir `interests` a array válido para Baserow Multiple Select

#### Caso 1: Ya es array (normalizar)

```javascript
// Input con duplicados
out.interests = ["Diseño Web", "SEO", "Diseño Web", "  SEO  "];

// Proceso
out.interests.map(v => String(v).trim())
// ["Diseño Web", "SEO", "Diseño Web", "SEO"]

new Set([...])
// Set { "Diseño Web", "SEO" }  ← Deduplica

[...new Set(...)]
// ["Diseño Web", "SEO"]  ✅ Array sin duplicados

// Output
out.interests = ["Diseño Web", "SEO"];
```

**Spread en Set para deduplicar**:
```javascript
const arr = [1, 2, 2, 3, 3, 3];
const unique = [...new Set(arr)];  // [1, 2, 3]
```

---

#### Caso 2: Es string JSON (parsear)

```javascript
// Input
out.interests = '["Diseño Web", "SEO"]';

// Proceso
const t = '["Diseño Web", "SEO"]'.trim();
t.startsWith('[')  // ✅ true

try {
  out.interests = JSON.parse('["Diseño Web", "SEO"]');
  // ✅ ["Diseño Web", "SEO"]
} catch {
  out.interests = [];  // ❌ Si falla el parse
}

// Output
out.interests = ["Diseño Web", "SEO"];
```

**Protección contra JSON inválido**:
```javascript
// Input
out.interests = '[Diseño Web, SEO]';  // ❌ JSON inválido (sin comillas)

// Parse falla
try {
  JSON.parse('[Diseño Web, SEO]');  // ❌ SyntaxError
} catch {
  out.interests = [];  // ✅ Fallback seguro
}

// Output
out.interests = [];
```

---

#### Caso 3: Es string CSV (convertir)

```javascript
// Input
out.interests = "Diseño Web, SEO, Marketing";

// Proceso
const t = "Diseño Web, SEO, Marketing".trim();
t.startsWith('[')  // ❌ false

t === ''  // ❌ false

// Split por comas
out.interests = "Diseño Web, SEO, Marketing"
  .split(',')
  // ["Diseño Web", " SEO", " Marketing"]
  .map(s => s.trim())
  // ["Diseño Web", "SEO", "Marketing"]
  .filter(Boolean);
  // ["Diseño Web", "SEO", "Marketing"]  (elimina strings vacíos)

// Output
out.interests = ["Diseño Web", "SEO", "Marketing"];
```

---

#### Caso 4: Es string vacío

```javascript
// Input
out.interests = "";

// Proceso
const t = "".trim();  // ""
t === ''  // ✅ true

out.interests = [];

// Output
out.interests = [];
```

---

#### Caso 5: Es null/undefined (omitir)

```javascript
// Input
out.interests = null;

// Proceso
if (null == null)  // ✅ true
// → No hace nada, se mantiene null

// Output
out.interests = null;
// → Fue eliminado en el filtro inicial (paso 2)
```

---

### 6. Limpiezas Adicionales

```javascript
if (out.email === '') delete out.email;        // evita string vacío si no querés
if (out.lead_id === 0) delete out.lead_id;     // mejor null/omitir que 0
```

**Propósito**: Eliminar valores "vacíos" que no aportan información

#### Limpieza de `email`

```javascript
// Input
out.email = "";

// Evaluación
"" === ''  // ✅ true
delete out.email;

// Resultado: Campo eliminado del payload
// Baserow: No actualiza email (Update) o lo deja null (Create)
```

**Razón**: String vacío `""` puede ser interpretado como "email válido vacío" en vez de "sin email".

---

#### Limpieza de `lead_id`

```javascript
// Input
out.lead_id = 0;

// Evaluación
0 === 0  // ✅ true
delete out.lead_id;

// Resultado: Campo eliminado del payload
// Baserow: Mantiene valor existente o usa null
```

**Razón**: `lead_id: 0` puede indicar "sin lead en Odoo" en vez de lead con ID 0.

## Estructura de Entrada

Recibe el objeto merged del nodo anterior (ambas rutas):

### Input desde Create Flow (Fallback)

```json
{
  "exists": false,
  "row_id": null,
  "row": null,
  "row_on_create": {
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "email": "",
    "stage": "explore",
    "services_seen": 0,
    "interests": [],
    "lead_id": 0,
    "priority": "normal"
  },
  "row_upsert": {
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "email": "",
    "stage": "explore",
    "services_seen": 0,
    "interests": [],
    "lead_id": 0,
    "priority": "normal"
  }
}
```

**Campos usados**: `row_upsert` (prioridad) o `row_on_create`

---

### Input desde Update Flow (True)

```json
{
  "exists": true,
  "row_id": 123,
  "row": {
    "id": 123,
    "stage": "qualify",
    "services_seen": 3
  },
  "row_always": {
    "last_message": "Hola que tal",
    "last_message_id": 2704
  },
  "row_upsert": {
    "chatwoot_id": 186,
    "stage": "qualify",
    "last_message": "Hola que tal",
    "last_message_id": 2704
  }
}
```

**Campos usados**: `row_upsert`

## Formato de Salida (JSON)

### Caso 1: Create Flow (lead nuevo)

**Input**:
```json
{
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
  }
}
```

**Procesamiento**:
```javascript
// 1. Selección
const src = row_upsert || row_on_create;  // → row_on_create

// 2. Filtro null/undefined
// email_ask_ts: null → ❌ Eliminado
// addressee_ask_ts: null → ❌ Eliminado

// 3. Validación stage
stage: "explore" → ✅ Válido (se mantiene)

// 4. Validación priority
priority: "normal" → ✅ Válido (se mantiene)

// 5. Normalización interests
interests: [] → ✅ Array vacío (se mantiene)

// 6. Limpiezas
email: "" → ❌ Eliminado
lead_id: 0 → ❌ Eliminado
```

**Output**:
```json
[
  {
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "full_name": "Felix Figueroa",
    "phone_number": "+5491133851987",
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
    "priority": "normal"
  }
]
```

**Campos eliminados**:
- ❌ `email` (string vacío)
- ❌ `lead_id` (valor 0)
- ❌ `email_ask_ts` (null)
- ❌ `addressee_ask_ts` (null)

---

### Caso 2: Update Flow (lead existente)

**Input**:
```json
{
  "row_upsert": {
    "chatwoot_id": 186,
    "stage": "qualify",
    "channel": "whatsapp",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z",
    "email": null,
    "lead_id": 0
  }
}
```

**Procesamiento**:
```javascript
// 1. Selección
const src = row_upsert;  // → row_upsert

// 2. Filtro null/undefined
email: null → ❌ Eliminado

// 3. Validación stage
stage: "qualify" → ✅ Válido (se mantiene)

// 4. Limpiezas
lead_id: 0 → ❌ Eliminado
```

**Output**:
```json
[
  {
    "chatwoot_id": 186,
    "stage": "qualify",
    "channel": "whatsapp",
    "last_message": "Hola que tal",
    "last_message_id": 2704,
    "last_activity_iso": "2025-10-31T12:33:41.372Z"
  }
]
```

**Campos eliminados**:
- ❌ `email` (null)
- ❌ `lead_id` (valor 0)

---

### Caso 3: Interests con duplicados (normalización)

**Input**:
```json
{
  "row_on_create": {
    "chatwoot_id": 186,
    "interests": ["Diseño Web", "SEO", "Diseño Web", "  Marketing  "]
  }
}
```

**Procesamiento**:
```javascript
// Normalización interests
Array.isArray(["Diseño Web", "SEO", "Diseño Web", "  Marketing  "])  // ✅ true

out.interests.map(v => String(v).trim())
// ["Diseño Web", "SEO", "Diseño Web", "Marketing"]

new Set([...])
// Set { "Diseño Web", "SEO", "Marketing" }

[...new Set(...)]
// ["Diseño Web", "SEO", "Marketing"]  ✅ Deduplicado
```

**Output**:
```json
[
  {
    "chatwoot_id": 186,
    "interests": ["Diseño Web", "SEO", "Marketing"]
  }
]
```

**Transformaciones**:
- ✅ Duplicados eliminados ("Diseño Web" aparecía 2 veces)
- ✅ Espacios limpiados ("  Marketing  " → "Marketing")

---

### Caso 4: Stage inválido (validación)

**Input**:
```json
{
  "row_on_create": {
    "chatwoot_id": 186,
    "stage": "invalid_stage",
    "priority": "urgent"
  }
}
```

**Procesamiento**:
```javascript
// Validación stage
stageAllowed.has("invalid_stage")  // ❌ false
delete out.stage;  // ← Eliminado

// Validación priority
priorityAllowed.has("urgent")  // ❌ false
delete out.priority;  // ← Eliminado
```

**Output**:
```json
[
  {
    "chatwoot_id": 186
  }
]
```

**Campos eliminados**:
- ❌ `stage` (valor inválido)
- ❌ `priority` (valor inválido)

**Resultado en Baserow**:
- `stage` → Baserow usará valor existente (Update) o null (Create)
- `priority` → Baserow usará valor existente (Update) o null (Create)

## Propósito en el Workflow

### 1. **Sanitización de Datos**

Antes de enviar a Baserow, el nodo **elimina valores problemáticos**:

```javascript
// Antes de CreatePayload
{
  email: "",           // ← String vacío
  lead_id: 0,          // ← 0 sin significado
  email_ask_ts: null,  // ← Null explícito
  stage: "invalid"     // ← Valor no permitido
}

// Después de CreatePayload
{
  // ✅ email eliminado
  // ✅ lead_id eliminado
  // ✅ email_ask_ts eliminado
  // ✅ stage eliminado
}

// Baserow recibe solo campos válidos
```

**Ventaja**: Evita errores de validación en Baserow.

---

### 2. **Validación de Enums (Single Select)**

Los campos `stage` y `priority` son **Single Select** en Baserow:

```javascript
// Baserow schema
stage: {
  type: "single_select",
  options: ["explore", "qualify", "proposal", "won", "lost"]
}

priority: {
  type: "single_select",
  options: ["normal", "high", "low"]
}
```

**Sin validación**:
```javascript
// Intento de crear con valor inválido
stage: "invalid_stage"

// Baserow response:
// ❌ Error 400: "invalid_stage is not a valid option for field stage"
```

**Con validación** (CreatePayload):
```javascript
// Valor inválido → eliminado
stage: "invalid_stage" → delete out.stage

// Baserow recibe:
// { chatwoot_id: 186, ... }  (sin stage)

// Baserow response:
// ✅ 200 OK (usa valor por defecto o null)
```

---

### 3. **Normalización de Multi Select**

El campo `interests` es **Multi Select** en Baserow:

```javascript
// Baserow schema
interests: {
  type: "multiple_select",
  options: ["Diseño Web", "SEO", "Marketing", "Desarrollo", ...]
}
```

**Formatos posibles de entrada**:
```javascript
// Array (ideal)
interests: ["Diseño Web", "SEO"]

// String JSON
interests: '["Diseño Web", "SEO"]'

// String CSV
interests: "Diseño Web, SEO"

// String vacío
interests: ""

// Null/undefined
interests: null
```

**CreatePayload normaliza todo a array**:
```javascript
// Todos los formatos anteriores → ["Diseño Web", "SEO"]
```

**Sin normalización**:
```javascript
// Baserow recibe string en vez de array
interests: '["Diseño Web", "SEO"]'

// Baserow response:
// ❌ Error 400: "interests must be an array"
```

---

### 4. **Deduplicación de Arrays**

Si `interests` tiene duplicados, CreatePayload los elimina:

```javascript
// Input
interests: ["Diseño Web", "SEO", "Diseño Web", "SEO"]

// CreatePayload
[...new Set(interests)]  // ["Diseño Web", "SEO"]

// Baserow recibe array sin duplicados
// ✅ Más limpio
// ✅ Menos datos enviados
```

## Diagrama de Flujo

```
┌─────────────────────────────────────┐
│ checkIfLeadAlreadyRegistered        │
│                                     │
│ Output (ambas rutas):               │
│ {                                   │
│   exists,                           │
│   row_id,                           │
│   row,                              │
│   row_on_create,                    │
│   row_always,                       │
│   row_upsert                        │
│ }                                   │
└──────────┬──────────────────────────┘
           │
      ┌────┴────┐
      │         │
   [true]    [false]
      │         │
      └────┬────┘
           │
           ▼
┌─────────────────────────────────────┐
│ CreatePayload                       │ ← ESTAMOS AQUÍ
│                                     │
│ 1. Selecciona row_upsert            │
│ 2. Filtra null/undefined            │
│ 3. Valida stage/priority            │
│ 4. Normaliza interests              │
│ 5. Limpia email/lead_id             │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Output Limpio:                      │
│ {                                   │
│   chatwoot_id: 186,                 │
│   stage: "explore",  // ✅ Validado │
│   interests: [...],  // ✅ Array    │
│   // ❌ Sin nulls                   │
│   // ❌ Sin valores vacíos          │
│ }                                   │
└─────────────────────────────────────┘
```

## Casos de Uso Detallados

### Caso 1: Lead nuevo con datos completos

```javascript
// Input
{
  row_on_create: {
    chatwoot_id: 186,
    full_name: "Felix Figueroa",
    email: "",
    stage: "explore",
    interests: [],
    lead_id: 0,
    priority: "normal"
  }
}

// CreatePayload procesa:
// 1. src = row_on_create
// 2. Filtro: email_ask_ts, addressee_ask_ts eliminados (null)
// 3. stage: "explore" → ✅ válido
// 4. priority: "normal" → ✅ válido
// 5. interests: [] → ✅ array vacío
// 6. email: "" → ❌ eliminado
// 7. lead_id: 0 → ❌ eliminado

// Output
{
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  stage: "explore",
  interests: [],
  priority: "normal",
  // ... otros campos
}
```

---

### Caso 2: Lead con interests en formato CSV

```javascript
// Input
{
  row_on_create: {
    chatwoot_id: 186,
    interests: "Diseño Web, SEO, Marketing"  // ← String CSV
  }
}

// CreatePayload procesa:
typeof "Diseño Web, SEO, Marketing" === 'string'  // ✅ true
const t = "Diseño Web, SEO, Marketing".trim();
t.startsWith('[')  // ❌ false
t === ''  // ❌ false

// Split y normaliza
out.interests = "Diseño Web, SEO, Marketing"
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
// ["Diseño Web", "SEO", "Marketing"]

// Output
{
  chatwoot_id: 186,
  interests: ["Diseño Web", "SEO", "Marketing"]  // ✅ Array
}
```

---

### Caso 3: Lead con stage inválido

```javascript
// Input
{
  row_on_create: {
    chatwoot_id: 186,
    stage: "contacted"  // ← No está en ['explore','qualify','proposal','won','lost']
  }
}

// CreatePayload procesa:
const s = String("contacted").trim();  // "contacted"
stageAllowed.has("contacted")  // ❌ false
delete out.stage;  // ← Eliminado

// Output
{
  chatwoot_id: 186
  // ❌ Sin stage (Baserow usará null o valor por defecto)
}
```

---

### Caso 4: Interests con duplicados y espacios

```javascript
// Input
{
  row_on_create: {
    interests: ["Diseño Web", "  SEO  ", "Diseño Web", "Marketing"]
  }
}

// CreatePayload procesa:
Array.isArray(interests)  // ✅ true

interests.map(v => String(v).trim())
// ["Diseño Web", "SEO", "Diseño Web", "Marketing"]

new Set([...])
// Set { "Diseño Web", "SEO", "Marketing" }

[...new Set(...)]
// ["Diseño Web", "SEO", "Marketing"]

// Output
{
  interests: ["Diseño Web", "SEO", "Marketing"]
}
```

## Datos Disponibles para Siguiente Nodo

Después de CreatePayload, el siguiente nodo recibe **solo campos limpios y válidos**:

| Campo | Tipo | Siempre presente | Validado |
|-------|------|------------------|----------|
| `chatwoot_id` | Number | ✅ | - |
| `full_name` | String | ✅ | - |
| `stage` | String | ❌ | ✅ (enum) |
| `priority` | String | ❌ | ✅ (enum) |
| `interests` | Array | ❌ | ✅ (deduplicado) |
| `email` | String | ❌ | ✅ (no vacío) |
| `lead_id` | Number | ❌ | ✅ (no 0) |

**Acceso**:
```javascript
$json.chatwoot_id     // 186
$json.stage           // "explore" | undefined
$json.interests       // ["Diseño Web", "SEO"] | undefined
```

## Próximo Nodo Esperado

El siguiente nodo debería ser **Baserow Create o Update** (según la ruta):

### Create Flow (Fallback)

**Nodo**: Baserow Create

**Configuración**:
```javascript
Operation: Create
Database: Leonobitech
Table: Leads
Fields to Send: Manual Mapping
Data: {{ $json }}
```

**SQL equivalente**:
```sql
INSERT INTO Leads (
  chatwoot_id, full_name, stage, interests, priority, ...
) VALUES (
  186, 'Felix Figueroa', 'explore', '["Diseño Web","SEO"]', 'normal', ...
);
```

---

### Update Flow (True)

**Nodo**: Baserow Update

**Configuración**:
```javascript
Operation: Update
Database: Leonobitech
Table: Leads
Row ID: {{ $('MergeForUpdate').item.json.row_id }}
Fields to Send: Manual Mapping
Data: {{ $json }}
```

**SQL equivalente**:
```sql
UPDATE Leads
SET
  stage = 'qualify',
  last_message = 'Hola que tal',
  last_activity_iso = '2025-10-31T12:33:41.372Z'
WHERE id = 123;
```

**Nota**: Como `row_id` no está en `$json` (fue procesado por CreatePayload), el nodo Update debe acceder a `$('MergeForUpdate').item.json.row_id`.

## Mejoras Sugeridas

### 1. Logging de validación

```javascript
// Al final del código
const removed = [];
if (src.email === '') removed.push('email (empty)');
if (src.lead_id === 0) removed.push('lead_id (0)');
if (src.stage && !stageAllowed.has(src.stage)) removed.push(`stage (${src.stage})`);

if (removed.length > 0) {
  console.log('Fields removed:', removed.join(', '));
}
```

**Ventaja**: Trazabilidad de qué campos fueron limpiados.

---

### 2. Validación de campos requeridos

```javascript
// Después de limpiezas
const required = ['chatwoot_id', 'phone_number'];
const missing = required.filter(field => out[field] == null);

if (missing.length > 0) {
  throw new Error(`Missing required fields: ${missing.join(', ')}`);
}
```

**Ventaja**: Evita crear leads sin campos críticos.

---

### 3. Normalización de emails

```javascript
// Validar formato de email
if (out.email != null && out.email !== '') {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(out.email)) {
    console.warn(`Invalid email format: ${out.email}`);
    delete out.email;
  } else {
    out.email = out.email.toLowerCase().trim();
  }
}
```

**Ventaja**: Asegura emails válidos y normalizados.

---

### 4. Metadata de validación

```javascript
return [{
  json: {
    ...out,
    _metadata: {
      validated_at: new Date().toISOString(),
      removed_fields: removed,
      source: src === $json.row_upsert ? 'row_upsert' : 'row_on_create'
    }
  }
}];
```

**Ventaja**: Auditoría completa de la validación.

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Sanitización, validación y normalización de payload
**Validaciones**: stage (enum), priority (enum), interests (array), null/undefined, email vacío, lead_id 0
**Output**: Objeto limpio listo para Baserow Create/Update
**Próximo paso**: Baserow Create (fallback) o Baserow Update (true)
**Mejora crítica**: Logging de campos removidos y validación de campos requeridos
