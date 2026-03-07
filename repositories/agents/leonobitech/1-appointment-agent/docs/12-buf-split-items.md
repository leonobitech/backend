# Nodo 12: Buf_SplitItems

## Información General

- **Nombre del nodo**: `Buf_SplitItems`
- **Tipo**: Split Out (Item Lists)
- **Función**: Separar el array de mensajes en items individuales
- **Entrada**: Salida del nodo `Buf_Flush`

## Descripción

Este nodo implementa la **operación de split** que convierte un array de mensajes en items individuales. Transforma la estructura de datos de:

```
1 item con array de N mensajes
→
N items con 1 mensaje cada uno
```

Esto permite que los nodos siguientes procesen cada mensaje individualmente (parsear, concatenar, etc.).

## Configuración del Nodo

### Fields To Split Out
- **Valor**: `message`
- **Descripción**: Campo que contiene el array a separar

### Use $binary to split out the input item by binary data
- **Valor**: ❌ Disabled
- **Descripción**: Solo split de datos JSON, no binarios

### Include
- **Valor**: `No Other Fields`
- **Descripción**: Solo incluir el campo `message`, descartar otros campos

### Options
- No properties configuradas

## Lógica de Funcionamiento

### Operación de Split

```javascript
// Input (1 item)
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}",
    "{\"message_id\":2705,\"message_text\":\"Necesito ayuda\",...}",
    "{\"message_id\":2706,\"message_text\":\"Es urgente\",...}"
  ]
}

// Output (3 items)
[
  { "message": "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}" },
  { "message": "{\"message_id\":2705,\"message_text\":\"Necesito ayuda\",...}" },
  { "message": "{\"message_id\":2706,\"message_text\":\"Es urgente\",...}" }
]
```

### Comportamiento con `No Other Fields`

```javascript
// Input
{
  "message": ["msg1", "msg2"],
  "other_field": "some_value"  // Este campo se descarta
}

// Output
[
  { "message": "msg1" },  // Solo 'message', sin 'other_field'
  { "message": "msg2" }
]
```

## Estructura de Entrada

Recibe el output de `Buf_Flush`:

```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
  ]
}
```

**Característica clave**: El array `message` contiene **strings JSON serializados**, no objetos parseados.

## Formato de Salida (JSON)

### Caso 1: Un solo mensaje

**Input**:
```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
  ]
}
```

**Output**:
```json
[
  {
    "message": "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
  }
]
```

**Resultado**: 1 item de salida

---

### Caso 2: Múltiples mensajes (agrupados en ventana temporal)

**Input**:
```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola\",...}",
    "{\"message_id\":2705,\"message_text\":\"Necesito ayuda\",...}",
    "{\"message_id\":2706,\"message_text\":\"Es urgente\",...}"
  ]
}
```

**Output**:
```json
[
  {
    "message": "{\"message_id\":2704,\"message_text\":\"Hola\",...}"
  },
  {
    "message": "{\"message_id\":2705,\"message_text\":\"Necesito ayuda\",...}"
  },
  {
    "message": "{\"message_id\":2706,\"message_text\":\"Es urgente\",...}"
  }
]
```

**Resultado**: 3 items de salida

## Propósito en el Workflow

### 1. **Preparar para Procesamiento Individual**

Permite que el siguiente nodo procese cada mensaje por separado:

```javascript
// Sin split (1 iteración)
for (const items of [input]) {
  // Procesa el array completo de una vez
  const messages = items.message; // Array de strings
}

// Con split (N iteraciones)
for (const item of output) {
  // Procesa cada mensaje individualmente
  const message = item.message; // String único
}
```

### 2. **Facilitar Parsing Individual**

```javascript
// Siguiente nodo (probablemente Code)
const parsed = JSON.parse($input.item.json.message);
// Ahora 'parsed' es un objeto con message_id, message_text, etc.
```

### 3. **Permitir Concatenación Ordenada**

Los items ahora pueden procesarse secuencialmente para concatenar:

```javascript
// Nodo Code después del split
let concatenated = "";
for (const item of $input.all()) {
  const msg = JSON.parse(item.json.message);
  concatenated += msg.message_text + "\n";
}
// Resultado: "Hola\nNecesito ayuda\nEs urgente\n"
```

## Diagrama de Flujo

```
┌─────────────────────────────┐
│ Buf_Flush                   │
│ Output: 1 item              │
│ {                           │
│   message: [msg1, msg2, msg3]│
│ }                           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Buf_SplitItems              │ ← ESTAMOS AQUÍ
│ Split field: "message"      │
└──────────┬──────────────────┘
           │
           ▼
     ┌────┴─────┐
     │          │
   Item 1    Item 2    Item 3
     │          │          │
     ▼          ▼          ▼
  {message:  {message:  {message:
   "msg1"}    "msg2"}    "msg3"}
```

## Casos de Uso Detallados

### Caso 1: Ventana temporal con 3 mensajes

```
Input:
{
  "message": [
    '{"message_id":2704,"message_text":"Hola"}',
    '{"message_id":2705,"message_text":"Necesito ayuda"}',
    '{"message_id":2706,"message_text":"Es urgente"}'
  ]
}

Output (3 items):
Item 0: { "message": '{"message_id":2704,"message_text":"Hola"}' }
Item 1: { "message": '{"message_id":2705,"message_text":"Necesito ayuda"}' }
Item 2: { "message": '{"message_id":2706,"message_text":"Es urgente"}' }
```

