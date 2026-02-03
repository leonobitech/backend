# Baserow Schema Documentation

Este directorio contiene **backups de las tablas de Baserow** que almacenan el estado persistente del Sales Agent.

## Propósito

- Documentar la estructura de datos del sistema
- Preservar el esquema para referencia y disaster recovery
- Facilitar comprensión del flujo de datos: Chatwoot → n8n → Baserow → n8n
- Servir como fuente de verdad para validación de cambios en los nodos

---

## Tablas

### 1. Leads Table (`leads-table.csv`)

**Descripción**: Almacena el estado de cada lead/conversación activa. Es la tabla central que los nodos n8n consultan y actualizan en cada mensaje.

**Total Campos**: 29 columnas

#### Campos de Identificación

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer | ID autoincremental de Baserow (PK) |
| `lead_id` | UUID | ID único generado por el sistema (internal_uid) |
| `chatwoot_id` | Integer | Contact ID de Chatwoot |
| `chatwoot_inbox_id` | Integer | Inbox ID de Chatwoot (WhatsApp inbox) |
| `conversation_id` | Integer | Conversation ID activa en Chatwoot |
| `internal_uid` | UUID | Alias de lead_id (redundante, legacy) |

#### Datos del Contacto

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `full_name` | String | Nombre completo del lead |
| `phone_number` | String | Teléfono en formato E.164 (+5491133851987) |
| `email` | String/NULL | Email del lead (capturado durante conversación) |
| `business_name` | String/NULL | Nombre del negocio (si aplica) |

#### Metadatos de Contexto

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `country` | String | País del lead (Argentina, Mexico, etc.) |
| `tz` | String | Timezone offset (-03:00, -05:00, etc.) |
| `channel` | Enum | Canal de origen: whatsapp, telegram, etc. |
| `priority` | Enum | Prioridad: normal, high, urgent |

#### Historial de Actividad

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `first_interaction` | String | Timestamp primer mensaje (local time) |
| `first_interaction_utc` | String | Timestamp primer mensaje (UTC) |
| `last_message` | String | Texto del último mensaje recibido |
| `last_message_id` | Integer | ID del último mensaje en Chatwoot |
| `last_activity_iso` | ISO8601 | Timestamp última actividad (formato ISO) |

#### Estado del Funnel (Stage System)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `stage` | Enum | explore → match → price → qualify → proposal_ready |

**Reglas de Stage**:
- **explore**: Lead recién llegó, explorando opciones
- **match**: Lead mostró interés en servicios específicos
- **price**: Lead preguntó por precios o mostró señales de compra
- **qualify**: Lead calificado (email + business context + interés claro)
- **proposal_ready**: Lead listo para recibir propuesta formal

