# Profile y State - Mapeo con Baserow

Este documento explica la relación entre la tabla **Leads** de Baserow y los objetos `profile` y `state` que usa el Master Agent v2.0.

---

## 📊 Tabla Baserow: Leads

### Campos Principales

| Campo Baserow | Tipo | Ejemplo | Descripción |
|---------------|------|---------|-------------|
| `id` | Number | `198` | Row ID (PK de Baserow) |
| `lead_id` | Number | `33` | ID del lead en Odoo CRM |
| `full_name` | Text | `"Felix Figueroa"` | Nombre completo del lead |
| `phone_number` | Text | `"+5491133851987"` | Teléfono (formato E.164) |
| `email` | Email | `null` o `"felix@example.com"` | Email del lead |
| `channel` | Single Select | `"whatsapp"` | Canal de comunicación |
| `country` | Single Select | `"Argentina"` | País del lead |
| `tz` | Text | `"-03:00"` | Timezone offset |
| `stage` | Single Select | `"qualify"` | Etapa del funnel |
| `priority` | Single Select | `"normal"` | Prioridad del lead |
| `services_seen` | Number | `1` | Contador: servicios vistos |
| `prices_asked` | Number | `1` | Contador: precios preguntados |
| `deep_interest` | Number | `2` | Contador: interés profundo |
| `proposal_offer_done` | Checkbox | `false` | Flag: propuesta ofrecida |
| `interests` | Multiple Select | `["CRM", "Odoo"]` | Servicios de interés |
| `chatwoot_id` | Number | `186` | ID en Chatwoot |
| `chatwoot_inbox_id` | Number | `186` | Inbox ID en Chatwoot |
| `conversation_id` | Number | `190` | Conversation ID |
| `last_message` | Text | `"Podemos agendar..."` | Último mensaje |
| `last_message_id` | Text | `"2724"` | ID último mensaje |
| `last_activity_iso` | Date | `"2025-11-01T04:55:53Z"` | Última actividad |
| `email_ask_ts` | Date | `null` o ISO string | Timestamp: preguntó email |
| `addressee_ask_ts` | Date | `"2025-10-31T14:16:42Z"` | Timestamp: preguntó nombre |

---

## 🔄 Transformación: Baserow Row → Profile

El nodo **ComposeProfile** transforma la row de Baserow en el objeto `profile`:

### Input (Baserow Row):
```json
{
  "id": 198,
  "lead_id": 33,
  "full_name": "Felix Figueroa",
  "phone_number": "+5491133851987",
  "email": null,
  "channel": { "value": "whatsapp" },
  "country": { "value": "Argentina" },
  "tz": "-03:00",
  "stage": { "value": "qualify" },
  "priority": { "value": "normal" },
  "services_seen": 1,
  "prices_asked": 1,
  "deep_interest": 2,
  "proposal_offer_done": false,
  "interests": [
    { "value": "CRM" },
    { "value": "Odoo" }
  ],
  "chatwoot_id": 186,
  "chatwoot_inbox_id": 186,
  "conversation_id": 190,
  "last_message": "Podemos agendar una demo",
  "last_message_id": "2724",
  "last_activity_iso": "2025-11-01T04:55:53.444000Z",
  "email_ask_ts": null,
  "addressee_ask_ts": "2025-10-31T14:16:42Z"
}
```

