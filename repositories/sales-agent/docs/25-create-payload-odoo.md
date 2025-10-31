# Nodo 25: CreatePayloadOdoo

## Información General

- **Nombre del nodo**: `CreatePayloadOdoo`
- **Tipo**: Code (JavaScript)
- **Función**: Transformar registro de Baserow a payload para Odoo CRM Lead
- **Entrada**: Salida del nodo `createLeadBaserow` (o ruta Update)
- **Mode**: Run Once for All Items

## Descripción

Este nodo actúa como **adaptador de datos** entre Baserow y Odoo. Realiza transformaciones críticas:

1. **Extrae valores de Single Select** de Baserow (objetos `{ id, value, color }` → strings)
2. **Mapea campos** de schema Baserow a schema Odoo CRM
3. **Resuelve IDs de relaciones** (country_id, state_id) usando mapeo hardcodeado
4. **Deduce ubicación geográfica** desde número de teléfono (código de área)
5. **Construye descripción enriquecida** con metadata del lead
6. **Valida y limpia datos** antes de enviar a Odoo
7. **Genera payload final** compatible con `crm.lead.create()`

Es el **punto de integración** entre dos sistemas con schemas diferentes.

## Código Completo

```javascript
// CreatePayloadOdoo — a partir del row de Baserow construye el payload limpio para Odoo

const src = $json;

// Helpers
const sel = (v) => (v && typeof v === 'object' && 'value' in v) ? String(v.value || '').trim()
           : (v == null ? '' : String(v).trim());

const onlyDigits = (s) => String(s || '').replace(/[^\d]/g, '');

// Campos base (tolerantes a nombres distintos)
const fullName   = src.full_name || src.name || '';
const phoneE164  = src.phone_number || src.phone || '';
const email      = (src.email || '').trim();
const country    = sel(src.country);
const channel    = sel(src.channel);
const chatId     = src.chatwoot_id ?? src.keys?.chatwoot_id ?? null;
const inboxId    = src.chatwoot_inbox_id ?? null;
const convId     = src.conversation_id ?? null;
const tz         = src.tz || '-03:00';
const lastMsg    = (src.last_message || '').slice(0, 180);

// === MAPEO ODOO (ajusta IDs a tu instancia) ===
const ODOO = {
  Argentina: {
    country_id: 10,                // ID de res.country (Argentina) en tu Odoo
    state_id_by_area: { '11': 553 }, // 553 = CABA en tu Odoo
    default_state_id: 553,
    default_city: 'Buenos Aires'
  },
  // Puedes agregar más países aquí
};

// Resolver country/state/city
let country_id = ODOO[country]?.country_id ?? null;
let state_id   = null;
let city       = '';

if (country === 'Argentina') {
  // Intento de deducir el área: +54 9 11 xxxx o +54 11 xxxx
  let d = onlyDigits(phoneE164);
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  const area = d.slice(0, 2); // '11' → CABA

  if (ODOO.Argentina.state_id_by_area[area]) {
    state_id = ODOO.Argentina.state_id_by_area[area];
    city = 'Buenos Aires';
  } else {
    state_id = ODOO.Argentina.default_state_id || null;
    city = ODOO.Argentina.default_city || '';
  }
}

// Descripción rica (útil para tu equipo)
const parts = [];
if (channel) parts.push(`Canal: ${channel}`);
if (chatId != null) parts.push(`Chatwoot: ${chatId}`);
if (inboxId != null) parts.push(`Inbox: ${inboxId}`);
if (convId != null) parts.push(`Conv: ${convId}`);
if (tz) parts.push(`TZ: ${tz}`);
if (lastMsg) parts.push(`Último: ${lastMsg}`);
const description = parts.join(' • ');

// Construir vals para crm.lead.create (solo IDs numéricos, sin pares [id, name])
const vals = {
  type: 'lead',
  name: fullName || `Nuevo lead ${channel || ''}`.trim(),  // asunto del lead
  contact_name: fullName || null,
  phone: phoneE164 || null,
  email_from: email || '',
  description: description || undefined,
  city: city || undefined,
  zip: src.zip || undefined,
  street: src.street || undefined,
};

// Solo añadimos IDs si existen
if (country_id) vals.country_id = country_id;
if (state_id)   vals.state_id   = state_id;

// Salida: payload limpio + passthrough del row_id de Baserow (si lo tenés)
return [{
  json: {
    odoo_payload: vals,
    baserow_row_id: src.id ?? src.row_id ?? null,
    debug_country: country
  }
}];
```

