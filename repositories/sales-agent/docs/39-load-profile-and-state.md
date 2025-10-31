# Nodo 39: LoadProfileAndState

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | LoadProfileAndState |
| **Tipo** | Code (JavaScript) |
| **Función** | Cargar profile con fallbacks y generar state derivado |
| **Entrada** | Multiple sources: ComposeProfile, UpdateLeadWithRow_Id, $json |
| **Modo** | Run Once for All Items |
| **Ubicación** | Salida B de ComposeProfile (Node 35) |
| **Salidas** | 2 salidas (A y B) para diferentes flujos |

---

## Descripción

**LoadProfileAndState** es un nodo de la **Salida B** de ComposeProfile que carga el perfil del lead con **múltiples fallbacks** y genera un objeto `state` derivado optimizado para el **Agente Master**. Este nodo es equivalente a ComposeProfile (Node 35) pero con una arquitectura más robusta de fallbacks.

**IMPORTANTE:** Este nodo tiene **dos salidas (A y B)** que se dirigen a diferentes flujos de procesamiento.

Su función principal es:
1. **Intentar cargar profile** desde 3 fuentes en orden de prioridad
2. **Mapear datos de Baserow** si viene desde UpdateLeadWithRow_Id
3. **Generar objeto `state`** derivado con estructura optimizada
4. **Organizar datos** en categorías (counters, cooldowns)
5. **Aplicar defaults** para campos faltantes
6. **Preservar $json original** y agregar profile + state

**Diferencia con Node 35 (ComposeProfile):**
- **Node 35**: Single source (UpdateLeadWithRow_Id o createLeadBaserow)
- **Node 39**: Triple fallback (ComposeProfile → UpdateLeadWithRow_Id → $json)
- **Node 39**: Genera `state` adicional (estructura organizada para Agente Master)

---

## Configuración

### Settings

```yaml
Mode: Run Once for All Items
Language: JavaScript
```

---

## Input

El nodo puede recibir datos de **3 fuentes diferentes** (en orden de prioridad):

### Fuente 1: ComposeProfile (Node 35)
```javascript
$items('ComposeProfile', 0, 0)?.json?.profile
```

### Fuente 2: UpdateLeadWithRow_Id (Node 34)
```javascript
$items('UpdateLeadWithRow_Id', 0, 0)?.json
```

### Fuente 3: $json actual
```javascript
$json.profile
```

**Caso actual:** Usa Fuente 1 (ComposeProfile):
```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "lead_id": 33,
    "stage": "explore",
    "services_seen": 0,
    ...
  }
}
```

---

## Código