**Anti-regresión**: El stage nunca retrocede (enforced por BuildStatePatch node #46)

#### Contadores Monótonos (Counters)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `services_seen` | Integer | Cuántos servicios ha visto/mencionado |
| `prices_asked` | Integer | Cuántas veces ha preguntado por precios |
| `deep_interest` | Integer | Cuántas veces mostró interés profundo |

**Reglas de Counters**:
- Monótonos: solo incrementan, nunca disminuyen
- Enforced por BuildStatePatch (Node #46) con `Math.max(base, llm)`
- Usados por FlagsAnalyzer (Node #48) para decisiones de flujo

#### Intereses (Interests)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `interests` | String (CSV) | Lista de intereses separados por comas: "CRM,Odoo,WhatsApp" |

**Catálogo Permitido**: Odoo, WhatsApp, CRM, Voz, Automatización, Analytics, Reservas, Knowledge Base

**Reglas de Interests**:
- Canónicos: union(baseline, llm) sin perder intereses previos
- Filtrados por catálogo permitido
- Enforced por BuildStatePatch (Node #46)

#### Flags y Milestones

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `proposal_offer_done` | Boolean | ¿Ya se ofreció enviar propuesta formal? |

**Reglas**:
- No regresivo: una vez `true`, no vuelve a `false`
- Enforced por BuildStatePatch

#### Cooldowns (Anti-Spam)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `email_ask_ts` | ISO8601/NULL | Timestamp de cuándo se preguntó por email |
| `addressee_ask_ts` | ISO8601/NULL | Timestamp de cuándo se preguntó por nombre |

**Propósito**: Evitar re-preguntar información ya solicitada dentro de un periodo.

**Sistema de Email Gating** (7 condiciones en FlagsAnalyzer Node #48):
1. Email no capturado aún (`!email`)
2. Stage >= "price" (mostró señales de compra)
3. No se preguntó recientemente (`!emailAskedRecently`)
4. No estamos en soft-close de usuario
5. Counters de engagement suficientes
6. Intent no es "chit-chat" o "out-of-scope"
7. Usuario mostró interés serio (deep_interest >= 1)

#### Integración con Odoo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Odoo info` | String/NULL | Metadata de sincronización con Odoo CRM |

#### Notas

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `notes` | String/NULL | Notas internas del agente o humanos |

---

### 2. Services Table (`services-table.csv`)

**Descripción**: Catálogo de servicios de Leonobitech con metadata para personalización y RAG.

**Total Campos**: 21 columnas
**Total Servicios**: 12 activos

#### Identificación

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer | ID autoincremental de Baserow (PK) |
| `ServiceId` | String | ID único del servicio (svc-whatsapp-chatbot, etc.) |
| `Slug` | String | Slug URL-friendly (whatsapp-chatbot) |

#### Información Básica

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Name` | String | Nombre comercial del servicio |
| `Category` | Enum | Chatbots, Voice, Automations, Integrations |
| `Description` | String | Descripción corta (1-2 líneas) |

#### Contenido para RAG

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `KeyFeatures` | String (CSV) | Features clave separados por ; (captura de leads; respuestas rápidas; etc.) |
| `UseCases` | String | Casos de uso específicos por industria |
| `Audience` | String | Target audience (PYMES, retail, clínicas, etc.) |
| `Differentiators` | String | Diferenciadores vs competencia |

**Uso en RAG**: Estos campos alimentan los `rag_hints` en Node #50 (Master Agent) para personalización por industria.

#### Pricing

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `PricingModel` | Enum | Mensual, Proyecto, Por uso |
| `StartingPrice` | Integer | Precio inicial en USD (sin centavos) |
| `SLA_Tier` | Enum | Basic, Pro, Enterprise |

**Política de Precios**:
- Precios transparentes en respuestas solo si `flags.allow_price_mention === true`
- FlagsAnalyzer (Node #48) decide cuándo permitir mencionar precios
- Master Agent (Node #50) formatea precios según policy

#### Internacionalización

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Languages` | String (CSV) | Idiomas soportados: "ES,EN" |

#### Integraciones

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Integrations` | String (CSV) | Plataformas con las que integra: "Odoo,Chatwoot,n8n,WhatsApp Business" |

**Uso**: Para matching cuando lead menciona plataformas específicas.

#### Metadata Operativa

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Status` | Enum | Active, Beta, Deprecated |
| `Owner` | String | Responsable del servicio (Felix) |
| `UpdatedAt` | String | Última actualización (formato: DD/MM/YYYY HH:MM) |
| `SchemaV` | Integer | Versión del schema (para migraciones) |

#### SEO y Marketing

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Tags` | String (CSV) | Tags para búsqueda: "whatsapp,pedidos,faq,reservas" |
| `PublicURL` | String | URL de landing page del servicio |

---

## Relaciones Entre Tablas

```
Leads Table                    Services Table
┌─────────────┐               ┌──────────────┐
│ interests   │──────────────>│ Category     │
│ (CSV)       │  matching     │ Name         │
└─────────────┘               │ ServiceId    │
                              └──────────────┘
```

**Flujo de Matching**:
1. User menciona: "necesito automatizar WhatsApp"
2. LLM Analyst (Node #42) extrae interests: ["WhatsApp"]
3. BuildStatePatch (Node #46) actualiza `leads.interests`
4. RAG system consulta `services` con filtro por Category/Tags/Name
5. Master Agent (Node #50) recibe `rag_hints` con servicios relevantes
6. Response incluye servicios personalizados para el lead

---

## Flujo de Datos Completo

```
┌──────────────┐
│  Chatwoot    │ Incoming WhatsApp message
│  (Webhook)   │
└──────┬───────┘
       │
       v
┌──────────────────────────────────────────────────────┐
│              n8n Sales Agent Workflow                │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. Chat History Filter (Node #38)                  │
│     └─> Fetch history from Chatwoot API             │
│                                                      │
│  2. Smart Input (Node #41)                          │
│     └─> Build context for LLM Analyst               │
│                                                      │
│  3. Baserow GET (profile/state_base) ───────────┐   │
│     └─> SELECT * FROM leads WHERE lead_id=X     │   │
│                                                 │   │
│  4. Chat History Processor (Node #42)           │   │
│     └─> LLM Analyst: extract intent + state    │   │
│                                                 │   │
│  5. BuildStatePatch (Node #46) <────────────────┘   │
│     └─> Diff(state_base, state_llm)                │
│     └─> Enforce monotonicidad + anti-regresión     │
│                                                      │
│  6. FlagsAnalyzer (Node #48)                        │
│     └─> Decide: purpose, message_kind, guardrails  │
│                                                      │
│  7. Master Agent (Node #50)                         │
│     └─> Query Services table for RAG hints ─────┐  │
│     └─> Generate response with personalization  │  │
│                                                  │  │
│  8. Output Main (Node #51)                       │  │
│     └─> Render final message + menu             │  │
│                                                  │  │
│  9. Baserow PATCH ───────────────────────────────┘  │
│     └─> UPDATE leads SET ... WHERE lead_id=X       │
│                                                      │
│ 10. Chatwoot Send Message                           │
│     └─> POST /api/v1/accounts/.../messages          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Inmutables Protegidos

Campos que **NUNCA** se sobrescriben por LLM (enforced en BuildStatePatch Node #46):

```javascript
const IMMUTABLES = [
  "lead_id",
  "chatwoot_id",
  "phone_number",
  "country",
  "tz",
  "channel"
];
```

**Razón**: Estos campos son asignados por sistemas externos (Chatwoot, UUID generator) y no deben mutarse durante la conversación.

---

## Estado Actual del Sistema

### Leads Table
- **Total Leads**: 1 lead activo
- **Lead de Prueba**: Felix Figueroa (+5491133851987)
  - Stage: `qualify`
  - Interests: `CRM,Odoo`
  - Counters: services_seen=1, prices_asked=1, deep_interest=2
  - Email: No capturado aún
  - Business: No capturado aún
  - Last message: "Tengo 10 empleados, necesito gestionar mejor el equipo!"

### Services Table
- **Total Servicios**: 12 activos
- **Categorías**:
  - Chatbots: 3 servicios
  - Voice: 1 servicio
  - Automations: 2 servicios
  - Integrations: 6 servicios
- **Pricing Range**: $39/mo (Webhook Guard) → $3000/proyecto (Platform Core)
- **Integración Universal**: Todos integran con n8n, Odoo, Chatwoot

---

## Validación de Schema

### Leads Table - Constraints Esperados

```javascript
// Stage progression (no regression)
const ALLOWED_STAGES = ["explore", "match", "price", "qualify", "proposal_ready"];
const stageIndex = ALLOWED_STAGES.indexOf(currentStage);
// newStage index must be >= stageIndex

// Counters (monotonic)
assert(newCounters.services_seen >= oldCounters.services_seen);
assert(newCounters.prices_asked >= oldCounters.prices_asked);
assert(newCounters.deep_interest >= oldCounters.deep_interest);

// Interests (canonical union)
assert(newInterests.length >= oldInterests.length);
// oldInterests should be subset of newInterests

// Cooldowns (latest timestamp)
if (oldCooldown && newCooldown) {
  assert(new Date(newCooldown) >= new Date(oldCooldown));
}
```

### Services Table - Constraints Esperados

```javascript
// ServiceId uniqueness
assert(serviceIds.length === new Set(serviceIds).size);

// Status enum
const ALLOWED_STATUS = ["Active", "Beta", "Deprecated"];
assert(ALLOWED_STATUS.includes(service.Status));

// Pricing model enum
const ALLOWED_PRICING = ["Mensual", "Proyecto", "Por uso"];
assert(ALLOWED_PRICING.includes(service.PricingModel));

// Languages format
assert(/^[A-Z]{2}(,[A-Z]{2})*$/.test(service.Languages)); // "ES,EN"
```

---

## Uso en Testing y Debugging

### Verificar State Consistency

```bash
# Leer estado actual del lead de prueba
grep "Felix Figueroa" leads-table.csv

# Verificar counters después de cada mensaje
# Expected: monotonic increase only
```

### Verificar Services Catalog

```bash
# Listar todos los ServiceIds
tail -n +2 services-table.csv | cut -d',' -f2 | sort

# Buscar servicios por categoría
grep "Chatbots" services-table.csv
```

### Reproducir Bugs

Para reproducir bugs documentados en AGENT-TESTING-LOG.md:

1. Restaurar lead a estado específico (stage, counters)
2. Enviar mensaje problema
3. Comparar `state_base` vs `state_llm` en BuildStatePatch output
4. Verificar si patch es correcto según reglas de monotonicidad

---

## Referencias

- **Testing Log**: `../docs/AGENT-TESTING-LOG.md`
- **Node Backups**: `../nodes-code-original/`
- **Workflow Docs**: `../docs/`
- **Baserow Production**: https://baserow.leonobitech.com

---

**Última actualización**: 2025-11-01
**Mantenido por**: Felix Figueroa + Claude Code
**Backup Date**: 2025-11-01 (export from Baserow Production)