## Lógica de Funcionamiento

### 1. Helper: Extractor de Single Select (`sel`)

```javascript
const sel = (v) => (v && typeof v === 'object' && 'value' in v) ? String(v.value || '').trim()
           : (v == null ? '' : String(v).trim());
```

**Propósito**: Extraer valor de campos Single Select de Baserow

**Proceso**:

```javascript
// Input: Objeto Baserow Single Select
const country = { id: 3240, value: "Argentina", color: "cyan" };

// Evaluación
v && typeof v === 'object'  // ✅ true
'value' in v  // ✅ true

// Extracción
String(v.value || '').trim()  // "Argentina"

// Output
sel(country)  // "Argentina"
```

**Casos cubiertos**:

```javascript
// Caso 1: Objeto Single Select (Baserow)
sel({ id: 3240, value: "Argentina", color: "cyan" })  // "Argentina"

// Caso 2: String simple
sel("Argentina")  // "Argentina"

// Caso 3: Null/undefined
sel(null)  // ""
sel(undefined)  // ""

// Caso 4: Objeto sin 'value'
sel({ id: 123 })  // "[object Object]" → trim() → ""

// Caso 5: Espacios
sel({ value: "  Argentina  " })  // "Argentina"
```

---

### 2. Helper: Extractor de Dígitos (`onlyDigits`)

```javascript
const onlyDigits = (s) => String(s || '').replace(/[^\d]/g, '');
```

**Propósito**: Extraer solo dígitos de string (para analizar teléfono)

**Proceso**:

```javascript
// Input
const phone = "+54 9 11 3385 1987";

// Evaluación
String("+54 9 11 3385 1987").replace(/[^\d]/g, '')

// Resultado
"5491133851987"
```

**Casos**:

```javascript
onlyDigits("+54 9 11 3385 1987")  // "5491133851987"
onlyDigits("+1 (555) 123-4567")   // "15551234567"
onlyDigits("abc123def456")        // "123456"
onlyDigits("")                    // ""
onlyDigits(null)                  // ""
```

---

### 3. Extracción de Campos Base

```javascript
const fullName   = src.full_name || src.name || '';
const phoneE164  = src.phone_number || src.phone || '';
const email      = (src.email || '').trim();
const country    = sel(src.country);
const channel    = sel(src.channel);
const chatId     = src.chatwoot_id ?? src.keys?.chatwoot_id ?? null;
const inboxId    = src.chatwoot_inbox_id ?? null;
const convId     = src.conversation_id ?? null;
const tz         = src.tz || '-03:00';
const lastMsg    = (src.last_message || '').slice(0, 180);
```

**Propósito**: Extraer y normalizar campos del registro de Baserow

#### Campo: `fullName`

```javascript
const fullName = src.full_name || src.name || '';
```

**Tolerancia a nombres de campo**:
- Prioridad 1: `full_name` (Baserow)
- Prioridad 2: `name` (alternativo)
- Fallback: `''` (string vacío)

---

#### Campo: `country` (con `sel`)

```javascript
const country = sel(src.country);
```

**Input de Baserow**:
```javascript
src.country = { id: 3240, value: "Argentina", color: "cyan" }
```

**Extracción**:
```javascript
sel({ id: 3240, value: "Argentina", color: "cyan" })  // "Argentina"
```