```javascript
// LoadProfileAndState (v2) — robusto con fallbacks a UpdateLeadWithRow_Id

function num(x, d=0){ const n = Number(x); return Number.isFinite(n) ? n : d; }
function nul(x){ return (x === '' || x === undefined) ? null : x; }
function val(v){ return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }

function mapBaserowRow(r){
  if (!r) return null;
  return {
    row_id: r.id ?? null,
    full_name: nul(r.full_name),
    phone: nul(r.phone_number),
    email: nul(r.email),
    channel: val(r.channel) || 'whatsapp',
    country: val(r.country) || null,
    tz: r.tz ?? '-03:00',
    stage: val(r.stage) || 'explore',
    priority: val(r.priority) || 'normal',

    services_seen: num(r.services_seen, 0),
    prices_asked:  num(r.prices_asked, 0),
    deep_interest: num(r.deep_interest, 0),
    proposal_offer_done: Boolean(r.proposal_offer_done),

    interests: Array.isArray(r.interests) ? r.interests : [],

    lead_id: r.lead_id ? Number(r.lead_id) : null,
    chatwoot_id: r.chatwoot_id ? Number(r.chatwoot_id) : null,
    chatwoot_inbox_id: r.chatwoot_inbox_id ? Number(r.chatwoot_inbox_id) : null,
    conversation_id: r.conversation_id ? Number(r.conversation_id) : null,

    last_message: nul(r.last_message),
    last_message_id: nul(r.last_message_id),
    last_activity_iso: nul(r.last_activity_iso),

    email_ask_ts: nul(r.email_ask_ts),
    addressee_ask_ts: nul(r.addressee_ask_ts),
  };
}

// 1) intentamos desde ComposeProfile
const fromCompose = $items('ComposeProfile', 0, 0)?.json?.profile;

// 2) si no, desde UpdateLeadWithRow_Id (row completo de Baserow)
const fromUpdateRow = $items('UpdateLeadWithRow_Id', 0, 0)?.json;
const mappedFromUpdate = mapBaserowRow(fromUpdateRow);

// 3) si no, usa lo que venga en este item
const fromCurrent = ($json.profile && Object.keys($json.profile).length) ? $json.profile : null;

const profile = fromCompose || mappedFromUpdate || fromCurrent || {};

// State derivado del profile (con defaults)
const state = {
  lead_id: profile.lead_id ?? null,
  chatwoot_id: profile.chatwoot_id ?? null,
  full_name: profile.full_name ?? null,
  business_name: profile.business_name ?? null,
  email: profile.email ?? null,
  phone_number: profile.phone ?? profile.phone_number ?? null,
  country: profile.country ?? null,
  tz: profile.tz ?? "-03:00",
  channel: profile.channel ?? "whatsapp",

  stage: profile.stage || "explore",
  interests: Array.isArray(profile.interests) ? profile.interests : [],
  last_proposal_offer_ts: profile.last_proposal_offer_ts ?? null,

  counters: {
    services_seen: num(profile.services_seen ?? profile.counters?.services_seen, 0),
    prices_asked:  num(profile.prices_asked  ?? profile.counters?.prices_asked, 0),
    deep_interest: num(profile.deep_interest ?? profile.counters?.deep_interest, 0),
  },
  cooldowns: {
    email_ask_ts:     profile.email_ask_ts     ?? profile.cooldowns?.email_ask_ts ?? null,
    addressee_ask_ts: profile.addressee_ask_ts ?? profile.cooldowns?.addressee_ask_ts ?? null,
  },

  proposal_offer_done: Boolean(profile.proposal_offer_done),
};

return [{ json: { ...$json, profile, state } }];
```

### Breakdown del Código

#### 1. Helper Functions

##### num()
```javascript
function num(x, d=0){ const n = Number(x); return Number.isFinite(n) ? n : d; }
```

**Propósito:** Convertir a número con default.

**Ejemplos:**
```javascript
num("5")      // → 5
num("abc")    // → 0 (default)
num(null, 10) // → 10 (default)
num(NaN)      // → 0 (default)
```

##### nul()
```javascript
function nul(x){ return (x === '' || x === undefined) ? null : x; }
```

**Propósito:** Normalizar empty string y undefined a null.

**Ejemplos:**
```javascript
nul("")        // → null
nul(undefined) // → null
nul(null)      // → null
nul("Felix")   // → "Felix"
nul(0)         // → 0 (no convierte)
```

##### val()
```javascript
function val(v){ return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }
```

**Propósito:** Extraer valor de SELECT fields de Baserow.

**Ejemplos:**
```javascript
val({ id: 3240, value: "Argentina", color: "cyan" })  // → "Argentina"
val("whatsapp")                                        // → "whatsapp"
val(null)                                              // → null
```

#### 2. mapBaserowRow()

