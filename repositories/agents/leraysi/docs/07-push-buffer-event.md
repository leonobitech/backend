# Nodo 7: PushBufferEvent

## Información General

- **Nombre del nodo**: `PushBufferEvent`
- **Tipo**: Redis (List operation)
- **Función**: Almacenar el evento normalizado en una cola Redis (LPUSH)
- **Entrada**: Salida del nodo `Normalize_Inbound`
- **Credential**: Redis account

## Descripción

Este nodo implementa un **buffer de mensajes** usando una lista de Redis. Cada mensaje normalizado se añade a una cola identificada por el **número de teléfono del lead**. Esto permite:

1. **Serialización de mensajes**: Procesar mensajes en orden de llegada
2. **Prevención de race conditions**: Evitar procesamiento simultáneo del mismo lead
3. **Buffer temporal**: Cola de mensajes pendientes si el procesamiento es más lento que la llegada
4. **Trazabilidad**: Registro persistente de eventos en Redis

## Configuración del Nodo

### Credential
- **Tipo**: Redis account
- **Conexión**: Servidor Redis configurado en n8n

### Operation
- **Tipo**: `Push` (LPUSH)
- **Comando Redis**: `LPUSH key value`

### Parameters

#### List (Key)
```javascript
{{ $('Normalize_Inbound').item.json.profile_base.phone_e164 }}
```
**Ejemplo**: `+5491133851987`

**Resultado**: Crea/usa una lista en Redis con el teléfono como clave.

#### Data (Value)
```javascript
{{ JSON.stringify($('Normalize_Inbound').item.json.event) }}
```

**Contenido serializado**:
```json
{
  "message_id": 2704,
  "message_text": "Hola que tal",
  "msg_created_iso": "2025-10-31T12:33:39.000Z",
  "now_iso_utc": "2025-10-31T12:33:41.372Z",
  "now_iso_local": "2025-10-31T09:33:41.372-03:00"
}
```

#### Tail
- **Valor**: ✅ Enabled
- **Efecto**: Inserta al **final** de la lista (RPUSH en vez de LPUSH)
- **Orden**: FIFO (First In, First Out)

## Lógica de Funcionamiento

### Comando Redis Ejecutado

```bash
LPUSH "+5491133851987" '{"message_id":2704,"message_text":"Hola que tal",...}'
```

### Estructura en Redis

```
Key: "+5491133851987"
Type: list
Value: [
  '{"message_id":2704,"message_text":"Hola que tal",...}',  ← Mensaje actual
  '{"message_id":2703,"message_text":"Mensaje anterior",...}',
  '{"message_id":2702,"message_text":"Otro mensaje",...}'
]
```

### Con `Tail = true`

Cuando `Tail` está habilitado, Redis usa **RPUSH** (push al final):

```bash
RPUSH "+5491133851987" '{"message_id":2704,...}'
```

**Ventaja**: Los mensajes se procesan en orden de llegada (FIFO).

## Estructura de Entrada

Recibe el objeto normalizado del nodo anterior:

```json
{
  "profile_base": {
    "phone_e164": "+5491133851987",  // ⭐ Usado como key de Redis
    "full_name": "Felix Figueroa",
    "country": "Argentina",
    "chatwoot_id": 186,
    "conversation_id": 190
  },
  "event": {  // ⭐ Almacenado en Redis (serializado)
    "message_id": 2704,
    "message_text": "Hola que tal",
    "msg_created_iso": "2025-10-31T12:33:39.000Z",
    "now_iso_utc": "2025-10-31T12:33:41.372Z",
    "now_iso_local": "2025-10-31T09:33:41.372-03:00"
  }
}
```

## Formato de Salida (JSON)

El nodo **NO modifica** los datos, solo los almacena en Redis y pasa el objeto completo:

