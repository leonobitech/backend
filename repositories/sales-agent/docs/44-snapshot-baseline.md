# Nodo 44: SnapshotBaseline

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | SnapshotBaseline |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Crear snapshot inmutable del state inicial para comparación posterior |
| **Input previo** | LoadProfileAndState Salida B (Node 39) → `{ profile, state }` |
| **Modo ejecución** | Run Once for All Items |
| **Zona** | **FLAGS ZONE** (nueva etapa del workflow) |
| **Salidas** | 1 salida → `{ profile, state, state_base, state_base_meta, merge_key, history, options, rules }` |
| **Versión** | v1.2 (snapshot inmutable + merge_key) |

---

## Descripción

El nodo **SnapshotBaseline** es el **primer nodo de la FLAGS ZONE**, una nueva etapa del workflow que maneja flags y snapshots para comparación de estados.

**¿Qué es FLAGS ZONE?**

La FLAGS ZONE es una sección paralela del workflow que:
1. Captura el **estado inicial** del lead (snapshot)
2. Se ejecuta en **paralelo** con el flujo principal (Analysis of History)
3. Permite **comparar cambios** entre state inicial y state final
4. Proporciona el **merge_key** para unir flujos posteriormente

**Función del SnapshotBaseline:**

1. **Crear snapshot inmutable:** Si no existe `state_base`, clona profundamente el `state` actual
2. **Agregar metadata:** Timestamp ISO y fuente del snapshot
3. **Extraer merge_key:** Busca `lead_id` en múltiples fuentes (state, profile, merge_key existente)
4. **Arrastrar contexto opcional:** Propaga profile, history, options, rules (vacíos si no existen)
5. **Output único:** Objeto con state + state_base + merge_key

**Propósito crítico:**

El snapshot `state_base` es **inmutable** - representa el estado del lead **antes** de que el Analyst/Master hagan cambios. Esto permite:
- **Detectar qué cambió** (stage transitions, counters incrementados, interests añadidos)
- **Auditar decisiones** (por qué se pasó de explore → match)
- **Validar políticas** (counters solo +1, no regresión de stages)
- **Rollback si necesario** (restaurar state_base en caso de error)

**Patrón arquitectónico:** **Snapshot Pattern** - Captura estado en un punto específico del tiempo para comparación/rollback.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: Code
Lenguaje: JavaScript
Mode: Run Once for All Items
```

### Code Completo

```javascript
// SnapshotBaseline v1.2 — snapshot inmutable + merge_key
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

const base = $json || {};
const out  = { ...base };

// Crear snapshot solo si no existe
if (!out.state_base) {
  out.state_base = deepClone(base.state || {});
  out.state_base_meta = {
    created_at_iso: new Date().toISOString(),
    source: "SnapshotBaseline"
  };
}

// Clave de unión para el Merge By Key
out.merge_key = out.merge_key ?? (out.state?.lead_id ?? out.profile?.lead_id ?? null);

// (opcional) arrastrar contexto
out.profile = out.profile || base.profile || {};
out.history = out.history || base.history || [];
out.options = out.options || base.options || {};
out.rules   = out.rules   || base.rules   || {};

return [{ json: out }];
```

### Code Breakdown

#### 1. Helper Function (Línea 2)

```javascript
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
```

**Propósito:** Clonación profunda para evitar mutaciones del state original.

**Técnica:** Serializa a JSON y vuelve a parsear (copia todos los valores, no referencias).

**Limitación:** No preserva funciones, Date objects, undefined, Symbol. Suficiente para state (POJO - Plain Old JavaScript Object).

---

#### 2. Base Input (Líneas 4-5)

```javascript
const base = $json || {};
const out  = { ...base };
```

**Propósito:**
- `base`: Input completo desde LoadProfileAndState (Salida B)
- `out`: Spread operator (`{...base}`) crea copia shallow (se modificará)

**Nota:** Spread es shallow copy - objetos anidados siguen siendo referencias. Por eso se usa `deepClone` para state_base.

---

#### 3. Snapshot Creation (Líneas 8-14)

```javascript
if (!out.state_base) {
  out.state_base = deepClone(base.state || {});
  out.state_base_meta = {
    created_at_iso: new Date().toISOString(),
    source: "SnapshotBaseline"
  };
}
```

**Lógica:**
1. **Condicional**: Solo crea snapshot si `state_base` no existe (idempotencia)
2. **Deep clone**: `deepClone(base.state)` → copia completamente independiente
3. **Metadata**:
   - `created_at_iso`: Timestamp ISO 8601 de creación
   - `source`: Identifica que fue creado por SnapshotBaseline

**¿Por qué idempotencia?**

Si el nodo se ejecuta múltiples veces (retry, loop), el snapshot solo se crea una vez. Esto garantiza que `state_base` siempre representa el **estado inicial**, no estados intermedios.

**Ejemplo:**
```javascript
// Primera ejecución
base.state = { stage: "explore", counters: { services_seen: 0 } };
→ out.state_base = { stage: "explore", counters: { services_seen: 0 } }; // ✅ Snapshot creado

