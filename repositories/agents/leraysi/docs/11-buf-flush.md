# Nodo 11: Buf_Flush

## Información General

- **Nombre del nodo**: `Buf_Flush`
- **Tipo**: Redis (Delete operation)
- **Función**: Limpiar el buffer de mensajes después de procesar
- **Entrada**: Salida del nodo `Ctrl_WindowDecision` (output "Continue")
- **Credential**: Redis account

## Descripción

Este nodo implementa la **limpieza del buffer** eliminando la lista de mensajes en Redis una vez que se decidió procesar. Es el paso final del patrón Producer-Consumer antes de pasar los mensajes al procesamiento real (Baserow/Odoo/LLM).

Actúa como "flush" (vaciar) la cola de mensajes del lead específico.

## Configuración del Nodo

### Credential
- **Tipo**: Redis account
- **Conexión**: Servidor Redis configurado en n8n

### Operation
- **Tipo**: `Delete`
- **Comando Redis**: `DEL key`

### Parameters

#### Key
```javascript
{{ $('Normalize_Inbound').item.json.profile_base.phone_e164 }}
```
**Ejemplo**: `+5491133851987`

**Resultado**: Elimina completamente la key (lista) de Redis.

## Lógica de Funcionamiento

### Comando Redis Ejecutado

```bash
DEL "+5491133851987"
```

### Efecto en Redis

```bash
# Antes del flush
redis-cli LRANGE "+5491133851987" 0 -1
1) "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
2) "{\"message_id\":2705,\"message_text\":\"Necesito ayuda\",...}"
3) "{\"message_id\":2706,\"message_text\":\"Es urgente\",...}"

# Después del flush
redis-cli DEL "+5491133851987"
(integer) 1  # Número de keys eliminadas

# Verificación
redis-cli EXISTS "+5491133851987"
(integer) 0  # La key ya no existe
```

## Estructura de Entrada

Recibe el output "Continue" de `Ctrl_WindowDecision`:

```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
  ]
}
```

**⚠️ Nota**: El nodo necesita acceso a `Normalize_Inbound` para obtener el `phone_e164`, ya que `message` no lo contiene.

## Formato de Salida (JSON)

El nodo pasa el objeto sin modificar:

```json
[
  {
    "message": [
      "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
    ]
  }
]
```

**Side effect**: La key `+5491133851987` fue eliminada de Redis.

## Propósito en el Workflow

### 1. **Liberar Memoria de Redis**

```bash
# Sin flush (acumulación infinita)
redis-cli KEYS "+*"
1) "+5491133851987"
2) "+5493416789012"
3) "+5491145678901"
... (miles de keys, memoria creciendo)

# Con flush (limpieza automática)
# Solo existen keys de leads activos escribiendo en este momento
redis-cli KEYS "+*"
(empty array)  # O muy pocas keys
```

### 2. **Preparar para Próximos Mensajes**

```bash
# Si el mismo lead vuelve a escribir después
# Se crea una nueva lista limpia
t=0s:   Lead: "Hola" → RPUSH → [msg_2704]
t=8s:   → Flush → DEL → []
t=30s:  Lead: "Otra pregunta" → RPUSH → [msg_2800] (lista nueva)
```

### 3. **Evitar Procesamiento Duplicado**

Sin flush:
```bash
# Mensaje procesado
[msg_2704, msg_2705, msg_2706] → Procesar

# Nuevo mensaje del mismo lead (5 minutos después)
[msg_2704, msg_2705, msg_2706, msg_2999] → Procesar DE NUEVO los anteriores ❌
```

Con flush:
```bash
# Mensaje procesado
[msg_2704, msg_2705, msg_2706] → Procesar → DEL

# Nuevo mensaje (5 minutos después)
[msg_2999] → Procesar solo el nuevo ✅
```

## Diagrama de Flujo Completo del Buffer

