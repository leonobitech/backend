# Nodo 24: createLeadBaserow

## Información General

- **Nombre del nodo**: `createLeadBaserow`
- **Tipo**: Baserow (Create)
- **Función**: Crear nuevo registro de lead en Baserow
- **Entrada**: Salida del nodo `CreatePayload` (Fallback route)
- **Credential**: Baserow account

## Descripción

Este nodo ejecuta la **operación CREATE en Baserow** cuando el lead NO existe en la base de datos. Es el punto final del **Create Flow** (Fallback route del Switch).

Responsabilidades:
1. **Insertar nuevo registro** en la tabla `Leads` de Baserow
2. **Auto-mapear campos** desde el payload limpio de `CreatePayload`
3. **Generar ID único** (`internal_uid`) automáticamente por Baserow
4. **Aplicar valores por defecto** para campos no enviados
5. **Retornar registro completo** con ID asignado y campos formateados

Es el equivalente a un `INSERT` en SQL.

## Configuración del Nodo

### Credential to connect with
- **Tipo**: `Baserow account`
- **Descripción**: Credenciales de acceso a la API de Baserow

### Resource
- **Valor**: `Row`
- **Descripción**: Operación sobre filas de tabla

### Operation
- **Valor**: `Create`
- **Descripción**: Crear un nuevo registro

### Database Name or ID
- **Valor**: `Leonobitech`
- **Descripción**: Nombre de la base de datos en Baserow

### Table Name or ID
- **Valor**: `Leads`
- **Descripción**: Tabla donde se almacenan los leads

### Data to Send
- **Valor**: `Auto-Map Input Data to Columns`
- **Descripción**: Mapeo automático de campos del input a columnas de Baserow

### Inputs to Ignore
- **Valor**: `[empty]`
- **Descripción**: No ignorar ningún campo (mapear todos)

## Lógica de Funcionamiento

### Auto-Mapeo de Campos

```javascript
// Input (CreatePayload)
{
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  stage: "explore",
  interests: [],
  // ...
}

// Baserow API
POST /api/database/rows/table/{table_id}/
{
  "chatwoot_id": "186",
  "full_name": "Felix Figueroa",
  "stage": "explore",
  "interests": [],
  // ...
}

// Response
{
  "id": 198,  // ← ID asignado por Baserow
  "chatwoot_id": "186",
  "full_name": "Felix Figueroa",
  "stage": { "id": 3262, "value": "explore", "color": "yellow" },
  "internal_uid": "a412d4b2-78f4-4cfe-8533-e5da7cd0bd00",  // ← UUID generado
  // ...
}
```

---

### Transformación de Campos por Baserow

Baserow **enriquece** algunos campos al crearlos:

#### Single Select Fields

```javascript
// Input
stage: "explore"

// Baserow transforma a objeto
stage: {
  id: 3262,           // ID interno de la opción
  value: "explore",   // Valor original
  color: "yellow"     // Color asignado
}
```

**Campos afectados**:
- `stage` → `{ id, value, color }`
- `priority` → `{ id, value, color }`
- `channel` → `{ id, value, color }`
- `country` → `{ id, value, color }`

---

#### Multi Select Fields

```javascript
// Input
interests: []

// Baserow mantiene array vacío
interests: []

// Si tuviera valores:
interests: ["Diseño Web", "SEO"]

// Baserow transforma a array de objetos
interests: [
  { id: 1001, value: "Diseño Web", color: "blue" },
  { id: 1002, value: "SEO", color: "green" }
]
```

---

#### Auto-Generated Fields

```javascript
// No enviado en input
internal_uid: undefined

// Baserow genera UUID
internal_uid: "a412d4b2-78f4-4cfe-8533-e5da7cd0bd00"
```

**Campo**: `internal_uid` (UUID v4)

---

#### Number Strings

```javascript
// Input
services_seen: 0

// Baserow almacena como string
services_seen: "0"
```

**Campos afectados**:
- `services_seen` → `"0"`
- `prices_asked` → `"0"`
- `deep_interest` → `"0"`

**Nota**: Baserow puede configurar campos numéricos como Text en vez de Number.

---

#### Timestamp Formatting

```javascript
// Input
first_interaction: "2025-10-31T09:33:39.000-03:00"

// Baserow convierte a UTC sin offset
first_interaction: "2025-10-31T12:33:39Z"
```