// Segunda ejecución (retry)
base.state = { stage: "match", counters: { services_seen: 1 } }; // Estado cambió
base.state_base ya existe → NO sobrescribir
→ out.state_base = { stage: "explore", counters: { services_seen: 0 } }; // ✅ Snapshot original preservado
```

---

#### 4. Merge Key Extraction (Línea 17)

```javascript
out.merge_key = out.merge_key ?? (out.state?.lead_id ?? out.profile?.lead_id ?? null);
```

**Lógica:** Nullish coalescing chain (`??`) con 3 niveles de fallback:
1. `out.merge_key` → Si ya existe (de nodo anterior)
2. `out.state?.lead_id` → Desde state (fuente principal)
3. `out.profile?.lead_id` → Desde profile (fallback)
4. `null` → Si ninguno existe (error)

**Propósito del merge_key:**

El `merge_key` es el **lead_id** que se usará para **unir flujos** en un nodo Merge posterior:
- **Flujo A (Analysis)**: Node 41 → 42 → 43 → ... → Merge
- **Flujo B (Flags)**: Node 39 → 44 (SnapshotBaseline) → ... → Merge

El Merge node usa `merge_key` para emparejar items de ambos flujos que corresponden al mismo lead.

**Ejemplo:**
```javascript
// Flujo A output:
{ ok: true, merge_key: 33, agent_brief: {...}, state: {...} }

// Flujo B output:
{ merge_key: 33, state_base: {...}, state_base_meta: {...} }

// Merge By Key (key = merge_key):
{
  merge_key: 33,
  agent_brief: {...},      // Desde Flujo A
  state: {...},            // Desde Flujo A
  state_base: {...},       // Desde Flujo B
  state_base_meta: {...}   // Desde Flujo B
}
```

---

#### 5. Context Propagation (Líneas 20-24)

```javascript
out.profile = out.profile || base.profile || {};
out.history = out.history || base.history || [];
out.options = out.options || base.options || {};
out.rules   = out.rules   || base.rules   || {};
```

**Propósito:** Arrastrar contexto opcional desde input (si existe).

**Lógica:** Doble fallback:
1. `out.profile` → Si ya está en out (de step anterior)
2. `base.profile` → Si está en input
3. `{}` → Default vacío

**¿Por qué vacíos en este caso?**

En este ejemplo específico, LoadProfileAndState (Salida B) solo envía `profile` y `state`, NO envía `history`, `options`, `rules`. Esos campos se inicializan como vacíos (`[]`, `{}`) para que existan en el output.

En un flujo alternativo, si LoadProfileAndState enviara más contexto, se preservaría.

---

#### 6. Output (Línea 26)

```javascript
return [{ json: out }];
```

**Propósito:** Retorna array con 1 item (formato n8n).

**Output structure:**
```javascript
{
  profile: {...},          // Desde input
  state: {...},            // Desde input
  state_base: {...},       // ✅ Snapshot creado
  state_base_meta: {...},  // ✅ Metadata del snapshot
  merge_key: 33,           // ✅ Lead ID para Merge
  history: [],             // Vacío (no presente en input)
  options: {},             // Vacío
  rules: {}                // Vacío
}
```

---

## Input

Input desde **LoadProfileAndState Salida B (Node 39)**:

```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": null,
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "explore",
    "priority": "normal",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "lead_id": 33,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null
  },
  "state": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": false
  }
}
```

**Notas:**
- Solo contiene `profile` y `state`
- NO contiene `history`, `options`, `rules` (se inicializan vacíos en SnapshotBaseline)
- `state.stage` = "explore" (estado inicial)
- `state.counters` = 0/0/0 (sin actividad)

---

## Output

Output del nodo:

```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": null,
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "explore",
    "priority": "normal",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "lead_id": 33,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null
  },
  "state": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": false
  },
  "state_base": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": false
  },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",
    "source": "SnapshotBaseline"
  },
  "merge_key": 33,
  "history": [],
  "options": {},
  "rules": {}
}
```

**Cambios aplicados:**

1. ✅ **state_base creado**: Deep clone de `state` (idéntico en este momento)
2. ✅ **state_base_meta agregado**: Timestamp ISO + source
3. ✅ **merge_key extraído**: 33 (desde `state.lead_id`)
4. ✅ **Context propagation**: history/options/rules inicializados como vacíos

**Observación importante:**

En este momento, `state` y `state_base` son **idénticos** (ambos tienen stage="explore", counters=0/0/0). Después de que el Analyst/Master procesen el mensaje y actualicen `state`, la diferencia será visible:

```javascript
// Después del Analyst (en Merge node):
state.stage = "match";                // ✅ Cambió
state.counters.services_seen = 1;     // ✅ Incrementó
state.interests = ["WhatsApp", "CRM"]; // ✅ Añadidos