```json
[
  {
    "profile_base": {
      "full_name": "Felix Figueroa",
      "phone_e164": "+5491133851987",
      "email": null,
      "country": "Argentina",
      "tz": "-03:00",
      "channel": "whatsapp",
      "chatwoot_id": 186,
      "chatwoot_inbox_id": 186,
      "conversation_id": 190
    },
    "event": {
      "message_id": 2704,
      "message_text": "Hola que tal",
      "msg_created_iso": "2025-10-31T12:33:39.000Z",
      "now_iso_utc": "2025-10-31T12:33:41.372Z",
      "now_iso_local": "2025-10-31T09:33:41.372-03:00"
    }
  }
]
```

## Casos de Uso

### Caso 1: Primer mensaje del lead
```bash
# Redis antes
(key no existe)

# Comando ejecutado
RPUSH "+5491133851987" '{"message_id":2704,...}'

# Redis después
"+5491133851987": ['{"message_id":2704,...}']
# Longitud de lista: 1
```

### Caso 2: Múltiples mensajes rápidos del mismo lead
```bash
# Lead envía 3 mensajes en 2 segundos:
# t=0s: "Hola"
# t=1s: "Necesito ayuda"
# t=2s: "Es urgente"

# Redis después
"+5491133851987": [
  '{"message_id":2704,"message_text":"Hola",...}',
  '{"message_id":2705,"message_text":"Necesito ayuda",...}',
  '{"message_id":2706,"message_text":"Es urgente",...}'
]
# Longitud: 3
```

**Ventaja**: Los mensajes quedan en cola esperando procesamiento secuencial.

### Caso 3: Leads diferentes en paralelo
```bash
# Lead A (+5491133851987)
RPUSH "+5491133851987" '{"message_id":2704,...}'

# Lead B (+5493416789012)
RPUSH "+5493416789012" '{"message_id":2705,...}'

# Redis tiene 2 listas independientes
"+5491133851987": [...]  # Cola de Lead A
"+5493416789012": [...]  # Cola de Lead B
```

**Ventaja**: Cada lead tiene su propia cola, no hay conflicto entre leads.

## Propósito en el Workflow

### 1. **Prevención de Race Conditions**
Si el mismo lead envía 2 mensajes mientras el agente está procesando el primero:
- ✅ Con buffer: El 2do mensaje espera en cola
- ❌ Sin buffer: Ambos mensajes se procesan simultáneamente, causando duplicados en Baserow/Odoo

### 2. **Control de Flujo**
Si el procesamiento LLM es lento (5-10 segundos) pero llegan 3 mensajes en 3 segundos:
- ✅ Con buffer: Los mensajes se procesan uno a uno
- ❌ Sin buffer: 3 ejecuciones paralelas del workflow, alto costo de API

### 3. **Resiliencia**
Si el workflow falla en una etapa posterior:
- ✅ Con buffer: El mensaje permanece en Redis, se puede reintentar
- ❌ Sin buffer: El mensaje se pierde si el workflow crashea

### 4. **Auditoría**
Redis guarda un registro temporal de todos los mensajes recibidos:
```bash
# Ver mensajes en cola
LRANGE "+5491133851987" 0 -1

# Ver longitud de cola
LLEN "+5491133851987"
```

## Patrón de Arquitectura

Este nodo implementa el patrón **Producer-Consumer** con Redis como broker:

```
┌──────────────┐
│  Producer    │ ← Este nodo (PushBufferEvent)
│  (n8n)       │
└──────┬───────┘
       │
       │ RPUSH
       ▼
┌──────────────┐
│    Redis     │
│   (Buffer)   │
└──────┬───────┘
       │
       │ LPOP (siguiente nodo)
       ▼
┌──────────────┐
│  Consumer    │ ← Nodo que procesa la cola
│  (n8n)       │
└──────────────┘
```

## Gestión del TTL (Time To Live)

⚠️ **Nota importante**: Este nodo **no configura TTL** para las claves de Redis.

### Riesgos potenciales:
- **Memoria infinita**: Si los mensajes no se consumen, Redis crece indefinidamente
- **Claves huérfanas**: Si un lead nunca vuelve a escribir, su cola queda en Redis