**Campos afectados**:
- `first_interaction` → UTC con `Z`
- `first_interaction_utc` → UTC con `Z`
- `last_activity_iso` → UTC con microsegundos `.372000Z`

---

### SQL Equivalente

```sql
INSERT INTO Leads (
  chatwoot_id,
  chatwoot_inbox_id,
  conversation_id,
  full_name,
  phone_number,
  email,
  country,
  tz,
  channel,
  first_interaction,
  first_interaction_utc,
  last_message,
  last_message_id,
  last_activity_iso,
  stage,
  services_seen,
  prices_asked,
  deep_interest,
  proposal_offer_done,
  interests,
  priority
) VALUES (
  '186',
  '186',
  '190',
  'Felix Figueroa',
  '+5491133851987',
  '',
  'Argentina',
  '-03:00',
  'whatsapp',
  '2025-10-31T12:33:39Z',
  '2025-10-31T12:33:39Z',
  'Hola que tal',
  '2704',
  '2025-10-31T12:33:41.372000Z',
  'explore',
  '0',
  '0',
  '0',
  false,
  '[]',
  'normal'
)
RETURNING *;
```

## Estructura de Entrada

Recibe el payload limpio de `CreatePayload`:

```json
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
```

**Características del payload**:
- ✅ Sin valores `null` o `undefined`
- ✅ Sin strings vacíos en campos críticos
- ✅ `stage` y `priority` validados
- ✅ `interests` como array

## Formato de Salida (JSON)

### Caso 1: Lead nuevo creado exitosamente

**Input**:
```json
{
  "chatwoot_id": 186,
  "full_name": "Felix Figueroa",
  "stage": "explore",
  "interests": [],
  "priority": "normal"
}
```

**Baserow Response**:
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
    "last_message": "Hola que tal",
    "first_interaction": "2025-10-31T12:33:39Z",
    "lead_id": null,
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
    "last_message_id": "2704",
    "last_activity_iso": "2025-10-31T12:33:41.372000Z",
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

**Campos destacados**:

| Campo | Input | Output | Transformación |
|-------|-------|--------|----------------|
| `id` | - | `198` | ✅ Generado por Baserow |
| `internal_uid` | - | `"a412d4b2-..."` | ✅ UUID generado |
| `stage` | `"explore"` | `{ id: 3262, value: "explore", color: "yellow" }` | ✅ Enriquecido |
| `priority` | `"normal"` | `{ id: 3260, value: "normal", color: "darker-blue" }` | ✅ Enriquecido |
| `country` | `"Argentina"` | `{ id: 3240, value: "Argentina", color: "cyan" }` | ✅ Enriquecido |
| `channel` | `"whatsapp"` | `{ id: 3253, value: "whatsapp", color: "deep-dark-green" }` | ✅ Enriquecido |
| `services_seen` | `0` | `"0"` | ✅ Convertido a string |
| `first_interaction` | `"2025-10-31T09:33:39.000-03:00"` | `"2025-10-31T12:33:39Z"` | ✅ Convertido a UTC |
| `order` | - | `"1.00000000000000000000"` | ✅ Generado (ordenamiento) |
| `Odoo info` | - | `[]` | ✅ Default (relación vacía) |

---

### Caso 2: Lead con interests (Multi Select)

**Input**:
```json
{
  "chatwoot_id": 187,
  "full_name": "Ana García",
  "interests": ["Diseño Web", "SEO", "Marketing"]
}
```

**Baserow Response**:
```json
[
  {
    "id": 199,
    "chatwoot_id": "187",
    "full_name": "Ana García",
    "interests": [
      { "id": 1001, "value": "Diseño Web", "color": "blue" },
      { "id": 1002, "value": "SEO", "color": "green" },
      { "id": 1003, "value": "Marketing", "color": "orange" }
    ],
    "stage": {
      "id": 3262,
      "value": "explore",
      "color": "yellow"
    }
  }
]
```

**Transformación**:
```javascript
// Input
interests: ["Diseño Web", "SEO", "Marketing"]

// Output
interests: [
  { id: 1001, value: "Diseño Web", color: "blue" },
  { id: 1002, value: "SEO", "green" },
  { id: 1003, value: "Marketing", color: "orange" }
]
```

