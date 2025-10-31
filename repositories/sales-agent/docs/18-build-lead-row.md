# Nodo 18: Build Lead Row

## Información General

- **Nombre del nodo**: `Build Lead Row`
- **Tipo**: Code (JavaScript)
- **Función**: Transformar payload en estructura de datos para Baserow (upsert-safe)
- **Entrada**: Salida del nodo `Buf_FinalizePayload`
- **Mode**: Run Once for All Items

## Descripción

Este nodo implementa la **preparación de datos para Baserow** con una arquitectura **upsert-safe** (create/update seguro). Genera 4 estructuras de datos diferenciadas:

1. **`keys`**: Campos de búsqueda para upsert (chatwoot_id + phone_number)
2. **`row_on_create`**: Campos que se setean SOLO al crear el lead (defaults, first_interaction, etc.)
3. **`row_always`**: Campos seguros para actualizar SIEMPRE (last_message, last_activity, etc.)
4. **`row_upsert`**: Fusión de los dos anteriores (para nodos que requieren un solo objeto)

Esta arquitectura evita:
- ❌ Sobrescribir `first_interaction` en updates
- ❌ Perder datos en race conditions
- ❌ Resetear flags conversacionales

## Configuración del Nodo

### Mode
- **Tipo**: `Run Once for All Items`
- **Descripción**: Procesa todos los items del input en una sola ejecución

### Language
- **Tipo**: `JavaScript`

## Funciones Auxiliares

### `toLocalIso(isoUtc, tzOff)`

Convierte timestamp UTC a ISO local con offset de zona horaria.

```javascript
function toLocalIso(isoUtc, tzOff){
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  const sign = tzOff?.startsWith('-') ? -1 : 1;
  const [h,m] = String(tzOff||'-03:00').slice(1).split(':').map(Number);
  const offMin = sign * (h*60 + m);
  return new Date(d.getTime() + offMin*60000).toISOString().replace('Z', tzOff||'-03:00');
}
```

**Ejemplo**:
```javascript
toLocalIso('2025-10-31T12:33:39.000Z', '-03:00')
// "2025-10-31T09:33:39.000-03:00"
```

**Propósito**: Almacenar `first_interaction` en hora local del lead para reportes y análisis.

## Extracción de Datos

### Desde `profile_base`

```javascript
const pb = it.json.profile_base || {};

const country   = pb.country || 'Desconocido';         // "Argentina"
const tz        = pb.tz || '-03:00';                   // "-03:00"
const channel   = pb.channel || 'whatsapp';            // "whatsapp"
const fullName  = pb.full_name || '';                  // "Felix Figueroa"
const phone     = pb.phone_e164 || '';                 // "+5491133851987"
const email     = (pb.email ?? "");                    // "" (o email si existe)

const chatwootId       = pb.chatwoot_id ?? null;       // 186
const chatwootInboxId  = pb.chatwoot_inbox_id ?? null; // 186
const conversationId   = pb.conversation_id ?? null;   // 190
```

### Desde `event`

```javascript
const ev = it.json.event || {};

const msgId      = ev.message_id ?? null;              // 2704
const msgText    = String(ev.message_text || '').trim(); // "Hola que tal"
const msgIsoUtc  = ev.msg_created_iso || null;         // "2025-10-31T12:33:39.000Z"
const nowIsoUtc  = ev.now_iso_utc || new Date().toISOString(); // "2025-10-31T12:33:41.372Z"
```

### Conversión de Timestamps

```javascript
// Timestamp local para first_interaction
const msgIsoLocal = msgIsoUtc ? toLocalIso(msgIsoUtc, tz) : null;
// "2025-10-31T09:33:39.000-03:00"
```

## Estructura de Salida

### 1. `keys` (Campos de Búsqueda para Upsert)

```javascript
{
  chatwoot_id: 186,
  phone_number: "+5491133851987"
}
```

**Uso**: Baserow usa estos campos para buscar si el lead existe.
- Si `chatwoot_id` coincide → Update
- Si `phone_number` coincide → Update
- Si ninguno coincide → Create

---

