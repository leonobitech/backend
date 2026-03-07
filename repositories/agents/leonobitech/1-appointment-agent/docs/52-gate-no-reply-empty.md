# Node 52: Gate: NO_REPLY / Empty

## Metadata

| Atributo | Valor |
|----------|-------|
| **Nombre del Nodo** | Gate: NO_REPLY / Empty |
| **Tipo** | If (Conditional Gate) |
| **Función Principal** | Filtrar mensajes con flag no_reply o indicadores especiales [[NO_REPLY]] |
| **Input Primario** | Output del Output Main (Node 51) |
| **Modo de Ejecución** | Conditional routing |
| **Zona del Workflow** | ETAPA 5 - Master AI Agent Core Process (control flow) |
| **Outputs** | 2 outputs: True (stop), False (continue) |
| **Versión** | v1.0 |
| **Dependencias Upstream** | Node 51 (Output Main) |
| **Dependencias de Servicio** | Ninguna (evaluación local) |
| **Timing Estimado** | <1ms (evaluación condicional) |

---

## Descripción General

**Gate: NO_REPLY / Empty** es un nodo de control de flujo que actúa como punto de decisión en el workflow. Su función es determinar si el mensaje debe enviarse al cliente o si debe detenerse el flujo.

### Rol en el Workflow

Este nodo:
1. **Evalúa la condición de no-reply** del mensaje generado por Output Main
2. **Detecta indicadores especiales** como `[[NO_REPLY]]` en el texto
3. **Rutea el flujo** hacia dos caminos:
   - **True path** (stop): Si `no_reply` es true O hay indicador especial → detener workflow
   - **False path** (continue): Si debe enviarse mensaje → continuar a nodos de envío

### ¿Por Qué es Crítico?

- **Previene envíos innecesarios**: Algunos procesos internos (actualización de state, logging) no requieren mensaje al cliente
- **Optimiza costos**: Evita llamadas innecesarias a Chatwoot/WhatsApp API
- **Control granular**: Permite que el Master Agent decida dinámicamente si enviar o no mensaje
- **Maneja edge cases**: Detecta marcadores especiales insertados por validaciones upstream

---

## Configuración del Nodo

### Conditions

```javascript
{{
  !!$json &&
  $json.skip === false &&
  $json.llm &&
  $json.llm.text &&
  $json.llm.text.trim() !== '' &&
  $json.llm.text.trim() !== '[[NO_REPLY]]'
}}
```

**Desglose de la condición**:

1. `!!$json` - Input existe y no es null/undefined
2. `$json.skip === false` - No está marcado para skip
3. `$json.llm` - Objeto LLM existe
4. `$json.llm.text` - Texto del LLM existe
5. `$json.llm.text.trim() !== ''` - Texto no está vacío
6. `$json.llm.text.trim() !== '[[NO_REPLY]]'` - No tiene marcador especial

**Resultado**:
- Si **TODAS** las condiciones son `true` → `is true` → **False path** (continuar)
- Si **ALGUNA** condición es `false` → `is true` → **True path** (detener)

**Nota**: La lógica parece invertida, pero n8n evalúa "is true" sobre el resultado booleano completo.

### Convert types where required
**Enabled** - Convierte tipos automáticamente durante evaluación

---

## Lógica de Decisión

### Casos que Detienen el Flujo (True path)

#### Caso 1: Flag `no_reply` del Master Agent

```json
{
  "meta": {
    "no_reply": true
  }
}
```

**¿Cuándo ocurre?**
- Master Agent decide que no debe haber respuesta visible
- Ejemplo: Actualización silenciosa de state tras acción interna

#### Caso 2: Marcador `[[NO_REPLY]]` en texto

```json
{
  "content_whatsapp": {
    "content": "[[NO_REPLY]]"
  }
}
```

**¿Cuándo ocurre?**
- Output Main detectó error crítico pero no fatal
- Validación upstream insertó marcador de supresión
- Debugging/testing con mensajes marcados

#### Caso 3: Campo `skip` activado

```json
{
  "skip": true
}
```

**¿Cuándo ocurre?**
- Nodo upstream decidió omitir envío
- Condición de negocio (ej. fuera de horario laboral, lead pausado)

#### Caso 4: Texto vacío o null