```
┌──────────────────┐
│ PushBufferEvent  │ → RPUSH "+549..." '{"message_id":2704,...}'
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Buf_FetchAll     │ → LRANGE "+549..." 0 -1
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Ctrl_WindowDeci  │
└─┬──────┬─────┬───┘
  │      │     │
Wait  Continue │
  │      │   Nothing
  │      ▼
  │  ┌──────────────────┐
  │  │ Buf_Flush        │ → DEL "+549..." ← ESTAMOS AQUÍ
  │  └────────┬─────────┘
  │           │
  │           ▼
  │      [Procesar mensajes]
  │
  ▼
┌──────────────────┐
│ Ctrl_WaitSilence │ → WAIT 8s → Loop back
└──────────────────┘
```

## Casos de Uso Detallados

### Caso 1: Un solo mensaje

```
t=0s:   Lead: "Hola"
        → PushBufferEvent: RPUSH "+549..." '{"message_id":2704,...}'
        Redis: [msg_2704]

t=8s:   Ctrl_WindowDecision: Continue
        → Buf_Flush: DEL "+549..."
        Redis: (key eliminada)

        → Procesar: "Hola"
```

**Estado final de Redis**: Key no existe

---

### Caso 2: Múltiples mensajes agrupados

```
t=0s:   Lead: "Hola"
        → RPUSH: [msg_2704]

t=2s:   Lead: "Necesito ayuda"
        → RPUSH: [msg_2704, msg_2705]

t=4s:   Lead: "Es urgente"
        → RPUSH: [msg_2704, msg_2705, msg_2706]

t=12s:  Ctrl_WindowDecision: Continue
        → Buf_Flush: DEL "+549..."
        Redis: (key eliminada con 3 mensajes)

        → Procesar: ["Hola", "Necesito ayuda", "Es urgente"]
```

**Estado final de Redis**: Key no existe

---

### Caso 3: Lead vuelve a escribir después

```
t=0s:   Lead: "Hola" → Procesado → Flush
        Redis: []

t=60s:  Lead: "Otra pregunta"
        → RPUSH: [msg_2800] (nueva lista)

t=68s:  → Procesado → Flush
        Redis: []
```

**Ventaja**: Cada sesión de mensajes es independiente.

## Comparación: Flush vs No Flush

### ❌ Sin Flush (acumulación)

```bash
# Día 1
Lead: "Hola" → [msg_1]
Lead: "Adiós" → [msg_1, msg_2]

# Día 2 (mismo lead)
Lead: "Otra pregunta" → [msg_1, msg_2, msg_3]
# ❌ Procesa mensajes de hace 1 día
```

**Problemas**:
- Contexto obsoleto
- Memoria desperdiciada
- Procesamiento más lento (más mensajes = más datos a parsear)

---

### ✅ Con Flush (limpieza automática)

```bash
# Día 1
Lead: "Hola" → [msg_1] → Procesar → DEL

# Día 2 (mismo lead)
Lead: "Otra pregunta" → [msg_3] → Procesar → DEL
# ✅ Solo procesa el mensaje actual
```

**Ventajas**:
- Contexto fresco
- Memoria eficiente
- Procesamiento rápido

## Alternativas al DELETE

### Opción 1: LPOP/RPOP (consumir mensajes uno a uno)

```bash
# En lugar de DEL (eliminar toda la lista)
LPOP "+5491133851987"  # Elimina y retorna el primer mensaje
LPOP "+5491133851987"  # Elimina el segundo
...
```

**Ventaja**: Más granular, permite procesar mensajes de forma incremental.

**Desventaja**: Requiere múltiples operaciones.

---

### Opción 2: EXPIRE (TTL automático)

```bash
# En lugar de eliminar manualmente
EXPIRE "+5491133851987" 3600  # Auto-elimina en 1 hora
```

**Ventaja**: Limpieza automática sin intervención.

**Desventaja**: Si el lead vuelve a escribir antes de 1 hora, los mensajes viejos siguen ahí.

---

### Opción 3: RENAME (archivar en lugar de eliminar)

```bash
# Mover a una key de "procesados"
RENAME "+5491133851987" "processed:+5491133851987"
EXPIRE "processed:+5491133851987" 86400  # 24 horas
```