**Output**: `"Argentina"` (string limpio)

---

#### Campo: `chatId` (con Nullish Coalescing)

```javascript
const chatId = src.chatwoot_id ?? src.keys?.chatwoot_id ?? null;
```

**Operador `??` (Nullish Coalescing)**:
- Retorna el primer valor que **NO sea `null` o `undefined`**
- A diferencia de `||`, `0` y `""` se consideran válidos

**Casos**:
```javascript
// Caso 1: chatwoot_id existe
src.chatwoot_id = "186"
chatId = "186"

// Caso 2: chatwoot_id es null, pero keys.chatwoot_id existe
src.chatwoot_id = null
src.keys = { chatwoot_id: 186 }
chatId = 186

// Caso 3: ambos null
src.chatwoot_id = null
src.keys = null
chatId = null
```

**Operador `?.` (Optional Chaining)**:
```javascript
src.keys?.chatwoot_id

// Equivalente a:
src.keys !== null && src.keys !== undefined ? src.keys.chatwoot_id : undefined
```

---

#### Campo: `lastMsg` (con límite de caracteres)

```javascript
const lastMsg = (src.last_message || '').slice(0, 180);
```

**Propósito**: Limitar a 180 caracteres para no exceder límites de Odoo

**Casos**:
```javascript
// Caso 1: Mensaje corto
src.last_message = "Hola que tal"
lastMsg = "Hola que tal"  // 12 caracteres

// Caso 2: Mensaje largo (200 caracteres)
src.last_message = "A".repeat(200)
lastMsg = "A".repeat(180)  // Truncado a 180

// Caso 3: Null
src.last_message = null
lastMsg = ""
```

---

### 4. Mapeo de IDs de Odoo

```javascript
const ODOO = {
  Argentina: {
    country_id: 10,                // ID de res.country (Argentina) en tu Odoo
    state_id_by_area: { '11': 553 }, // 553 = CABA en tu Odoo
    default_state_id: 553,
    default_city: 'Buenos Aires'
  },
  // Puedes agregar más países aquí
};
```

**Propósito**: Mapeo hardcodeado de nombres a IDs de Odoo

**Estructura**:
- `country_id`: ID en tabla `res.country` de Odoo
- `state_id_by_area`: Mapeo de código de área telefónico → ID de `res.country.state`
- `default_state_id`: Estado por defecto si no se puede deducir
- `default_city`: Ciudad por defecto

**Ejemplo de uso**:
```javascript
// Obtener country_id
const country = "Argentina";
const country_id = ODOO[country]?.country_id;  // 10

// Obtener state_id por código de área
const area = "11";  // CABA
const state_id = ODOO.Argentina.state_id_by_area[area];  // 553
```

**⚠️ Nota crítica**: Los IDs son **específicos de cada instancia de Odoo**. Debes:
1. Consultar tu base de datos Odoo
2. Obtener IDs reales de `res.country` y `res.country.state`
3. Actualizar el mapeo `ODOO`

---

### 5. Resolución de Ubicación Geográfica

```javascript
let country_id = ODOO[country]?.country_id ?? null;
let state_id   = null;
let city       = '';

if (country === 'Argentina') {
  // Intento de deducir el área: +54 9 11 xxxx o +54 11 xxxx
  let d = onlyDigits(phoneE164);
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  const area = d.slice(0, 2); // '11' → CABA

  if (ODOO.Argentina.state_id_by_area[area]) {
    state_id = ODOO.Argentina.state_id_by_area[area];
    city = 'Buenos Aires';
  } else {
    state_id = ODOO.Argentina.default_state_id || null;
    city = ODOO.Argentina.default_city || '';
  }
}
```

**Propósito**: Deducir estado/ciudad desde número de teléfono

#### Ejemplo: Teléfono de CABA

