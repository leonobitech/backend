# Nodo 9: Ctrl_WindowDecision

## Información General

- **Nombre del nodo**: `Ctrl_WindowDecision`
- **Tipo**: Switch (Rules-based routing)
- **Función**: Decidir si procesar el mensaje inmediatamente o esperar más mensajes
- **Entrada**: Salida del nodo `Buf_FetchAll`
- **Mode**: Rules

## Descripción

Este nodo implementa una **ventana de control temporal** (temporal window) para agrupar mensajes consecutivos del mismo lead. Analiza el timestamp del último mensaje y decide:

1. **Nothing** → Mensaje recién llegado, esperar posibles mensajes adicionales (no procesar aún)
2. **Continue** → Han pasado suficientes segundos, procesar ahora
3. **Wait** (Fallback) → Caso por defecto si ninguna regla coincide

Este patrón mejora la experiencia del usuario al evitar respuestas fragmentadas cuando el lead escribe múltiples mensajes seguidos.

## Configuración del Nodo

### Mode
- **Tipo**: `Rules`
- **Convert types where required**: ✅ Enabled

### Routing Rules

#### Regla 1: Mensaje Nuevo (No procesar)
```javascript
// Condición
{{ JSON.parse($json.message[last(0)]).message_id }}
is not equal to
{{ $('Normalize_Inbound').item.json.event.message_id }}

// Output Name
Nothing
```

**Lógica**:
- Compara el `message_id` del último mensaje en buffer (Redis)
- Con el `message_id` del evento actual (recién llegado)
- Si son **diferentes** → El mensaje actual NO es el último en buffer
- **Resultado**: No hacer nada, el mensaje ya fue procesado o está en cola

**Casos de uso**:
```javascript
// Mensaje en buffer: 2703
// Mensaje actual:   2704 (nuevo)
// Resultado: ❌ No son iguales → Output: "Nothing"
```

#### Regla 2: Ventana de Espera Cumplida (Procesar)
```javascript
// Condición
{{ JSON.parse($json.message[last(0)]).now_iso_local }}
is before
{{ $now.minus(8, 'seconds').toISO() }}

// Output Name
Continue
```

**Lógica**:
- Extrae el timestamp local del último mensaje (`now_iso_local`)
- Lo compara con el timestamp actual menos 8 segundos
- Si el mensaje tiene **más de 8 segundos de antigüedad** → Procesar
- **Resultado**: Continuar con el workflow (el lead dejó de escribir)

**Casos de uso**:
```javascript
// Timestamp del mensaje: 2025-10-31T09:33:41.372-03:00
// Timestamp actual:       2025-10-31T09:33:50.000-03:00 (9 segundos después)
// Condición: 09:33:41 < 09:33:42 (now - 8s)
// Resultado: ✅ Es antes → Output: "Continue"
```

### Fallback Output
- **Tipo**: `Extra Output`
- **Rename Fallback Output**: ✅ Enabled
- **Output Name**: `Wait`

**Cuándo se activa**: Si ninguna de las 2 reglas anteriores se cumple.

## Análisis de las Reglas

### Tabla de Decisión

| Condición | Regla | Output | Acción |
|-----------|-------|--------|--------|
| `message_id` del buffer ≠ `message_id` actual | Regla 1 | **Nothing** | No procesar (mensaje duplicado o ya procesado) |
| Último mensaje tiene > 8 segundos | Regla 2 | **Continue** | Procesar ahora (ventana cerrada) |
| Último mensaje tiene ≤ 8 segundos | Fallback | **Wait** | Esperar más mensajes (ventana abierta) |

### Flujo de Ejecución

```
┌─────────────────────────────────────────┐
│ Lead envía mensaje "Hola"               │
│ message_id: 2704                        │
│ now_iso_local: 09:33:41                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ Ctrl_WindowDecision                     │
│                                         │
│ ¿message_id en buffer ≠ 2704?          │
└─────────┬───────────────┬───────────────┘
          │               │
         NO              SI
          │               │
          ▼               ▼
    ┌─────────┐     ┌─────────┐
    │Continue?│     │ Nothing │
    └────┬────┘     └─────────┘
         │              (No procesar)
         │
    ┌────┴────┐
    │         │
    │ ¿Tiene  │
    │ > 8s?   │
    │         │
    └────┬────┘
         │
    ┌────┴────┐
   SI        NO
    │         │
    ▼         ▼
┌─────────┐ ┌──────┐
│Continue │ │ Wait │
└─────────┘ └──────┘
 (Procesar)  (Esperar más mensajes)
```