## Propósito en el Workflow

### 1. **Persistencia de Lead Nuevo**

Almacena permanentemente el lead en Baserow:

```
Antes:
- Lead solo existe en Chatwoot
- Sin historial de interacción
- Sin flags conversacionales

Después:
- Lead registrado en Baserow con ID 198
- Timestamp first_interaction guardado
- Flags inicializados (stage: explore, services_seen: 0)
- UUID único generado
```

---

### 2. **Inicialización de Flags Conversacionales**

Los flags permiten rastrear el progreso del lead:

```javascript
// Valores iniciales
{
  stage: "explore",              // ← Etapa inicial
  services_seen: 0,              // ← Contador en 0
  prices_asked: 0,               // ← Contador en 0
  deep_interest: 0,              // ← Contador en 0
  proposal_offer_done: false,    // ← Sin propuesta
  interests: [],                 // ← Sin intereses aún
  priority: "normal"             // ← Prioridad normal
}
```

**Uso posterior**: El LLM Analista puede leer estos flags para personalizar respuestas.

---

### 3. **Registro de Primera Interacción**

El campo `first_interaction` es **inmutable**:

```javascript
// Creación (hoy)
first_interaction: "2025-10-31T12:33:39Z"

// Update (mañana)
// first_interaction NO se actualiza (campo no en row_always)
first_interaction: "2025-10-31T12:33:39Z"  // ← Preservado
```

**Ventaja**: Permite calcular "tiempo desde primer contacto" para métricas.

---

### 4. **Vinculación con Chatwoot**

El `chatwoot_id` permite relacionar lead con conversación:

```javascript
// Baserow
{ id: 198, chatwoot_id: "186" }

// Chatwoot Conversation
{ id: 190, contact_id: 186 }

// Relación
Baserow.chatwoot_id === Chatwoot.contact_id
```

**Uso**: Futuras actualizaciones pueden encontrar el lead por `chatwoot_id`.

---

### 5. **Generación de Identificador Único**

Baserow genera `internal_uid` (UUID v4):

```javascript
internal_uid: "a412d4b2-78f4-4cfe-8533-e5da7cd0bd00"
```

**Uso**:
- Identificador único global (no depende de ID autoincremental)
- Permite migrar datos entre sistemas sin colisiones
- Útil para APIs externas que requieren UUID

## Diagrama de Flujo

```
┌─────────────────────────────────────┐
│ checkIfLeadAlreadyRegistered        │
│                                     │
│ Condition: exists === true          │
└──────────┬──────────────────────────┘
           │
      ┌────┴────┐
      │         │
   [true]    [false] ← Fallback (Create Flow)
      │         │
      │         ▼
      │  ┌─────────────────────────────┐
      │  │ CreatePayload               │
      │  │ Output: {                   │
      │  │   chatwoot_id: 186,         │
      │  │   stage: "explore",         │
      │  │   interests: [],            │
      │  │   ...                       │
      │  │ }                           │
      │  └──────────┬──────────────────┘
      │             │
      │             ▼
      │  ┌─────────────────────────────┐
      │  │ createLeadBaserow           │ ← ESTAMOS AQUÍ
      │  │                             │
      │  │ Operation: Create           │
      │  │ Database: Leonobitech       │
      │  │ Table: Leads                │
      │  │ Data: Auto-Map              │
      │  └──────────┬──────────────────┘
      │             │
      │             ▼
      │  ┌─────────────────────────────┐
      │  │ Baserow Response:           │
      │  │ {                           │
      │  │   id: 198,                  │
      │  │   internal_uid: "a412...",  │
      │  │   stage: { ... },           │
      │  │   ...                       │
      │  │ }                           │
      │  └─────────────────────────────┘
      │
      └─────────────┬───────────────────
                    │
                    ▼
         (ambas rutas continúan)
```

## Casos de Uso Detallados

### Caso 1: Primer contacto de un lead