```json
{
  "content_whatsapp": {
    "content": ""
  }
}
```

**¿Cuándo ocurre?**
- Error en Output Main al generar texto
- Master Agent generó respuesta vacía (edge case)

#### Caso 5: Objeto LLM inexistente

```json
{
  "llm": null
}
```

**¿Cuándo ocurre?**
- Error crítico en nodos upstream
- Datos corruptos o malformados

### Casos que Continúan el Flujo (False path)

```json
{
  "skip": false,
  "llm": {
    "text": "Leonobit 🤖 *[Servicio]*:\nEl WhatsApp Chatbot permite..."
  },
  "content_whatsapp": {
    "content": "Leonobit 🤖 *[Servicio]*:\nEl WhatsApp Chatbot permite..."
  }
}
```

**Condiciones cumplidas**:
- ✅ Input válido
- ✅ `skip = false`
- ✅ Objeto LLM existe
- ✅ Texto no vacío
- ✅ Texto no es `[[NO_REPLY]]`

→ **Continuar a nodos de envío** (Chatwoot/WhatsApp API)

---

## Input Structure

El input esperado viene del **Node 51: Output Main**:

```javascript
{
  // Mensajes formateados
  "content_whatsapp": {
    "content": "Leonobit 🤖 *[Servicio]*:\n...",
    "message_type": "outgoing",
    "content_type": "text"
  },
  "body_html": "<p><strong>🤖 Leonobit</strong></p>...",
  "chatwoot_messages": [ /* ... */ ],

  // Metadata de control
  "skip": false,
  "expect_reply": true,
  "message_kind": "service_info",

  // Meta con flags
  "meta": {
    "no_reply": false,
    "purpose": "service_info",
    "validation": { /* ... */ }
  },

  // Campo legacy (si existe)
  "llm": {
    "text": "Leonobit 🤖 *[Servicio]*:\n..."
  }
}
```

---

## Output Structure

### True Path (Detener)

**Cuando**: Condición es **false** (contradictorio pero así funciona n8n "is true")

```javascript
// Empty output (no items pasan por este path)
[]
```

**Comportamiento**:
- Workflow se detiene aquí
- No se envía mensaje a Chatwoot/WhatsApp
- State se persiste (si nodos de persistencia están upstream)
- Logging marca como "no_reply_triggered"

### False Path (Continuar)

**Cuando**: Condición es **true**

```javascript
[
  {
    "body_html": "<p>...</p>",
    "content_whatsapp": { /* ... */ },
    "chatwoot_messages": [ /* ... */ ],
    "lead_id": 33,
    "expect_reply": true,
    // ... (full object from Output Main)
  }
]
```

**Comportamiento**:
- Items continúan a nodos de envío
- Mensaje se enviará a Chatwoot/WhatsApp
- Flujo normal continúa

---

## Casos de Uso

### Caso 1: Mensaje Normal (Continuar)

**Input**:
```json
{
  "skip": false,
  "content_whatsapp": {
    "content": "Leonobit 🤖 *[Precios]*:\nEl WhatsApp Chatbot cuesta $2,500 MXN/mes."
  },
  "meta": {
    "no_reply": false
  }
}
```

**Evaluación**:
```javascript
!!$json &&
$json.skip === false &&           // ✅ true
$json.llm &&
$json.llm.text &&                 // ✅ exists
$json.llm.text.trim() !== '' &&   // ✅ not empty
$json.llm.text.trim() !== '[[NO_REPLY]]' // ✅ not marker
// → TRUE → False path (continuar)
```

**Resultado**: Mensaje pasa al siguiente nodo (envío a Chatwoot/WhatsApp)

**Timing**: <1ms

---

### Caso 2: No Reply Flag (Detener)

**Input**:
```json
{
  "skip": false,
  "content_whatsapp": {
    "content": "Update silencioso de state"
  },
  "meta": {
    "no_reply": true
  }
}
```

**Evaluación**:
```javascript
// Gate evalúa texto, pero meta.no_reply=true debería ser detectado upstream
// Si llega aquí, depende de si llm.text existe
// Asumiendo que Output Main puso llm.text = "[[NO_REPLY]]"
$json.llm.text.trim() === '[[NO_REPLY]]'
// → FALSE → True path (detener)
```

**Resultado**: Workflow se detiene, no se envía mensaje