```javascript
function mapBaserowRow(r){
  if (!r) return null;
  return {
    row_id: r.id ?? null,
    full_name: nul(r.full_name),
    phone: nul(r.phone_number),
    email: nul(r.email),
    channel: val(r.channel) || 'whatsapp',
    country: val(r.country) || null,
    tz: r.tz ?? '-03:00',
    stage: val(r.stage) || 'explore',
    priority: val(r.priority) || 'normal',

    services_seen: num(r.services_seen, 0),
    prices_asked:  num(r.prices_asked, 0),
    deep_interest: num(r.deep_interest, 0),
    proposal_offer_done: Boolean(r.proposal_offer_done),

    interests: Array.isArray(r.interests) ? r.interests : [],

    lead_id: r.lead_id ? Number(r.lead_id) : null,
    chatwoot_id: r.chatwoot_id ? Number(r.chatwoot_id) : null,
    chatwoot_inbox_id: r.chatwoot_inbox_id ? Number(r.chatwoot_inbox_id) : null,
    conversation_id: r.conversation_id ? Number(r.conversation_id) : null,

    last_message: nul(r.last_message),
    last_message_id: nul(r.last_message_id),
    last_activity_iso: nul(r.last_activity_iso),

    email_ask_ts: nul(r.email_ask_ts),
    addressee_ask_ts: nul(r.addressee_ask_ts),
  };
}
```

**Propósito:** Convertir row de Baserow (60+ campos) a estructura profile normalizada.

**Es idéntica a la función de Node 35 (ComposeProfile).**

#### 3. Triple Fallback Pattern

```javascript
// 1) intentamos desde ComposeProfile
const fromCompose = $items('ComposeProfile', 0, 0)?.json?.profile;

// 2) si no, desde UpdateLeadWithRow_Id (row completo de Baserow)
const fromUpdateRow = $items('UpdateLeadWithRow_Id', 0, 0)?.json;
const mappedFromUpdate = mapBaserowRow(fromUpdateRow);

// 3) si no, usa lo que venga en este item
const fromCurrent = ($json.profile && Object.keys($json.profile).length) ? $json.profile : null;

const profile = fromCompose || mappedFromUpdate || fromCurrent || {};
```

**Orden de prioridad:**
1. **fromCompose** (ideal): Profile ya normalizado de Node 35
2. **mappedFromUpdate** (fallback 1): Row crudo de Baserow → mapear
3. **fromCurrent** (fallback 2): Profile en $json actual
4. **{}** (fallback 3): Objeto vacío si todo falla

**¿Por qué 3 fallbacks?**

Robustez ante diferentes rutas de flujo:
- **Ruta A → B**: ComposeProfile (35) → RegisterMessage (36) → ... → LoadProfileAndState (39)
- **Ruta solo B**: ComposeProfile (35) → LoadProfileAndState (39) (directo)
- **Ruta alternativa**: UpdateLeadWithRow_Id (34) → LoadProfileAndState (39) (sin pasar por 35)

#### 4. Generación de State

```javascript
const state = {
  lead_id: profile.lead_id ?? null,
  chatwoot_id: profile.chatwoot_id ?? null,
  full_name: profile.full_name ?? null,
  business_name: profile.business_name ?? null,
  email: profile.email ?? null,
  phone_number: profile.phone ?? profile.phone_number ?? null,
  country: profile.country ?? null,
  tz: profile.tz ?? "-03:00",
  channel: profile.channel ?? "whatsapp",

  stage: profile.stage || "explore",
  interests: Array.isArray(profile.interests) ? profile.interests : [],
  last_proposal_offer_ts: profile.last_proposal_offer_ts ?? null,

  counters: {
    services_seen: num(profile.services_seen ?? profile.counters?.services_seen, 0),
    prices_asked:  num(profile.prices_asked  ?? profile.counters?.prices_asked, 0),
    deep_interest: num(profile.deep_interest ?? profile.counters?.deep_interest, 0),
  },
  cooldowns: {
    email_ask_ts:     profile.email_ask_ts     ?? profile.cooldowns?.email_ask_ts ?? null,
    addressee_ask_ts: profile.addressee_ask_ts ?? profile.cooldowns?.addressee_ask_ts ?? null,
  },

  proposal_offer_done: Boolean(profile.proposal_offer_done),
};
```