**Próximo nodo** (probablemente): Code para parsear y concatenar
```javascript
// Parse each item
const item0 = JSON.parse(item[0].message); // { message_text: "Hola" }
const item1 = JSON.parse(item[1].message); // { message_text: "Necesito ayuda" }
const item2 = JSON.parse(item[2].message); // { message_text: "Es urgente" }

// Concatenate
const fullMessage = [item0, item1, item2]
  .map(m => m.message_text)
  .join("\n");
// "Hola\nNecesito ayuda\nEs urgente"
```

---

### Caso 2: Mensaje único (sin agrupación)

```
Input:
{
  "message": [
    '{"message_id":2704,"message_text":"Hola que tal"}'
  ]
}

Output (1 item):
Item 0: { "message": '{"message_id":2704,"message_text":"Hola que tal"}' }

// Próximo nodo: Parse simple
const parsed = JSON.parse($input.item.json.message);
const fullMessage = parsed.message_text; // "Hola que tal"
```

## Comparación: Con Include Options

### Opción 1: No Other Fields (actual)

```javascript
Input:
{
  "message": ["msg1", "msg2"],
  "profile_base": { "phone": "+549..." },
  "event": { "timestamp": "..." }
}

Output:
[
  { "message": "msg1" },  // Solo 'message'
  { "message": "msg2" }
]

// ❌ Se perdió profile_base y event
```

---

### Opción 2: Keep Other Fields (alternativa)

```javascript
Input:
{
  "message": ["msg1", "msg2"],
  "profile_base": { "phone": "+549..." },
  "event": { "timestamp": "..." }
}

Output:
[
  {
    "message": "msg1",
    "profile_base": { "phone": "+549..." },  // ✅ Preservado
    "event": { "timestamp": "..." }
  },
  {
    "message": "msg2",
    "profile_base": { "phone": "+549..." },
    "event": { "timestamp": "..." }
  }
]
```

**Ventaja**: Cada item tiene acceso a `profile_base` sin necesidad de merge posterior.

## Impacto en el Flujo de Datos

### Pérdida de Contexto

⚠️ **Problema**: Al usar `No Other Fields`, se pierden datos del nodo `Normalize_Inbound`:

```javascript
// Datos antes del split
{
  "message": [...],
  "profile_base": {  // ❌ Se pierde aquí
    "phone_e164": "+5491133851987",
    "full_name": "Felix Figueroa",
    "country": "Argentina"
  }
}

// Datos después del split
{
  "message": "..."  // Solo esto
}
```

**Consecuencia**: Los nodos siguientes no tienen acceso a `profile_base` directamente.

**Soluciones**:

1. **Cambiar a "Keep Other Fields"**:
   ```
   Include: All Other Fields
   ```

2. **Merge posterior con Normalize_Inbound**:
   ```javascript
   const profile = $('Normalize_Inbound').item.json.profile_base;
   const message = $input.item.json.message;
   ```

3. **Code node antes del split** que combine todo:
   ```javascript
   return {
     json: {
       ...profile_base,
       messages: $input.item.json.message
     }
   };
   ```

## Próximo Nodo Esperado

Basándome en el título "concatenar mensajes", el siguiente nodo debería ser:

### Opción 1: Code - Parse and Concatenate

```javascript
// Parsear todos los mensajes
const messages = $input.all().map(item => {
  return JSON.parse(item.json.message);
});

// Concatenar textos
const concatenatedText = messages
  .map(m => m.message_text)
  .join("\n");

// Metadata
const messageIds = messages.map(m => m.message_id);
const timestamps = messages.map(m => m.msg_created_iso);

return {
  json: {
    concatenated_message: concatenatedText,
    message_count: messages.length,
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
  "last_message_time": "2025-10-31T12:33:45.000Z"
}
```

---

### Opción 2: Aggregate - Concatenate field

```javascript
// Usar nodo Aggregate de n8n
Aggregate: message
Operation: Concatenate
Separator: "\n"
```

**Más simple pero menos flexible**.

## Mejoras Sugeridas

### 1. Preservar profile_base

```javascript
// Cambiar configuración del nodo
Include: All Other Fields

// O en un Code node previo, anidar los datos:
{
  profile_base: { ... },
  messages: [...]
}
```

---

### 2. Parsear antes de split

```javascript
// Nodo Code ANTES del split
const parsed = $input.item.json.message.map(m => JSON.parse(m));

return {
  json: {
    messages: parsed  // Ya parseados
  }
};

// Luego split retorna objetos, no strings
```

**Ventaja**: Los nodos siguientes no necesitan JSON.parse().

---

### 3. Añadir índice de mensaje

```javascript
// Después del split, añadir metadata
const items = $input.all();
return items.map((item, index) => ({
  json: {
    ...item.json,
    message_index: index,
    total_messages: items.length,
    is_first: index === 0,
    is_last: index === items.length - 1
  }
}));
```

**Uso**: Identificar el primer y último mensaje para formateo especial.

## Monitoreo y Debugging

### Verificar cantidad de items

```javascript
// En el siguiente nodo Code
console.log("Total items after split:", $input.all().length);

// Ejemplo:
// Total items after split: 3
```

### Inspeccionar estructura

```javascript
// Ver todos los items
console.log($input.all().map(i => i.json.message));

// Output:
// [
//   '{"message_id":2704,...}',
//   '{"message_id":2705,...}',
//   '{"message_id":2706,...}'
// ]
```

### Verificar que son strings, no objetos

```javascript
const firstItem = $input.first().json.message;
console.log(typeof firstItem); // "string"
console.log(firstItem[0]); // "{"  (primer carácter del JSON)
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Split array → items individuales
**Output**: N items (uno por mensaje en el array)
**Próximo paso**: Parsear y concatenar mensajes
**Mejora crítica**: Considerar usar "All Other Fields" para preservar `profile_base`
