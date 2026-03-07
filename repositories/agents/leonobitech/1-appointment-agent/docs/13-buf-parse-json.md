# Nodo 13: Buf_ParseJSON

## Información General

- **Nombre del nodo**: `Buf_ParseJSON`
- **Tipo**: Edit Fields (Set) - JSON Mode
- **Función**: Parsear strings JSON a objetos JavaScript
- **Entrada**: Salida del nodo `Buf_SplitItems`
- **Mode**: JSON

## Descripción

Este nodo implementa la **deserialización de JSON** convirtiendo cada string JSON (almacenado en Redis) en un objeto JavaScript accesible. Transforma la estructura de datos de:

```
{ "message": '{"message_id":2704,...}' }  // String
→
{ "message_id": 2704, ... }               // Objeto
```

Es un paso crucial antes de la concatenación, ya que permite acceder a los campos individuales (`message_text`, `message_id`, etc.) sin necesidad de parsing manual en cada nodo.

## Configuración del Nodo

### Mode
- **Tipo**: `JSON`
- **Descripción**: Parsear string JSON a objeto

### JSON
```javascript
{{ JSON.parse($json.message) }}
```

**Explicación**:
- `$json.message`: Accede al campo `message` del item actual (string JSON)
- `JSON.parse()`: Convierte el string a objeto JavaScript
- `{{ }}`: Expresión de n8n que evalúa y retorna el resultado

### Include Other Input Fields
- **Valor**: ✅ Enabled
- **Descripción**: Mantener otros campos del input (si existen)

### Options
- No properties configuradas

## Lógica de Funcionamiento

### Operación de Parsing

```javascript
// Input (cada item del split)
{
  "message": "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
}

// JSON.parse() ejecutado
const parsed = JSON.parse($json.message);

// Output (objeto parseado)
{
  "message_id": 2704,
  "message_text": "Hola que tal",
  "msg_created_iso": "2025-10-31T12:33:39.000Z",
  "now_iso_utc": "2025-10-31T12:33:41.372Z",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"
}
```

### Transformación Visual

```
ANTES (string):
┌─────────────────────────────────────┐
│ message: "{\"message_id\":2704,...}" │  ← String con escapes
└─────────────────────────────────────┘

DESPUÉS (objeto):
┌─────────────────────────────────────┐
│ message_id: 2704                    │  ← Número
│ message_text: "Hola que tal"        │  ← String accesible
│ msg_created_iso: "2025-10-31..."    │  ← String de fecha
│ now_iso_utc: "2025-10-31..."        │
│ now_iso_local: "2025-10-31..."      │
└─────────────────────────────────────┘
```

## Estructura de Entrada

Recibe cada item individual del split anterior:

```json
{
  "message": "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
}
```

**Tipo de dato**: `message` es un **string** (contiene caracteres de escape `\"`)

## Formato de Salida (JSON)

### Caso 1: Mensaje único

**Input**:
```json
{
  "message": "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
}
```

**Output**:
```json
[
  {
    "message_id": 2704,
    "message_text": "Hola que tal",
    "msg_created_iso": "2025-10-31T12:33:39.000Z",
    "now_iso_utc": "2025-10-31T12:33:41.372Z",
    "now_iso_local": "2025-10-31T09:33:41.372-03:00"
  }
]
```

**Observación**: El campo `message` (string) fue **reemplazado** por los campos del objeto parseado.

---

### Caso 2: Múltiples mensajes (3 items después del split)

**Input (3 items)**:
```json
[
  { "message": "{\"message_id\":2704,\"message_text\":\"Hola\",...}" },
  { "message": "{\"message_id\":2705,\"message_text\":\"Necesito ayuda\",...}" },
  { "message": "{\"message_id\":2706,\"message_text\":\"Es urgente\",...}" }
]
```

**Output (3 items parseados)**:
```json
[
  {
    "message_id": 2704,
    "message_text": "Hola",
    "msg_created_iso": "2025-10-31T12:33:39.000Z",
    "now_iso_utc": "2025-10-31T12:33:41.372Z",
    "now_iso_local": "2025-10-31T09:33:41.372-03:00"
  },
  {
    "message_id": 2705,
    "message_text": "Necesito ayuda",
    "msg_created_iso": "2025-10-31T12:33:40.000Z",
    "now_iso_utc": "2025-10-31T12:33:42.000Z",
    "now_iso_local": "2025-10-31T09:33:42.000-03:00"
  },
  {
    "message_id": 2706,
    "message_text": "Es urgente",
    "msg_created_iso": "2025-10-31T12:33:41.000Z",
    "now_iso_utc": "2025-10-31T12:33:43.000Z",
    "now_iso_local": "2025-10-31T09:33:43.000-03:00"
  }
]
```

## Propósito en el Workflow

### 1. **Acceso Directo a Campos**

