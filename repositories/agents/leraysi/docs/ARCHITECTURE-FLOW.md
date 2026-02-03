# Sales Agent Workflow - Arquitectura de Flujos

## Metadata

| Campo | Valor |
|-------|-------|
| **Fecha** | 2025-10-31 |
| **Versión** | 1.0 |
| **Total nodos** | 48 nodos documentados |
| **Patrones principales** | Fork-Join, Snapshot-Diff-Patch, Buffer-Window |

---

## Resumen Ejecutivo

El workflow del Sales Agent procesa mensajes de WhatsApp en **5 etapas principales**:

1. ✅ **Filter Process** (Nodos 1-5) - Early-exit filters
2. ✅ **Buffer Messages** (Nodos 6-17) - Message aggregation con window de 30s
3. ✅ **Register Leads** (Nodos 18-40) - Create/Update en Baserow + Odoo
4. ✅ **Analysis + FLAGS ZONE** (Nodos 41-48) - LLM Analyst + Decision making
5. ⏳ **Master Agent** (Pendiente) - Response generation con RAG

**Patrón arquitectónico principal**: **Fork-Join** con análisis LLM paralelo a snapshot de estado.

---

## Arquitectura Completa

### Flujo General (High-Level)

```
WhatsApp Message
    ↓
ETAPA 1: Filter Process (5 filtros secuenciales)
    ↓
ETAPA 2: Buffer Messages (30s window + transform pipeline)
    ↓
ETAPA 3: Register Leads (Create OR Update flow)
    ↓
    ┌──────────────────────────────────────────────┐
    │  ETAPA 4: Analysis + State Management        │
    │                                              │
    │  PREPROCESSING:                              │
    │  - Compose Profile (profile + state base)    │
    │  - Snapshot state inmutable                  │
    │  - Prepare history + context                 │
    │                                              │
    │  FORK-JOIN PATTERN:                          │
    │  ┌─────────────────┐  ┌──────────────────┐  │
    │  │ Analysis Flow   │  │ Snapshot Flow    │  │
    │  │ (LLM Analyst)   │  │ (state_base)     │  │
    │  └────────┬────────┘  └────────┬─────────┘  │
    │           └────────┬────────────┘            │
    │                    ↓                         │
    │            MERGE POINT (Node 45)             │
    │                    ↓                         │
    │  FLAGS ZONE:                                 │
    │  - BuildStatePatch (diff calculation)        │
    │  - BuildFlagsInput (recency + cooldowns)     │
    │  - FlagsAnalyzer (decision making)           │
    └──────────────────────────────────────────────┘
    ↓
ETAPA 5: Master Agent (Response generation + RAG)
    ↓
WhatsApp Response
```

---

## ETAPA 4 - Análisis Detallado (Fork-Join Pattern)

### PREPROCESSING (antes del Fork)

**Nodos 33-35**: Preparación de datos base desde Baserow

```
UpdatePayload (33) [Prepara datos para actualizar Baserow]
    ↓
UpdateLeadWithRow_Id (34) [Baserow UPDATE - actualiza last_message, last_activity]
    ↓
ComposeProfile (35) [Convierte Baserow row → {profile, state}]
    │
    ├─→ Salida A: Register + History Flow
    │       ↓
    │   Register incoming message (36) [CREATE en Odoo chatter]
    │       ↓
    │   Get Chat History from Lead (37) [GET MANY desde Odoo]
    │       ↓
    │   Chat History Filter (38) [Limpiar HTML + deduplicar]
    │       ↓
    │   LoadProfileAndState (39) [Salida A: profile + state]
    │       ↓
    │   [Continúa en Analysis Flow...]
    │
    └─→ Salida B: State Snapshot
            ↓
        LoadProfileAndState (39) [Salida B: profile + state]
            ↓
        SnapshotBaseline (44) [Crea state_base inmutable]
            ↓
        [Continúa en Snapshot Flow...]
```

**Propósito**:
- ✅ Actualizar Baserow con último mensaje (Node 34)
- ✅ Cargar profile + state normalizado (Node 35)
- ✅ **Fork en Node 35**: Bifurcación A (History) + B (Snapshot)
- ✅ Registrar mensaje en Odoo chatter (Node 36)
- ✅ Traer historial completo de conversación (Node 37)
- ✅ Limpiar y formatear historial para LLM (Node 38)
- ✅ Crear snapshot inmutable ANTES de que LLM modifique state (Node 44)

---

### FORK POINT: Dos Flujos Paralelos

#### Flujo A: Analysis Flow (LLM Analyst)