```javascript
// Input
phoneE164 = "+5491133851987"
country = "Argentina"

// Paso 1: Extraer dígitos
let d = onlyDigits("+5491133851987")  // "5491133851987"

// Paso 2: Remover prefijo país
d.startsWith('549')  // ✅ true
d = d.slice(3)  // "1133851987"

// Paso 3: Extraer código de área
const area = d.slice(0, 2)  // "11"

// Paso 4: Mapear a state_id
ODOO.Argentina.state_id_by_area["11"]  // 553 (CABA)

// Paso 5: Asignar
state_id = 553
city = "Buenos Aires"
```

**Output**:
```javascript
country_id = 10      // Argentina
state_id = 553       // CABA
city = "Buenos Aires"
```

---

#### Ejemplo: Teléfono de provincia (área 223 = Mar del Plata)

```javascript
// Input
phoneE164 = "+542235551234"
country = "Argentina"

// Extracción
d = "2235551234"  // Después de remover '54'
area = "22"  // Código de área

// Mapeo
ODOO.Argentina.state_id_by_area["22"]  // undefined (no mapeado)

// Fallback
state_id = ODOO.Argentina.default_state_id  // 553 (CABA como default)
city = ODOO.Argentina.default_city  // "Buenos Aires"
```

**Output**:
```javascript
country_id = 10      // Argentina
state_id = 553       // CABA (fallback)
city = "Buenos Aires"
```

**⚠️ Limitación**: Solo mapea área '11' (CABA). Para otras provincias, hay que extender `state_id_by_area`.

---

### 6. Construcción de Descripción Enriquecida

```javascript
const parts = [];
if (channel) parts.push(`Canal: ${channel}`);
if (chatId != null) parts.push(`Chatwoot: ${chatId}`);
if (inboxId != null) parts.push(`Inbox: ${inboxId}`);
if (convId != null) parts.push(`Conv: ${convId}`);
if (tz) parts.push(`TZ: ${tz}`);
if (lastMsg) parts.push(`Último: ${lastMsg}`);
const description = parts.join(' • ');
```

**Propósito**: Crear descripción rica para el lead en Odoo

**Proceso**:

```javascript
// Valores
channel = "whatsapp"
chatId = 186
inboxId = 186
convId = 190
tz = "-03:00"
lastMsg = "Hola que tal"

// Construcción del array
parts = [
  "Canal: whatsapp",
  "Chatwoot: 186",
  "Inbox: 186",
  "Conv: 190",
  "TZ: -03:00",
  "Último: Hola que tal"
]

// Join
description = "Canal: whatsapp • Chatwoot: 186 • Inbox: 186 • Conv: 190 • TZ: -03:00 • Último: Hola que tal"
```

**Uso en Odoo**: Se muestra en el campo "Notas internas" del lead.

---

### 7. Construcción de Payload Odoo

```javascript
const vals = {
  type: 'lead',
  name: fullName || `Nuevo lead ${channel || ''}`.trim(),
  contact_name: fullName || null,
  phone: phoneE164 || null,
  email_from: email || '',
  description: description || undefined,
  city: city || undefined,
  zip: src.zip || undefined,
  street: src.street || undefined,
};

// Solo añadimos IDs si existen
if (country_id) vals.country_id = country_id;
if (state_id)   vals.state_id   = state_id;
```

**Propósito**: Construir objeto compatible con `crm.lead.create()` de Odoo XML-RPC

#### Campos del payload:

| Campo Odoo | Fuente | Tipo | Requerido | Ejemplo |
|------------|--------|------|-----------|---------|
| `type` | Hardcoded | String | ✅ | `"lead"` |
| `name` | `full_name` | String | ✅ | `"Felix Figueroa"` |
| `contact_name` | `full_name` | String | ❌ | `"Felix Figueroa"` |
| `phone` | `phone_number` | String | ❌ | `"+5491133851987"` |
| `email_from` | `email` | String | ❌ | `""` |
| `description` | Generado | Text | ❌ | `"Canal: whatsapp..."` |
| `city` | Deducido | String | ❌ | `"Buenos Aires"` |
| `country_id` | Mapeado | Integer | ❌ | `10` |
| `state_id` | Deducido | Integer | ❌ | `553` |
| `zip` | Baserow | String | ❌ | `undefined` |
| `street` | Baserow | String | ❌ | `undefined` |

