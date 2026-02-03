# Nodo 14: Buf_NormalizeParts

## Información General

- **Nombre del nodo**: `Buf_NormalizeParts`
- **Tipo**: Edit Fields (Set) - Manual Mapping
- **Función**: Extraer solo los campos necesarios para procesamiento posterior
- **Entrada**: Salida del nodo `Buf_ParseJSON`
- **Mode**: Manual Mapping

## Descripción

Este nodo implementa una **proyección de campos** (field projection), seleccionando únicamente los datos relevantes para el procesamiento posterior. Reduce la estructura de datos de 5 campos a solo 2:

```
{ message_id, message_text, msg_created_iso, now_iso_utc, now_iso_local }
↓
{ message_text, now_iso_local }
```

Esta simplificación facilita la concatenación y reduce el payload que pasa a los nodos siguientes.

## Configuración del Nodo

### Mode
- **Tipo**: `Manual Mapping`
- **Descripción**: Mapeo explícito de campos (control total)

### Fields to Set

#### Campo 1: message_text
```javascript
{{ $json.message_text }}
```
**Tipo**: String
**Descripción**: Texto del mensaje del cliente
**Ejemplo**: "Hola que tal"

#### Campo 2: now_iso_local
```javascript
{{ $json.now_iso_local }}
```
**Tipo**: String
**Descripción**: Timestamp local del lead (con offset de zona horaria)
**Ejemplo**: "2025-10-31T09:33:41.372-03:00"

### Include Other Input Fields
- **Valor**: ❌ Disabled
- **Descripción**: Solo incluir los campos mapeados explícitamente

### Options
- No properties configuradas

## Lógica de Funcionamiento

### Operación de Proyección

```javascript
// Input (5 campos del parsing)
{
  "message_id": 2704,
  "message_text": "Hola que tal",
  "msg_created_iso": "2025-10-31T12:33:39.000Z",
  "now_iso_utc": "2025-10-31T12:33:41.372Z",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"
}

// Proyección (solo 2 campos seleccionados)
{
  "message_text": "Hola que tal",              // ✅ Incluido
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"  // ✅ Incluido
}

// Campos descartados:
// - message_id (no necesario para concatenación)
// - msg_created_iso (ya tenemos now_iso_local)
// - now_iso_utc (now_iso_local es más útil)
```

### Comparación Visual

```
ANTES (5 campos):
┌─────────────────────────────────────┐
│ message_id: 2704                    │
│ message_text: "Hola que tal"        │  ← Necesario
│ msg_created_iso: "2025-10-31..."    │
│ now_iso_utc: "2025-10-31..."        │
│ now_iso_local: "2025-10-31..."      │  ← Necesario
└─────────────────────────────────────┘

DESPUÉS (2 campos):
┌─────────────────────────────────────┐
│ message_text: "Hola que tal"        │
│ now_iso_local: "2025-10-31..."      │
└─────────────────────────────────────┘
```

## Estructura de Entrada

Recibe cada item parseado del nodo anterior:

```json
{
  "message_id": 2704,
  "message_text": "Hola que tal",
  "msg_created_iso": "2025-10-31T12:33:39.000Z",
  "now_iso_utc": "2025-10-31T12:33:41.372Z",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"
}
```

## Formato de Salida (JSON)

### Caso 1: Mensaje único

**Input**:
```json
{
  "message_id": 2704,
  "message_text": "Hola que tal",
  "msg_created_iso": "2025-10-31T12:33:39.000Z",
  "now_iso_utc": "2025-10-31T12:33:41.372Z",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"
}
```

**Output**:
```json
[
  {
    "message_text": "Hola que tal",
    "now_iso_local": "2025-10-31T09:33:41.372-03:00"
  }
]
```

---

### Caso 2: Múltiples mensajes (3 items)

**Input (3 items)**:
```json
[
  {
    "message_id": 2704,
    "message_text": "Hola",
    "now_iso_local": "2025-10-31T09:33:41.372-03:00"
  },
  {
    "message_id": 2705,
    "message_text": "Necesito ayuda",
    "now_iso_local": "2025-10-31T09:33:42.000-03:00"
  },
  {
    "message_id": 2706,
    "message_text": "Es urgente",
    "now_iso_local": "2025-10-31T09:33:43.000-03:00"
  }
]
```

**Output (3 items simplificados)**:
```json
[
  {
    "message_text": "Hola",
    "now_iso_local": "2025-10-31T09:33:41.372-03:00"
  },
  {
    "message_text": "Necesito ayuda",
    "now_iso_local": "2025-10-31T09:33:42.000-03:00"
  },
  {
    "message_text": "Es urgente",
    "now_iso_local": "2025-10-31T09:33:43.000-03:00"
  }
]
```

## Propósito en el Workflow

### 1. **Reducir Payload**