**Nodos 36→37→38→39→40→41→42→43**: Registro en Odoo + Análisis con LLM

```
Register incoming message (36) [CREATE en mail.message de Odoo]
    ↓
Get Chat History from Lead (37) [GET MANY desde mail.message]
    ↓
Chat History Filter (38) [Limpiar HTML, deduplicar, formatear para LLM]
    ↓
LoadProfileAndState (39) [Salida A: profile + state]
    ↓
HydrateForHistory (40) [Merge: history limpio + profile/state]
    ↓
Smart Input (41) [Context preparation: history + options + rules + policies]
    ↓
Chat History Processor (42) [LLM Analyst - GPT-3.5-turbo]
    ↓
Filter Output (43) [Guardrails + validation: 7 tipos]
    ↓
    └─────────────────┐
                      │
                      ↓
              [Hacia Merge Point]
```

**Breakdown por nodo**:

| Nodo | Función | Duración | Output |
|------|---------|----------|--------|
| 36 | Registrar mensaje en Odoo chatter | ~200-300ms | `{ id: 1043 }` |
| 37 | Traer historial completo de Odoo | ~300-500ms | `[{id, date, body, author_id}, ...]` (4 mensajes) |
| 38 | Limpiar HTML, deduplicar, formatear | ~20-50ms | `[{role, text, ts}, ...]` |
| 39 | LoadProfileAndState (Salida A) | ~10-20ms | `{profile, state}` |
| 40 | Merge history + profile | ~5-10ms | `{history, profile, state, lead_id}` |
| 41 | Preparar context para LLM | ~10-20ms | `{history, options, rules, profile, state}` |
| 42 | LLM Analyst (GPT-3.5) | ~1500-2500ms ⚠️ | `{agent_brief, state}` |
| 43 | Guardrails + validation | ~30-50ms | `{ok, agent_brief, state}` |

**Output final del Analysis Flow**:
```json
{
  "ok": true,
  "agent_brief": {
    "intent": "contact_share",
    "stage": "explore",
    "recommendation": "INSTRUCCIONES PARA MASTER: ...",
    "cta_menu": { "items": [...] }
  },
  "state": {
    "stage": "explore",
    "counters": { "services_seen": 0 },
    "cooldowns": { "addressee_ask_ts": "2025-10-31T14:16:42.000Z" }
  }
}
```

**Duración total**: ~2100-3500ms

**Bottleneck**: LLM call (Node 42) representa ~70% del tiempo total

---

#### Flujo B: Snapshot Flow (State Baseline)

**Nodos 39→44**: Snapshot de estado inmutable

```
LoadProfileAndState (39) [Salida B]
    ↓
SnapshotBaseline (44) [Crea state_base inmutable]
    ↓
    └─────────────────┐
                      │
                      ↓
              [Hacia Merge Point]
```

**Output del Snapshot Flow**:
```json
{
  "profile": { "row_id": 198, "lead_id": 33, "full_name": "Felix", ... },
  "state": { "stage": "explore", "counters": {...}, "cooldowns": {...} },
  "state_base": { "stage": "explore", "counters": {...}, "cooldowns": {...} },
  "state_base_meta": {
    "created_at_iso": "2025-10-31T19:26:45.093Z",
    "source": "SnapshotBaseline"
  }
}
```

**Duración**: ~10-20ms (solo snapshot, sin LLM)

---

### JOIN POINT: HydrateStateAndContext (Node 45)

**Tipo**: Merge node (n8n native)

**Combina**:
- **Input 1** (Filter Output): `{ok, agent_brief, state (actualizado)}`
- **Input 2** (SnapshotBaseline): `{profile, state_base (inmutable)}`

**Clash Handling**: Prefer Input 1 (usa `state` actualizado del LLM, no el original)

**Output combinado**:
```json
{
  "profile": {...},               // Desde Input 2
  "state": {...},                 // Desde Input 1 (actualizado por LLM) ✅
  "state_base": {...},            // Desde Input 2 (snapshot original) ⚓
  "agent_brief": {...},           // Desde Input 1
  "ok": true                      // Desde Input 1
}
```

**Propósito**: Unir análisis del LLM con snapshot original para poder calcular DIFF.

---

### FLAGS ZONE (después del Merge)

**Nodos 46→47→48**: Cálculo de diff, flags y decisiones