```javascript
// Situación
// - Lead escribe por primera vez a WhatsApp
// - FindByChatwootId retorna vacío (no existe)
// - checkIfLeadAlreadyRegistered → Fallback (false)

// Input a createLeadBaserow
{
  chatwoot_id: 186,
  full_name: "Felix Figueroa",
  phone_number: "+5491133851987",
  channel: "whatsapp",
  stage: "explore",
  services_seen: 0,
  first_interaction: "2025-10-31T12:33:39Z"
}

// Baserow CREATE
POST /api/database/rows/table/Leads/
Body: { chatwoot_id: "186", full_name: "Felix Figueroa", ... }

// Baserow Response
{
  id: 198,  // ← Nuevo ID
  chatwoot_id: "186",
  full_name: "Felix Figueroa",
  stage: { id: 3262, value: "explore", color: "yellow" },
  internal_uid: "a412d4b2-...",  // ← UUID generado
  first_interaction: "2025-10-31T12:33:39Z"
}

// Resultado
// ✅ Lead creado en Baserow con ID 198
// ✅ Flags inicializados (stage: explore, services_seen: 0)
// ✅ Timestamp de primera interacción guardado
```

---

### Caso 2: Lead con intereses detectados

```javascript
// Situación
// - LLM Analista detectó intereses en el mensaje
// - Build Lead Row incluyó interests: ["Diseño Web", "SEO"]

// Input a createLeadBaserow
{
  chatwoot_id: 187,
  full_name: "Ana García",
  interests: ["Diseño Web", "SEO"],
  stage: "qualify"  // ← Etapa avanzada detectada
}

// Baserow CREATE
POST /api/database/rows/table/Leads/
Body: { interests: ["Diseño Web", "SEO"], stage: "qualify", ... }

// Baserow Response
{
  id: 199,
  interests: [
    { id: 1001, value: "Diseño Web", color: "blue" },
    { id: 1002, value: "SEO", color: "green" }
  ],
  stage: { id: 3263, value: "qualify", color: "orange" }
}

// Resultado
// ✅ Lead creado con intereses
// ✅ Stage inicial en "qualify" (no "explore")
```

---

### Caso 3: Lead sin email ni business_name

```javascript
// Situación
// - CreatePayload eliminó email (string vacío)
// - business_name no fue enviado

// Input a createLeadBaserow
{
  chatwoot_id: 188,
  full_name: "Carlos López",
  phone_number: "+5491155551234"
  // ❌ Sin email
  // ❌ Sin business_name
}

// Baserow CREATE
POST /api/database/rows/table/Leads/
Body: { chatwoot_id: "188", full_name: "Carlos López", ... }

// Baserow Response
{
  id: 200,
  full_name: "Carlos López",
  email: "",              // ← Baserow usa default (string vacío)
  business_name: null     // ← Baserow usa default (null)
}

// Resultado
// ✅ Lead creado sin email ni business_name
// ✅ Campos opcionales usan valores por defecto
```

## Datos Disponibles para Siguiente Nodo

Después de la creación, el siguiente nodo tiene acceso al **registro completo**:

| Campo | Tipo | Ejemplo | Fuente |
|-------|------|---------|--------|
| `id` | Number | `198` | Baserow (generado) |
| `internal_uid` | String (UUID) | `"a412d4b2-..."` | Baserow (generado) |
| `chatwoot_id` | String | `"186"` | Input |
| `full_name` | String | `"Felix Figueroa"` | Input |
| `stage` | Object | `{ id: 3262, value: "explore", color: "yellow" }` | Baserow (enriquecido) |
| `priority` | Object | `{ id: 3260, value: "normal", color: "darker-blue" }` | Baserow (enriquecido) |
| `interests` | Array | `[]` | Input |
| `services_seen` | String | `"0"` | Input (convertido) |
| `first_interaction` | String (ISO) | `"2025-10-31T12:33:39Z"` | Input (convertido a UTC) |
| `order` | String | `"1.00000000000000000000"` | Baserow (generado) |

**Acceso**:
```javascript
$json.id                        // 198
$json.internal_uid              // "a412d4b2-78f4-4cfe-8533-e5da7cd0bd00"
$json.stage.value               // "explore"
$json.stage.color               // "yellow"
$json.interests                 // []
$json.first_interaction         // "2025-10-31T12:33:39Z"
```

## Próximo Nodo Esperado

Ambas rutas (Create y Update) deben **converger** en un nodo común. Opciones:

### Opción 1: Merge Node