**Ventaja**: Auditoría, posibilidad de reintentar.

**Desventaja**: Más complejidad, más memoria.

## Riesgos Potenciales

### 1. **Race Condition con mensajes nuevos**

```
t=0s:   Lead: "Hola" → RPUSH → [msg_2704]
t=8s:   Ctrl_WindowDecision: Continue
t=8.1s: Lead: "Otra pregunta" → RPUSH → [msg_2704, msg_2800]
t=8.2s: Buf_Flush: DEL
        ❌ El msg_2800 se elimina antes de procesarse
```

**Solución**: Implementar lock de procesamiento (Redis SETNX).

---

### 2. **Flush antes de procesar (orden incorrecto)**

Si el flush ocurre ANTES de leer los mensajes:
```
Buf_FetchAll → Buf_Flush → Process
                    ↑
                    ❌ Los mensajes se eliminan antes de leerlos
```

**Solución actual**: El flush está DESPUÉS de `Buf_FetchAll`, es correcto.

---

### 3. **Fallo en procesamiento posterior**

```
Buf_Flush: DEL → Success
Procesar: LLM call → ❌ Error (timeout, API down)

Resultado: Los mensajes se perdieron sin procesarse
```

**Solución**: Mover el flush al FINAL del workflow (después de guardar en Odoo).

## Monitoreo y Debugging

### Verificar limpieza

```bash
# Antes del flush
redis-cli EXISTS "+5491133851987"
(integer) 1  # Existe

# Después del flush
redis-cli EXISTS "+5491133851987"
(integer) 0  # No existe
```

### Auditar mensajes eliminados

```bash
# Antes del flush, hacer backup (opcional)
redis-cli LRANGE "+5491133851987" 0 -1 > backup_messages.json

# Luego hacer flush
redis-cli DEL "+5491133851987"
```

### Estadísticas de memoria

```bash
# Ver memoria usada antes y después del flush
redis-cli INFO memory | grep used_memory_human
```

## Mejoras Sugeridas

### 1. **Flush condicional**

```javascript
// Solo flush si el procesamiento fue exitoso
if (llm_response_success) {
  redis.del(phone_key);
} else {
  // Mantener mensajes para retry
  redis.expire(phone_key, 300); // 5 minutos de retry window
}
```

### 2. **Flush parcial (LTRIM)**

```bash
# En lugar de DEL, mantener solo los últimos N mensajes
LTRIM "+5491133851987" -5 -1  # Mantiene últimos 5, elimina el resto
```

**Uso**: Para mantener contexto reciente sin acumular todo.

---

### 3. **Archivar antes de flush**

```javascript
// Guardar en una key de histórico
const messages = await redis.lrange(phone, 0, -1);
await redis.set(`history:${phone}:${Date.now()}`, JSON.stringify(messages), 'EX', 86400);
await redis.del(phone);
```

**Ventaja**: Auditoría completa, debugging más fácil.

---

### 4. **Usar transacciones (MULTI/EXEC)**

```bash
# Operación atómica
MULTI
LRANGE "+5491133851987" 0 -1
DEL "+5491133851987"
EXEC
```

**Ventaja**: Garantiza que la lectura y eliminación son atómicas.

## Próximo Nodo Esperado

Después del flush, los mensajes están listos para procesamiento. El siguiente nodo probablemente sea:

1. **Merge/Code**: Combinar `profile_base` con `messages` parseados
2. **Baserow: Search**: Buscar si el lead existe
3. **Odoo: Search**: Buscar oportunidad existente
4. O directamente **LLM Analista**: Si ya se tiene todo el contexto

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación Redis**: DELETE (elimina la key completamente)
**Propósito**: Liberar memoria y preparar para próximos mensajes
**Timing**: Después de decidir procesar (Continue), antes de procesar
**Mejora crítica**: Mover el flush al FINAL del workflow (después de guardar en DB) para evitar pérdida de datos en caso de error