```
HydrateStateAndContext (45) [MERGE POINT]
    ↓
BuildStatePatch (46) [Calcula DIFF: state vs state_base]
    ↓ Output: patch + json_patch + changed_keys
BuildFlagsInput (47) [Recency analytics + Intent heuristics + Cooldowns]
    ↓ Output: flags_base + flags_derived + timing + context
FlagsAnalyzer (48) [Decision making: actions + routing + guardrails]
    ↓ Output: decision object
[Master Agent - ETAPA 5]
```

#### Node 46: BuildStatePatch

**Función**: Calcular diferencia entre `state_base` (original) y `state` (actualizado por LLM).

**Normalizations aplicadas**:
1. Monotonic counters (services_seen, prices_asked, deep_interest)
2. Latest timestamps (cooldowns)
3. Anti-regression (stage transitions)
4. Interests canonical union (nunca perder interests)
5. Non-regressive flags (proposal_offer_done)

**Output**:
```json
{
  "patch": { "cooldowns": { "addressee_ask_ts": "2025-10-31T14:16:42.000Z" } },
  "json_patch": [{ "op": "replace", "path": "/cooldowns/addressee_ask_ts", "value": "..." }],
  "has_patch": true,
  "changed_keys": ["cooldowns.addressee_ask_ts"]
}
```

**Uso**: Este patch se aplicará a Baserow al final del workflow (UPDATE solo campos modificados).

---

#### Node 47: BuildFlagsInput

**Función**: Enriquecer contexto con analytics y heuristics.

**Calcula**:
- **Recency buckets**: fresh (<30min), warm (<6h), stale (<24h), dormant (>24h)
- **Calendar recency**: hoy, ayer, esta_semana, anterior (TZ-aware)
- **Intent heuristics**: service_selected, ontopic, neutral, offtopic, greeting, contact_share
- **Cooldown windows**: email_ask (6h), addressee_ask (12h)
- **Compatibility checks**: email gate enabled, cooldowns OK, stage validations

**Output**:
```json
{
  "flags_base": { "has_email": false, "has_business_name": false, "stage": "explore" },
  "flags_derived": {
    "service_selected": false,
    "ready_for_benefits": false,
    "ready_for_price_cta": false,
    "rag_hints": []
  },
  "timing": { "now_iso": "...", "last_seen_iso": "...", "recency": "warm" },
  "context": { "intent_hint": "neutral", "recency": "warm", "last_msgs": [...] }
}
```

---

#### Node 48: FlagsAnalyzer

**Función**: Tomar decisiones basadas en flags.

**Decisiones**:
1. **Actions**: ask_email, ask_business_name, acknowledge_price, greet_only
2. **Counters patch**: Increments para services_seen, prices_asked, deep_interest
3. **Stage patch**: Transiciones (explore→match cuando service_selected)
4. **Decision object**: Routing strategy para Master Agent

**Output**:
```json
{
  "actions": { "ask_email": false, "greet_only": true },
  "counters_patch": { "services_seen": 0, "prices_asked": 0, "deep_interest": 0 },
  "stage_patch": null,
  "decision": {
    "route": "generic_flow",
    "purpose": "options",
    "rag": { "use": false, "hints": [] },
    "guardrails": { "dont_restart_main_menu": false }
  }
}
```

**Uso**: El decision object guía al Master Agent sobre:
- Qué routing usar (service_selected_flow vs generic_flow)
- Qué propósito tiene la respuesta (price_cta, benefits_cta, options)
- Si consultar RAG (rag.use = true/false)
- Qué guardrails aplicar

---

## Patrones Arquitectónicos Clave

### 1. Fork-Join Pattern

**Definición**: Dos flujos paralelos se ejecutan independientemente y luego convergen.

**Implementación**:
- **Fork**: LoadProfileAndState (39) → 2 salidas (A: History, B: Snapshot)
- **Parallel execution**:
  - Flujo A (Analysis): 40→41→42→43 (~3000ms)
  - Flujo B (Snapshot): 44 (~20ms)
- **Join**: HydrateStateAndContext (45)

**Ventajas**:
- ✅ Paralelismo (Snapshot no espera a LLM)
- ✅ Separación de concerns (Analysis vs State Management)
- ✅ Snapshot inmutable disponible para auditoría

**Trade-offs**:
- ⚠️ Complejidad arquitectónica
- ⚠️ Flujo B espera ~2980ms a que Flujo A termine

---

### 2. Snapshot-Diff-Patch Pattern

**Definición**: Capturar estado original, calcular diferencias, aplicar patch.

**Implementación**:
- **Snapshot**: Node 44 (SnapshotBaseline) → state_base inmutable
- **Diff**: Node 46 (BuildStatePatch) → calcula cambios entre state y state_base
- **Patch**: RFC6902 JSON Patch format para aplicar a Baserow