### 2. `row_on_create` (Solo para Create)

```javascript
{
  // Identidad (Chatwoot)
  chatwoot_id: 186,
  chatwoot_inbox_id: 186,
  conversation_id: 190,

  // Perfil
  full_name: "Felix Figueroa",
  phone_number: "+5491133851987",
  email: "",
  country: "Argentina",
  tz: "-03:00",
  channel: "whatsapp",

  // Timestamps de primera interacción (inmutables)
  first_interaction: "2025-10-31T09:33:39.000-03:00",  // Local
  first_interaction_utc: "2025-10-31T12:33:39.000Z",   // UTC

  // Última actividad
  last_message: "Hola que tal",
  last_message_id: 2704,
  last_activity_iso: "2025-10-31T12:33:41.372Z",

  // Estado conversacional (defaults)
  stage: "explore",                    // Etapa inicial
  services_seen: 0,                    // Contador
  prices_asked: 0,                     // Contador
  deep_interest: 0,                    // Nivel de interés (0-10)
  proposal_offer_done: false,          // Flag de propuesta enviada
  interests: [],                       // Multi-select (servicios de interés)

  // Timestamps de solicitudes
  email_ask_ts: null,                  // Cuándo se pidió el email
  addressee_ask_ts: null,              // Cuándo se pidió el nombre/empresa

  // CRM
  lead_id: 0,                          // ID de Odoo (se actualiza después)
  priority: "normal"                   // Prioridad (normal, high, urgent)
}
```

**Campos inmutables**: `first_interaction`, `first_interaction_utc` (solo se setean en create)

---

### 3. `row_always` (Siempre Actualizable)

```javascript
{
  channel: "whatsapp",                              // Normalizado
  last_message: "Hola que tal",                     // Último mensaje
  last_message_id: 2704,                            // ID del último mensaje
  last_activity_iso: "2025-10-31T12:33:41.372Z"     // Timestamp de actividad
}
```

**Campos seguros**: Estos campos se pueden actualizar en cada mensaje sin riesgo de pérdida de datos.

---

### 4. `row_upsert` (Fusión para Upsert)

```javascript
{
  // Contiene todos los campos de row_on_create + row_always
  // Útil para nodos que requieren un solo objeto
}
```

**Estrategia de merge**:
```javascript
const row_upsert = { ...row_on_create, ...row_always };
```

Los campos de `row_always` sobrescriben los de `row_on_create` en caso de conflicto (ej: `last_message`).

## Esquema de la Tabla Baserow

### Campos de Identidad

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `chatwoot_id` | Number | ID único del contacto en Chatwoot | 186 |
| `chatwoot_inbox_id` | Number | ID del inbox de Chatwoot | 186 |
| `conversation_id` | Number | ID de la conversación activa | 190 |
| `phone_number` | String | Teléfono en formato E.164 | "+5491133851987" |

---

### Campos de Perfil

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `full_name` | String | Nombre completo del lead | "Felix Figueroa" |
| `email` | String | Email (opcional) | "" o "felix@example.com" |
| `country` | String | País detectado por código de área | "Argentina" |
| `tz` | String | Zona horaria (offset UTC) | "-03:00" |
| `channel` | String | Canal de contacto | "whatsapp" |

---

### Campos Temporales (Inmutables)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `first_interaction` | String (ISO) | Primera interacción (hora local) | "2025-10-31T09:33:39.000-03:00" |
| `first_interaction_utc` | String (ISO) | Primera interacción (UTC) | "2025-10-31T12:33:39.000Z" |

---

### Campos de Actividad (Actualizables)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `last_message` | String | Último mensaje del lead | "Hola que tal" |
| `last_message_id` | Number | ID del último mensaje en Chatwoot | 2704 |
| `last_activity_iso` | String (ISO) | Timestamp de última actividad (UTC) | "2025-10-31T12:33:41.372Z" |

---

### Campos de Estado Conversacional (Flags)

