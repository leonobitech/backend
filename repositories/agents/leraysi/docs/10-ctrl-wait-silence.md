# Nodo 10: Ctrl_WaitSilence

## Información General

- **Nombre del nodo**: `Ctrl_WaitSilence`
- **Tipo**: Wait
- **Función**: Pausar la ejecución durante la ventana temporal antes de volver a verificar
- **Entrada**: Salida del nodo `Ctrl_WindowDecision` (output "Wait")
- **Resume**: After Time Interval

## Descripción

Este nodo implementa la **pausa temporal** del loop de control de ventana. Cuando `Ctrl_WindowDecision` determina que el mensaje es muy reciente (< 8 segundos), este nodo espera **8 segundos** antes de volver a verificar si llegaron más mensajes.

Es la pieza clave del patrón **Temporal Window** que permite agrupar mensajes consecutivos del mismo lead.

## Configuración del Nodo

### Resume
- **Tipo**: `After Time Interval`
- **Efecto**: Pausar la ejecución del workflow por un tiempo fijo

### Wait Amount
- **Valor**: `8.00`
- **Descripción**: Tiempo de espera en la unidad especificada

### Wait Unit
- **Valor**: `Seconds`
- **Opciones**: Seconds, Minutes, Hours, Days

## Lógica de Funcionamiento

### Comando n8n ejecutado

```
WAIT 8 SECONDS
THEN RESUME WORKFLOW
```

### Flujo de ejecución

```
┌─────────────────────────────┐
│ Ctrl_WindowDecision         │
│ Output: "Wait"              │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Ctrl_WaitSilence            │ ← ESTAMOS AQUÍ
│ WAIT 8 seconds              │
└──────────┬──────────────────┘
           │
           │ (8 segundos después)
           │
           ▼
┌─────────────────────────────┐
│ Loop back to:               │
│ Buf_FetchAll                │
│ (volver a verificar buffer) │
└─────────────────────────────┘
```

## Estructura de Entrada

Recibe el output "Wait" de `Ctrl_WindowDecision`:

```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
  ]
}
```

## Formato de Salida (JSON)

Después de esperar 8 segundos, pasa **exactamente el mismo objeto** sin modificaciones:

```json
[
  {
    "message": [
      "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
    ]
  }
]
```

**⏱️ Diferencia**: La ejecución se retrasó 8 segundos.

## Propósito en el Workflow

### 1. **Implementar la Ventana Temporal**

```
Usuario escribe: "Hola" (t=0s)
↓
Ctrl_WindowDecision: ¿> 8s? No → Output: Wait
↓
Ctrl_WaitSilence: WAIT 8 seconds... ⏳
↓ (t=8s)
Loop back → Buf_FetchAll
↓
Ctrl_WindowDecision: ¿> 8s? Sí → Output: Continue
↓
Procesar mensaje
```

### 2. **Evitar Polling Agresivo**

❌ Sin Wait (polling cada ciclo):
```
t=0s:   Check buffer → Wait? → Check buffer
t=0.1s: Check buffer → Wait? → Check buffer
t=0.2s: Check buffer → Wait? → Check buffer
...
(miles de checks por segundo, sobrecarga de Redis)
```

✅ Con Wait (polling controlado):
```
t=0s:   Check buffer → Wait? → SLEEP 8s
t=8s:   Check buffer → Wait? → SLEEP 8s
t=16s:  Check buffer → Continue → Process
```

### 3. **Sincronizar con la Ventana de Decisión**

El tiempo de wait **debe coincidir** con la ventana de `Ctrl_WindowDecision`:

```javascript
// Ctrl_WindowDecision
$now.minus(8, 'seconds')  // Ventana de 8 segundos

// Ctrl_WaitSilence
Wait: 8.00 seconds        // Mismo valor
```

**Razón**: Si esperamos menos que la ventana, el loop no tiene sentido. Si esperamos más, hay delay innecesario.

## Casos de Uso Detallados

### Caso 1: Usuario escribe 1 mensaje

```
t=0s:   Lead: "Hola" → Buf_FetchAll → Ctrl_WindowDecision → Wait
        ↓
t=8s:   (wait completo) → Buf_FetchAll → Ctrl_WindowDecision → Continue
        ↓
t=8s:   → Procesar mensaje → Responder
```

