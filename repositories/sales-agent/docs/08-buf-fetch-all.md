# Nodo 8: Buf_FetchAll

## Información General

- **Nombre del nodo**: `Buf_FetchAll`
- **Tipo**: Redis (Get operation)
- **Función**: Leer todos los mensajes en cola del lead sin eliminarlos
- **Entrada**: Salida del nodo `PushBufferEvent`
- **Credential**: Redis account

## Descripción

Este nodo implementa la operación de **lectura no destructiva** de la cola de mensajes en Redis. A diferencia de `LPOP`/`RPOP` que eliminan elementos, este nodo usa `GET` para **leer sin consumir**.

⚠️ **Importante**: Este nodo lee con operación `Get` (para strings), pero la cola fue creada con `LPUSH`/`RPUSH` (tipo list). Esto puede causar un **error de tipo** en Redis.

## Configuración del Nodo

### Credential
- **Tipo**: Redis account
- **Conexión**: Servidor Redis configurado en n8n

### Operation
- **Tipo**: `Get`
- **Comando Redis**: `GET key`

### Parameters

#### Name
```
message
```
**Descripción**: Nombre del campo de salida que contendrá el resultado.

#### Key
```javascript
{{ $('Normalize_Inbound').item.json.profile_base.phone_e164 }}
```
**Ejemplo**: `+5491133851987`

**Resultado**: Intenta leer la key `+5491133851987` como un string.

#### Key Type
- **Valor**: `Automatic`
- **Efecto**: n8n detecta automáticamente el tipo de dato

## ⚠️ Problema de Tipo de Datos

### Conflicto: List vs String

```bash
# Nodo anterior (PushBufferEvent) ejecutó:
RPUSH "+5491133851987" '{"message_id":2704,...}'
# Tipo de dato creado: LIST

# Este nodo (Buf_FetchAll) ejecuta:
GET "+5491133851987"
# Tipo de dato esperado: STRING

# Redis responde:
WRONGTYPE Operation against a key holding the wrong kind of value
```

### Solución Correcta

Para leer una lista completa en Redis, se debe usar:

```bash
# Opción 1: Leer todos los elementos (sin eliminar)
LRANGE "+5491133851987" 0 -1

# Opción 2: Leer el primer elemento (sin eliminar)
LINDEX "+5491133851987" 0

# Opción 3: Ver longitud de la lista
LLEN "+5491133851987"
```

## Estructura de Entrada

Recibe el objeto normalizado:

```json
{
  "profile_base": {
    "phone_e164": "+5491133851987",  // ⭐ Usado como key de Redis
    "full_name": "Felix Figueroa",
    "chatwoot_id": 186,
    "conversation_id": 190
  },
  "event": {
    "message_id": 2704,
    "message_text": "Hola que tal",
    "msg_created_iso": "2025-10-31T12:33:39.000Z"
  }
}
```

## Formato de Salida (JSON)

### ✅ Caso 1: Si funcionara correctamente (asumiendo LRANGE)

```json
[
  {
    "message": [
      "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
    ]
  }
]
```

**Observación**: El resultado es un **array de strings JSON** (sin parsear).

### ⚠️ Caso 2: Error de tipo (más probable)

```json
{
  "error": "WRONGTYPE Operation against a key holding the wrong kind of value"
}
```

## Propósito Aparente del Nodo

Basándome en el nombre `Buf_FetchAll`, el objetivo parece ser:

1. **Leer todos los mensajes** en cola del lead
2. **Verificar si hay múltiples mensajes** pendientes de procesar
3. **Tomar decisiones** basadas en la cantidad de mensajes (ej: agrupar respuestas)

### Casos de uso potenciales:

#### Caso A: Lead envía múltiples mensajes rápidos
```javascript
// Lead escribe:
// "Hola"
// "Necesito ayuda"
// "Es urgente"

// Redis tiene 3 mensajes:
[
  '{"message_text":"Hola",...}',
  '{"message_text":"Necesito ayuda",...}',
  '{"message_text":"Es urgente",...}'
]

// El agente podría:
// - Concatenar los 3 mensajes en uno
// - Responder solo al último
// - Esperar X segundos por más mensajes
```

#### Caso B: Verificar si hay backlog
```javascript
// Si hay > 5 mensajes en cola
if (messages.length > 5) {
  // Activar modo "fast response"
  // Usar modelo más rápido (gpt-3.5 en vez de gpt-4)
}
```

## Refactor Sugerido

### Opción 1: Cambiar a operación List

Modificar la configuración del nodo:

```javascript
// En n8n Redis node
Operation: "List" → "Pop and Get" o "Info"
// O usar "Execute Command" con LRANGE

Command: LRANGE
Key: {{ $('Normalize_Inbound').item.json.profile_base.phone_e164 }}
Start: 0
End: -1
```

### Opción 2: Usar Code node con Redis client