| Campo | Tipo | Descripción | Valor Inicial |
|-------|------|-------------|---------------|
| `stage` | String | Etapa del lead (explore, qualify, propose, close) | "explore" |
| `services_seen` | Number | Cantidad de servicios consultados | 0 |
| `prices_asked` | Number | Cantidad de veces que preguntó por precios | 0 |
| `deep_interest` | Number | Nivel de interés profundo (0-10) | 0 |
| `proposal_offer_done` | Boolean | ¿Se envió propuesta? | false |
| `interests` | Array | Servicios de interés (multi-select) | [] |

**Propósito**: Estos flags ayudan al LLM Analista a entender el estado de la conversación y tomar mejores decisiones.

---

### Campos de Solicitudes (Timestamps)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `email_ask_ts` | String\|null | Cuándo se solicitó el email | null o "2025-10-31T12:35:00.000Z" |
| `addressee_ask_ts` | String\|null | Cuándo se solicitó nombre/empresa | null o "2025-10-31T12:36:00.000Z" |

**Uso**: Evitar pedir el mismo dato múltiples veces (UX).

---

### Campos de CRM

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `lead_id` | Number | ID de la oportunidad en Odoo | 0 (se actualiza después) |
| `priority` | String | Prioridad del lead | "normal" |

## Lógica de Funcionamiento

### Paso 1: Extracción de Datos

```javascript
const pb = it.json.profile_base || {};
const ev = it.json.event || {};

// Extraer todos los campos con defaults
const country = pb.country || 'Desconocido';
const fullName = pb.full_name || '';
// ... etc
```

---

### Paso 2: Conversión de Timestamps

```javascript
// UTC → Local con offset
const msgIsoLocal = msgIsoUtc ? toLocalIso(msgIsoUtc, tz) : null;

// "2025-10-31T12:33:39.000Z" → "2025-10-31T09:33:39.000-03:00"
```

---

### Paso 3: Construcción de Estructuras

```javascript
// 1. Keys para búsqueda
const keys = {
  chatwoot_id: chatwootId,
  phone_number: phone
};

// 2. Campos de creación (incluye defaults)
const row_on_create = {
  chatwoot_id: chatwootId,
  full_name: fullName,
  // ... todos los campos
  stage: 'explore',           // Default
  services_seen: 0,           // Default
  interests: []               // Default vacío
};

// 3. Campos de actualización (seguros)
const row_always = {
  channel: channel,
  last_message: msgText,
  last_message_id: msgId,
  last_activity_iso: nowIsoUtc
};

// 4. Upsert (merge de ambos)
const row_upsert = { ...row_on_create, ...row_always };
```

---

### Paso 4: Output

```javascript
out.push({ json: { keys, row_on_create, row_always, row_upsert } });
```

## Casos de Uso Detallados

### Caso 1: Lead Nuevo (Create)

```javascript
// Input
{
  profile_base: {
    phone_e164: "+5491133851987",
    full_name: "Felix Figueroa",
    chatwoot_id: 186
  },
  event: {
    message_text: "Hola que tal",
    message_id: 2704
  }
}

// Output (keys)
{
  chatwoot_id: 186,
  phone_number: "+5491133851987"
}

// Baserow busca por keys → No encuentra → Crea con row_on_create
// Resultado: Lead creado con:
// - first_interaction: "2025-10-31T09:33:39.000-03:00" ✅ (setea)
// - stage: "explore" ✅ (default)
// - services_seen: 0 ✅ (default)
```

---

### Caso 2: Lead Existente (Update)

```javascript
// Mismo input que arriba, pero el lead ya existe en Baserow

// Baserow busca por keys → Encuentra → Actualiza con row_always
// Resultado: Lead actualizado con:
// - last_message: "Hola que tal" ✅ (actualiza)
// - last_activity_iso: "2025-10-31T12:33:41.372Z" ✅ (actualiza)
// - first_interaction: "2025-10-30T..." ✅ (NO cambia, se preserva)
// - services_seen: 3 ✅ (NO cambia, se preserva)
```

**Ventaja**: Los contadores y timestamps inmutables no se resetean.

---

### Caso 3: Lead con Email