**Timing**: <1ms

---

### Caso 3: Texto Vacío (Detener)

**Input**:
```json
{
  "skip": false,
  "content_whatsapp": {
    "content": ""
  },
  "llm": {
    "text": ""
  }
}
```

**Evaluación**:
```javascript
$json.llm.text.trim() === ''
// → FALSE → True path (detener)
```

**Resultado**: Workflow se detiene (error en generación de texto)

**Timing**: <1ms

---

### Caso 4: Marcador Especial (Detener)

**Input**:
```json
{
  "skip": false,
  "llm": {
    "text": "[[NO_REPLY]]"
  }
}
```

**Evaluación**:
```javascript
$json.llm.text.trim() === '[[NO_REPLY]]'
// → FALSE → True path (detener)
```

**Resultado**: Workflow se detiene (marcador de supresión)

**Timing**: <1ms

---

### Caso 5: Skip Activado (Detener)

**Input**:
```json
{
  "skip": true,
  "content_whatsapp": {
    "content": "Este mensaje no se enviará"
  }
}
```

**Evaluación**:
```javascript
$json.skip === false
// → FALSE (skip es true) → True path (detener)
```

**Resultado**: Workflow se detiene (skip forzado)

**Timing**: <1ms

---

### Caso 6: Objeto LLM Inexistente (Detener)

**Input**:
```json
{
  "skip": false,
  "content_whatsapp": {
    "content": "Texto sin objeto LLM"
  },
  "llm": null
}
```

**Evaluación**:
```javascript
$json.llm
// → FALSE (llm es null) → True path (detener)
```

**Resultado**: Workflow se detiene (error crítico)

**Timing**: <1ms

---

## Comparación con Otros Gates

| Aspecto | Gate: NO_REPLY | Gate: Empty Messages | Gate: Rate Limit |
|---------|---------------|---------------------|------------------|
| **Ubicación** | Después de Output Main | Después de Buffer | Antes de envío |
| **Condición** | no_reply flag + marcadores | Mensajes vacíos | Límite de rate |
| **Propósito** | Control de envío lógico | Validación de contenido | Protección anti-spam |
| **Timing** | <1ms | <1ms | 1-2ms (query Redis) |
| **Output True** | Detener (no enviar) | Detener (invalid) | Detener (throttled) |
| **Output False** | Continuar (enviar) | Continuar (valid) | Continuar (allowed) |

---

## Mejoras Potenciales

### 1. Logging de Decisiones

**Problema**: No hay visibilidad de por qué se detuvo el flujo.

**Solución**: Agregar nodo de logging antes del gate.

```javascript
// Logging Node (antes del gate)
const reasons = [];
if ($json.skip) reasons.push("skip_flag");
if (!$json.llm) reasons.push("missing_llm");
if (!$json.llm?.text) reasons.push("missing_text");
if ($json.llm?.text?.trim() === '') reasons.push("empty_text");
if ($json.llm?.text?.trim() === '[[NO_REPLY]]') reasons.push("no_reply_marker");
if ($json.meta?.no_reply) reasons.push("no_reply_meta");

return [{
  json: {
    ...$json,
    gate_decision: reasons.length > 0 ? "stop" : "continue",
    gate_reasons: reasons
  }
}];
```

### 2. Unificar Condición con meta.no_reply

**Problema**: Condición actual no evalúa `meta.no_reply` directamente.

**Solución**: Incluir en expresión.

```javascript
{{
  !!$json &&
  $json.skip === false &&
  $json.meta?.no_reply !== true &&  // ← Agregar esta línea
  $json.llm &&
  $json.llm.text &&
  $json.llm.text.trim() !== '' &&
  $json.llm.text.trim() !== '[[NO_REPLY]]'
}}
```

### 3. Compatibilidad con Múltiples Marcadores

**Problema**: Solo detecta `[[NO_REPLY]]`, pueden existir otros marcadores.

**Solución**: Array de marcadores.

```javascript
const NO_REPLY_MARKERS = [
  '[[NO_REPLY]]',
  '[[SKIP]]',
  '[[SILENT]]',
  '[[INTERNAL]]'
];

const text = $json.llm?.text?.trim() || '';
const hasMarker = NO_REPLY_MARKERS.some(m => text === m);

{{ !hasMarker && /* resto de condiciones */ }}
```

