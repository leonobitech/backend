# Nodo 46: BuildStatePatch

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre del nodo** | BuildStatePatch |
| **Tipo** | Code (JavaScript) |
| **Función principal** | Calcular diff entre state_base y state actualizado, generar patch para persistencia eficiente |
| **Input previo** | HydrateStateAndContext (Node 45) → `{ profile, state, state_base, agent_brief, ... }` |
| **Modo ejecución** | Run Once for All Items |
| **Salidas** | 1 salida → `{ ok, merge_key, agent_brief, profile, state, patch, json_patch, has_patch, *_changed flags, patch_meta }` |
| **Versión** | v2.1 (monotonicidad + anti-regresión + latestISO + intereses canónicos + flags no regresivos + RFC6902) |

---

## Descripción

El nodo **BuildStatePatch** es el **motor de diff y normalización** que compara el estado original (`state_base`) con el estado actualizado por el Analyst (`state`), y genera un **patch estructurado** que contiene **solo los cambios**.

**¿Por qué es crítico?**

1. **Persistencia eficiente**: En lugar de sobrescribir todo el state en Baserow (UPDATE con 20+ campos), solo actualiza los campos que cambiaron
2. **Auditoría granular**: El patch documenta exactamente qué cambió (stage, counters, interests, cooldowns)
3. **Normalizaciones finales**: Aplica políticas que incluso el Filter Output puede haber pasado por alto:
   - **Monotonicidad de counters**: Garantiza que counters NUNCA disminuyan
   - **Anti-regresión de stage**: Previene retrocesos (price → match ❌)
   - **Latest timestamp**: Cooldowns/timestamps siempre usan el más reciente
   - **Intereses canónicos**: Unión con baseline + filtro por catálogo
   - **Flags no regresivos**: `proposal_offer_done` nunca vuelve a false

4. **Múltiples formatos**:
   - **Dot-path patch**: `{ "cooldowns.addressee_ask_ts": "2025-10-31T14:16:42Z" }`
   - **RFC6902 JSON Patch**: `[{ "op": "replace", "path": "/cooldowns/addressee_ask_ts", "value": "..." }]`
   - **Change flags**: `cooldowns_changed: true`, `has_funnel_changes: false`

5. **Evidencia enriquecida**: Captura contexto sobre por qué cambió (last_incoming, intent, assistant_ask_name_ts)

**Patrón arquitectónico:** **Diff-Patch Pattern** - Calcula diferencias y genera parche para aplicar cambios de forma incremental.

---

## Configuración del Nodo

### Configuración General

```yaml
Tipo: Code
Lenguaje: JavaScript
Mode: Run Once for All Items
```

### Constants & Configuration (Líneas 1-25)

```javascript
const IMMUTABLES = ["lead_id","chatwoot_id","phone_number","country","tz","channel"];

const PATCH_FIELDS = [
  "stage",
  "business_name",
  "email",
  "counters.services_seen",
  "counters.prices_asked",
  "counters.deep_interest",
  "cooldowns.addressee_ask_ts",
  "cooldowns.email_ask_ts",
  "interests",
  "last_proposal_offer_ts",
  "proposal_offer_done",
  "proposal_intent_confirmed"  // opcional
];
```

**Propósito:**
- `IMMUTABLES`: Campos que **nunca** deben cambiar (se restauran desde baseline si el LLM los modificó)
- `PATCH_FIELDS`: Campos considerados para el diff (dot-path notation)

**Nota:** Solo estos 12-13 campos se incluyen en el patch. Campos como `full_name`, `phone_number` NO se patchean (se asume que son inmutables o se actualizan por otros flujos).

---

### Helper Functions (Líneas 26-100)

#### 1. Basic Helpers

```javascript
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
function toIntNZ(v,d=0){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(0,Math.trunc(n)):d;
}
function isISO(ts){
  if (typeof ts!=="string") return false;
  const d=new Date(ts);
  return !isNaN(d.getTime()) && ts.includes("T") && ts.endsWith("Z");
}
function toISOorNull(ts){
  if (ts==null) return null;
  if (isISO(ts)) return ts;
  const d=new Date(ts);
  return isNaN(d.getTime())?null:d.toISOString();
}
function uniq(a){ return Array.from(new Set(a)); }
```