```javascript
// Tamaño aproximado ANTES
{
  "message_id": 2704,                        // 13 bytes
  "message_text": "Hola que tal",            // 25 bytes
  "msg_created_iso": "2025-10-31T12:33:39.000Z",  // 38 bytes
  "now_iso_utc": "2025-10-31T12:33:41.372Z",      // 34 bytes
  "now_iso_local": "2025-10-31T09:33:41.372-03:00" // 42 bytes
}
// Total: ~152 bytes

// Tamaño aproximado DESPUÉS
{
  "message_text": "Hola que tal",            // 25 bytes
  "now_iso_local": "2025-10-31T09:33:41.372-03:00" // 42 bytes
}
// Total: ~67 bytes

// Reducción: 56% menos datos
```

**Ventaja**: Menos memoria, transferencias más rápidas entre nodos.

---

### 2. **Simplificar Concatenación**

El siguiente nodo solo necesita acceder a 2 campos:

```javascript
// Nodo Code después de Buf_NormalizeParts
const messages = $input.all();

// Concatenación simple (solo 2 campos relevantes)
const concatenated = messages
  .map(m => m.json.message_text)
  .join("\n");

const timestamps = messages
  .map(m => m.json.now_iso_local);

return {
  json: {
    full_message: concatenated,
    first_timestamp: timestamps[0],
    last_timestamp: timestamps[timestamps.length - 1]
  }
};
```

Sin normalización, el código tendría más campos innecesarios que ignorar.

---

### 3. **Preparar para Agregación**

Los nodos de agregación (Aggregate, Code) trabajan mejor con estructuras simples:

```javascript
// Estructura simple facilita operaciones
items.map(i => i.json.message_text)  // ✅ Claro y directo

// vs estructura compleja
items.map(i => {
  const { message_text, message_id, msg_created_iso, now_iso_utc, now_iso_local } = i.json;
  return message_text;  // Ignora todo lo demás
})
```

## Diagrama de Flujo

```
┌─────────────────────────────┐
│ Buf_ParseJSON               │
│ Output: N items (5 campos)  │
│ {                           │
│   message_id: 2704,         │
│   message_text: "Hola",     │
│   msg_created_iso: "...",   │
│   now_iso_utc: "...",       │
│   now_iso_local: "..."      │
│ }                           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Buf_NormalizeParts          │ ← ESTAMOS AQUÍ
│ Proyectar solo:             │
│ - message_text              │
│ - now_iso_local             │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Output: N items (2 campos)  │
│ {                           │
│   message_text: "Hola",     │
│   now_iso_local: "..."      │
│ }                           │
└─────────────────────────────┘
```

## Razones para Descartar Cada Campo

### 1. `message_id` (descartado)

```javascript
// ¿Por qué no se necesita?
// - No se usa en la concatenación de texto
// - No afecta la respuesta del LLM
// - Solo útil para auditoría (ya se registró en Redis/Chatwoot)

// Si se necesitara para debugging:
// Mantenerlo en un nodo de logging antes de descartar
```

---

### 2. `msg_created_iso` (descartado)

```javascript
// ¿Por qué no se necesita?
// - Ya tenemos now_iso_local que tiene el timestamp procesado
// - msg_created_iso es el timestamp original del mensaje en Chatwoot
// - Para concatenación, solo importa el orden (implícito en el array)

// Si se necesitara para análisis temporal:
// const messageAge = Date.now() - new Date(msg_created_iso);
```

---

### 3. `now_iso_utc` (descartado)

```javascript
// ¿Por qué no se necesita?
// - now_iso_local es más útil (tiene el timezone del lead)
// - UTC se puede derivar de now_iso_local si hace falta
// - Para logging/debugging, local es más legible

// Conversión UTC ↔ Local (si se necesitara):
// const utc = new Date(now_iso_local).toISOString();
```

## Casos de Uso Detallados

### Caso 1: Concatenación de 3 mensajes

```javascript
// Después de Buf_NormalizeParts
const items = [
  { message_text: "Hola", now_iso_local: "2025-10-31T09:33:41.372-03:00" },
  { message_text: "Necesito ayuda", now_iso_local: "2025-10-31T09:33:42.000-03:00" },
  { message_text: "Es urgente", now_iso_local: "2025-10-31T09:33:43.000-03:00" }
];

// Concatenar textos
const fullMessage = items.map(i => i.message_text).join("\n");
// "Hola\nNecesito ayuda\nEs urgente"

// Extraer rango temporal
const firstTime = items[0].now_iso_local;  // "09:33:41"
const lastTime = items[items.length - 1].now_iso_local;  // "09:33:43"
const durationSeconds =
  (new Date(lastTime) - new Date(firstTime)) / 1000;  // 2 segundos
```

---

### Caso 2: Formateo con timestamps

```javascript
// Si se quisiera incluir timestamps en la concatenación
const formatted = items.map(i => {
  const time = new Date(i.now_iso_local).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `[${time}] ${i.message_text}`;
}).join("\n");

// Output:
// [09:33] Hola
// [09:33] Necesito ayuda
// [09:33] Es urgente
```

**Uso**: Mostrar timestamps en el historial del agente.

## Alternativas de Diseño

### Alternativa 1: Mantener todos los campos

```javascript
// Include Other Input Fields: ✅ Enabled
// Output:
{
  "message_id": 2704,
  "message_text": "Hola que tal",
  "msg_created_iso": "2025-10-31T12:33:39.000Z",
  "now_iso_utc": "2025-10-31T12:33:41.372Z",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"
}
```