state_base.stage = "explore";          // ⚓ Inmutable
state_base.counters.services_seen = 0; // ⚓ Inmutable
state_base.interests = [];             // ⚓ Inmutable
```

---

## Arquitectura de Flujos Paralelos

### Flujo Completo Bifurcado

```
Node 35: ComposeProfile (2 outputs)
├─ Salida A: History Flow
│  ├─ Node 36: Register incoming message
│  ├─ Node 37: Get Chat History from Lead
│  ├─ Node 38: Chat History Filter
│  └─ Node 40: HydrateForHistory (Merge con Salida B-A)
│     └─ ETAPA 4B: Analysis of History
│        ├─ Node 41: Smart Input
│        ├─ Node 42: Chat History Processor (LLM Analyst)
│        ├─ Node 43: Filter Output
│        └─ → [Master Agent + RAG] → Merge Final
│
└─ Salida B: Profile Flow
   └─ Node 39: LoadProfileAndState (2 outputs)
      ├─ Salida A → Node 40 (Merge con History)
      └─ Salida B → **FLAGS ZONE**
         └─ Node 44: SnapshotBaseline ✅
            └─ → [Flags processing?] → Merge Final
```

### Propósito de la Bifurcación

**¿Por qué dos outputs en LoadProfileAndState?**

1. **Salida A (va a Merge con History):**
   - Propósito: Proveer profile + state para el Analyst
   - Destino: HydrateForHistory (Node 40) → Analysis

2. **Salida B (va a FLAGS ZONE):**
   - Propósito: Capturar snapshot del estado inicial
   - Destino: SnapshotBaseline (Node 44) → Flags processing → Merge Final

**Ventaja:** Ejecución paralela - mientras el Analyst analiza, la FLAGS ZONE prepara snapshots y flags para comparación posterior.

---

## Casos de Uso

### 1. Primera Ejecución (Snapshot Creation)

**Escenario:** Lead nuevo, primera vez que se ejecuta SnapshotBaseline.

**Input:**
```json
{
  "state": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 }
  }
}
```

**Lógica:**
```javascript
if (!out.state_base) { // ✅ true (no existe)
  out.state_base = deepClone(state); // Crear snapshot
}
```

**Output:**
```json
{
  "state": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 }
  },
  "state_base": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 }
  },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",
    "source": "SnapshotBaseline"
  },
  "merge_key": 33
}
```

---

### 2. Re-ejecución (Idempotencia)

**Escenario:** Workflow hace retry, SnapshotBaseline se ejecuta nuevamente con state modificado.

**Input (segunda ejecución):**
```json
{
  "state": {
    "lead_id": 33,
    "stage": "match",  // ✅ Cambió
    "counters": { "services_seen": 1, "prices_asked": 0, "deep_interest": 0 }
  },
  "state_base": {
    "lead_id": 33,
    "stage": "explore",  // ⚓ Original
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 }
  },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",
    "source": "SnapshotBaseline"
  }
}
```

**Lógica:**
```javascript
if (!out.state_base) { // ❌ false (ya existe)
  // NO ejecutar - preservar snapshot original
}
```

**Output:**
```json
{
  "state": {
    "lead_id": 33,
    "stage": "match",  // ✅ Nuevo estado
    "counters": { "services_seen": 1, "prices_asked": 0, "deep_interest": 0 }
  },
  "state_base": {
    "lead_id": 33,
    "stage": "explore",  // ⚓ Snapshot original preservado
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 }
  },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",  // ⚓ Timestamp original
    "source": "SnapshotBaseline"
  },
  "merge_key": 33
}
```

**Beneficio:** `state_base` sigue representando el estado inicial, no el estado intermedio.

---

### 3. Merge Key Fallback Chain

**Escenario:** Input no tiene `state.lead_id`, pero sí `profile.lead_id`.

**Input:**
```json
{
  "state": {
    "chatwoot_id": 186,
    // lead_id faltante
  },
  "profile": {
    "lead_id": 33,  // ✅ Presente
    "phone": "+5491133851987"
  }
}
```

**Lógica:**
```javascript
out.merge_key = out.merge_key ?? (out.state?.lead_id ?? out.profile?.lead_id ?? null);
// → undefined ?? (undefined ?? 33 ?? null)
// → undefined ?? 33
// → 33 ✅
```

**Output:**
```json
{
  "merge_key": 33  // ✅ Extraído desde profile.lead_id
}
```

---

### 4. Comparación Pre/Post Analyst

**Escenario:** Después del Merge Final, comparar state_base vs state.

**state_base (capturado en SnapshotBaseline):**
```json
{
  "stage": "explore",
  "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
  "interests": []
}
```

**state (después del Analyst/Master):**
```json
{
  "stage": "match",
  "counters": { "services_seen": 1, "prices_asked": 0, "deep_interest": 1 },
  "interests": ["WhatsApp", "CRM"]
}
```

**Diff calculation:**
```javascript
const diff = {
  stage: state.stage !== state_base.stage ? `${state_base.stage} → ${state.stage}` : null,
  counters: {
    services_seen: state.counters.services_seen - state_base.counters.services_seen,
    prices_asked: state.counters.prices_asked - state_base.counters.prices_asked,
    deep_interest: state.counters.deep_interest - state_base.counters.deep_interest
  },
  interests_added: state.interests.filter(i => !state_base.interests.includes(i))
};