**Propósito:**
- `deepClone`: Clonación profunda (evita mutaciones)
- `toIntNZ`: Coerción a entero no-negativo (para counters)
- `isISO`/`toISOorNull`: Validación y normalización de timestamps ISO 8601
- `uniq`: Deduplicación de arrays

---

#### 2. Latest Timestamp Helper

```javascript
function latestISO(a,b){
  const A = a? new Date(a).getTime(): -Infinity;
  const B = b? new Date(b).getTime(): -Infinity;
  if (!isFinite(A) && !isFinite(B)) return null;
  return (B>=A ? b : a) || null;
}
```

**Propósito:** Retorna el timestamp más reciente entre dos valores ISO.

**Lógica:**
- Si ambos son null/inválidos → `null`
- Si solo uno es válido → ese
- Si ambos válidos → el más reciente (B >= A)

**Uso crítico:**
```javascript
// Cooldown: si baseline tiene 10:00 y LLM tiene 09:00, usar 10:00 (más reciente)
stateLLM.cooldowns.email_ask_ts = latestISO(stateBase.cooldowns.email_ask_ts, stateLLM.cooldowns.email_ask_ts);
```

---

#### 3. Path Helpers

```javascript
function getPath(o, path){
  const parts = path.split(".");
  let cur = o;
  for (const p of parts){
    if (cur==null || typeof cur!=="object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(o, path, val){
  const parts = path.split(".");
  let cur = o;
  for (let i=0;i<parts.length-1;i++){
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length-1]] = val;
}

function dotToJsonPointer(path){
  return "/"+path.split(".").map(encodeURIComponent).join("/");
}
```

**Propósito:**
- `getPath`: Accede a nested properties con dot notation (`"cooldowns.email_ask_ts"`)
- `setPath`: Escribe en nested properties (crea objetos intermedios si no existen)
- `dotToJsonPointer`: Convierte dot-path a JSON Pointer RFC6901 (`"cooldowns.email_ask_ts"` → `"/cooldowns/email_ask_ts"`)

**Uso:**
```javascript
getPath(state, "cooldowns.email_ask_ts"); // → "2025-10-31T14:16:42Z"
setPath(patch, "cooldowns.email_ask_ts", "2025-10-31T14:16:42Z"); // → patch.cooldowns.email_ask_ts = ...
dotToJsonPointer("cooldowns.email_ask_ts"); // → "/cooldowns/email_ask_ts" (para RFC6902)
```

---

#### 4. Array Comparison Helpers

```javascript
function arraysEqual(a,b){
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i=0;i<a.length;i++){ if (a[i] !== b[i]) return false; }
  return true;
}

function sortedStrings(arr){
  return uniq((arr||[]).filter(v => typeof v==="string").map(v => v.trim())).sort((a,b)=>a.localeCompare(b));
}

function stageIndex(stage, allowed){
  const i = allowed.indexOf(stage);
  return i<0? 0 : i;
}
```

**Propósito:**
- `arraysEqual`: Comparación estricta de arrays (orden importa)
- `sortedStrings`: Normaliza array de strings (trim + unique + sort)
- `stageIndex`: Retorna índice de stage en allowedStages (para comparar progresión)

---

#### 5. History Helper (Evidence)

```javascript
const NAME_ASK_PATTERNS = [
  /tu nombre/i,
  /c[oó]mo te llamas/i,
  /me podr[íi]as (decir|compartir) tu nombre/i,
  /nombre para comenzar/i
];

function lastAssistantAskName(history){
  let hit = null;
  for (const m of Array.isArray(history)?history:[]){
    if (m?.role === "assistant" && NAME_ASK_PATTERNS.some(rx => rx.test(m?.text || ""))){
      hit = { ts: m.ts || null, text: m.text || null };
    }
  }
  return hit;
}
```

**Propósito:** Encuentra última vez que assistant preguntó por nombre (para evidencia en patch_meta).

---

### Input Parsing (Líneas 101-120)

