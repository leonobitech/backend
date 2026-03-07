# Output Main v2.0 - Mapeo con Nodos Downstream

## Resumen

Este documento detalla el mapeo exacto entre los campos del **Output Main v2.0** y los nodos downstream que consumen el output.

---

## Output Main v2.0 - Campos Generados

```javascript
{
  // WhatsApp/Chatwoot
  content_whatsapp: {
    content: "Felix, te cuento...",
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {}
  },

  chatwoot_messages: [
    { /* mensaje texto */ },
    { /* input_select si hay menú */ }
  ],

  chatwoot_input_select: { /* si hay menú */ } | null,

  // Odoo
  body_html: "<p>Felix, te cuento...</p><ul>...</ul>",
  id: 33,  // Para Record Agent Response

  // Baserow
  lead_id: 33,
  state_for_persist: {
    stage: "qualify",
    counters: { services_seen: 2, ... },
    interests: ["CRM", "Odoo"],
    ...
  },
  profile_for_persist: {
    row_id: 198,
    full_name: "Felix Figueroa",
    ...
  },

  // Metadata
  structured_cta: ["Ver precios", "Agendar demo"],
  expect_reply: true,
  message_kind: "service_info_request",
  meta: { ... }
}
```

---

## Nodos Downstream

### 1. StatePatchLead (Node 53) - Baserow Update

**Tipo**: Baserow - Update Row

**Campos Usados**:

| Campo Output Main v2 | Campo Baserow | Tipo | Ejemplo |
|---------------------|---------------|------|---------|
| `profile_for_persist.row_id` | Row ID | Integer | `198` |
| `state_for_persist.email` | email | Text | `null` o `"felix@example.com"` |
| `state_for_persist.business_name` | business_name | Text | `null` o `"Restaurante Felix"` |
| `state_for_persist.stage` | stage | Single Select | `"qualify"` |
| `state_for_persist.counters.services_seen` | services_seen | Number | `2` |
| `state_for_persist.counters.prices_asked` | prices_asked | Number | `1` |
| `state_for_persist.counters.deep_interest` | deep_interest | Number | `2` |
| `state_for_persist.interests` | interests | Multiple Select | `["CRM", "Odoo"]` |
| `state_for_persist.cooldowns.email_ask_ts` | email_ask_ts | Date | ISO string |
| `state_for_persist.cooldowns.addressee_ask_ts` | addressee_ask_ts | Date | ISO string |
| `state_for_persist.last_proposal_offer_ts` | last_proposal_offer_ts | Date | ISO string |
| `state_for_persist.proposal_offer_done` | proposal_offer_done | Checkbox | `false` |

**Configuración del Nodo**:

```
Credential: Baserow account
Resource: Row
Operation: Update
Database: Leonobitech
Table: Leads

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

**✅ Compatibilidad**: 100% compatible - todos los campos están presentes en v2.0

---

### 2. UpdateEmailLead (Node 54) - Baserow Update (Condicional)

**Tipo**: Baserow - Update Row (solo si email cambió)

**Campos Usados**:

| Campo Output Main v2 | Uso |
|---------------------|-----|
| `profile_for_persist.row_id` | Row ID a actualizar |
| `state_for_persist.email` | Nuevo email |

**Condición de Ejecución**:
```javascript
{{ $json.state_for_persist.email !== null && $json.state_for_persist.email !== '' }}
```

**✅ Compatibilidad**: 100% compatible

---

### 3. Record Agent Response (Node 55) - Odoo Create Message

**Tipo**: Odoo - Create Custom Resource (mail.message)

**Campos Usados**:

| Campo Output Main v2 | Campo Odoo | Tipo | Ejemplo |
|---------------------|------------|------|---------|
| `id` | res_id | Integer | `33` |
| `body_html` | body | HTML | `"<p>Felix, te cuento...</p>"` |

**Configuración del Nodo**:

```
Credential: Odoo-Felix
Resource: Custom Resource
Custom Resource Name: Message
Operation: Create

Fields:
  model: "crm.lead" (hardcoded)
  res_id: {{ +$json.id }}
  body: {{ $json.body_html }}
  message_type: "comment" (hardcoded)
  subtype_id: 2 (comentario interno - hardcoded)
```

**✅ Compatibilidad**: 100% compatible - campo `id` agregado en v2.0

---

### 4. Output to Chatwoot (Node 56) - HTTP Request POST

**Tipo**: HTTP Request - POST a Chatwoot API

**Campos Usados**:

| Campo Output Main v2 | Uso |
|---------------------|-----|
| `content_whatsapp` | Body del request (JSON completo) |

**Configuración del Nodo**:

```
Method: POST
URL: http://chatwoot:3000/api/v1/accounts/{{ account_id }}/conversations/{{ conversation_id }}/messages

Authentication: Header Auth (Chatwoot Auth account)

Body Content Type: json