### 4. Métricas de Gate

**Problema**: No sabemos cuántos mensajes se detienen vs continúan.

**Solución**: Agregar tracking a ambos paths.

```javascript
// En False path (continuar)
const trackingNode = {
  event: "gate_passed",
  gate_name: "NO_REPLY",
  timestamp: new Date().toISOString(),
  lead_id: $json.lead_id
};

// En True path (detener)
const trackingNode = {
  event: "gate_stopped",
  gate_name: "NO_REPLY",
  reason: $json.gate_reasons?.join(",") || "unknown",
  timestamp: new Date().toISOString(),
  lead_id: $json.lead_id
};
```

Enviar a Redis/InfluxDB para análisis.

### 5. Validación Upstream

**Problema**: Gate puede recibir datos malformados de Output Main.

**Solución**: Agregar nodo de validación antes del gate.

```javascript
// Validation Node (antes del gate)
function validateOutput(obj){
  const errors = [];

  if (!obj) errors.push("null_input");
  if (!obj.content_whatsapp) errors.push("missing_content_whatsapp");
  if (!obj.body_html) errors.push("missing_body_html");
  if (!obj.meta) errors.push("missing_meta");

  return {
    valid: errors.length === 0,
    errors
  };
}

const validation = validateOutput($json);
if (!validation.valid){
  // Insertar marcador [[NO_REPLY]]
  $json.llm = { text: "[[NO_REPLY]]" };
  $json.validation_errors = validation.errors;
}

return [{ json: $json }];
```

### 6. Soft vs Hard Stop

**Problema**: Gate solo tiene 2 estados (stop/continue), no distingue severidad.

**Solución**: Agregar 3rd path para "soft stop" (log pero no error).

```javascript
// Soft Stop: Mensajes informativos que no son errores
const isSoftStop =
  $json.meta?.no_reply === true &&
  $json.meta?.purpose === "state_update";

// Hard Stop: Errores o validaciones fallidas
const isHardStop =
  !$json.llm ||
  !$json.llm.text ||
  $json.llm.text.trim() === '';

// Continue: Mensajes normales
const shouldContinue = !isSoftStop && !isHardStop;
```

**Routing**:
- **Soft Stop** → Logging node (info level)
- **Hard Stop** → Error handler node (warning level)
- **Continue** → Send to Chatwoot/WhatsApp

---

## Referencias

### Documentos Relacionados

1. **Node 51: Output Main** - [51-output-main.md](51-output-main.md)
   - Generación del output que este gate evalúa

2. **Node 50: Master AI Agent-Main** - [50-master-ai-agent-main.md](50-master-ai-agent-main.md)
   - Master Agent que puede setear `no_reply` flag

3. **ARCHITECTURE-FLOW.md** - [ARCHITECTURE-FLOW.md](ARCHITECTURE-FLOW.md)
   - Flujo completo del workflow

### External References

- **n8n If Node Docs**: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/
- **n8n Expressions**: https://docs.n8n.io/code-examples/expressions/

### Version History

| Version | Cambios | Fecha |
|---------|---------|-------|
| v1.0 | Condición inicial con 6 validaciones | 2025-01-15 |

---

## Conclusión

**Node 52: Gate: NO_REPLY / Empty** es un nodo crítico de control de flujo que decide si el mensaje debe enviarse al cliente o si el workflow debe detenerse.

**Características clave**:
- **Evaluación rápida** (<1ms) con 6 condiciones
- **Múltiples criterios de detención** (no_reply flag, marcadores, skip, vacío)
- **Routing dual** (True path stop, False path continue)
- **Compatibilidad backward** con campo legacy `llm.text`

**Casos de uso principales**:
1. **State updates silenciosos** - Actualizar profile/state sin notificar cliente
2. **Errores manejados** - Detener flujo cuando hay error pero no es crítico
3. **Testing/debugging** - Marcar mensajes con `[[NO_REPLY]]` para testing
4. **Business rules** - Skip según condiciones de negocio (horario, lead status)

Este nodo actúa como **última línea de defensa** antes del envío, asegurando que solo mensajes válidos y deseados lleguen al cliente.

**Next steps**: Documentar nodos de envío y persistencia (53-55).