Antes del parsing:
```javascript
// ❌ No funciona
$json.message.message_text  // undefined

// ✅ Necesita parsing manual
JSON.parse($json.message).message_text  // "Hola que tal"
```

Después del parsing:
```javascript
// ✅ Acceso directo
$json.message_text  // "Hola que tal"
```

---

### 2. **Preparar para Concatenación**

Con objetos parseados, el siguiente nodo puede concatenar fácilmente:

```javascript
// Nodo Code después de Buf_ParseJSON
const messages = $input.all();
const concatenated = messages
  .map(item => item.json.message_text)
  .join("\n");

return {
  json: {
    full_message: concatenated,
    message_count: messages.length
  }
};
```

**Output**:
```json
{
  "full_message": "Hola\nNecesito ayuda\nEs urgente",
  "message_count": 3
}
```

---

### 3. **Validación de Datos**

El parsing también actúa como validación:

```javascript
// Si el JSON es inválido, el nodo falla
try {
  JSON.parse('{"invalid": }');  // ❌ Error
} catch (e) {
  // n8n detiene la ejecución
}
```

**Ventaja**: Detecta corrupción de datos tempranamente.

## Diagrama de Flujo

```
┌─────────────────────────────┐
│ Buf_SplitItems              │
│ Output: N items             │
│ [                           │
│   { message: '{"id":2704}' }│  ← String JSON
│   { message: '{"id":2705}' }│
│   { message: '{"id":2706}' }│
│ ]                           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Buf_ParseJSON               │ ← ESTAMOS AQUÍ
│ JSON.parse($json.message)   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Output: N items (parsed)    │
│ [                           │
│   { message_id: 2704,       │  ← Objeto
│     message_text: "Hola" }  │
│   { message_id: 2705,       │
│     message_text: "..." }   │
│   { message_id: 2706,       │
│     message_text: "..." }   │
│ ]                           │
└─────────────────────────────┘
```

## Comportamiento con "Include Other Input Fields"

### ✅ Con Include Other Input Fields (actual)

```javascript
// Input
{
  "message": '{"message_id":2704}',
  "other_field": "some_value"  // Si existiera
}

// Output
{
  "message_id": 2704,           // Del JSON.parse()
  "other_field": "some_value"   // ✅ Preservado
}
```

---

### ❌ Sin Include Other Input Fields (alternativa)

```javascript
// Input
{
  "message": '{"message_id":2704}',
  "other_field": "some_value"
}

// Output
{
  "message_id": 2704            // Solo del JSON.parse()
  // ❌ "other_field" eliminado
}
```

## Casos de Uso Detallados

### Caso 1: Parsing de 3 mensajes agrupados

```javascript
// Item 0 (input)
{ "message": '{"message_id":2704,"message_text":"Hola"}' }

// Item 0 (output)
{ "message_id": 2704, "message_text": "Hola" }

// Item 1 (input)
{ "message": '{"message_id":2705,"message_text":"Necesito ayuda"}' }

// Item 1 (output)
{ "message_id": 2705, "message_text": "Necesito ayuda" }

// Item 2 (input)
{ "message": '{"message_id":2706,"message_text":"Es urgente"}' }

// Item 2 (output)
{ "message_id": 2706, "message_text": "Es urgente" }
```

**Próximo paso**: Nodo que concatena los 3 `message_text`:
```
"Hola\nNecesito ayuda\nEs urgente"
```

---

### Caso 2: Parsing con timestamps

```javascript
// Input
{
  "message": '{"message_text":"Hola","msg_created_iso":"2025-10-31T12:33:39.000Z"}'
}

// Output (parseado)
{
  "message_text": "Hola",
  "msg_created_iso": "2025-10-31T12:33:39.000Z"  // String de fecha
}

// Siguiente nodo puede convertir a Date
const date = new Date($json.msg_created_iso);
console.log(date.toLocaleString()); // "10/31/2025, 12:33:39 PM"
```

## Ventajas de Usar el Nodo Edit Fields (JSON)

### vs Code Node con JSON.parse()

| Aspecto | Edit Fields (JSON) | Code Node |
|---------|-------------------|-----------|
| **Complejidad** | Configuración simple | Requiere código |
| **Performance** | Nativo de n8n (rápido) | Evaluación de JS |
| **Error handling** | Automático | Manual (try/catch) |
| **Debugging** | Visual en n8n UI | Console.log |
| **Mantenimiento** | Fácil de entender | Requiere conocer JS |

### Ejemplo equivalente en Code Node:

```javascript
// Equivalente a Buf_ParseJSON
const parsed = JSON.parse($input.item.json.message);

return {
  json: {
    ...parsed
  }
};
```

**Conclusión**: El nodo Edit Fields es más declarativo y fácil de mantener para parsing simple.

## Manejo de Errores