```javascript
const i = $json || {};
const profile      = deepClone(i.profile || {});
const stateLLM0    = deepClone(i.state   || {});
const stateBase0   = deepClone(i.state_base || null);
const agent_brief  = deepClone(i.agent_brief || {});
const options      = deepClone(i.options || {});
const history      = deepClone(i.history || i.smart_input?.history || i.base?.history || []);
const merge_key    = i.merge_key ?? stateLLM0.lead_id ?? profile.lead_id ?? null;

if (!stateLLM0) return [{ json: { ok:false, error:"BuildStatePatch: falta state (LLM)", input:i } }];
if (!stateBase0) {
  return [{
    json: {
      ok: true,
      merge_key,
      agent_brief,
      profile,
      state: stateLLM0,
      patch: {},
      json_patch: [],
      has_patch: false,
      changed_keys: [],
      // ... todos los flags en false
      patch_meta: { before:null, after:null, changed_keys:[], source:"llm", warning:"state_base no presente; patch vacío por seguridad.", evidence: null }
    }
  }];
}
```

**Lógica:**
1. Extrae todos los campos del input (profile, state, state_base, agent_brief, options, history)
2. **Validación:** Si falta `state` → error
3. **Fallback:** Si falta `state_base` → retorna patch vacío (por seguridad, no puede calcular diff)

**Nota importante:** El fallback con `state_base` null retorna `has_patch: false` - esto significa "no hubo cambios" o "no se puede determinar cambios". En producción, `state_base` siempre debería existir (viene de SnapshotBaseline).

---

### Immutables Protection (Líneas 121-125)

```javascript
const stateLLM  = deepClone(stateLLM0);
const stateBase = deepClone(stateBase0);

// Proteger inmutables con baseline
for (const k of IMMUTABLES){
  if (k in stateBase) stateLLM[k] = stateBase[k];
}
```

**Lógica:** Si el LLM modificó algún campo inmutable (lead_id, chatwoot_id, phone_number, country, tz, channel), **restaurar el valor desde baseline**.

**Propósito:** Última línea de defensa contra modificaciones accidentales de campos críticos.

**Ejemplo:**
```javascript
// LLM cambió lead_id por error
stateLLM.lead_id = 999; // ❌
stateBase.lead_id = 33;

// Corrección:
stateLLM.lead_id = stateBase.lead_id; // ✅ 33
```

---

### Normalizations (Líneas 126-210)

#### 1. Defaults & Enum Setup

```javascript
const allowedStages = Array.isArray(options.stage_allowed) && options.stage_allowed.length
  ? options.stage_allowed
  : ["explore","match","price","qualify","proposal_ready"];

const allowedInterests = Array.isArray(options.interests_allowed) && options.interests_allowed.length
  ? options.interests_allowed
  : ["Odoo","WhatsApp","CRM"];

if (!stateLLM.counters) stateLLM.counters = { services_seen:0, prices_asked:0, deep_interest:0 };
if (!stateBase.counters) stateBase.counters = { services_seen:0, prices_asked:0, deep_interest:0 };
```

---

#### 2. Monotonic Counters

```javascript
// Counters monótonos (no regresan)
stateLLM.counters.services_seen = Math.max(
  toIntNZ(stateBase.counters.services_seen,0),
  toIntNZ(stateLLM.counters.services_seen,0)
);
stateLLM.counters.prices_asked  = Math.max(
  toIntNZ(stateBase.counters.prices_asked,0),
  toIntNZ(stateLLM.counters.prices_asked,0)
);
stateLLM.counters.deep_interest = Math.max(
  toIntNZ(stateBase.counters.deep_interest,0),
  toIntNZ(stateLLM.counters.deep_interest,0)
);
```

**Lógica:** Counters son **monótonos** - siempre toman el valor máximo entre baseline y LLM.

**Casos:**
```javascript
// Caso 1: LLM incrementa counter (normal)
stateBase.counters.services_seen = 0;
stateLLM.counters.services_seen = 1;
→ max(0, 1) = 1 ✅

// Caso 2: LLM decrementa counter (error)
stateBase.counters.services_seen = 5;
stateLLM.counters.services_seen = 3; // ❌ LLM hizo regresión
→ max(5, 3) = 5 ✅ Corregido

// Caso 3: LLM no cambia counter
stateBase.counters.services_seen = 2;
stateLLM.counters.services_seen = 2;
→ max(2, 2) = 2 ✅
```