### Soluciones recomendadas:

#### Opción 1: TTL automático en otro nodo
```bash
# Después de procesar todos los mensajes
EXPIRE "+5491133851987" 3600  # 1 hora
```

#### Opción 2: Limpieza periódica
```javascript
// Workflow separado que corre cada hora
// Elimina colas vacías o con mensajes antiguos
const keys = await redis.keys('+*');
for (const key of keys) {
  const len = await redis.llen(key);
  if (len === 0) {
    await redis.del(key);
  }
}
```

#### Opción 3: Configurar maxmemory-policy en Redis
```bash
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru  # Elimina claves menos usadas
```

## Monitoreo y Debugging

### Comandos útiles de Redis

```bash
# Ver todas las colas activas
redis-cli KEYS "+*"

# Ver longitud de cola de un lead
redis-cli LLEN "+5491133851987"

# Ver todos los mensajes sin eliminar
redis-cli LRANGE "+5491133851987" 0 -1

# Ver solo el primer mensaje (siguiente a procesar)
redis-cli LINDEX "+5491133851987" 0

# Eliminar cola de un lead
redis-cli DEL "+5491133851987"

# Estadísticas de memoria
redis-cli INFO memory
```

### Métricas a monitorear

1. **Longitud promedio de colas**: `LLEN` debería ser < 5 normalmente
2. **Cantidad de colas activas**: `KEYS +* | wc -l`
3. **Memoria usada**: `INFO memory`
4. **Tasa de crecimiento**: Comparar `used_memory` en el tiempo

## Integración con el Workflow

### Datos que pasan al siguiente nodo

El objeto completo `{ profile_base, event }` se pasa sin modificar.

### Próximo nodo esperado

Basándome en el patrón Producer-Consumer, el siguiente nodo debería:

1. **PopBufferEvent (Redis LPOP)**: Leer y eliminar el primer mensaje de la cola
2. O **Wait/Delay**: Esperar a que termine el procesamiento anterior
3. O **Switch**: Verificar si hay lock de procesamiento activo

## Comparación: Con vs Sin Buffer

### ❌ Sin Buffer (Procesamiento Directo)
```
Mensaje 1 → LLM (10s) ─┐
Mensaje 2 → LLM (10s) ─┼→ 3 llamadas paralelas a OpenAI
Mensaje 3 → LLM (10s) ─┘   Alto costo, posibles duplicados
```

### ✅ Con Buffer (Procesamiento Secuencial)
```
Mensaje 1 → Queue → LLM (10s) → Respuesta
Mensaje 2 → Queue → Wait      → LLM (10s) → Respuesta
Mensaje 3 → Queue → Wait      → Wait      → LLM (10s) → Respuesta
```

## Mejoras Sugeridas

### 1. Incluir `profile_base` en el buffer
Actualmente solo se guarda `event`. Considerar guardar todo:

```javascript
// Data actual
{{ JSON.stringify($('Normalize_Inbound').item.json.event) }}

// Data mejorada
{{ JSON.stringify($('Normalize_Inbound').item.json) }}
// Incluye profile_base + event
```

**Ventaja**: Si Redis es la única fuente de verdad del estado, tener toda la info.

### 2. Añadir metadata al mensaje
```javascript
{
  ...event,
  queued_at: new Date().toISOString(),
  workflow_execution_id: $execution.id,
  retry_count: 0
}
```

### 3. Usar Redis Streams en lugar de Lists
```javascript
// En lugar de LPUSH/RPUSH
XADD stream_messages * phone +5491133851987 event '{...}'

// Ventajas:
// - Consumer groups para procesamiento distribuido
// - ACK de mensajes procesados
// - Reintentos automáticos
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación Redis**: RPUSH (con Tail=true)
**Salida**: Objeto sin modificar (side effect: mensaje en Redis)
**Key pattern**: `+{phone_e164}` (ej: `+5491133851987`)