**Ventajas**:
- ✅ Auditoría (qué cambió exactamente)
- ✅ Optimización (UPDATE solo campos modificados)
- ✅ Rollback (state_base disponible)
- ✅ Validación (counters solo incrementan, no decrementan)

**Ejemplo**:
```javascript
// state_base (original):
{ "stage": "explore", "counters": { "services_seen": 0 } }

// state (actualizado por LLM):
{ "stage": "match", "counters": { "services_seen": 1 } }

// patch (diff):
{ "stage": "match", "counters": { "services_seen": 1 } }

// json_patch (RFC6902):
[
  { "op": "replace", "path": "/stage", "value": "match" },
  { "op": "replace", "path": "/counters/services_seen", "value": 1 }
]
```

---

### 3. Guardrails-as-Code Pattern

**Definición**: Business policies enforced in code, not just prompts.

**Implementación**: Node 43 (Filter Output) - 7 tipos de guardrails

**Tipos**:
1. **Stage Match Guardrail**: Force stage=match when service_target exists
2. **Stage Regression Block**: No backward transitions (match→explore forbidden)
3. **Interests Normalization**: Only from catalog, reject hallucinations
4. **Privacy Enforcement**: Sanitize PII from summaries
5. **Soft-Close++ Detection**: Detect offtopic loops, emit brief close
6. **Service Target Validation**: Ensure bundle + rag_hints present
7. **Schema Enforcement**: Validate JSON structure

**Filosofía**: **Trust-but-Verify**
- LLM makes decisions (Policy-as-Prompt)
- Code validates and corrects (Guardrails-as-Code)

---

### 4. TZ-Aware Date Calculations

**Definición**: Cálculos de fecha en timezone local del usuario.

**Implementación**: Node 47 (BuildFlagsInput) - `localYMDStamp()`

**Problema que resuelve**:
```javascript
// Mensaje a las 23:59 en Argentina (UTC-3):
// UTC timestamp: "2025-10-31T02:59:00.000Z" (día 31)
// Local timestamp: "2025-10-30T23:59:00-03:00" (día 30)

// Sin TZ-aware:
days_since_last_seen = 0 // ❌ Incorrecto (compara UTC dates)

// Con TZ-aware:
days_since_last_seen = 1 // ✅ Correcto (compara local dates)
calendar_recency = "ayer" // ✅ Correcto
```

**Uso**: Recency analytics (hoy, ayer, esta_semana, anterior) son críticos para reengagement strategy.

---

### 5. Decision Object Pattern

**Definición**: Objeto estructurado que guía comportamiento del Master Agent.

**Implementación**: Node 48 (FlagsAnalyzer) - `decision` object

**Estructura**:
```json
{
  "route": "service_selected_flow" | "generic_flow",
  "purpose": "price_cta" | "benefits_cta" | "options",
  "service_canonical": "WhatsApp Chatbot" | null,
  "bundle": ["item1", "item2"],
  "rag": {
    "use": true | false,
    "hints": ["query1", "query2"]
  },
  "cta_menu": { "items": [...] },
  "guardrails": {
    "dont_restart_main_menu": true | false,
    "dont_require_volume_first": true | false
  }
}
```

**Uso por Master Agent**:
- `route`: Determina prompt template (service-specific vs generic)
- `purpose`: Ajusta tono (price focus vs benefits focus vs exploration)
- `rag.use`: Si true, consultar Qdrant antes de generar respuesta
- `rag.hints`: Keywords para RAG search
- `guardrails`: Restricciones para evitar loops y regressions

---

## Data Flow Evolution

### Entrada (Node 01)
```json
{
  "event": "message_created",
  "message_type": "incoming",
  "content": "Hola",
  "conversation": { "id": 123 }
}
```

### Post-Buffer (Node 17)
```json
{
  "conversationId": 123,
  "text": "Hola buenos días",
  "buffer_count": 2,
  "buffered_texts": ["Hola", "buenos días"]
}
```

### Post-Register (Node 35)
```json
{
  "profile": { "lead_id": 33, "full_name": "Felix", "stage": "explore" },
  "state": { "stage": "explore", "counters": { "services_seen": 0 } }
}
```

### Post-Snapshot (Node 44)
```json
{
  "profile": {...},
  "state": {...},
  "state_base": {...},  // ⚓ Snapshot inmutable
  "state_base_meta": { "created_at_iso": "...", "source": "SnapshotBaseline" }
}
```