```javascript
// Nodo Merge
Input 1: createLeadBaserow (Create Flow)
Input 2: updateLeadBaserow (Update Flow)
Output: Registro de lead (creado o actualizado)
```

**Ventaja**: Unifica ambos flujos antes de continuar con Odoo.

---

### Opción 2: Continuar directamente a Odoo

```javascript
// Siguiente nodo: Search/Create Odoo Lead
Input: $json (registro de Baserow)
```

**Ventaja**: Sin nodo intermedio innecesario.

---

### Opción 3: Code Node de normalización

```javascript
// Nodo Code
const baserowLead = $input.item.json;

return [{
  json: {
    baserow_id: baserowLead.id,
    chatwoot_id: baserowLead.chatwoot_id,
    full_name: baserowLead.full_name,
    stage: baserowLead.stage.value,  // ← Extrae solo el valor
    // ... normaliza campos
  }
}];
```

**Ventaja**: Prepara datos para Odoo con estructura específica.

## Manejo de Errores

### Error 1: Campo requerido faltante

```javascript
// Baserow schema
chatwoot_id: { required: true }

// Input sin chatwoot_id
{ full_name: "Felix Figueroa" }

// Baserow Response
// Status: 400 Bad Request
{
  "error": "ERROR_REQUEST_BODY_VALIDATION",
  "detail": {
    "chatwoot_id": [
      { "error": "This field is required.", "code": "required" }
    ]
  }
}
```

**Mitigación**: CreatePayload debería validar campos requeridos.

---

### Error 2: Valor inválido en Single Select

```javascript
// Baserow schema
stage: { type: "single_select", options: ["explore", "qualify", ...] }

// Input con valor inválido
{ stage: "invalid_stage" }

// Baserow Response
// Status: 400 Bad Request
{
  "error": "ERROR_REQUEST_BODY_VALIDATION",
  "detail": {
    "stage": [
      { "error": "invalid_stage is not a valid select option.", "code": "invalid_select_option" }
    ]
  }
}
```

**Mitigación**: CreatePayload ya valida stage (elimina valores inválidos).

---

### Error 3: Duplicado de chatwoot_id (si hay constraint)

```javascript
// Baserow schema (con constraint único)
chatwoot_id: { unique: true }

// Input con chatwoot_id duplicado
{ chatwoot_id: 186 }  // Ya existe

// Baserow Response
// Status: 400 Bad Request
{
  "error": "ERROR_ROW_DOES_NOT_EXIST",
  "detail": "The row with chatwoot_id 186 already exists."
}
```

**Mitigación**: FindByChatwootId debería prevenir este escenario.

## Mejoras Sugeridas

### 1. Validación de respuesta

```javascript
// Nodo Code después de createLeadBaserow
const created = $input.item.json;

if (!created.id) {
  throw new Error("Baserow did not return an ID");
}

if (!created.internal_uid) {
  console.warn("⚠️ internal_uid not generated");
}

console.log(`✅ Lead created with ID: ${created.id}`);

return [$input.item];
```

**Ventaja**: Detecta creaciones fallidas.

---

### 2. Logging de creación

```javascript
console.log({
  action: "lead_created",
  baserow_id: created.id,
  chatwoot_id: created.chatwoot_id,
  stage: created.stage.value,
  timestamp: new Date().toISOString()
});
```

**Ventaja**: Auditoría de nuevas creaciones.

---

### 3. Retry en caso de error

```javascript
// Configuración de n8n
Retry On Fail: true
Max Tries: 3
Wait Between Tries: 5 seconds
```

**Ventaja**: Tolera errores temporales de red.

---

### 4. Notificación de nuevo lead

```javascript
// Nodo Slack/Email después de crear
if (created.priority.value === "high") {
  // Enviar notificación
  await slack.send({
    channel: "#sales",
    message: `🔥 New high-priority lead: ${created.full_name}`
  });
}
```

**Ventaja**: Alertas en tiempo real para leads prioritarios.

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: INSERT en tabla Leads de Baserow
**Database**: Leonobitech
**Table**: Leads
**Data Mapping**: Auto-Map Input Data to Columns
**Output**: Registro completo con ID, UUID, y campos enriquecidos
**Próximo paso**: Merge con Update Flow o continuar a Odoo
**Mejora crítica**: Validación de respuesta y logging de creaciones