**Diferencias con profile:**
1. **Organización por categorías**: `counters`, `cooldowns` (estructura más semántica)
2. **Normalización de campos**: `profile.phone` → `state.phone_number`
3. **Fallbacks anidados**: `profile.phone ?? profile.phone_number`
4. **Defaults explícitos**: `stage || "explore"`, `tz ?? "-03:00"`

#### 5. Merge con $json Original

```javascript
return [{ json: { ...$json, profile, state } }];
```

**Output structure:**
```json
{
  ...($json original),
  "profile": {...},
  "state": {...}
}
```

**Ventaja:** Preserva cualquier dato que venía en $json (ej: event, history).

---

## Output

### Estructura de Salida

```json
[
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
]
```

### Comparación: profile vs state

| Campo | En profile | En state |
|-------|------------|----------|
| **phone** | `phone: "+549..."` | `phone_number: "+549..."` |
| **services_seen** | `services_seen: 0` | `counters.services_seen: 0` |
| **email_ask_ts** | `email_ask_ts: null` | `cooldowns.email_ask_ts: null` |
| **business_name** | ❌ No existe | `business_name: null` |
| **last_proposal_offer_ts** | ❌ No existe | `last_proposal_offer_ts: null` |

**¿Por qué duplicar datos?**

1. **profile**: Estructura plana idéntica a Baserow (para updates)
2. **state**: Estructura organizada para Agente Master (para decisiones)

---

## Diagrama de Flujo

```
Node 35: ComposeProfile
         │
         ├─> Salida A
         │   └─> (Nodos 36-38: Register + History)
         │
         └─> Salida B
             │
             v
       Node 39: LoadProfileAndState
             │
             ├─> 1. Intentar $items('ComposeProfile')
             │   ├─> Success? Use fromCompose
             │   └─> Fail? → Next fallback
             │
             ├─> 2. Intentar $items('UpdateLeadWithRow_Id')
             │   ├─> Success? Map + Use
             │   └─> Fail? → Next fallback
             │
             ├─> 3. Intentar $json.profile
             │   ├─> Success? Use fromCurrent
             │   └─> Fail? → Use {}
             │
             ├─> 4. Generar state derivado
             │   ├─> Reorganizar en counters
             │   ├─> Reorganizar en cooldowns
             │   └─> Normalizar field names
             │
             ├─> 5. Merge con $json original
             │
             v
       Output: { ...$json, profile, state }
             │
             v
       [Próximo nodo: Agente Master o Context Builder]
```

---

## Casos de Uso

### Caso 1: Flujo Normal (Ruta A → B)

**Path:**
```
Node 35 (ComposeProfile) → Node 36 (Register) → ... → Node 39 (LoadProfileAndState)
```

**Fallback usado:** `fromCompose` (prioridad 1)

**Resultado:** Profile ya normalizado, solo genera state.

### Caso 2: Flujo Directo (Ruta B)

**Path:**
```
Node 35 (ComposeProfile) → Node 39 (LoadProfileAndState)
```

**Fallback usado:** `fromCompose` (prioridad 1)

**Resultado:** Idéntico a Caso 1.

### Caso 3: Flujo Alternativo (Sin Node 35)

**Path:**
```
Node 34 (UpdateLeadWithRow_Id) → Node 39 (LoadProfileAndState)
```

**Fallback usado:** `mappedFromUpdate` (prioridad 2)

**Resultado:** Mapea row crudo de Baserow a profile normalizado.

### Caso 4: Fallback Total

**Path:** Node 39 ejecutado sin datos previos (caso edge).

**Fallback usado:** `fromCurrent` o `{}` (prioridad 3/4)

**Resultado:** State con todos los defaults.

---

## Ventajas de la Arquitectura

### 1. Triple Fallback = Robustez

```javascript
const profile = fromCompose || mappedFromUpdate || fromCurrent || {};
```

**Ventaja:** Nunca falla. Siempre devuelve un profile válido (aunque sea vacío).