---

#### 3. Latest Timestamps

```javascript
if (!stateLLM.cooldowns) stateLLM.cooldowns = { email_ask_ts:null, addressee_ask_ts:null };
if (!stateBase.cooldowns) stateBase.cooldowns = { email_ask_ts:null, addressee_ask_ts:null };

// Cooldowns/timestamps → más reciente
stateLLM.cooldowns.email_ask_ts     = latestISO(
  toISOorNull(stateBase.cooldowns.email_ask_ts),
  toISOorNull(stateLLM.cooldowns.email_ask_ts)
);
stateLLM.cooldowns.addressee_ask_ts = latestISO(
  toISOorNull(stateBase.cooldowns.addressee_ask_ts),
  toISOorNull(stateLLM.cooldowns.addressee_ask_ts)
);
stateLLM.last_proposal_offer_ts = latestISO(
  toISOorNull(stateBase.last_proposal_offer_ts),
  toISOorNull(stateLLM.last_proposal_offer_ts)
);
```

**Lógica:** Timestamps siempre usan el **más reciente** (no se sobrescriben con valores antiguos).

**Casos:**
```javascript
// Caso 1: LLM actualiza timestamp (normal)
stateBase.cooldowns.email_ask_ts = "2025-10-31T10:00:00Z";
stateLLM.cooldowns.email_ask_ts = "2025-10-31T11:00:00Z";
→ latestISO(...) = "2025-10-31T11:00:00Z" ✅

// Caso 2: LLM tiene timestamp antiguo (error)
stateBase.cooldowns.email_ask_ts = "2025-10-31T11:00:00Z";
stateLLM.cooldowns.email_ask_ts = "2025-10-31T10:00:00Z"; // ❌ Antiguo
→ latestISO(...) = "2025-10-31T11:00:00Z" ✅ Usa baseline

// Caso 3: Solo baseline tiene timestamp
stateBase.cooldowns.email_ask_ts = "2025-10-31T10:00:00Z";
stateLLM.cooldowns.email_ask_ts = null;
→ latestISO(...) = "2025-10-31T10:00:00Z" ✅ Preserva baseline
```

---

#### 4. String Normalization

```javascript
// Strings
if (typeof stateLLM.business_name === "string"){
  stateLLM.business_name = stateLLM.business_name.trim();
  if (stateLLM.business_name === "") stateLLM.business_name = stateBase.business_name ?? null;
}
if (typeof stateLLM.email === "string"){
  const e = stateLLM.email.trim().toLowerCase();
  stateLLM.email = e || (stateBase.email ?? null);
}
```

**Lógica:**
- `business_name`: Trim, si queda vacío → usar baseline
- `email`: Trim + lowercase, si queda vacío → usar baseline

---

#### 5. Stage Anti-Regression

```javascript
// Stage enum + anti-regresión
if (!stateLLM.stage) stateLLM.stage = stateBase.stage || "explore";
if (!allowedStages.includes(stateLLM.stage)) stateLLM.stage = allowedStages[0];

const idxBase = stageIndex(stateBase.stage || "explore", allowedStages);
const idxNew  = stageIndex(stateLLM.stage, allowedStages);

if (idxNew < idxBase) {
  stateLLM.stage = stateBase.stage || stateLLM.stage; // nunca retrocede
}
```

**Lógica:**
1. Si stage falta o es inválido → usar baseline o "explore"
2. Si stage es inválido → usar primer stage permitido
3. **Anti-regresión:** Si idxNew < idxBase → restaurar baseline

**Casos:**
```javascript
// allowedStages = ["explore", "match", "price", "qualify", "proposal_ready"]

// Caso 1: Progresión válida
stageBase = "match" (idx=1)
stageLLM = "price" (idx=2)
→ 2 >= 1 → OK ✅

// Caso 2: Regresión inválida
stageBase = "price" (idx=2)
stageLLM = "match" (idx=1) // ❌ Retrocedió
→ 1 < 2 → restaurar baseline ("price") ✅

// Caso 3: Stage inválido
stageLLM = "invalid"
→ no está en allowedStages → usar "explore" ✅
```

---

#### 6. Interests Canonical Union