### Output (Profile):
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
    "stage": "qualify",
    "priority": "normal",
    "services_seen": 1,
    "prices_asked": 1,
    "deep_interest": 2,
    "proposal_offer_done": false,
    "interests": ["CRM", "Odoo"],
    "lead_id": 33,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "last_message": "Podemos agendar una demo",
    "last_message_id": "2724",
    "last_activity_iso": "2025-11-01T04:55:53.444000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": "2025-10-31T14:16:42Z"
  }
}
```

### Transformaciones Aplicadas:

1. **pickVal()**: Extrae `value` de objetos Baserow Single/Multiple Select
   - `{ "value": "whatsapp" }` → `"whatsapp"`
   - `[{ "value": "CRM" }]` → `["CRM"]`

2. **toNum()**: Convierte a número o null
   - `"33"` → `33`
   - `""` → `null`
   - `null` → `null`

3. **toInt0()**: Convierte a entero, default 0
   - `1` → `1`
   - `null` → `0`
   - `""` → `0`

4. **Renombres**:
   - `row.id` → `profile.row_id`
   - `row.phone_number` → `profile.phone`

---

## 🔄 Separación: Profile vs State

El Master Agent v2.0 usa dos objetos separados:

### 1. **Profile** (Metadata del Lead)

**Fuente**: ComposeProfile (row de Baserow)

**Campos**:
```javascript
{
  row_id: 198,              // Baserow row ID
  lead_id: 33,              // Odoo lead ID
  full_name: "Felix Figueroa",
  phone: "+5491133851987",
  email: null,
  channel: "whatsapp",
  country: "Argentina",
  tz: "-03:00",
  chatwoot_id: 186,
  chatwoot_inbox_id: 186,
  conversation_id: 190,
  last_message: "...",
  last_message_id: "2724",
  last_activity_iso: "2025-11-01T04:55:53Z"
}
```

**Características**:
- ✅ Metadata inmutable (país, teléfono, IDs)
- ✅ Metadata de infraestructura (Chatwoot, Odoo)
- ❌ **NO** incluye state del funnel

---

### 2. **State** (Estado del Funnel)

**Fuente**: BuildState o Smart Input

**Campos**:
```javascript
{
  lead_id: 33,
  stage: "qualify",         // explore → match → price → qualify → proposal_ready
  interests: ["CRM", "Odoo"],
  business_name: null,      // Extraído de conversación
  email: null,              // Actualizado cuando user lo provee
  counters: {
    services_seen: 1,
    prices_asked: 1,
    deep_interest: 2
  },
  cooldowns: {
    email_ask_ts: null,
    addressee_ask_ts: "2025-10-31T14:16:42Z"
  },
  last_proposal_offer_ts: null,
  proposal_offer_done: false
}
```

**Características**:
- ✅ State mutable del funnel (stage, interests)
- ✅ Counters monotónicos (nunca decrecen)
- ✅ Cooldowns para anti-loop
- ✅ Business context extraído de conversación

---

## 🔀 Flujo de Datos Completo

```
1. Webhook (Chatwoot)
   ↓
2. Get/Update Baserow Row
   ↓ (row con todos los campos)
3. ComposeProfile
   ↓ (profile object)
4. BuildState (merge profile + counters/cooldowns/flags)
   ↓ (state object)
5. HydrateForHistory
   ↓ (history + lead_id + profile + state)
6. INPUT-MAIN
   ↓ (smart_input con profile + state)
7. Master Agent v2.0 (LLM)
   ↓ (profile actualizado + state actualizado)
8. OUTPUT-MAIN-v2
   ↓ (profile_for_persist + state_for_persist)
9. StatePatchLead (Baserow Update)
   - Actualiza row con campos de state_for_persist
```

---

## 📝 BuildState: Profile → State

El nodo **BuildState** construye el objeto `state` a partir del `profile`:

```javascript
const state = {
  lead_id: profile.lead_id,
  stage: profile.stage || "explore",
  interests: profile.interests || [],
  business_name: null,  // Se extrae en conversación
  email: profile.email || null,
  counters: {
    services_seen: profile.services_seen || 0,
    prices_asked: profile.prices_asked || 0,
    deep_interest: profile.deep_interest || 0
  },
  cooldowns: {
    email_ask_ts: profile.email_ask_ts || null,
    addressee_ask_ts: profile.addressee_ask_ts || null
  },
  last_proposal_offer_ts: null,  // Se actualiza en conversación
  proposal_offer_done: profile.proposal_offer_done || false
};
```

**Campos que se copian de Profile**:
- `lead_id`
- `stage`
- `interests`
- `email`
- `services_seen`, `prices_asked`, `deep_interest` (counters)
- `email_ask_ts`, `addressee_ask_ts` (cooldowns)
- `proposal_offer_done`

**Campos que NO vienen de Profile**:
- `business_name` (extraído por LLM de conversación)
- `last_proposal_offer_ts` (actualizado cuando se ofrece propuesta)

---

## 🔄 StatePatchLead: State → Baserow

El nodo **StatePatchLead** (Node 53) actualiza Baserow con los campos de `state_for_persist`:

### Mapeo State → Baserow:

| Campo State | Campo Baserow | Tipo |
|-------------|---------------|------|
| `email` | `email` | Email |
| `business_name` | `business_name` | Text |
| `stage` | `stage` | Single Select |
| `counters.services_seen` | `services_seen` | Number |
| `counters.prices_asked` | `prices_asked` | Number |
| `counters.deep_interest` | `deep_interest` | Number |
| `interests` | `interests` | Multiple Select |
| `cooldowns.email_ask_ts` | `email_ask_ts` | Date |
| `cooldowns.addressee_ask_ts` | `addressee_ask_ts` | Date |
| `last_proposal_offer_ts` | `last_proposal_offer_ts` | Date |
| `proposal_offer_done` | `proposal_offer_done` | Checkbox |

**Config del Nodo**:
```
Resource: Row
Operation: Update
Row ID: {{ $json.profile_for_persist.row_id }}