**Total de loops**: 1 wait + 1 continue = 2 verificaciones

---

### Caso 2: Usuario escribe 3 mensajes rápidos

```
t=0s:   Lead: "Hola" → Wait
        ↓
t=2s:   Lead: "Necesito ayuda" (nuevo webhook)
        → PushBufferEvent → Buf_FetchAll → Wait
        ↓
t=4s:   Lead: "Es urgente" (nuevo webhook)
        → PushBufferEvent → Buf_FetchAll → Wait
        ↓
t=8s:   (wait del primer mensaje completo)
        → Buf_FetchAll → Ctrl_WindowDecision
        → ¿> 8s? No (solo 8s desde "Hola", 6s desde "Es urgente")
        → Wait de nuevo
        ↓
t=12s:  (wait completo)
        → Buf_FetchAll → Ctrl_WindowDecision
        → ¿> 8s? Sí (8s desde "Es urgente")
        → Continue
        ↓
t=12s:  → Procesar 3 mensajes juntos → Responder
```

**Total de loops**: 3 waits + 1 continue = 4 verificaciones

---

### Caso 3: Conversación continua (usuario sigue escribiendo)

```
t=0s:   Lead: "Hola" → Wait
        ↓
t=8s:   → Continue → Procesar
        ↓
t=10s:  Lead: "¿Cuánto cuesta?" → Wait
        ↓
t=18s:  → Continue → Procesar
        ↓
t=25s:  Lead: "Necesito más info" → Wait
        ↓
t=33s:  → Continue → Procesar
```

**Patrón**: Cada mensaje espera 8s antes de procesarse.

## Análisis de Performance

### Tiempo de Respuesta

| Escenario | Tiempo hasta respuesta | Loops |
|-----------|------------------------|-------|
| 1 mensaje | 8 segundos | 2 |
| 3 mensajes (2s entre cada uno) | ~12 segundos | 4 |
| Mensaje durante procesamiento | ~8-16 segundos | Variable |

### Carga en Redis

```
Sin wait (polling continuo):
- Operaciones LRANGE: ~1000/segundo
- Carga en Redis: ALTA

Con wait (8 segundos):
- Operaciones LRANGE: ~0.125/segundo por lead
- Carga en Redis: BAJA
```

### Escalabilidad

```
Escenario: 100 leads activos simultáneamente

Sin wait:
- 100 leads × 1000 checks/s = 100,000 ops/s
- Redis colapsa

Con wait (8s):
- 100 leads × 0.125 checks/s = 12.5 ops/s
- Redis maneja sin problema
```

## Integración con el Loop

### Conexión del Loop

```
┌───────────────────┐
│  Buf_FetchAll     │ ←──────────────┐
└────────┬──────────┘                │
         │                           │
         ▼                           │
┌───────────────────┐                │
│ Ctrl_WindowDeci   │                │
└─┬──────┬──────┬───┘                │
  │      │      │                    │
Nothing  │    Wait                   │
  │   Continue  │                    │
  │      │      │                    │
  ▼      ▼      ▼                    │
[Stop] [Procesar] Ctrl_WaitSilence   │
                   │                 │
                   └─────────────────┘
                   (Loop back después de 8s)
```

### Condición de Salida del Loop

El loop se rompe cuando:
1. **Continue**: Se sale del loop y procesa
2. **Nothing**: Se detiene el workflow
3. **Error**: Timeout o falla de Redis

## Configuración Recomendada

### Ajuste de Tiempo de Wait

| Tiempo | Uso recomendado | Trade-off |
|--------|-----------------|-----------|
| **3 segundos** | Soporte urgente, chatbots rápidos | Menos agrupación, más respuestas |
| **5 segundos** | Balance general | Buen equilibrio |
| **8 segundos** | Agente de ventas (actual) | Mejor agrupación, respuesta más lenta |
| **10 segundos** | Consultas complejas | Máxima agrupación, puede parecer lento |

### Sincronización con Ctrl_WindowDecision

⚠️ **Crítico**: Ambos valores deben coincidir

```javascript
// Ctrl_WindowDecision
$now.minus(X, 'seconds')

// Ctrl_WaitSilence
Wait: X seconds
```