### Post-Analysis (Node 43)
```json
{
  "agent_brief": {
    "intent": "contact_share",
    "recommendation": "INSTRUCCIONES PARA MASTER: ...",
    "cta_menu": { "items": [...] }
  },
  "state": { "stage": "explore", "cooldowns": { "addressee_ask_ts": "..." } }
}
```

### Post-Merge (Node 45)
```json
{
  "profile": {...},           // Desde Snapshot
  "state": {...},             // Desde Analysis (actualizado)
  "state_base": {...},        // Desde Snapshot (original)
  "agent_brief": {...}        // Desde Analysis
}
```

### Post-FLAGS (Node 48)
```json
{
  "actions": { "ask_email": true },
  "decision": {
    "route": "generic_flow",
    "purpose": "options",
    "rag": { "use": false }
  },
  "patch": { "cooldowns": { "addressee_ask_ts": "..." } }
}
```

---

## Timing y Performance

### ETAPA 4 - Breakdown por fase

| Fase | Nodos | Duración | Bottleneck |
|------|-------|----------|------------|
| **Preprocessing Baserow** | 33-35 | ~200-400ms | Baserow UPDATE (34) |
| **History Preparation** | 36-38 | ~520-850ms | Odoo CREATE + GET (36+37) ⚠️ |
| **Analysis Flow** | 39-43 | ~1600-2600ms | LLM call (42) ⚠️⚠️ |
| **Snapshot Flow** | 39, 44 | ~20-40ms | Deep clone (44) |
| **Join** | 45 | ~5-10ms | Merge nativo |
| **FLAGS ZONE** | 46-48 | ~20-30ms | Regex matching (48) |
| **Total ETAPA 4** | | ~2400-3900ms | LLM + Odoo (~85%) |

**Breakdown detallado por nodo**:
- **Baserow UPDATE (34)**: ~200ms (actualizar last_message)
- **Odoo CREATE (36)**: ~200ms (registrar mensaje en chatter)
- **Odoo GET MANY (37)**: ~300ms (traer historial completo)
- **Chat History Filter (38)**: ~20-50ms (limpiar HTML, deduplicar)
- **LLM Analyst (42)**: ~1500-2500ms ⚠️⚠️ (60-65% del tiempo total)
- **Resto del pipeline**: ~200ms

**Optimización principal**: Paralelismo entre Analysis (36-43) y Snapshot (39, 44) - ahorra ~20-40ms.

**Bottlenecks críticos**:
1. **LLM call (Node 42)**: 60-65% del tiempo total de ETAPA 4
2. **Odoo queries (36+37)**: 15-20% del tiempo total
3. **Baserow UPDATE (34)**: 5-8% del tiempo total

**Optimizaciones posibles**:
- ✅ Cache de historial de Odoo (evitar query en Node 37 si no hubo cambios desde última llamada)
- ✅ Streaming LLM response para reducir latencia percibida
- ✅ Odoo batch operations (CREATE + GET MANY en una sola llamada XML-RPC)
- ✅ Paralelizar Baserow UPDATE (34) con Register message (36)

---

## Próxima Etapa

**ETAPA 5: Master Agent - Core Process**

**Inputs esperados**:
- `decision` object (desde FlagsAnalyzer)
- `agent_brief` (desde Filter Output)
- `profile` + `state` (merged context)
- `patch` (para aplicar a Baserow al final)

**Procesamiento**:
1. Si `decision.rag.use = true` → Consultar Qdrant con `rag.hints`
2. Generar prompt para Master Agent (GPT-4) basado en `decision.route` y `decision.purpose`
3. Llamar LLM con contexto completo
4. Validar respuesta
5. Aplicar `patch` a Baserow
6. Enviar respuesta a WhatsApp via Chatwoot

---

## Referencias

- [ANALYSIS-COHERENCE-CHECK.md](ANALYSIS-COHERENCE-CHECK.md) - Análisis de coherencia completo
- [00-ETAPA-1-FILTER-PROCESS.md](00-ETAPA-1-FILTER-PROCESS.md) - ETAPA 1
- [00-ETAPA-2-BUFFER-MESSAGES.md](00-ETAPA-2-BUFFER-MESSAGES.md) - ETAPA 2
- [00-ETAPA-3-REGISTER-LEADS.md](00-ETAPA-3-REGISTER-LEADS.md) - ETAPA 3
- Nodos 41-48 - ETAPA 4 documentación individual

---

**Versión**: 1.0
**Última actualización**: 2025-10-31
**Estado**: ✅ Arquitectura verificada y corregida