## Estructura de Entrada

Recibe el output de `Buf_FetchAll`:

```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",\"msg_created_iso\":\"2025-10-31T12:33:39.000Z\",\"now_iso_utc\":\"2025-10-31T12:33:41.372Z\",\"now_iso_local\":\"2025-10-31T09:33:41.372-03:00\"}"
  ]
}
```

**Acceso a datos**:
```javascript
// Último mensaje en el array
$json.message[last(0)]  // ← Función n8n para acceder al último elemento

// Parsear JSON
JSON.parse($json.message[last(0)])

// Extraer campos
.message_id
.now_iso_local
```

## Formato de Salida (JSON)

### Output 1: Nothing (No procesar)

```json
[]
```
**Descripción**: Output vacío, el workflow se detiene para este mensaje.

---

### Output 2: Continue (Procesar)

```json
[
  {
    "message": [
      "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
    ]
  }
]
```
**Descripción**: Pasa el objeto completo al siguiente nodo para procesamiento.

---

### Output 3: Wait (Esperar)

```json
[
  {
    "message": [
      "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
    ]
  }
]
```
**Descripción**: Pasa el objeto, pero el siguiente nodo probablemente sea un **Wait** o **Loop Back**.

## Casos de Uso Detallados

### Caso 1: Usuario escribe 3 mensajes rápidos

```
t=0s:  "Hola"                    → Buffer: [msg_2704] → Output: Wait (0s < 8s)
t=2s:  "Necesito ayuda"          → Buffer: [msg_2704, msg_2705] → Output: Wait (2s < 8s)
t=4s:  "Es urgente"              → Buffer: [msg_2704, msg_2705, msg_2706] → Output: Wait (4s < 8s)
t=12s: (nada)                    → Buffer: [msg_2704, msg_2705, msg_2706] → Output: Continue (12s > 8s)
```

**Resultado**: El agente responde una sola vez con contexto de los 3 mensajes.

---

### Caso 2: Usuario escribe mensaje único

```
t=0s:  "Hola que tal"            → Buffer: [msg_2704] → Output: Wait (0s < 8s)
t=9s:  (nada)                    → Buffer: [msg_2704] → Output: Continue (9s > 8s)
```

**Resultado**: El agente espera 8 segundos antes de responder (por si llegan más mensajes).

---

### Caso 3: Conversación continua

```
t=0s:  "Hola"                    → Output: Wait
t=10s: (procesado)               → Output: Continue → Agente responde
t=20s: "Cuánto cuesta?"          → Output: Wait
t=30s: (procesado)               → Output: Continue → Agente responde
```

**Resultado**: Cada mensaje se procesa independientemente con delay de 8s.

---

### Caso 4: Mensaje duplicado (Regla 1)

```
// Situación: El mismo webhook llega 2 veces (retry de Chatwoot)
Webhook 1: message_id = 2704 → Buffer: [2704] → Procesando...
Webhook 2: message_id = 2704 → Buffer: [2704] → Regla 1: 2704 ≠ 2704? NO → Output: Continue
```

⚠️ **Problema potencial**: La Regla 1 no parece prevenir duplicados correctamente.

**Regla actual**:
```javascript
// ❌ Esto siempre será false si es el mismo mensaje
last_message_id !== current_message_id
```

**Regla esperada para deduplicación**:
```javascript
// ✅ Verificar si el message_id ya existe en el buffer
$json.message.some(m => JSON.parse(m).message_id === current_message_id)
```

## Propósito en el Workflow