**Si no coinciden**:
- `wait > ventana`: Delay innecesario
- `wait < ventana`: Loop infinito (nunca cumple la condición)

## Monitoreo y Debugging

### Métricas a observar

1. **Promedio de loops por mensaje**:
   - Óptimo: 1-2 loops
   - Aceptable: 2-4 loops
   - Problema: > 5 loops (ventana muy corta o usuario escribiendo constantemente)

2. **Tiempo total en wait**:
   ```
   total_wait_time = wait_duration × number_of_loops
   ```

3. **Distribución de salidas**:
   - % Continue (procesados)
   - % Wait (en espera)
   - % Nothing (descartados)

### Logging sugerido

```javascript
// Antes del wait
console.log({
  action: "entering_wait",
  phone: $('Normalize_Inbound').item.json.profile_base.phone_e164,
  wait_duration: 8,
  timestamp: new Date().toISOString()
});

// Después del wait
console.log({
  action: "wait_completed",
  phone: $('Normalize_Inbound').item.json.profile_base.phone_e164,
  timestamp: new Date().toISOString()
});
```

## Limitaciones y Consideraciones

### 1. **Ejecuciones Activas de n8n**

⚠️ **Problema**: Cada ejecución en wait consume recursos de n8n.

```
100 leads en wait simultáneamente = 100 ejecuciones activas
```

**Solución**: n8n tiene límites de ejecuciones concurrentes.

### 2. **Timeout de Workflow**

Si el workflow tiene un timeout global:
```
Timeout: 30 segundos
Loops: 4 × 8s = 32 segundos
Resultado: ❌ Timeout, workflow cancelado
```

**Solución**: Configurar timeout > (max_loops × wait_duration)

### 3. **Mensajes durante el Wait**

```
t=0s:  Lead: "Hola" → Wait (8s)
t=4s:  Lead: "Ayuda" → Nuevo webhook → Nuevo workflow
       (ahora hay 2 workflows activos para el mismo lead)
```

**Posible race condition**: Ambos workflows pueden procesar simultáneamente.

**Solución**: Implementar lock en Redis (ver mejoras).

## Mejoras Sugeridas

### 1. **Wait dinámico basado en actividad**

```javascript
// En lugar de wait fijo
const recentMessages = $json.message.filter(m => {
  const age = Date.now() - new Date(JSON.parse(m).msg_created_iso);
  return age < 30000; // Mensajes de últimos 30s
});

const waitTime = recentMessages.length > 3 ? 10 : 5;
// Si hay mucha actividad, esperar más
```

### 2. **Lock de procesamiento en Redis**

```javascript
// Antes del wait, establecer un lock
const lockKey = `processing:${phone}`;
await redis.set(lockKey, 'true', 'EX', 60); // Lock por 60s

// Otros workflows verifican el lock antes de procesar
if (await redis.get(lockKey)) {
  // Otro workflow está procesando, salir
  return;
}
```

### 3. **Cancelar wait si llega mensaje nuevo**

```javascript
// Usar n8n Wait with webhook resume
// Si llega un nuevo webhook del mismo lead, cancelar el wait actual
// y procesar inmediatamente
```

### 4. **Progressive backoff**

```javascript
// Esperar progresivamente más si el usuario sigue escribiendo
loop_count = 0
while (should_wait) {
  wait_time = 5 + (loop_count × 2); // 5s, 7s, 9s, 11s...
  wait(wait_time);
  loop_count++;
}
```

## Próximo Nodo Esperado

Después del wait, el workflow hace **loop back** a:

```
Ctrl_WaitSilence → [Loop back] → Buf_FetchAll
```

Eventualmente, cuando `Ctrl_WindowDecision` retorna "Continue", el flujo va al siguiente nodo que probablemente sea:

1. **Merge Profile + Messages** - Combinar datos
2. **Pop from Buffer** - Consumir mensajes de Redis
3. **Consulta a Baserow** - Verificar si el lead existe

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Tiempo de espera**: 8 segundos
**Propósito**: Implementar temporal window para agrupación de mensajes
**Loop target**: Buf_FetchAll (verificar buffer de nuevo)
**Mejora crítica**: Implementar lock de procesamiento para evitar race conditions