**Escenario resiliente:**
- Si ComposeProfile falla → usa UpdateLeadWithRow_Id
- Si UpdateLeadWithRow_Id falla → usa $json
- Si todo falla → usa {} (objeto vacío con defaults)

### 2. Separación profile vs state

**profile:** Para writes (actualizar Baserow)
```javascript
// Estructura plana, field names exactos de Baserow
{
  "services_seen": 0,
  "email_ask_ts": null
}
```

**state:** Para reads (decisiones del Agente Master)
```javascript
// Estructura organizada, semántica clara
{
  "counters": { "services_seen": 0 },
  "cooldowns": { "email_ask_ts": null }
}
```

### 3. Compatibilidad con Múltiples Rutas

El nodo funciona correctamente en 3 rutas diferentes:
1. **A → B**: Node 35 → 36-38 → 39
2. **B directo**: Node 35 → 39
3. **Alternativa**: Node 34 → 39

### 4. Data Reintegration Pattern

```javascript
return [{ json: { ...$json, profile, state } }];
```

**Preserva:** Cualquier dato que venía en $json (ej: event, history, metadata).

**Agrega:** profile + state sin perder nada.

---

## Próximo Nodo Esperado

Después de LoadProfileAndState, el flujo probablemente continúa con:

1. **Merge con History** - Combinar state + history de Salida A
2. **Context Builder** - Preparar contexto completo para Agente Master
3. **Agente Master (GPT-4)** - Generar respuesta con RAG (Qdrant)
4. **Update State** - Actualizar counters/cooldowns según respuesta

---

## Mejoras Propuestas

### 1. Logging de Fallbacks

```javascript
let source = 'unknown';
const fromCompose = $items('ComposeProfile', 0, 0)?.json?.profile;
if (fromCompose) source = 'ComposeProfile';

const fromUpdateRow = $items('UpdateLeadWithRow_Id', 0, 0)?.json;
const mappedFromUpdate = mapBaserowRow(fromUpdateRow);
if (!fromCompose && mappedFromUpdate) source = 'UpdateLeadWithRow_Id (mapped)';

const fromCurrent = ($json.profile && Object.keys($json.profile).length) ? $json.profile : null;
if (!fromCompose && !mappedFromUpdate && fromCurrent) source = '$json.profile';

const profile = fromCompose || mappedFromUpdate || fromCurrent || {};
if (!fromCompose && !mappedFromUpdate && !fromCurrent) source = 'empty (all fallbacks failed)';

console.log('[LoadProfileAndState] Source:', source, 'row_id:', profile.row_id);
```

### 2. Validación de Profile

```javascript
const profile = fromCompose || mappedFromUpdate || fromCurrent || {};

if (!profile.lead_id || !profile.row_id) {
  console.warn('[LoadProfileAndState] Incomplete profile', {
    has_lead_id: !!profile.lead_id,
    has_row_id: !!profile.row_id,
    source
  });
}
```

### 3. State Versioning

```javascript
const state = {
  _version: "2.0",
  _generated_at: new Date().toISOString(),
  lead_id: profile.lead_id ?? null,
  ...
};
```

### 4. Computed Fields en State

```javascript
const state = {
  ...
  computed: {
    is_qualified: profile.services_seen > 2 && profile.prices_asked > 0,
    engagement_score: profile.services_seen + profile.prices_asked + profile.deep_interest,
    needs_followup: !profile.email && !profile.email_ask_ts,
    can_ask_email: !profile.email_ask_ts || (Date.now() - new Date(profile.email_ask_ts)) > 24*60*60*1000
  }
};
```

---

## Referencias

- **Node 34**: [UpdateLeadWithRow_Id](./34-update-lead-with-row-id.md) - Fuente de fallback 2
- **Node 35**: [ComposeProfile](./35-compose-profile.md) - Fuente de fallback 1 (función idéntica)

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Version**: v2 (con triple fallback)
- **Status**: ✅ Activo en producción