```javascript
// Nodo Code con librería redis
const Redis = require('ioredis');
const redis = new Redis({
  host: 'redis',
  port: 6379
});

const phone = $input.item.json.profile_base.phone_e164;
const messages = await redis.lrange(phone, 0, -1);

// Parsear mensajes
const parsed = messages.map(m => JSON.parse(m));

return {
  json: {
    phone,
    message_count: messages.length,
    messages: parsed
  }
};
```

### Opción 3: Usar Redis Execute Command

```javascript
// Operation: Execute Command
Command: LRANGE {{ $('Normalize_Inbound').item.json.profile_base.phone_e164 }} 0 -1
```

## Análisis del Output Actual

El output mostrado indica que **funcionó** de alguna manera:

```json
{
  "message": [
    "{\"message_id\":2704,...}"
  ]
}
```

Esto sugiere que:
1. Tal vez Redis devolvió el resultado como array
2. O n8n hizo una conversión automática
3. O la configuración real difiere de la esperada

### Parsing del mensaje

El mensaje está **serializado como string**, necesita parsearse:

```javascript
// Valor actual
"{\\"message_id\\":2704,...}"

// Después de JSON.parse()
{
  message_id: 2704,
  message_text: "Hola que tal",
  msg_created_iso: "2025-10-31T12:33:39.000Z",
  now_iso_utc: "2025-10-31T12:33:41.372Z",
  now_iso_local: "2025-10-31T09:33:41.372-03:00"
}
```

## Comparación: GET vs LRANGE

| Aspecto | GET (actual) | LRANGE (recomendado) |
|---------|--------------|----------------------|
| **Tipo de dato** | String | List |
| **Comando** | `GET key` | `LRANGE key 0 -1` |
| **Retorno** | String único | Array de strings |
| **Destructivo** | No | No |
| **Compatible con LPUSH** | ❌ No | ✅ Sí |
| **Múltiples mensajes** | ❌ No soporta | ✅ Retorna todos |

## Integración con el Workflow

### Datos que pasan al siguiente nodo

```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
  ]
}
```

**Problema**: Los datos de `profile_base` se pierden. El siguiente nodo solo recibe `message`.

### Solución: Merge de datos

El siguiente nodo debería ser un **Merge** o **Code** que combine:
- `profile_base` (del nodo `Normalize_Inbound`)
- `message` (de este nodo)

```javascript
// Nodo Code después de Buf_FetchAll
const profile = $('Normalize_Inbound').item.json.profile_base;
const messagesRaw = $input.item.json.message;

// Parse de mensajes
const messages = messagesRaw.map(m => JSON.parse(m));

return {
  json: {
    profile_base: profile,
    messages_in_buffer: messages
  }
};
```

## Próximo Nodo Esperado

Basándome en el flujo, el siguiente nodo podría ser:

1. **Code: Parse messages** - Deserializar los JSON strings
2. **Merge** - Combinar `profile_base` con `message`
3. **Switch: Check buffer length** - Decidir si procesar inmediatamente o esperar
4. **PopBufferEvent (Redis LPOP)** - Consumir el primer mensaje de la cola

## Monitoreo y Debugging

### Verificar contenido de la cola

```bash
# Ver tipo de dato
redis-cli TYPE "+5491133851987"
# Debería retornar: list

# Ver todos los mensajes
redis-cli LRANGE "+5491133851987" 0 -1

# Ver cantidad de mensajes
redis-cli LLEN "+5491133851987"

# Ver solo el primer mensaje
redis-cli LINDEX "+5491133851987" 0
```

### Test del comando correcto

```bash
# Desde redis-cli
LRANGE "+5491133851987" 0 -1

# Output esperado
1) "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
```

## Mejoras Sugeridas

### 1. Parsear mensajes automáticamente

```javascript
// Configurar el nodo para que retorne JSON parseado
// En lugar de array de strings
{
  "messages": [
    {
      "message_id": 2704,
      "message_text": "Hola que tal",
      "msg_created_iso": "2025-10-31T12:33:39.000Z"
    }
  ]
}
```

### 2. Incluir metadata de la cola

```javascript
{
  "phone": "+5491133851987",
  "buffer_length": 1,
  "oldest_message_date": "2025-10-31T12:33:39.000Z",
  "newest_message_date": "2025-10-31T12:33:41.372Z",
  "messages": [...]
}
```

### 3. Implementar rate limiting visual

```javascript
// Si hay > 10 mensajes en cola
if (buffer_length > 10) {
  // Alertar al equipo
  // Posible spam o flood
  notify("High message volume for lead: " + phone);
}
```

---

**Documentado el**: 2025-10-31
**Estado**: ⚠️ Funcionando pero con posible incompatibilidad de tipos
**Operación Redis**: GET (debería ser LRANGE)
**Salida**: Array de strings JSON sin parsear
**Mejora crítica**: Cambiar a `LRANGE` para compatibilidad con listas