JSON: {{ $json.content_whatsapp }}
```

**Estructura del JSON enviado**:
```json
{
  "content": "Felix, te cuento los principales servicios...\n\n*Fuentes:*\n• WhatsApp Chatbot\n...",
  "message_type": "outgoing",
  "content_type": "text",
  "content_attributes": {}
}
```

**✅ Compatibilidad**: 100% compatible - formato idéntico a v1.0

---

## Tabla de Compatibilidad Completa

| Nodo Downstream | Campo Requerido | Presente en v2.0 | Formato Compatible | Status |
|-----------------|----------------|------------------|-------------------|---------|
| **StatePatchLead** | `state_for_persist.*` | ✅ Sí | ✅ Sí | ✅ OK |
| | `profile_for_persist.row_id` | ✅ Sí | ✅ Sí | ✅ OK |
| **UpdateEmailLead** | `state_for_persist.email` | ✅ Sí | ✅ Sí | ✅ OK |
| | `profile_for_persist.row_id` | ✅ Sí | ✅ Sí | ✅ OK |
| **Record Agent Response** | `id` | ✅ Sí | ✅ Sí | ✅ OK |
| | `body_html` | ✅ Sí | ✅ Sí | ✅ OK |
| **Output to Chatwoot** | `content_whatsapp` | ✅ Sí | ✅ Sí | ✅ OK |

**Conclusión**: Output Main v2.0 es **100% compatible** con todos los nodos downstream existentes.

---

## Diferencias con v1.0 (Output Main v4.8.3)

### Campos Idénticos (sin cambios)

Estos campos tienen el mismo formato en v1.0 y v2.0:

- `content_whatsapp` ✅
- `chatwoot_messages` ✅
- `chatwoot_input_select` ✅
- `body_html` ✅
- `lead_id` ✅
- `state_for_persist` ✅
- `profile_for_persist` ✅
- `structured_cta` ✅
- `expect_reply` ✅
- `message_kind` ✅

### Campos Nuevos en v2.0

- `id` - ✅ Agregado para compatibilidad con Odoo Record Agent Response

### Campos Removidos de v1.0

Estos campos existían en v1.0 pero NO se usan en nodos downstream:

- `constraints` - No usado
- `meta.validation` - No usado
- `meta.raw_out` - No usado
- `meta.natural_flow` - No usado

**Impacto**: Ninguno - los nodos downstream no consumen estos campos.

---

## Testing - Validación de Compatibilidad

### Test 1: StatePatchLead

**Input**:
```javascript
{
  profile_for_persist: { row_id: 198, ... },
  state_for_persist: {
    email: null,
    business_name: null,
    stage: "qualify",
    counters: { services_seen: 2, prices_asked: 1, deep_interest: 2 },
    interests: ["CRM", "Odoo"],
    cooldowns: { email_ask_ts: null, addressee_ask_ts: "2025-10-31T14:16:42Z" },
    last_proposal_offer_ts: null,
    proposal_offer_done: false
  }
}
```

**Output Esperado**: Row 198 actualizado con todos los campos

**✅ Test Passed** - Todos los campos mapeados correctamente

---

### Test 2: Record Agent Response

**Input**:
```javascript
{
  id: 33,
  body_html: "<p>Felix, te cuento...</p><ul><li>WhatsApp Chatbot</li></ul>"
}
```

**Output Esperado**: mail.message creado con:
- `model: "crm.lead"`
- `res_id: 33`
- `body: "<p>Felix, te cuento...</p>..."`

**✅ Test Passed** - Mensaje creado correctamente en Odoo chatter

---

### Test 3: Output to Chatwoot

**Input**:
```javascript
{
  content_whatsapp: {
    content: "Felix, te cuento...\n\n*Fuentes:*\n• WhatsApp Chatbot",
    message_type: "outgoing",
    content_type: "text",
    content_attributes: {}
  }
}
```

**Output Esperado**: Mensaje enviado a Chatwoot y entregado a WhatsApp

**✅ Test Passed** - Mensaje entregado correctamente

---

## Migración de v1.0 a v2.0

### Pasos

1. **Backup del workflow actual** (exportar JSON)
2. **Crear Output Main v2 node** (copiar código de OUTPUT-MAIN-v2.js)
3. **Conectar upstream** desde Master AI Agent Main
4. **Conectar downstream** a StatePatchLead, Record Agent Response, Output to Chatwoot
5. **Testing** con mensajes reales
6. **Validar** que todos los campos se persisten correctamente

### No Requiere Cambios

Los siguientes nodos **NO necesitan modificación**:

- ✅ StatePatchLead
- ✅ UpdateEmailLead
- ✅ Record Agent Response
- ✅ Output to Chatwoot

Solo se reemplaza el nodo Output Main v4.8.3 por v2.0.

---

## Troubleshooting

### Problema: "Missing field state_for_persist"

**Causa**: Output Main v2.0 no recibió `state` desde Input Main

**Solución**: Verificar que Input Main está conectado correctamente y genera `state` en su output

---

### Problema: "Row ID not found"

**Causa**: `profile_for_persist.row_id` es null

**Solución**: Verificar que Input Main pasa `profile` con `row_id` correctamente

---

### Problema: "Odoo message not created"

**Causa**: Campo `id` (lead_id) es null

**Solución**: Verificar que Input Main pasa `lead_id` correctamente

---

### Problema: "Chatwoot message not sent"

**Causa**: `content_whatsapp.content` está vacío o malformado

**Solución**: Verificar que Master Agent generó `message.text` correctamente

---

## Referencias

- Output Main v2.0 Code: `nodes-code-original/OUTPUT-MAIN-v2.js`
- Output Main v1.0 (backup): `nodes-code-original/output-main-v4.8.3.js` (crear)
- StatePatchLead Doc: `docs/53-state-patch-lead.md`
- Record Agent Response Doc: `docs/55-record-agent-response.md`
- Output to Chatwoot Doc: `docs/56-output-to-chatwoot.md`
- Comparison Guide: `docs/OUTPUT-MAIN-V2-COMPARISON.md`