Fields to Send:
  email: {{ $json.state_for_persist.email }}
  business_name: {{ $json.state_for_persist.business_name }}
  stage: {{ $json.state_for_persist.stage }}
  services_seen: {{ $json.state_for_persist.counters.services_seen }}
  prices_asked: {{ $json.state_for_persist.counters.prices_asked }}
  deep_interest: {{ $json.state_for_persist.counters.deep_interest }}
  interests: {{ $json.state_for_persist.interests }}
  email_ask_ts: {{ $json.state_for_persist.cooldowns.email_ask_ts }}
  addressee_ask_ts: {{ $json.state_for_persist.cooldowns.addressee_ask_ts }}
  last_proposal_offer_ts: {{ $json.state_for_persist.last_proposal_offer_ts }}
  proposal_offer_done: {{ $json.state_for_persist.proposal_offer_done }}
```

---

## 🔒 Campos Inmutables

Estos campos **NO** se modifican durante la conversación:

### En Profile:
- `row_id` (Baserow ID)
- `lead_id` (Odoo ID)
- `phone` (teléfono del lead)
- `channel` (canal de comunicación)
- `country` (país)
- `tz` (timezone)
- `chatwoot_id`, `chatwoot_inbox_id`, `conversation_id`

### En State:
- `lead_id` (siempre coincide con profile.lead_id)

---

## ✅ Campos Modificables

Estos campos **SÍ** se modifican durante la conversación:

### En Profile:
- `full_name` (si el usuario corrige su nombre)
- `email` (cuando el usuario lo provee)
- `last_message`, `last_message_id`, `last_activity_iso` (actualizados por webhook)

### En State:
- `stage` (progresa en el funnel)
- `interests` (se agregan servicios)
- `business_name` (extraído de conversación)
- `email` (cuando el usuario lo provee)
- `counters.*` (se incrementan, nunca decrecen)
- `cooldowns.*` (se actualizan cuando el agente pregunta)
- `last_proposal_offer_ts` (cuando se ofrece propuesta)
- `proposal_offer_done` (flag de propuesta)

---

## 📖 Ejemplo Completo: Conversación → Actualización

### Estado Inicial (Baserow):
```json
{
  "id": 198,
  "lead_id": 33,
  "full_name": "Felix Figueroa",
  "stage": "match",
  "interests": ["CRM"],
  "business_name": null,
  "deep_interest": 1,
  "email": null,
  "addressee_ask_ts": null
}
```

### Mensaje Usuario:
"Tengo 10 empleados en mi restaurante, necesito gestionar mejor el equipo!"

### Master Agent v2.0 Output:
```json
{
  "message": { "text": "Perfecto, con 10 empleados Odoo CRM..." },
  "state": {
    "lead_id": 33,
    "stage": "qualify",  // ✅ match → qualify
    "interests": ["CRM", "Odoo"],  // ✅ agregó Odoo
    "business_name": "restaurante",  // ✅ extraído
    "email": null,
    "counters": {
      "services_seen": 1,
      "prices_asked": 0,
      "deep_interest": 2  // ✅ +1
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "last_proposal_offer_ts": null,
    "proposal_offer_done": false
  }
}
```

### StatePatchLead → Baserow Update:
```json
{
  "id": 198,  // mismo row
  "stage": "qualify",  // ✅ actualizado
  "interests": ["CRM", "Odoo"],  // ✅ actualizado
  "business_name": "restaurante",  // ✅ actualizado
  "deep_interest": 2  // ✅ actualizado
}
```

---

## 🚨 Validaciones Importantes

### 1. Row ID Requerido

**StatePatchLead** necesita `profile_for_persist.row_id` para actualizar:

```javascript
if (!profile || !profile.row_id) {
  throw new Error('[OutputMain] Missing profile.row_id (required for StatePatchLead)');
}
```

### 2. Lead ID Consistencia

`lead_id` debe ser consistente entre `profile` y `state`:

```javascript
if (profile.lead_id !== state.lead_id) {
  console.warn('[Validation] lead_id mismatch between profile and state');
}
```

### 3. Counters Monotónicos

Los counters **nunca** deben decrecer:

```javascript
// En BuildStatePatch (Node 46)
state.counters.deep_interest = Math.max(
  stateBase.counters.deep_interest || 0,
  stateLLM.counters.deep_interest || 0
);
```

---

## 📚 Referencias

- **COMPOSE-PROFILE.js**: Transformación Baserow row → profile
- **INPUT-MAIN.js**: Construcción de Smart Input (profile + state)
- **OUTPUT-MAIN-v2.js**: Formateo para persistencia (profile_for_persist + state_for_persist)
- **StatePatchLead Doc**: `docs/53-state-patch-lead.md`
- **Baserow Schema**: `baserow-schema/README.md`

---

**Versión**: 2.0.0
**Última actualización**: 2025-11-01