// Result:
{
  stage: "explore → match",
  counters: { services_seen: +1, prices_asked: 0, deep_interest: +1 },
  interests_added: ["WhatsApp", "CRM"]
}
```

**Uso:** Auditoría, logging, analytics, validación de políticas.

---

## Comparación con Nodos Previos

| Aspecto | Node 39 (LoadProfileAndState) | Node 44 (SnapshotBaseline) |
|---------|-------------------------------|----------------------------|
| **Función** | Cargar profile + generar state | Capturar snapshot de state |
| **Input** | Multiple sources (ComposeProfile, UpdateLeadWithRow_Id) | LoadProfileAndState Salida B |
| **Output** | `{profile, state}` | `{profile, state, state_base, state_base_meta, merge_key}` |
| **Mutabilidad** | state es mutable | state_base es inmutable |
| **Zona** | Profile Flow | FLAGS ZONE |
| **Propósito** | Preparar datos para Analyst | Preparar snapshot para comparación |
| **Idempotencia** | No (siempre regenera state) | Sí (snapshot solo se crea una vez) |
| **Merge key** | No genera | Sí genera (lead_id) |

**Progresión de datos:**

1. **Node 39 (LoadProfileAndState):** Profile + State generado
2. **Node 39 Salida B → Node 44 (SnapshotBaseline):** + state_base (snapshot) + merge_key
3. **Merge Final:** state_base (FLAGS ZONE) + state actualizado (Analysis) → Comparación

---

## Performance

### Métricas Estimadas

| Métrica | Valor |
|---------|-------|
| **Execution time** | ~5-10ms |
| **Input size** | ~1-2 KB |
| **Output size** | ~2-4 KB (duplica state → state_base) |
| **Memory usage** | Bajo (~1 MB) |
| **Code complexity** | Baja (~25 líneas) |

**Breakdown:**
- Deep clone: 3-5ms (serializa + parse JSON ~1KB)
- Metadata creation: 1ms
- Merge key extraction: 1ms
- Context propagation: 1-2ms

**Optimización:**
- Deep clone es O(n) donde n = tamaño del state (~1KB)
- No hay loops ni operaciones costosas

---

## Mejoras Propuestas

### 1. Structural Clone API (más eficiente)

**Problema:** `JSON.parse(JSON.stringify(x))` es lento y tiene limitaciones (no clona Date, undefined, functions).

**Solución:** Usar `structuredClone()` (nativo en Node.js 17+):

```javascript
function deepClone(x){ return structuredClone(x); }
```

**Beneficio:** 2-3x más rápido, clona más tipos (Date, Map, Set, ArrayBuffer).

---

### 2. Validación de Snapshot

**Problema:** No valida que `state_base` tenga los campos esperados.

**Solución:** Agregar validación:

```javascript
function isValidState(state) {
  return state &&
    typeof state.lead_id === 'number' &&
    typeof state.stage === 'string' &&
    typeof state.counters === 'object';
}