**Nota sobre `undefined`**:
- Odoo XML-RPC ignora campos con valor `undefined`
- No se envían al servidor (reducción de payload)

---

#### Campo: `name` (con fallback)

```javascript
name: fullName || `Nuevo lead ${channel || ''}`.trim()
```

**Casos**:
```javascript
// Caso 1: fullName existe
fullName = "Felix Figueroa"
name = "Felix Figueroa"

// Caso 2: fullName vacío, channel existe
fullName = ""
channel = "whatsapp"
name = "Nuevo lead whatsapp"

// Caso 3: Ambos vacíos
fullName = ""
channel = ""
name = "Nuevo lead"  // .trim() elimina espacio final
```

---

#### Condicionales de IDs:

```javascript
if (country_id) vals.country_id = country_id;
if (state_id)   vals.state_id   = state_id;
```

**Propósito**: Solo añadir IDs si existen (no enviar `null` a Odoo)

**Sin condicional**:
```javascript
vals.country_id = null  // ❌ Odoo puede rechazar null
```

**Con condicional**:
```javascript
if (null) vals.country_id = null;  // ❌ false, no se ejecuta
// vals.country_id no se añade → Odoo usa default
```

---

### 8. Salida Final

```javascript
return [{
  json: {
    odoo_payload: vals,
    baserow_row_id: src.id ?? src.row_id ?? null,
    debug_country: country
  }
}];
```

**Estructura de output**:
- `odoo_payload`: Objeto para `crm.lead.create()`
- `baserow_row_id`: ID del registro en Baserow (para vincular luego)
- `debug_country`: String del país (para debugging)

## Estructura de Entrada

Recibe el registro completo de Baserow:

```json
{
  "id": 198,
  "chatwoot_id": "186",
  "phone_number": "+5491133851987",
  "email": "",
  "country": {
    "id": 3240,
    "value": "Argentina",
    "color": "cyan"
  },
  "priority": {
    "id": 3260,
    "value": "normal",
    "color": "darker-blue"
  },
  "last_message": "Hola que tal",
  "full_name": "Felix Figueroa",
  "chatwoot_inbox_id": "186",
  "conversation_id": "190",
  "tz": "-03:00",
  "channel": {
    "id": 3253,
    "value": "whatsapp",
    "color": "deep-dark-green"
  },
  "stage": {
    "id": 3262,
    "value": "explore",
    "color": "yellow"
  }
}
```

## Formato de Salida (JSON)

### Caso 1: Lead con ubicación deducida (CABA)

**Input**:
```json
{
  "id": 198,
  "full_name": "Felix Figueroa",
  "phone_number": "+5491133851987",
  "country": { "value": "Argentina" },
  "channel": { "value": "whatsapp" },
  "chatwoot_id": "186",
  "chatwoot_inbox_id": "186",
  "conversation_id": "190",
  "tz": "-03:00",
  "last_message": "Hola que tal"
}
```

**Output**:
```json
[
  {
    "odoo_payload": {
      "type": "lead",
      "name": "Felix Figueroa",
      "contact_name": "Felix Figueroa",
      "phone": "+5491133851987",
      "email_from": "",
      "description": "Canal: whatsapp • Chatwoot: 186 • Inbox: 186 • Conv: 190 • TZ: -03:00 • Último: Hola que tal",
      "city": "Buenos Aires",
      "country_id": 10,
      "state_id": 553
    },
    "baserow_row_id": 198,
    "debug_country": "Argentina"
  }
]
```