```javascript
// Input
{
  profile_base: {
    phone_e164: "+5491133851987",
    full_name: "Felix Figueroa",
    email: "felix@leonobitech.com"
  }
}

// Output (row_on_create)
{
  email: "felix@leonobitech.com"  // ✅ Se incluye
}
```

---

### Caso 4: Lead sin Nombre

```javascript
// Input
{
  profile_base: {
    phone_e164: "+5491133851987",
    full_name: ""  // Chatwoot no tiene nombre
  }
}

// Output (row_on_create)
{
  full_name: ""  // Vacío, pero no null
}

// En Baserow se puede mostrar el teléfono como identificador
```

## Arquitectura Upsert-Safe

### Problema sin arquitectura segura

```javascript
// ❌ Enfoque ingenuo (todos los campos siempre)
const row = {
  first_interaction: "2025-10-31T09:33:39.000-03:00",
  services_seen: 0,  // ❌ Resetea el contador en update!
  last_message: "Nuevo mensaje"
};

// En update, services_seen se resetea a 0 (pierde el progreso)
```

---

### ✅ Solución con arquitectura segura

```javascript
// Create: usa row_on_create (con defaults)
{
  first_interaction: "2025-10-31T09:33:39.000-03:00",
  services_seen: 0  // ✅ Correcto en create
}

// Update: usa row_always (solo campos seguros)
{
  last_message: "Nuevo mensaje",
  last_activity_iso: "..."
  // ✅ services_seen NO está aquí, se preserva
}
```

## Flags Conversacionales

### `stage` (Etapa del Lead)

```javascript
// Valores posibles
"explore"   // Explorando, preguntando
"qualify"   // Calificando, mostrando interés
"propose"   // Recibió propuesta
"close"     // Cerrado (ganado o perdido)
```

**Uso**: El LLM Analista ajusta su respuesta según la etapa.

---

### `services_seen` (Contador)

```javascript
// Se incrementa cada vez que el lead consulta sobre un servicio
services_seen: 0  // Inicial
services_seen: 3  // Después de 3 consultas

// Uso: Identificar leads muy activos
if (services_seen > 5) {
  priority = "high";
}
```

---

### `prices_asked` (Contador)

```javascript
// Se incrementa cada vez que pregunta por precios
prices_asked: 0  // Inicial
prices_asked: 2  // Preguntó 2 veces

// Uso: Indicador de intención de compra
if (prices_asked > 1 && services_seen > 3) {
  stage = "qualify";  // Alta intención
}
```

---

### `deep_interest` (Nivel 0-10)

```javascript
// Calculado por el LLM Analista
deep_interest: 0   // Sin interés
deep_interest: 5   // Interés moderado
deep_interest: 9   // Muy interesado

// Uso: Priorizar leads calientes
if (deep_interest >= 7) {
  priority = "high";
  // Notificar al equipo de ventas
}
```

---

### `proposal_offer_done` (Boolean)

```javascript
// Se marca true cuando el agente envía una propuesta formal
proposal_offer_done: false  // Inicial
proposal_offer_done: true   // Después de enviar propuesta

// Uso: Evitar enviar múltiples propuestas
if (proposal_offer_done) {
  // Cambiar a modo "follow-up"
}
```

---

### `interests` (Array Multi-Select)

```javascript
// Servicios que el lead ha consultado
interests: []  // Inicial
interests: ["Diseño Web", "SEO", "Marketing Digital"]

// Uso: Personalizar respuestas futuras
const hasInterestIn = (service) => interests.includes(service);
if (hasInterestIn("SEO")) {
  // Mencionar caso de éxito de SEO
}
```

## Próximo Nodo Esperado

El siguiente nodo debería ser un **Baserow Upsert** (o HTTP Request a Baserow API) que:

1. Busca el lead por `keys` (chatwoot_id o phone_number)
2. Si no existe → Crea con `row_on_create`
3. Si existe → Actualiza con `row_always`

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Preparación de datos para Baserow (upsert-safe)
**Output**: 4 estructuras (keys, row_on_create, row_always, row_upsert)
**Arquitectura clave**: Separación create/update para evitar pérdida de datos
**Próximo paso**: Nodo Baserow Upsert