if (!out.state_base) {
  const stateToSnap = base.state || {};
  if (!isValidState(stateToSnap)) {
    throw new Error("Invalid state for snapshot");
  }
  out.state_base = deepClone(stateToSnap);
  // ...
}
```

**Beneficio:** Detecta errores tempranos (state malformado).

---

### 3. Versioning de Snapshots

**Problema:** Si el schema de `state` cambia (nuevos campos), snapshots viejos no son compatibles.

**Solución:** Agregar version a metadata:

```javascript
out.state_base_meta = {
  created_at_iso: new Date().toISOString(),
  source: "SnapshotBaseline",
  schema_version: "v2.0"  // ✅
};
```

**Uso:** Al comparar, verificar que ambos states usen la misma version.

**Beneficio:** Compatibilidad backwards al evolucionar schema.

---

### 4. Compression de Snapshot

**Problema:** `state_base` duplica ~1KB de datos (aumenta payload).

**Solución:** Comprimir con zlib (si n8n lo soporta):

```javascript
const zlib = require('zlib');

out.state_base_compressed = zlib.deflateSync(JSON.stringify(base.state)).toString('base64');
out.state_base = null; // No enviar sin comprimir

// Para descomprimir (en nodo posterior):
const stateBase = JSON.parse(zlib.inflateSync(Buffer.from(compressed, 'base64')).toString());
```

**Beneficio:** Reduce payload de 4KB → 1.5KB (60% smaller).

---

### 5. Merge Key Validation

**Problema:** Si `merge_key` es `null`, el Merge node fallará.

**Solución:** Agregar validación y error explícito:

```javascript
out.merge_key = out.merge_key ?? (out.state?.lead_id ?? out.profile?.lead_id ?? null);

if (out.merge_key == null) {
  throw new Error("[SnapshotBaseline] Cannot extract merge_key: lead_id not found in state or profile");
}
```

**Beneficio:** Error claro vs fallar silenciosamente en Merge.

---

### 6. Diff Calculation (en el mismo nodo)

**Problema:** Diff se calcula en nodo posterior (duplica lógica).

**Solución:** Calcular diff aquí si hay state previo:

```javascript
if (out.state_base && out.state) {
  out.state_diff = {
    stage_changed: out.state.stage !== out.state_base.stage,
    counters_delta: {
      services_seen: out.state.counters.services_seen - out.state_base.counters.services_seen,
      prices_asked: out.state.counters.prices_asked - out.state_base.counters.prices_asked,
      deep_interest: out.state.counters.deep_interest - out.state_base.counters.deep_interest
    },
    interests_added: out.state.interests.filter(i => !out.state_base.interests.includes(i))
  };
}
```

**Beneficio:** Centraliza lógica de diff, facilita debugging.

---

## Referencias

### Nodos Previos
- [Node 39: LoadProfileAndState](39-load-profile-and-state.md) → Provee profile + state para snapshot
- [Node 35: ComposeProfile](35-compose-profile.md) → Genera profile inicial (upstream de Node 39)

### Nodos Siguientes
- **Merge Final Node** (pendiente documentación) → Une FLAGS ZONE (state_base) con Analysis flow (state actualizado)
- **Diff Calculation Node** (pendiente) → Compara state_base vs state

### Arquitectura
- **FLAGS ZONE** (nueva etapa) → Procesamiento paralelo de flags y snapshots
- [ETAPA 4: Update Flow - Resumen](resumen-etapa-4.md) (pendiente crear)

---

## Notas Finales

**SnapshotBaseline** es el **primer nodo de la FLAGS ZONE**, una sección paralela del workflow que:

1. **Captura estado inicial** del lead (antes de que Analyst/Master hagan cambios)
2. **Proporciona merge_key** para unir flujos en Merge Final
3. **Garantiza idempotencia** (snapshot solo se crea una vez, incluso con retries)
4. **Facilita comparación** (state_base vs state actualizado)

**Patrón arquitectónico:** **Snapshot Pattern** - Captura inmutable del estado en un punto específico del tiempo.

**Trade-offs:**
- **Pro:** Auditoría completa (qué cambió y cuándo)
- **Pro:** Rollback posible (restaurar state_base si hay error)
- **Pro:** Validación de políticas (counters solo +1, no regresión)
- **Contra:** Duplica payload (~1KB extra por snapshot)
- **Contra:** Requiere Merge posterior (complejidad arquitectónica)

**Versión:** v1.2 (snapshot inmutable + merge_key) - indica evolución del nodo (v1.0 probablemente no tenía merge_key).

**Uso crítico:** Sin este snapshot, no habría forma de **verificar que el Analyst/Master respetan las políticas** (ej: counters solo +1, stage sin regresión). El snapshot actúa como **source of truth** del estado inicial.

**Próximos nodos:** Después de SnapshotBaseline, probablemente hay más procesamiento en FLAGS ZONE (flags adicionales, validaciones) antes del Merge Final que une ambos flujos.