```javascript
// Interests: canónicos + unión con baseline para no perder nada
const baseInterests = sortedStrings(Array.isArray(stateBase.interests)? stateBase.interests: []);
let llmInterests    = sortedStrings(Array.isArray(stateLLM.interests)? stateLLM.interests: []);

// limitar a catálogo y unir con baseline
llmInterests = sortedStrings(
  uniq([...llmInterests, ...baseInterests])
    .filter(v => allowedInterests.includes(v))
);
stateLLM.interests = llmInterests;
```

**Lógica:**
1. Normalizar baseline interests (sort + unique)
2. Normalizar LLM interests (sort + unique)
3. **Unión** con baseline (nunca pierde interests)
4. **Filtrar** por catálogo permitido (solo Odoo, WhatsApp, CRM)
5. **Sort** final (orden alfabético)

**Casos:**
```javascript
// allowedInterests = ["Odoo", "WhatsApp", "CRM"]

// Caso 1: LLM añade interest
baseInterests = ["Odoo"]
llmInterests = ["Odoo", "WhatsApp"]
→ uniq([..., ...]) = ["Odoo", "WhatsApp"] ✅

// Caso 2: LLM elimina interest (preservado por unión)
baseInterests = ["Odoo", "WhatsApp"]
llmInterests = ["Odoo"] // ❌ Perdió WhatsApp
→ uniq([llm, base]) = ["Odoo", "WhatsApp"] ✅ Unión restaura

// Caso 3: LLM añade interest inválido
baseInterests = ["Odoo"]
llmInterests = ["Odoo", "InvalidInterest"]
→ filter(allowedInterests) = ["Odoo"] ✅ Invalid eliminado

// Caso 4: Orden normalizad
baseInterests = ["WhatsApp", "Odoo"]
llmInterests = ["CRM", "WhatsApp"]
→ sort() = ["CRM", "Odoo", "WhatsApp"] ✅ Alfabético
```

---

#### 7. Non-Regressive Flags

```javascript
// Flags no regresivos
if (stateBase.proposal_offer_done === true) {
  stateLLM.proposal_offer_done = true;
}
if (typeof stateBase.proposal_intent_confirmed === "boolean" ||
    typeof stateLLM.proposal_intent_confirmed === "boolean"){
  stateLLM.proposal_intent_confirmed = Boolean(
    stateBase.proposal_intent_confirmed ||
    stateLLM.proposal_intent_confirmed
  );
}
```

**Lógica:**
- `proposal_offer_done`: Si baseline es `true`, LLM **NO puede** ponerlo en `false` (flag permanente)
- `proposal_intent_confirmed`: Similar - una vez `true`, permanece `true`

**Casos:**
```javascript
// Caso 1: Flag activado en baseline
stateBase.proposal_offer_done = true;
stateLLM.proposal_offer_done = false; // ❌ LLM intenta desactivar
→ stateLLM.proposal_offer_done = true ✅ Forzar true

// Caso 2: LLM activa flag
stateBase.proposal_offer_done = false;
stateLLM.proposal_offer_done = true;
→ stateLLM.proposal_offer_done = true ✅ OK

// Caso 3: Ambos false
stateBase.proposal_offer_done = false;
stateLLM.proposal_offer_done = false;
→ stateLLM.proposal_offer_done = false ✅ OK
```

---

### Patch Construction (Líneas 211-285)