**Campos destacados**:
- `country_id: 10` → Argentina en Odoo
- `state_id: 553` → CABA (deducido desde código de área '11')
- `city: "Buenos Aires"` → Ciudad asignada
- `description` → Metadata enriquecida

---

### Caso 2: Lead sin nombre (fallback)

**Input**:
```json
{
  "id": 199,
  "full_name": "",
  "phone_number": "+5491155551234",
  "channel": { "value": "instagram" }
}
```

**Output**:
```json
[
  {
    "odoo_payload": {
      "type": "lead",
      "name": "Nuevo lead instagram",
      "contact_name": null,
      "phone": "+5491155551234",
      "email_from": "",
      "description": "Canal: instagram • ...",
      "city": "Buenos Aires",
      "country_id": 10,
      "state_id": 553
    },
    "baserow_row_id": 199,
    "debug_country": "Argentina"
  }
]
```

**Transformación**:
- `name`: `"Nuevo lead instagram"` (generado automáticamente)
- `contact_name`: `null` (sin nombre)

---

### Caso 3: Lead de provincia (fallback a CABA)

**Input**:
```json
{
  "full_name": "María González",
  "phone_number": "+542235551234",
  "country": { "value": "Argentina" }
}
```

**Procesamiento**:
```javascript
// Extracción código de área
onlyDigits("+542235551234")  // "542235551234"
d = "2235551234"  // Después de remover '54'
area = "22"  // Mar del Plata

// Mapeo
ODOO.Argentina.state_id_by_area["22"]  // undefined

// Fallback
state_id = ODOO.Argentina.default_state_id  // 553
city = ODOO.Argentina.default_city  // "Buenos Aires"
```

**Output**:
```json
{
  "odoo_payload": {
    "name": "María González",
    "city": "Buenos Aires",
    "country_id": 10,
    "state_id": 553
  }
}
```

**⚠️ Limitación**: Usa CABA como fallback (incorrecto para provincia).

## Propósito en el Workflow

### 1. **Adaptación de Schemas**

Baserow y Odoo tienen estructuras diferentes:

```javascript
// Baserow
{
  country: { id: 3240, value: "Argentina", color: "cyan" },
  channel: { id: 3253, value: "whatsapp", color: "deep-dark-green" }
}

// Odoo
{
  country_id: 10,  // Solo ID numérico
  // No tiene campo 'channel'
}
```

**CreatePayloadOdoo transforma**:
- Objetos Single Select → Strings o IDs
- Campos de Baserow → Campos de Odoo
- Metadata → Descripción

---

### 2. **Deducción de Ubicación**

Odoo requiere `country_id` y `state_id` (IDs numéricos):

```javascript
// Sin CreatePayloadOdoo
country: "Argentina"  // ❌ Odoo no acepta string

// Con CreatePayloadOdoo
country_id: 10,       // ✅ ID de res.country
state_id: 553,        // ✅ ID de res.country.state
city: "Buenos Aires"  // ✅ String de ciudad
```

**Ventaja**: Pobla campos geográficos automáticamente.

---

### 3. **Enriquecimiento de Metadata**

La descripción almacena contexto útil:

```
Canal: whatsapp • Chatwoot: 186 • Inbox: 186 • Conv: 190 • TZ: -03:00 • Último: Hola que tal
```

**Uso en Odoo**:
- Vendedor puede ver canal de origen
- IDs de Chatwoot para buscar conversación
- Último mensaje enviado
- Timezone del lead

---

### 4. **Vinculación Baserow-Odoo**

El campo `baserow_row_id` permite relacionar registros:

```javascript
// Después de crear en Odoo
{
  odoo_lead_id: 456,      // ID asignado por Odoo
  baserow_row_id: 198     // ID del registro en Baserow
}

// Permite actualizar Baserow
UPDATE Leads SET lead_id = 456 WHERE id = 198
```

## Datos Disponibles para Siguiente Nodo