### JSON inválido

```javascript
// Si Redis almacenó un JSON corrupto
{
  "message": '{"message_id":2704,"message_text":"Hola"'  // ❌ Falta }
}

// JSON.parse() lanza error
// SyntaxError: Unexpected end of JSON input

// n8n marca el workflow como fallido
```

**Mitigación**:
1. Validar JSON antes de almacenar en Redis
2. Usar try/catch en nodo Code previo
3. Configurar retry automático en n8n

---

### Campo `message` faltante

```javascript
// Si el split no funcionó correctamente
{
  // No hay campo "message"
}

// JSON.parse(undefined) → Error
// TypeError: Cannot read property 'undefined'
```

**Mitigación**:
```javascript
// Usar expresión con fallback
{{ JSON.parse($json.message || '{}') }}
```

## Datos Disponibles para Siguiente Nodo

Después del parsing, cada item tiene los siguientes campos accesibles:

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `message_id` | Number | ID del mensaje en Chatwoot | 2704 |
| `message_text` | String | Texto del mensaje del cliente | "Hola que tal" |
| `msg_created_iso` | String | Timestamp del mensaje (UTC) | "2025-10-31T12:33:39.000Z" |
| `now_iso_utc` | String | Timestamp de procesamiento (UTC) | "2025-10-31T12:33:41.372Z" |
| `now_iso_local` | String | Timestamp local del lead | "2025-10-31T09:33:41.372-03:00" |

**Acceso en siguiente nodo**:
```javascript
$json.message_text       // "Hola que tal"
$json.message_id         // 2704
$json.msg_created_iso    // "2025-10-31T12:33:39.000Z"
```

## Próximo Nodo Esperado

El siguiente nodo debería **concatenar** los `message_text` de todos los items:

### Opción 1: Code - Concatenate Messages

```javascript
// Acceder a todos los items
const allItems = $input.all();

// Extraer textos
const texts = allItems.map(item => item.json.message_text);

// Concatenar con saltos de línea
const concatenated = texts.join("\n");

// Metadata adicional
const messageIds = allItems.map(item => item.json.message_id);
const timestamps = allItems.map(item => item.json.msg_created_iso);

return {
  json: {
    concatenated_message: concatenated,
    message_count: allItems.length,
    message_ids: messageIds,
    first_message_time: timestamps[0],
    last_message_time: timestamps[timestamps.length - 1]
  }
};
```

**Output esperado**:
```json
{
  "concatenated_message": "Hola\nNecesito ayuda\nEs urgente",
  "message_count": 3,
  "message_ids": [2704, 2705, 2706],
  "first_message_time": "2025-10-31T12:33:39.000Z",
  "last_message_time": "2025-10-31T12:33:41.000Z"
}
```

---

### Opción 2: Aggregate Node

```javascript
// Usar nodo Aggregate nativo de n8n
Aggregate: message_text
Operation: Concatenate
Separator: "\n"
```

**Más simple pero menos metadata**.

## Mejoras Sugeridas

### 1. Validación de esquema

```javascript
// Nodo Code después del parse
const requiredFields = ['message_id', 'message_text', 'msg_created_iso'];
const missingFields = requiredFields.filter(f => !$json[f]);

if (missingFields.length > 0) {
  throw new Error(`Missing fields: ${missingFields.join(', ')}`);
}
```

---

### 2. Enriquecimiento de datos

```javascript
// Añadir metadata adicional después del parse
{
  ...parsed,
  parsed_at: new Date().toISOString(),
  message_age_seconds: Math.floor((Date.now() - new Date(parsed.msg_created_iso)) / 1000),
  message_length: parsed.message_text.length
}
```

---

### 3. Normalización de timestamps

```javascript
// Convertir todos los timestamps a Date objects
{
  ...parsed,
  msg_created_date: new Date(parsed.msg_created_iso),
  now_date_utc: new Date(parsed.now_iso_utc),
  now_date_local: new Date(parsed.now_iso_local)
}
```

## Monitoreo y Debugging

### Verificar parsing exitoso

```javascript
// En nodo Code siguiente
console.log("Parsed successfully:");
console.log("- message_id:", $json.message_id);
console.log("- message_text:", $json.message_text);
console.log("- Type of message_id:", typeof $json.message_id); // "number"
```

### Comparar antes/después

```javascript
// Antes (en Buf_SplitItems output)
console.log($('Buf_SplitItems').item.json.message);
// Output: '{"message_id":2704,...}'  (string)

// Después (en Buf_ParseJSON output)
console.log($json.message_text);
// Output: "Hola que tal"  (acceso directo)
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: `JSON.parse($json.message)`
**Output**: Objetos JavaScript accesibles
**Próximo paso**: Concatenar `message_text` de todos los items
**Ventaja clave**: Acceso directo a campos sin parsing manual