```javascript
const patch = {};
const json_patch = [];
const before = {};
const after  = {};

let stage_changed=false, email_changed=false, business_name_changed=false;
let counters_changed=false, cooldowns_changed=false, interests_changed=false, proposal_changed=false;

for (const path of PATCH_FIELDS){
  // si el path no existe en ninguno de los dos → saltar
  const existsInBase = getPath(stateBase, path) !== undefined;
  const existsInLLM  = getPath(stateLLM,  path) !== undefined;
  if (!existsInBase && !existsInLLM) continue;

  const bRaw = getPath(stateBase, path);
  const aRaw = getPath(stateLLM,  path);

  let b = bRaw;
  let a = aRaw;

  // Normalizaciones por tipo
  if (path.startsWith("counters.")) {
    b = toIntNZ(b,0);
    a = toIntNZ(a,0);
  }

  if (path === "interests") {
    const bArr = sortedStrings(Array.isArray(b) ? b : []);
    const aArr = sortedStrings(Array.isArray(a) ? a : []);
    if (!arraysEqual(bArr, aArr)) {
      setPath(patch, path, aArr);
      const op = (bRaw === undefined) ? "add" : "replace";
      json_patch.push({ op, path: dotToJsonPointer(path), value: aArr });
      setPath(before, path, bArr);
      setPath(after, path, aArr);
      interests_changed = true;
    }
    continue;
  }

  if (path.startsWith("cooldowns.")) {
    a = toISOorNull(a);
    b = toISOorNull(b);
  }
  if (path === "last_proposal_offer_ts") {
    a = toISOorNull(a);
    b = toISOorNull(b);
  }

  const changed = (a ?? null) !== (b ?? null);
  if (changed){
    setPath(patch, path, a);

    const op = (bRaw === undefined && a !== null) ? "add"
              : (a === null ? "remove" : "replace");

    const pointer = dotToJsonPointer(path);
    if (op === "remove") {
      json_patch.push({ op, path: pointer });
    } else {
      json_patch.push({ op, path: pointer, value: a });
    }

    setPath(before, path, b);
    setPath(after, path, a);

    // Change flags
    if (path === "stage") stage_changed = true;
    if (path === "email") email_changed = true;
    if (path === "business_name") business_name_changed = true;
    if (path.startsWith("counters.")) counters_changed = true;
    if (path.startsWith("cooldowns.")) cooldowns_changed = true;
    if (path === "proposal_offer_done" || path === "last_proposal_offer_ts" || path === "proposal_intent_confirmed") {
      proposal_changed = true;
    }
  }
}
```

**Lógica:**

1. **Loop sobre PATCH_FIELDS**: Para cada campo candidato a patch:
   - Verificar si existe en baseline o LLM (si no existe en ninguno, skip)
   - Extraer valores con `getPath()`
   - Normalizar según tipo (counters → int, timestamps → ISO, interests → sorted array)

2. **Comparación:**
   - Para `interests`: Comparar arrays con `arraysEqual()` (orden importa)
   - Para otros: Comparar valores con `(a ?? null) !== (b ?? null)`

3. **Generar patch si cambió:**
   - **Dot-path patch**: `setPath(patch, path, newValue)` → `{ "cooldowns.addressee_ask_ts": "..." }`
   - **RFC6902 JSON Patch**: `json_patch.push({ op: "replace", path: "/cooldowns/addressee_ask_ts", value: "..." })`
   - **Before/After**: Guarda valores old/new para auditoría
   - **Change flags**: Activa flag correspondiente (stage_changed, cooldowns_changed, etc.)

4. **Operation types (RFC6902):**
   - `"add"`: Campo no existía en baseline, ahora existe con valor no-null
   - `"replace"`: Campo existía en baseline, cambió valor
   - `"remove"`: Campo existía en baseline, ahora es null

---

### Output Assembly (Líneas 286-320)

```javascript
const changed_keys = Object.keys(patch).sort();
const has_patch = changed_keys.length > 0;
const touched_roots = uniq(changed_keys.map(k => k.split(".")[0]));
const has_funnel_changes = !!(stage_changed || counters_changed || interests_changed || proposal_changed);

// Evidencia enriquecida
const askHit = lastAssistantAskName(history);
const fallbackAskTs = getPath(stateLLM, "cooldowns.addressee_ask_ts") || null;
const evidence = {
  last_incoming: agent_brief?.last_incoming || null,
  intent: agent_brief?.intent || null,
  stage_before: getPath(stateBase, "stage"),
  stage_after: getPath(stateLLM, "stage"),
  assistant_ask_name_ts: askHit?.ts || fallbackAskTs || null,
  assistant_ask_name_text: askHit?.text || (fallbackAskTs ? "(inferred from cooldowns.addressee_ask_ts)" : null)
};

return [{
  json: {
    ok: true,
    merge_key,
    agent_brief,
    profile,            // baseline intacto
    state: stateLLM,    // normalizado + inmutables protegidos
    patch,              // dot-paths -> nuevo valor
    json_patch,         // RFC6902
    has_patch,
    changed_keys,
    touched_roots,
    stage_changed,
    email_changed,
    business_name_changed,
    counters_changed,
    cooldowns_changed,
    interests_changed,
    proposal_changed,
    has_funnel_changes,
    patch_meta: { before, after, changed_keys, source:"llm", warning:null, evidence }
  }
}];
```