**Ventaja**: Máxima flexibilidad, toda la información disponible.
**Desventaja**: Más datos innecesarios, mayor complejidad.

---

### Alternativa 2: Solo message_text

```javascript
// Fields to Set: solo message_text
// Output:
{
  "message_text": "Hola que tal"
}
```

**Ventaja**: Máxima simplificación.
**Desventaja**: Pierde metadata temporal (si se necesita para análisis).

---

### Alternativa 3: Añadir campos derivados

```javascript
// Fields to Set:
// - message_text
// - timestamp (parseado)
// - message_length

{
  "message_text": "Hola que tal",
  "timestamp": 1730371421372,  // Unix timestamp
  "message_length": 12
}
```

**Ventaja**: Pre-procesa datos para análisis posterior.
**Desventaja**: Más lógica, potencial de errores.

## Comparación: Manual Mapping vs Run Once for Each Item

### Manual Mapping (actual)

```javascript
// Configuración visual en n8n
Fields to Set:
  - message_text: {{ $json.message_text }}
  - now_iso_local: {{ $json.now_iso_local }}
```

**Ventajas**:
- Visual, fácil de entender
- No requiere conocer JavaScript
- Validación automática de expresiones

---

### Run Once for Each Item (Code)

```javascript
// Nodo Code alternativo
return {
  json: {
    message_text: $input.item.json.message_text,
    now_iso_local: $input.item.json.now_iso_local
  }
};
```

**Ventajas**:
- Más flexible (lógica condicional)
- Puede hacer transformaciones complejas

**Desventajas**:
- Requiere código
- Más difícil de debugging visual

## Datos Disponibles para Siguiente Nodo

Después de la normalización, cada item tiene:

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `message_text` | String | Texto del mensaje | "Hola que tal" |
| `now_iso_local` | String | Timestamp local con offset | "2025-10-31T09:33:41.372-03:00" |

**Acceso en siguiente nodo**:
```javascript
$json.message_text     // "Hola que tal"
$json.now_iso_local    // "2025-10-31T09:33:41.372-03:00"
```

## Próximo Nodo Esperado

El siguiente nodo debería **concatenar** todos los `message_text`:

### Opción 1: Aggregate Node

```javascript
// Nodo Aggregate de n8n
Aggregate: message_text
Operation: Concatenate
Separator: "\n"
```

**Output**:
```json
{
  "message_text": "Hola\nNecesito ayuda\nEs urgente"
}
```

---

### Opción 2: Code - Custom Concatenation

```javascript
// Más control sobre el formato
const items = $input.all();

const concatenated = items
  .map(i => i.json.message_text)
  .join("\n");

const timestamps = items.map(i => i.json.now_iso_local);

return {
  json: {
    concatenated_message: concatenated,
    message_count: items.length,
    time_range: {
      start: timestamps[0],
      end: timestamps[timestamps.length - 1]
    }
  }
};
```

**Output**:
```json
{
  "concatenated_message": "Hola\nNecesito ayuda\nEs urgente",
  "message_count": 3,
  "time_range": {
    "start": "2025-10-31T09:33:41.372-03:00",
    "end": "2025-10-31T09:33:43.000-03:00"
  }
}
```

## Mejoras Sugeridas

### 1. Añadir índice de mensaje

```javascript
// Fields to Set:
// - message_text
// - now_iso_local
// - message_index

{
  "message_text": "Hola",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00",
  "message_index": 0  // Primer mensaje
}
```

**Uso**: Identificar posición en la secuencia de mensajes.

---

### 2. Incluir metadata de tiempo relativo

```javascript
// Calcular edad del mensaje
{
  "message_text": "Hola",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00",
  "age_seconds": Math.floor((Date.now() - new Date($json.now_iso_local)) / 1000)
}
```

---

### 3. Pre-limpiar texto

```javascript
// Normalizar texto (trim, lowercase, etc.)
{
  "message_text": $json.message_text.trim().replace(/\s+/g, ' '),
  "now_iso_local": $json.now_iso_local
}
```

**Ventaja**: Texto limpio antes de concatenar.

## Monitoreo y Debugging

### Verificar reducción de campos

```javascript
// Nodo Code de debugging
console.log("Campos antes (Buf_ParseJSON):",
  Object.keys($('Buf_ParseJSON').item.json));
// ["message_id", "message_text", "msg_created_iso", "now_iso_utc", "now_iso_local"]

console.log("Campos después (Buf_NormalizeParts):",
  Object.keys($json));
// ["message_text", "now_iso_local"]
```

### Verificar datos no perdidos críticos

```javascript
// Si accidentalmente se necesita message_id después
// Verificar que está disponible en nodo anterior
const messageId = $('Buf_ParseJSON').item.json.message_id;
console.log("Message ID:", messageId); // 2704
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: Proyección de campos (5 → 2)
**Campos seleccionados**: `message_text`, `now_iso_local`
**Próximo paso**: Concatenar `message_text` de todos los items
**Ventaja clave**: Payload 56% más pequeño, estructura simplificada