### 1. **Agrupación de mensajes**
Evita respuestas fragmentadas cuando el lead escribe en ráfagas:
```
❌ Sin ventana:
Lead: "Hola"
Bot:  "¡Hola! ¿En qué puedo ayudarte?"
Lead: "Necesito cotización"
Bot:  "Claro, ¿qué servicio necesitas?"
Lead: "Para mi empresa"
Bot:  "Perfecto, ¿me das más detalles?"

✅ Con ventana (8s):
Lead: "Hola"
Lead: "Necesito cotización"
Lead: "Para mi empresa"
(espera 8s)
Bot:  "¡Hola! Claro, con gusto te ayudo con la cotización para tu empresa. ¿Qué servicio específico necesitas?"
```

### 2. **Reducción de costos de API**
- Sin ventana: 3 llamadas a OpenAI
- Con ventana: 1 llamada a OpenAI con contexto completo

### 3. **Mejor experiencia de usuario**
El agente parece más humano al esperar que el usuario termine de escribir.

## Integración con Loop/Wait

Este nodo probablemente se conecta a:

```
┌──────────────────┐
│ Ctrl_WindowDeci  │
└────┬────┬────┬───┘
     │    │    │
  Nothing │  Wait
     │  Continue│
     │    │    │
     │    ▼    ▼
     │  [Procesar] [Loop Back + Delay]
     │             │
     │             ▼
     │        Wait 2s → Volver a Buf_FetchAll
     │
     └──→ [Stop]
```

### Nodo Wait esperado

```javascript
// Después del output "Wait"
Wait: 2 seconds
Resume: Yes
Then: Loop back to Buf_FetchAll
```

**Ciclo**:
1. Buf_FetchAll lee mensajes
2. Ctrl_WindowDecision evalúa timestamp
3. Si `Wait` → Espera 2s y vuelve a Buf_FetchAll
4. Si `Continue` → Procesa el mensaje
5. Si `Nothing` → Detiene el workflow

## Parámetros de Configuración

### Ventana temporal (actualmente 8 segundos)

```javascript
$now.minus(8, 'seconds')
```

**Ajuste recomendado**:
- **5 segundos**: Para respuestas más rápidas (usuarios impacientes)
- **10 segundos**: Para dar más tiempo a escribir (mensajes largos)
- **3 segundos**: Para conversaciones dinámicas (chatbots de soporte)

### Función `last(0)` en n8n

```javascript
$json.message[last(0)]  // Último elemento del array
$json.message[last(1)]  // Penúltimo elemento
```

Equivalente a:
```javascript
$json.message[$json.message.length - 1]
```

## Datos Disponibles para Siguiente Nodo

### Output: Continue

```json
{
  "message": [
    "{\"message_id\":2704,\"message_text\":\"Hola que tal\",...}"
  ]
}
```

⚠️ **Problema**: Solo se pasa `message`, se pierde `profile_base`.

**Solución**: El siguiente nodo debe hacer merge con `Normalize_Inbound`.

## Mejoras Sugeridas

### 1. Ventana adaptativa basada en longitud de mensaje

```javascript
// Si el mensaje es corto (< 20 chars), esperar menos
const msgLength = JSON.parse($json.message[last(0)]).message_text.length;
const waitTime = msgLength < 20 ? 5 : 10;
$now.minus(waitTime, 'seconds')
```

### 2. Detectar "typing indicators"

```javascript
// Si Chatwoot envía eventos de "usuario está escribiendo"
// Extender la ventana automáticamente
if (typing_indicator_active) {
  // Esperar más tiempo
  $now.minus(15, 'seconds')
}
```

### 3. Deduplicación real (fix Regla 1)

```javascript
// En lugar de comparar solo el último
// Verificar si el message_id existe en todo el buffer
const currentId = $('Normalize_Inbound').item.json.event.message_id;
const bufferIds = $json.message.map(m => JSON.parse(m).message_id);

if (bufferIds.includes(currentId)) {
  // Output: Nothing (duplicado)
} else {
  // Continue con la lógica de ventana
}
```

### 4. Logging de decisiones

```javascript
// Añadir metadata de por qué se tomó la decisión
{
  decision: "Continue",
  reason: "Message older than 8 seconds",
  message_age_seconds: 12,
  buffer_length: 3
}
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Ventana temporal**: 8 segundos
**Salidas**: Nothing, Continue, Wait
**Mejora crítica**: Implementar deduplicación real en Regla 1