**Campos output:**
- `patch`: Dot-path object (`{ "cooldowns.addressee_ask_ts": "..." }`)
- `json_patch`: Array RFC6902 (`[{ op: "replace", path: "/cooldowns/addressee_ask_ts", value: "..." }]`)
- `has_patch`: Boolean (true si hay cambios)
- `changed_keys`: Array de dot-paths modificados (`["cooldowns.addressee_ask_ts"]`)
- `touched_roots`: Array de root keys modificados (`["cooldowns"]`)
- `*_changed`: Flags booleanos por categoría
- `has_funnel_changes`: Boolean (true si cambió algo crítico del funnel: stage, counters, interests, proposal)
- `patch_meta`: Objeto con before/after, evidence, source

---

## Input

Input desde **HydrateStateAndContext (Node 45)**:

```json
{
  "profile": { "lead_id": 33, "full_name": "Felix Figueroa", ... },
  "state": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
    "cooldowns": { "email_ask_ts": null, "addressee_ask_ts": "2025-10-31T14:16:42.000Z" }
  },
  "state_base": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
    "cooldowns": { "email_ask_ts": null, "addressee_ask_ts": null }
  },
  "agent_brief": { ... },
  "options": { ... },
  "history": []
}
```

**Diferencia clave:**
- `state.cooldowns.addressee_ask_ts`: "2025-10-31T14:16:42Z" (actualizado por Filter Output)
- `state_base.cooldowns.addressee_ask_ts`: null (original)

---

## Output

Output del nodo:

```json
{
  "ok": true,
  "merge_key": 33,
  "agent_brief": { ... },
  "profile": { ... },
  "state": {
    "lead_id": 33,
    "stage": "explore",
    "counters": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
    "cooldowns": { "email_ask_ts": null, "addressee_ask_ts": "2025-10-31T14:16:42.000Z" }
  },
  "patch": {
    "cooldowns": {
      "addressee_ask_ts": "2025-10-31T14:16:42.000Z"
    }
  },
  "json_patch": [
    {
      "op": "replace",
      "path": "/cooldowns/addressee_ask_ts",
      "value": "2025-10-31T14:16:42.000Z"
    }
  ],
  "has_patch": true,
  "changed_keys": ["cooldowns.addressee_ask_ts"],
  "touched_roots": ["cooldowns"],
  "stage_changed": false,
  "email_changed": false,
  "business_name_changed": false,
  "counters_changed": false,
  "cooldowns_changed": true,
  "interests_changed": false,
  "proposal_changed": false,
  "has_funnel_changes": false,
  "patch_meta": {
    "before": {
      "cooldowns": { "addressee_ask_ts": null }
    },
    "after": {
      "cooldowns": { "addressee_ask_ts": "2025-10-31T14:16:42.000Z" }
    },
    "changed_keys": ["cooldowns.addressee_ask_ts"],
    "source": "llm",
    "warning": null,
    "evidence": {
      "last_incoming": {
        "role": "user",
        "text": "Si, claro me llamo Felix",
        "ts": "2025-10-31T18:59:47.000Z"
      },
      "intent": "contact_share",
      "stage_before": "explore",
      "stage_after": "explore",
      "assistant_ask_name_ts": "2025-10-31T14:16:42.000Z",
      "assistant_ask_name_text": "(inferred from cooldowns.addressee_ask_ts)"
    }
  }
}
```

**Análisis:**
- ✅ **1 cambio detectado**: `cooldowns.addressee_ask_ts` (null → "2025-10-31T14:16:42Z")
- ✅ **Patch generado** en 2 formatos (dot-path + RFC6902)
- ✅ **Flags activados**: `cooldowns_changed: true`, `has_funnel_changes: false`
- ✅ **Evidence**: Captura contexto (last_incoming, intent, assistant_ask_name_ts)

---

## Casos de Uso

(Continuaré con los casos de uso en el siguiente mensaje debido al límite de tokens)