| Campo | Tipo | Ejemplo | Uso |
|-------|------|---------|-----|
| `odoo_payload` | Object | `{ type: "lead", name: "...", ... }` | Payload para `crm.lead.create()` |
| `baserow_row_id` | Number | `198` | ID para vincular con Odoo |
| `debug_country` | String | `"Argentina"` | Debugging |

**Acceso**:
```javascript
$json.odoo_payload           // { type: "lead", ... }
$json.odoo_payload.name      // "Felix Figueroa"
$json.odoo_payload.city      // "Buenos Aires"
$json.baserow_row_id         // 198
```

## Próximo Nodo Esperado

El siguiente nodo debería ejecutar la creación en Odoo:

### Nodo: Odoo Create Lead (vía MCP o HTTP)

**Opción 1: MCP Odoo Tool**
```javascript
// Usando MCP server de Odoo
Tool: odoo_create_lead
Arguments: {{ $json.odoo_payload }}
```

**Opción 2: HTTP Request**
```javascript
// XML-RPC a Odoo
Method: POST
URL: https://odoo.leonobitech.com/xmlrpc/2/object
Body:
{
  "service": "object",
  "method": "execute_kw",
  "args": [
    db, uid, password,
    "crm.lead", "create",
    [{{ $json.odoo_payload }}]
  ]
}
```

**Output esperado**:
```json
{
  "odoo_lead_id": 456,  // ID asignado
  "baserow_row_id": 198
}
```

## Mejoras Sugeridas

### 1. Extender mapeo de provincias

```javascript
const ODOO = {
  Argentina: {
    country_id: 10,
    state_id_by_area: {
      '11': 553,   // CABA
      '221': 554,  // Buenos Aires (provincia)
      '223': 555,  // Mar del Plata
      '261': 556,  // Mendoza
      '341': 557,  // Rosario
      '351': 558,  // Córdoba
      // ...
    },
    default_state_id: 553,
    default_city: 'Buenos Aires'
  }
};
```

---

### 2. Soporte multi-país

```javascript
const ODOO = {
  Argentina: { country_id: 10, ... },
  Uruguay: {
    country_id: 235,
    state_id_by_area: { '2': 4001 },  // Montevideo
    default_state_id: 4001,
    default_city: 'Montevideo'
  },
  Chile: {
    country_id: 46,
    state_id_by_area: { '2': 5001 },  // Santiago
    default_state_id: 5001,
    default_city: 'Santiago'
  }
};
```

---

### 3. Consulta dinámica de IDs

```javascript
// En lugar de hardcodear, consultar Odoo
const countries = await odoo.search_read('res.country', [['name', '=', 'Argentina']], ['id']);
const country_id = countries[0]?.id;

const states = await odoo.search_read('res.country.state', [['country_id', '=', country_id]], ['id', 'name']);
```

**Ventaja**: Portable entre instancias de Odoo.

---

### 4. Validación de payload antes de enviar

```javascript
// Validar campos requeridos
if (!vals.name) {
  throw new Error("Lead name is required");
}

if (!vals.phone && !vals.email_from) {
  throw new Error("Lead must have phone or email");
}
```

---

### 5. Logging de transformación

```javascript
console.log({
  action: "odoo_payload_created",
  baserow_id: src.id,
  country: country,
  state_deduced: state_id ? true : false,
  payload_size: JSON.stringify(vals).length
});
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Transformación Baserow → Odoo CRM payload
**Helpers**: `sel()` (extract Single Select), `onlyDigits()` (extract digits)
**Mapeo**: Hardcoded ODOO object (country_id, state_id_by_area)
**Deducción**: Código de área → state_id
**Output**: `{ odoo_payload, baserow_row_id, debug_country }`
**Próximo paso**: Odoo Create Lead (MCP o HTTP)
**Mejora crítica**: Extender mapeo de provincias y soporte multi-país
