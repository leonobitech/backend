# Resumen ETAPA 4: LLM Analyst & Decision Layer

**Versión**: 1.0
**Fecha**: 2025-10-31
**Nodos**: 40-48 (9 nodos)
**Duración total**: ~1.8-2.3 segundos

---

## Tabla de Contenidos

1. [Propósito de la ETAPA](#propósito-de-la-etapa)
2. [Arquitectura Visual](#arquitectura-visual)
3. [Nodos de la ETAPA](#nodos-de-la-etapa)
4. [Flujo de Datos](#flujo-de-datos)
5. [Patrones de Diseño](#patrones-de-diseño)
6. [Casos de Uso Completos](#casos-de-uso-completos)
7. [Performance y Costos](#performance-y-costos)
8. [Optimizaciones](#optimizaciones)
9. [Referencias](#referencias)

---

## Propósito de la ETAPA

La **ETAPA 4** es el **cerebro analítico del workflow**. Su función es:

1. **Analizar la conversación completa** usando GPT-3.5-turbo como LLM Analyst
2. **Detectar intención** del usuario (greeting, service_info, price, request_proposal, etc.)
3. **Actualizar estado conversacional** (stage transitions, counters, interests, cooldowns)
4. **Generar recomendaciones técnicas** para el Master Agent (≤280 caracteres)
5. **Construir objeto de decisión** (master_task v3.0) con routing, guardrails, RAG hints
6. **Validar políticas de negocio** (email gating con 7 condiciones, anti-loop, service lock)

**Diferencia clave con ETAPA 3 (FLAGS ZONE)**:
- **ETAPA 3**: Evalúa condiciones simples (cooldowns numéricos, contadores, proposal triggers)
- **ETAPA 4**: Usa **LLM para interpretar contexto conversacional** y tomar decisiones complejas

**Input**: Historial conversacional + RAG chunks + lead state + flags
**Output**: `master_task` v3.0 con análisis completo + recomendaciones + guardrails

---

## Arquitectura Visual

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       ETAPA 4: LLM ANALYST                              │
│                     (Nodos 40-48, ~1.8-2.3s)                            │
└─────────────────────────────────────────────────────────────────────────┘

  INPUT (desde ETAPA 3):
  ├─ Historial conversacional (8-10 mensajes)
  ├─ RAG chunks (5-8 resultados relevantes)
  ├─ Lead state (stage, interests, counters, cooldowns)
  └─ FLAGS (cooldowns OK/not, proposal auto-trigger, ACK_ONLY)

                              ▼

  ┌─────────────────────────────────────────────────────────────────────┐
  │ [40] HydrateForHistory                                (~50ms)       │
  │      └─ Merge: history + profile + state                           │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [41] Smart Input                                      (~100ms)      │
  │      └─ Construir contexto completo:                                │
  │         • options (services, aliases, stage_allowed)                │
  │         • rules (11 políticas de negocio)                           │
  │         • meta (locale, tz, anti-loop window)                       │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [42] Chat History Processor (LLM ANALYST)        (~1500-2300ms)    │
  │      ┌──────────────────────────────────────────────────────────┐  │
  │      │ GPT-3.5-turbo                                            │  │
  │      │ System prompt v3.3 (~200 líneas)                         │  │
  │      │ Input: history + profile + state + options + rules       │  │
  │      │ Output: {agent_brief, state_updated}                     │  │
  │      └──────────────────────────────────────────────────────────┘  │
  │                                                                      │
  │      Decisiones críticas:                                           │
  │      • Intent detection (11 intents canónicos)                      │
  │      • Stage transitions (explore→match→price→qualify)              │
  │      • Service target identification (canonical + bundle + hints)   │
  │      • CTA menu generation (4 items contextuales)                   │
  │      • Recommendation para Master (≤280 chars)                      │
  │      • Email gating (7 condiciones)                                 │
  │      • Counters update (+1 máx por tipo)                            │
  │      • Cooldowns update (solo cuando assistant pregunta)            │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [43] Filter Output                                    (~30ms)       │
  │      └─ Validar JSON del LLM (fallback a defaults si inválido)     │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [44] Snapshot Baseline                                (~20ms)       │
  │      └─ Guardar estado PRE-LLM para comparación                    │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [45] HydrateStateAndContext                           (~50ms)       │
  │      └─ Re-hidratar state + context con output del LLM             │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [46] BuildStatePatch                                  (~40ms)       │
  │      └─ Comparar baseline vs updated → generar state_patch         │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [47] BuildFlagsInput                                  (~30ms)       │
  │      └─ Merge flags de ETAPA 3 + agent_brief del LLM              │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ [48] FlagsAnalyzer                                    (~50ms)       │
  │      └─ Decision-making final:                                      │
  │         • Route (service_selected_flow vs generic_flow)             │
  │         • Purpose (price_cta, benefits_cta, options)                │
  │         • Guardrails (dont_restart_menu, dont_require_volume)       │
  │         • RAG activation (rag_hints, bundle)                        │
  │         • Actions (ask_email, greet_only, acknowledge_price)        │
  │         • Debug object (troubleshooting)                            │
  └─────────────────────────────────────────────────────────────────────┘
                              ▼

  OUTPUT (hacia ETAPA 5):
  └─ master_task v3.0 {
       profile,
       state_updated,
       state_patch,
       context,
       flags,
       agent_brief,
       decision: {
         route, purpose, guardrails, rag, bundle, actions
       },
       timing,
       debug
     }
```

---

## Nodos de la ETAPA

### Node 40: HydrateForHistory
**Tipo**: Code (JavaScript)
**Duración**: ~50ms
**Función**: Merge de history + profile + state en un solo objeto

**Input**:
```javascript
{
  history: [...],        // 8-10 mensajes
  profile: {...},        // Datos del lead
  state: {...}           // Estado conversacional
}
```

**Output**:
```javascript
{
  history: [...],
  profile: {...},
  state: {...}
}
```

**Propósito**: Preparar datos para Smart Input (Node 41)

**Documento**: [40-hydrate-for-history.md](40-hydrate-for-history.md)

---

### Node 41: Smart Input
**Tipo**: Code (JavaScript)
**Duración**: ~100ms
**Función**: Construir contexto completo con options, rules y meta

**Componentes clave**:

1. **Options object**: Configuración del sistema
   - `interests_allowed`: ["Odoo", "WhatsApp", "CRM", ...]
   - `services_allowed`: ["WhatsApp Chatbot", "Landing Page", ...]
   - `services_aliases`: {"chatbot": "WhatsApp Chatbot", ...}
   - `stage_allowed`: ["explore", "match", "price", "qualify", "proposal_ready"]

2. **Rules object (11 políticas de negocio)**:
   - `timing_and_chronology`: Orden cronológico ascendente
   - `interests_policy`: Normalización de interests (aliases → canonical)
   - `stage_policy`: Transiciones secuenciales sin regresión
   - `counters_policy`: Máx +1 por tipo por iteración
   - `cooldowns_policy`: Solo actualizar cuando assistant pregunta
   - `recommendation_format_policy`: ≤280 caracteres, técnico, sin PII
   - `rag_first_policy`: Siempre consultar RAG antes de especular
   - `anti_loop_policy`: Ventana de 5 minutos entre preguntas repetidas
   - `email_gating_policy`: 7 condiciones para pedir email
   - `privacy_policy`: Sin PII en history_summary ni reason
   - `menu_guard_policy`: No menú general si stage≥match
   - `self_check_policy`: Validar output antes de emitir

3. **Meta object**: Metadata contextual
   - `history_len`, `truncated`, `locale_hint`, `channel`, `country`, `tz`
   - `now_ts`, `anti_loop_window_min`, `version`

**Output**:
```javascript
{
  history: [...],
  profile: {...},
  state: {...},
  options: {...},      // Config
  rules: {...},        // 11 políticas
  meta: {...}          // Metadata
}
```

**Propósito**: Proveer contexto completo al LLM Analyst (Node 42)

**Documento**: [41-smart-input.md](41-smart-input.md)

---

### Node 42: Chat History Processor (LLM ANALYST) ⭐
**Tipo**: AI Agent (OpenAI Chat Model)
**Duración**: ~1500-2300ms
**Modelo**: GPT-3.5-turbo
**Función**: **Cerebro analítico del workflow**

**System prompt v3.3** (200+ líneas):
- ROL: Analista Conversacional de Leonobitech
- OUTPUT: JSON minificado, 1 línea, ≤1800 caracteres
- CONTRATO: `{agent_brief: {...}, state: {...}}`
- REGLAS CLAVE: 6 reglas (JSON-only, transiciones sin regresión, service_target completo, privacidad, etc.)

**User prompt**:
```xml
<role>Eres Analista Conversacional de Leonobitech.</role>
<task>
Devuelve SOLO un JSON minificado con {agent_brief, state}.
Pipeline:
1) Analiza <history> ascendente
2) Determina intent y ACTUALIZA <state>
3) Construye agent_brief y reask_decision
</task>
<options>{{JSON.stringify($json.options)}}</options>
<rules>{{JSON.stringify($json.rules)}}</rules>
<meta>{{JSON.stringify($json.meta)}}</meta>
<history>{{JSON.stringify($json.history)}}</history>
<profile>{{JSON.stringify($json.profile)}}</profile>
<state>{{JSON.stringify($json.state)}}</state>
```

**Output schema**:

```typescript
interface LLMAnalystOutput {
  agent_brief: {
    history_summary: string;        // ≤120 palabras, SIN PII
    last_incoming: {
      role: "user" | "assistant";
      text: string;
      ts: string;                   // ISO-8601
    };
    intent:
      | "greeting"
      | "service_info"
      | "price"
      | "request_proposal"
      | "demo_request"
      | "contact_share"
      | "schedule_request"
      | "negotiation"
      | "support"
      | "off_topic"
      | "unclear";
    stage: "explore" | "match" | "price" | "qualify" | "proposal_ready";
    service_target: {
      canonical?: string;           // "WhatsApp Chatbot"
      bundle?: string[];            // ["WhatsApp Chatbot", "AI Automation"]
      rag_hints?: string[];         // ["beneficios chatbot", "casos uso"]
    };
    cta_menu: {
      prompt: string;               // "¿Cómo querés avanzar?"
      kind: "service" | "action";
      items: string[];              // SIEMPRE 4 items
      max_picks: 1;
    };
    recommendation: string;         // ≤280 caracteres, técnico
    reask_decision: {
      can_ask_email_now: boolean;
      can_ask_addressee_now: boolean;
      reason: string;               // Breve, SIN PII
    };
  };

  state: {
    // Immutable fields (NEVER change)
    lead_id: number;
    chatwoot_id: number;
    phone_number: string;
    country: string;
    tz: string;
    channel: string;

    // Mutable fields (can be updated)
    full_name: string | null;
    business_name: string | null;
    email: string | null;
    stage: string;
    interests: string[];            // Normalized (aliases → canonical)

    counters: {
      services_seen: number;        // +1 per new service
      prices_asked: number;         // +1 per price question
      deep_interest: number;        // +1 per strong interest signal
    };

    cooldowns: {
      email_ask_ts: string | null;
      addressee_ask_ts: string | null;
    };

    proposal_offer_done: boolean;
    last_proposal_offer_ts: string | null;
  };
}
```

**Decisiones críticas que toma el LLM**:

1. **Intent detection** (11 intents canónicos)
2. **Stage transitions** (explore→match→price→qualify→proposal_ready)
3. **Service target identification** (canonical + bundle + rag_hints)
4. **CTA menu generation** (4 items contextuales)
5. **Recommendation para Master** (≤280 chars, técnico, sin PII)
6. **Email gating validation** (7 condiciones):
   ```javascript
   can_ask_email_now = (
     stage in ["qualify", "proposal_ready"] &&
     interests.length >= 1 &&
     counters.services_seen >= 1 &&
     counters.deep_interest >= 1 &&
     state.business_name !== "" &&
     (proposal_intent === true || counters.prices_asked >= 1) &&
     ((now - email_ask_ts) > 5min || email_ask_ts === null)
   );
   ```
7. **Counters update** (+1 máx por tipo: services_seen, prices_asked, deep_interest)
8. **Cooldowns update** (solo cuando assistant pregunta explícitamente)

**Performance**:
- Tokens input: ~1500-2000
- Tokens output: ~300-450
- Costo: ~$0.002-0.003 USD/call
- Latency: 1500-2300ms (70-80% del tiempo de ETAPA 4)

**Documento**: [42-chat-history-processor.md](42-chat-history-processor.md)

---

### Node 43: Filter Output
**Tipo**: Code (JavaScript)
**Duración**: ~30ms
**Función**: Validar JSON del LLM, aplicar fallbacks si inválido

**Validaciones**:
- JSON es parseable
- Contiene `agent_brief` y `state`
- `agent_brief.intent` es válido (enum de 11 intents)
- `agent_brief.stage` es válido (enum de 5 stages)
- `state` tiene mismo shape que input

**Fallback si falla**:
```javascript
{
  agent_brief: {
    intent: "unclear",
    stage: state_baseline.stage,  // Sin cambio
    recommendation: "ERROR: LLM output inválido. Solicitar clarificación.",
    reask_decision: { can_ask_email_now: false, can_ask_addressee_now: false }
  },
  state: state_baseline  // Rollback a estado previo
}
```

**Documento**: [43-filter-output.md](43-filter-output.md)

---

### Node 44: Snapshot Baseline
**Tipo**: Code (JavaScript)
**Duración**: ~20ms
**Función**: Guardar estado PRE-LLM para comparación

**Output**:
```javascript
{
  state_baseline: {...},  // Estado antes de LLM
  agent_brief: {...},
  state_updated: {...}    // Estado después de LLM
}
```

**Propósito**: Permitir diff (baseline vs updated) en Node 46

**Documento**: [44-snapshot-baseline.md](44-snapshot-baseline.md)

---

### Node 45: HydrateStateAndContext
**Tipo**: Code (JavaScript)
**Duración**: ~50ms
**Función**: Re-hidratar state + context con output del LLM

**Transformaciones**:
```javascript
{
  profile: {...},
  state: state_updated,       // Estado actualizado por LLM
  context: {
    rag_chunks: [...],
    service_target: agent_brief.service_target,
    cta_menu: agent_brief.cta_menu
  },
  agent_brief: {...}
}
```

**Documento**: [45-hydrate-state-and-context.md](45-hydrate-state-and-context.md)

---

### Node 46: BuildStatePatch
**Tipo**: Code (JavaScript)
**Duración**: ~40ms
**Función**: Comparar baseline vs updated → generar state_patch

**Algoritmo**:
```javascript
const state_patch = {};

for (const key in state_updated) {
  if (JSON.stringify(state_baseline[key]) !== JSON.stringify(state_updated[key])) {
    state_patch[key] = state_updated[key];
  }
}

// Resultado ejemplo:
{
  stage: "match",                    // Cambió de "explore" → "match"
  interests: ["WhatsApp", "CRM"],    // Cambió de [] → ["WhatsApp", "CRM"]
  counters: {
    services_seen: 1,                // Cambió de 0 → 1
    deep_interest: 1                 // Cambió de 0 → 1
  }
}
```

**Propósito**: Enviar solo **cambios** a Baserow (optimización)

**Documento**: [46-build-state-patch.md](46-build-state-patch.md)

---

### Node 47: BuildFlagsInput
**Tipo**: Code (JavaScript)
**Duración**: ~30ms
**Función**: Merge flags de ETAPA 3 + agent_brief del LLM

**Output**:
```javascript
{
  flags_base: {...},               // Cooldowns de ETAPA 3
  flags_derived: {...},            // Proposal auto-trigger
  flags_base_llm: {                // Output del LLM
    intent: "service_info",
    stage: "match",
    service_target: {...},
    cta_menu: {...},
    recommendation: "...",
    reask_decision: {...}
  },
  timing: {...},
  context: {...}
}
```

**Documento**: [47-build-flags-input.md](47-build-flags-input.md)

---

### Node 48: FlagsAnalyzer ⭐
**Tipo**: Code (JavaScript)
**Duración**: ~50ms
**Función**: **Decision-making final** antes de Master Agent

**Decisiones que toma**:

1. **Route** (service_selected_flow vs generic_flow):
   ```javascript
   const route = (service_target.canonical && rag_hints.length > 0)
     ? "service_selected_flow"
     : "generic_flow";
   ```

2. **Purpose** (price_cta, benefits_cta, options):
   ```javascript
   let purpose = "options";  // Default
   if (intent === "price") purpose = "price_cta";
   if (intent === "service_info") purpose = "benefits_cta";
   ```

3. **Guardrails**:
   ```javascript
   const guardrails = {
     dont_restart_main_menu: (stage >= "match"),
     dont_require_volume_first: (intent !== "price"),
     expect_reply_natural: (intent !== "greet_only")
   };
   ```

4. **RAG activation**:
   ```javascript
   const rag = {
     active: (route === "service_selected_flow"),
     hints: rag_hints,
     bundle: bundle
   };
   ```

5. **Actions**:
   ```javascript
   const actions = [];
   if (reask_decision.can_ask_email_now) actions.push("ask_email");
   if (intent === "greeting") actions.push("greet_only");
   if (intent === "price") actions.push("acknowledge_price");
   ```

**Output final (master_task v3.0)**:
```javascript
{
  profile: {...},
  state: state_updated,
  state_patch: {...},
  context: {...},
  flags: {...},
  agent_brief: {...},

  decision: {
    route: "service_selected_flow" | "generic_flow",
    purpose: "price_cta" | "benefits_cta" | "options",
    guardrails: {
      dont_restart_main_menu: boolean,
      dont_require_volume_first: boolean,
      expect_reply_natural: boolean
    },
    rag: {
      active: boolean,
      hints: string[],
      bundle: string[]
    },
    actions: string[]  // ["ask_email", "greet_only", ...]
  },

  timing: {...},
  debug: {
    stage_in: "explore",
    recency: "recent",
    intent_hint: "service_info",
    service_selected: true
  }
}
```

**Propósito**: Proveer **master_task v3.0** completo a ETAPA 5 (Master Agent)

**Documento**: [48-flags-analyzer.md](48-flags-analyzer.md)

---

## Flujo de Datos

### Ejemplo Completo: Usuario pregunta por servicio

**INPUT (desde ETAPA 3)**:
```javascript
{
  history: [
    {role: "assistant", text: "¡Hola! Soy Leonobit 🤖...", ts: "..."},
    {role: "user", text: "Hola!", ts: "..."},
    {role: "assistant", text: "¿Cuál es tu nombre?", ts: "..."},
    {role: "user", text: "Me llamo Felix", ts: "..."},
    {role: "user", text: "Quiero info del chatbot de WhatsApp", ts: "..."}
  ],
  profile: {
    lead_id: 33,
    stage: "explore",
    interests: [],
    counters: {services_seen: 0, prices_asked: 0, deep_interest: 0}
  },
  state: {...},  // Same as profile
  rag_chunks: [
    {content: "El chatbot de WhatsApp permite...", score: 0.87},
    // ... 4-7 más
  ],
  flags: {
    cooldowns: {email_ask_ok: true, addressee_ask_ok: false},
    proposal: {auto_offer: false}
  }
}
```

**Node 40 → HydrateForHistory**:
```javascript
{
  history: [...],
  profile: {...},
  state: {...}
}
```

**Node 41 → Smart Input**:
```javascript
{
  history: [...],
  profile: {...},
  state: {...},
  options: {
    interests_allowed: ["Odoo", "WhatsApp", "CRM", ...],
    services_allowed: ["WhatsApp Chatbot", ...],
    services_aliases: {"chatbot": "WhatsApp Chatbot", ...}
  },
  rules: {
    timing_and_chronology: "...",
    interests_policy: "...",
    stage_policy: "...",
    // ... 11 políticas
  },
  meta: {
    history_len: 5,
    locale_hint: "es-AR",
    now_ts: 1730399987000,
    anti_loop_window_min: 5
  }
}
```

**Node 42 → Chat History Processor (GPT-3.5-turbo, ~2s)**:
```javascript
{
  agent_brief: {
    history_summary: "Usuario saludó, proporcionó nombre (Felix), y preguntó por chatbot de WhatsApp.",
    last_incoming: {
      role: "user",
      text: "Quiero info del chatbot de WhatsApp",
      ts: "2025-10-31T18:59:50Z"
    },
    intent: "service_info",
    stage: "match",  // ← Transición: explore → match
    service_target: {
      canonical: "WhatsApp Chatbot",
      bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
      rag_hints: ["beneficios chatbot", "casos de uso whatsapp", "integraciones"]
    },
    cta_menu: {
      prompt: "¿Cómo querés avanzar?",
      kind: "service",
      items: [
        "Ver precios",
        "Beneficios e integraciones",
        "Agendar demo",
        "Solicitar propuesta"
      ],
      max_picks: 1
    },
    recommendation: "INSTRUCCIONES PARA MASTER: Consultar RAG con hints ['beneficios chatbot', 'casos de uso whatsapp']; presentar beneficios clave del chatbot; incluir CTA menu con 4 opciones; NO mostrar menú general de servicios; preparar para transición a stage price si pregunta por costo.",
    reask_decision: {
      can_ask_email_now: false,
      can_ask_addressee_now: false,
      reason: "stage insuficiente; falta business_name; counters bajos"
    }
  },

  state: {
    lead_id: 33,
    full_name: "Felix",  // ← Extraído de "Me llamo Felix"
    stage: "match",      // ← Actualizado
    interests: ["WhatsApp", "CRM"],  // ← Inferido de servicio
    counters: {
      services_seen: 1,     // ← +1
      prices_asked: 0,
      deep_interest: 1      // ← +1 (muestra interés)
    },
    cooldowns: {
      email_ask_ts: null,
      addressee_ask_ts: null
    },
    // ... resto sin cambios
  }
}
```

**Node 43 → Filter Output**:
```javascript
// Validación OK → pass through
{agent_brief: {...}, state: {...}}
```

**Node 44 → Snapshot Baseline**:
```javascript
{
  state_baseline: {stage: "explore", interests: [], counters: {0,0,0}},
  state_updated: {stage: "match", interests: ["WhatsApp","CRM"], counters: {1,0,1}},
  agent_brief: {...}
}
```

**Node 45 → HydrateStateAndContext**:
```javascript
{
  profile: {...},
  state: state_updated,
  context: {
    rag_chunks: [...],
    service_target: {
      canonical: "WhatsApp Chatbot",
      bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
      rag_hints: ["beneficios chatbot", "casos de uso whatsapp"]
    },
    cta_menu: {...}
  },
  agent_brief: {...}
}
```

**Node 46 → BuildStatePatch**:
```javascript
{
  state_patch: {
    full_name: "Felix",
    stage: "match",
    interests: ["WhatsApp", "CRM"],
    counters: {
      services_seen: 1,
      deep_interest: 1
    }
  }
}
```

**Node 47 → BuildFlagsInput**:
```javascript
{
  flags_base: {cooldowns: {...}},
  flags_derived: {proposal: {...}},
  flags_base_llm: {
    intent: "service_info",
    stage: "match",
    service_target: {...},
    recommendation: "...",
    reask_decision: {...}
  }
}
```

**Node 48 → FlagsAnalyzer**:
```javascript
{
  master_task: {
    profile: {...},
    state: state_updated,
    state_patch: {...},
    context: {...},
    flags: {...},
    agent_brief: {...},

    decision: {
      route: "service_selected_flow",  // ← RAG activo
      purpose: "benefits_cta",          // ← Mostrar beneficios
      guardrails: {
        dont_restart_main_menu: true,   // stage >= match
        dont_require_volume_first: true,
        expect_reply_natural: true
      },
      rag: {
        active: true,
        hints: ["beneficios chatbot", "casos de uso whatsapp"],
        bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"]
      },
      actions: []  // No pedir email aún
    },

    debug: {
      stage_in: "explore",
      recency: "recent",
      intent_hint: "service_info",
      service_selected: true
    }
  }
}
```

**OUTPUT (hacia ETAPA 5)**:
```javascript
master_task v3.0 completo (arriba)
```

---

## Patrones de Diseño

### 1. Policy-as-Prompt
**Ubicación**: Nodes 41-42
**Propósito**: Codificar políticas de negocio como instrucciones en lenguaje natural para LLM

**Implementación**:
```javascript
// Node 41: Define políticas en texto
const rules = {
  email_gating_policy: `
    Solo recomendar solicitar email si se cumplen TODAS estas condiciones:
    1. stage in ["qualify", "proposal_ready"]
    2. interests.length >= 1
    3. counters.services_seen >= 1
    4. counters.deep_interest >= 1
    5. state.business_name !== ""
    6. proposal_intent === true || counters.prices_asked >= 1
    7. (now - email_ask_ts) > 5min || email_ask_ts === null
  `
};

// Node 42: LLM interpreta políticas
const systemPrompt = `
  Eres Analista Conversacional...

  REGLAS CLAVE:
  - Aplica email_gating_policy con precisión
  - Valida las 7 condiciones antes de recomendar pedir email
  - Si alguna condición falla, can_ask_email_now = false
`;
```

**Beneficios**:
- Políticas legibles por humanos (no código complejo)
- Fácil actualización (cambiar texto en rules)
- LLM maneja casos edge automáticamente

**Trade-off**: No determinístico (LLM puede interpretar diferente)

---

### 2. State Diffing
**Ubicación**: Node 46 (BuildStatePatch)
**Propósito**: Enviar solo cambios a Baserow (optimización)

**Implementación**:
```javascript
// Comparación profunda
const state_patch = {};
for (const key in state_updated) {
  if (JSON.stringify(state_baseline[key]) !== JSON.stringify(state_updated[key])) {
    state_patch[key] = state_updated[key];
  }
}

// Resultado:
// En lugar de: {lead_id: 33, stage: "match", counters: {...}, ...} (15 campos)
// Enviar solo: {stage: "match", counters: {services_seen: 1, deep_interest: 1}}
```

**Ahorro**:
- Payload reducido de ~2KB → ~200 bytes
- Baserow update más rápido (~100ms menos)

---

### 3. Snapshot-Restore Pattern
**Ubicación**: Nodes 43-44
**Propósito**: Rollback a estado previo si LLM falla

**Implementación**:
```javascript
// Node 44: Snapshot ANTES de procesar output de LLM
const state_baseline = JSON.parse(JSON.stringify(state));

// Node 43: Si LLM output inválido
if (!isValidJSON(llm_output)) {
  return {
    state: state_baseline,  // ← ROLLBACK
    agent_brief: {
      intent: "unclear",
      recommendation: "ERROR: solicitar clarificación"
    }
  };
}
```

**Beneficio**: Garantiza que estado nunca quede corrupto

---

### 4. Intent-Based Routing
**Ubicación**: Node 48 (FlagsAnalyzer)
**Propósito**: Diferentes flujos según intent del usuario

**Implementación**:
```javascript
const decision = {
  route: "generic_flow",  // Default
  purpose: "options",
  actions: []
};

// Route selection
if (service_target.canonical && rag_hints.length > 0) {
  decision.route = "service_selected_flow";
}

// Purpose selection
if (intent === "price") {
  decision.purpose = "price_cta";
  decision.actions.push("acknowledge_price");
}
else if (intent === "service_info") {
  decision.purpose = "benefits_cta";
}
else if (intent === "greeting") {
  decision.actions.push("greet_only");
}

// Guardrails
decision.guardrails = {
  dont_restart_main_menu: (stage >= "match"),
  dont_require_volume_first: (intent !== "price")
};
```

**Rutas posibles**:
- **service_selected_flow**: RAG activo, respuesta especializada
- **generic_flow**: Sin RAG, respuesta genérica exploratoria

---

### 5. Robust Fallbacks
**Ubicación**: Nodes 42-43
**Propósito**: Garantizar workflow nunca se rompe por error de LLM

**Implementación**:
```javascript
// Node 42: Enable Fallback Model
{
  primary_model: "gpt-3.5-turbo",
  fallback_model: "gpt-4",  // Si GPT-3.5 falla
  max_retries: 2
}

// Node 43: Validación con fallback a defaults
function validateLLMOutput(raw) {
  try {
    const parsed = JSON.parse(raw);

    // Validar schema
    if (!parsed.agent_brief || !parsed.state) {
      throw new Error("Missing keys");
    }

    // Validar enums
    const validIntents = ["greeting", "service_info", ...];
    if (!validIntents.includes(parsed.agent_brief.intent)) {
      parsed.agent_brief.intent = "unclear";  // Fallback
    }

    return parsed;
  }
  catch (e) {
    // FALLBACK TOTAL
    return {
      agent_brief: {
        intent: "unclear",
        stage: state_baseline.stage,
        recommendation: "ERROR: LLM output inválido"
      },
      state: state_baseline
    };
  }
}
```

**Tasa de éxito**: >99% (con fallback model + validation)

---

## Casos de Uso Completos

### Caso 1: Saludo Inicial (Greeting)

**Escenario**: Usuario saluda y proporciona nombre

**Input**:
```javascript
history: [
  {role: "assistant", text: "¡Hola! Soy Leonobit 🤖..."},
  {role: "user", text: "Hola!"},
  {role: "assistant", text: "¿Cuál es tu nombre?"},
  {role: "user", text: "Me llamo Felix"}
]
state: {stage: "explore", interests: [], counters: {0,0,0}}
```

**Output**:
```javascript
agent_brief: {
  intent: "greeting",
  stage: "explore",  // Sin cambio
  service_target: {},
  cta_menu: {items: ["Ver precios", "Beneficios e integraciones", ...]},
  recommendation: "INSTRUCCIONES PARA MASTER: Mantener diálogo exploratorio...",
  reask_decision: {can_ask_email_now: false, reason: "stage insuficiente"}
}

state_updated: {
  full_name: "Felix",  // ← Extraído
  stage: "explore",
  interests: [],
  counters: {0,0,0}
}

state_patch: {
  full_name: "Felix"  // Solo este cambio
}

decision: {
  route: "generic_flow",
  purpose: "options",
  actions: ["greet_only"]
}
```

**Master Agent recibirá**: Instrucción de mantener diálogo exploratorio, sin pedir email, mostrar menú genérico

---

### Caso 2: Pregunta por Servicio

**Escenario**: Usuario pregunta "Quiero info del chatbot"

**Input**:
```javascript
history: [..., {role: "user", text: "Quiero info del chatbot"}]
state: {stage: "explore", interests: [], counters: {0,0,0}}
rag_chunks: [
  {content: "El chatbot de WhatsApp permite automatizar...", score: 0.87},
  // ... 5 más
]
```

**Output**:
```javascript
agent_brief: {
  intent: "service_info",
  stage: "match",  // ← Transición explore → match
  service_target: {
    canonical: "WhatsApp Chatbot",
    bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"],
    rag_hints: ["beneficios chatbot", "casos de uso whatsapp"]
  },
  cta_menu: {items: ["Ver precios", "Beneficios e integraciones", ...]},
  recommendation: "INSTRUCCIONES PARA MASTER: Consultar RAG con hints...",
  reask_decision: {can_ask_email_now: false}
}

state_updated: {
  stage: "match",
  interests: ["WhatsApp", "CRM"],  // ← Inferido
  counters: {services_seen: 1, deep_interest: 1}  // ← +1, +1
}

state_patch: {
  stage: "match",
  interests: ["WhatsApp", "CRM"],
  counters: {services_seen: 1, deep_interest: 1}
}

decision: {
  route: "service_selected_flow",  // ← RAG activo
  purpose: "benefits_cta",
  guardrails: {dont_restart_main_menu: true},  // stage >= match
  rag: {
    active: true,
    hints: ["beneficios chatbot", "casos de uso whatsapp"],
    bundle: ["WhatsApp Chatbot", "AI Automation", "CRM Integration"]
  },
  actions: []
}
```

**Master Agent recibirá**: RAG chunks + instrucción de presentar beneficios + CTA 4 opciones + NO menú general

---

### Caso 3: Pregunta por Precio

**Escenario**: Usuario pregunta "¿Cuánto cuesta el chatbot?"

**Input**:
```javascript
history: [..., {role: "user", text: "¿Cuánto cuesta el chatbot?"}]
state: {stage: "match", interests: ["WhatsApp"], counters: {1,0,1}}
```

**Output**:
```javascript
agent_brief: {
  intent: "price",
  stage: "price",  // ← Transición match → price
  service_target: {canonical: "WhatsApp Chatbot", ...},
  cta_menu: {
    items: [
      "Ver precios",
      "Calcular presupuesto",  // ← Reemplaza "Beneficios e integraciones"
      "Agendar demo",
      "Solicitar propuesta"
    ]
  },
  recommendation: "INSTRUCCIONES PARA MASTER: Preguntar por volumen/mes...",
  reask_decision: {can_ask_email_now: false}
}

state_updated: {
  stage: "price",
  counters: {services_seen: 1, prices_asked: 1, deep_interest: 2}  // ← +1, +1
}

state_patch: {
  stage: "price",
  counters: {prices_asked: 1, deep_interest: 2}
}

decision: {
  route: "service_selected_flow",
  purpose: "price_cta",  // ← Foco en precio
  guardrails: {
    dont_restart_main_menu: true,
    dont_require_volume_first: false  // Puede pedir volumen
  },
  rag: {active: true, hints: [...]},
  actions: ["acknowledge_price"]
}
```

**Master Agent recibirá**: Instrucción de preguntar por volumen + CTA "Calcular presupuesto" + puede mencionar pricing

---

### Caso 4: Email Gating (7 condiciones cumplidas)

**Escenario**: Usuario dice "Quiero una cotización formal"

**Input**:
```javascript
history: [..., {role: "user", text: "Quiero una cotización formal"}]
state: {
  stage: "qualify",
  interests: ["WhatsApp", "CRM"],
  business_name: "Acme Corp",
  counters: {services_seen: 1, prices_asked: 1, deep_interest: 2},
  cooldowns: {email_ask_ts: null}
}
```

**Validación de 7 condiciones**:
```javascript
✅ 1. stage = "qualify" in ["qualify", "proposal_ready"]
✅ 2. interests = ["WhatsApp", "CRM"] (length = 2 >= 1)
✅ 3. counters.services_seen = 1 >= 1
✅ 4. counters.deep_interest = 2 >= 1
✅ 5. business_name = "Acme Corp" !== ""
✅ 6. proposal_intent detectado en mensaje
✅ 7. email_ask_ts = null (no preguntamos antes)

→ can_ask_email_now = TRUE ✅
```

**Output**:
```javascript
agent_brief: {
  intent: "request_proposal",
  stage: "qualify",
  recommendation: "INSTRUCCIONES PARA MASTER: Solicitar email para enviar cotización...",
  reask_decision: {
    can_ask_email_now: true,  // ← ✅
    can_ask_addressee_now: false,
    reason: "stage qualify; intereses≥1; services_seen≥1; deep_interest≥2; business_name presente; proposal_intent detectado; cooldown email null"
  }
}

decision: {
  route: "service_selected_flow",
  purpose: "options",
  actions: ["ask_email"]  // ← Master Agent DEBE pedir email
}
```

**Master Agent recibirá**: Instrucción explícita de pedir email + CTA "Recibir propuesta por email"

---

## Performance y Costos

### Timing por Nodo

| Nodo | Nombre | Tipo | Duración | % de ETAPA 4 |
|------|--------|------|----------|--------------|
| 40 | HydrateForHistory | Code | 50ms | 2% |
| 41 | Smart Input | Code | 100ms | 5% |
| **42** | **Chat History Processor** | **LLM** | **1500-2300ms** | **70-80%** |
| 43 | Filter Output | Code | 30ms | 1% |
| 44 | Snapshot Baseline | Code | 20ms | 1% |
| 45 | HydrateStateAndContext | Code | 50ms | 2% |
| 46 | BuildStatePatch | Code | 40ms | 2% |
| 47 | BuildFlagsInput | Code | 30ms | 1% |
| 48 | FlagsAnalyzer | Code | 50ms | 2% |
| **TOTAL** | - | - | **1800-2300ms** | **100%** |

**Observación**: Node 42 (LLM Analyst) es el cuello de botella (70-80% del tiempo).

### Costos por Mensaje

| Componente | Tokens Input | Tokens Output | Costo/Call |
|-----------|--------------|---------------|------------|
| **GPT-3.5-turbo** (Node 42) | 1500-2000 | 300-450 | **$0.002-0.003** |

**Pricing**:
- GPT-3.5-turbo: $0.0005/1K input, $0.0015/1K output

**Proyección mensual**:
- 5,000 mensajes: $10-15/mes
- 10,000 mensajes: $20-30/mes
- 50,000 mensajes: $100-150/mes

**Nota**: GPT-3.5-turbo es **~25x más barato** que GPT-4 ($0.002 vs $0.05 por call)

---

## Optimizaciones

### 1. Fine-tuning de GPT-3.5-turbo
**Problema**: System prompt de 200+ líneas aumenta tokens input

**Solución**: Fine-tune con dataset de 1000+ conversaciones reales

**Beneficio**:
- Reducir system prompt de 200 → 50 líneas
- Tokens input: 1500 → 800 (-47%)
- Costo: $0.002 → $0.001 (-50%)
- Latency: 1500ms → 800ms (-47%)

**Inversión**: $100-200 inicial (fine-tuning), ROI en 10K mensajes

---

### 2. Caching de Options/Rules
**Problema**: Options + Rules se envían en cada llamada (~1000 tokens)

**Solución**: Usar system prompt con referencia a config versionado

```javascript
// Antes (actual):
const userPrompt = `
<options>${JSON.stringify(options)}</options>
<rules>${JSON.stringify(rules)}</rules>
`;

// Después (optimizado):
const systemPrompt = `
Eres Analista Conversacional...
CONFIG: Usa options@v2.json y rules@v3.json como referencia.
`;

const userPrompt = `
<config_version>options@v2, rules@v3</config_version>
`;
```

**Beneficio**:
- Tokens input: 1500 → 800 (-47%)
- Costo: $0.002 → $0.001 (-50%)

---

### 3. Intent Classifier Previo (Pequeño Modelo)
**Problema**: GPT-3.5-turbo cuesta $0.002 por llamada para casos simples (greeting)

**Solución**: Usar modelo pequeño (DistilBERT fine-tuned) para clasificar intent primero

```javascript
// Flujo optimizado:
const quickIntent = await classifyIntent(last_message);  // DistilBERT, 50ms, $0.0001

if (quickIntent === "greeting" || quickIntent === "thank") {
  // Respuesta hardcoded (sin LLM)
  return {
    agent_brief: {
      intent: quickIntent,
      stage: state.stage,  // Sin cambio
      recommendation: "INSTRUCCIONES: Saludo breve..."
    },
    state: state  // Sin cambios
  };
}
else {
  // Casos complejos → GPT-3.5-turbo
  return await callLLMAnalyst(...);
}
```

**Beneficio**:
- 20-30% de mensajes son saludos/agradecimientos simples
- Ahorro: $0.002 → $0.0001 por mensaje simple (-95%)
- Latency: 1500ms → 50ms (-97%)

**Impacto mensual** (5,000 msgs, 25% simples):
- Ahorro: $2.50/mes (25% reducción de costos LLM)
- Latency promedio: 1800ms → 1400ms

---

### 4. Streaming de LLM Output
**Problema**: Master Agent espera 1.5-2.3s para recibir análisis completo

**Solución**: Usar streaming API de OpenAI

```javascript
// Recibir tokens incrementalmente
const stream = await openai.chat.completions.create({
  model: "gpt-3.5-turbo",
  stream: true,
  messages: [...]
});

let partial = "";
for await (const chunk of stream) {
  partial += chunk.choices[0]?.delta?.content || "";

  // Emitir partial updates a Master Agent
  emit("llm_partial", {recommendation: extractRecommendation(partial)});
}
```

**Beneficio**:
- TTFB (Time To First Byte): 500ms vs 1500ms
- Master Agent puede empezar a preparar respuesta antes de recibir análisis completo
- UX: Latency percibida reducida de 1500ms → 800ms

---

### 5. Parallel Processing de State Updates
**Problema**: Nodes 45-48 se ejecutan secuencialmente (~170ms)

**Solución**: Ejecutar en paralelo

```javascript
// Actual (secuencial):
Node 45 → Node 46 → Node 47 → Node 48  (170ms)

// Optimizado (paralelo):
┌─ Node 46 (BuildStatePatch) ────────┐
│                                     ├─→ Node 48 (FlagsAnalyzer)
└─ Node 47 (BuildFlagsInput) ────────┘

Reducción: 170ms → 100ms (-40%)
```

**Beneficio**: Ahorro de 70ms (4% del tiempo de ETAPA 4)

---

## Referencias

### Documentación de Nodos
- [40-hydrate-for-history.md](40-hydrate-for-history.md)
- [41-smart-input.md](41-smart-input.md)
- [42-chat-history-processor.md](42-chat-history-processor.md) ⭐
- [43-filter-output.md](43-filter-output.md)
- [44-snapshot-baseline.md](44-snapshot-baseline.md)
- [45-hydrate-state-and-context.md](45-hydrate-state-and-context.md)
- [46-build-state-patch.md](46-build-state-patch.md)
- [47-build-flags-input.md](47-build-flags-input.md)
- [48-flags-analyzer.md](48-flags-analyzer.md) ⭐

### Prompts Standalone
- [prompts/llm-analyst-system-prompt.md](../prompts/llm-analyst-system-prompt.md) - System prompt v3.3 (~200 líneas)

### Documentación de ETAPAs
- [ETAPA-1-RESUMEN.md](ETAPA-1-RESUMEN.md) - Ingesta
- [ETAPA-2-RESUMEN.md](ETAPA-2-RESUMEN.md) - Contexto & RAG
- [ETAPA-3-RESUMEN.md](ETAPA-3-RESUMEN.md) - Zona de FLAGS
- **ETAPA-4-RESUMEN.md** (este documento) - LLM Analyst & Decision Layer
- [ETAPA-5-RESUMEN.md](ETAPA-5-RESUMEN.md) - Master AI Agent

### Resumen Completo
- [WORKFLOW-COMPLETO-RESUMEN.md](WORKFLOW-COMPLETO-RESUMEN.md) - Overview de las 5 ETAPAs

---

## Notas Finales

**ETAPA 4** es el **cerebro analítico** del workflow. Su función crítica es **interpretar contexto conversacional** usando un LLM (GPT-3.5-turbo) para:

1. **Detectar intención** del usuario con precisión (~95%)
2. **Actualizar estado conversacional** (stage transitions, counters, interests)
3. **Validar políticas de negocio** (email gating, anti-loop, service lock)
4. **Generar recomendaciones técnicas** para Master Agent (≤280 chars)
5. **Construir objeto de decisión** (master_task v3.0) con routing, guardrails, RAG hints

**Patrón arquitectónico**: **Policy-as-Prompt**
- Las 11 políticas de negocio (definidas en Smart Input) se traducen a instrucciones en lenguaje natural
- El LLM actúa como **"intérprete de políticas"** (no como ejecutor de código)
- Ventaja: Flexibilidad para manejar casos edge sin código adicional
- Desventaja: No determinístico, costo ~$0.002/call

**Cuello de botella**: Node 42 (Chat History Processor) consume 70-80% del tiempo de ETAPA 4 (~1.5-2.3s)

**Optimizaciones críticas**:
1. Fine-tuning de GPT-3.5-turbo (ahorro 50% costo + 47% latency)
2. Intent classifier previo (ahorro 95% en casos simples)
3. Streaming de LLM output (reducción 47% de TTFB)

**Trade-offs**:
- **Pro**: Flexibilidad, adaptabilidad, manejo de casos edge
- **Pro**: Costo bajo (~$0.002 vs $0.08 de GPT-4 en ETAPA 5)
- **Contra**: Latency (1.5-2.3s = 25% del workflow total)
- **Contra**: No determinístico (variabilidad en outputs)

**Alternativa (para considerar)**: Rule engine determinístico para casos simples (greeting, service_info) + LLM solo para casos complejos (negotiation, unclear) → reduce costo 60-70% y latency 50-60%.

---

**Última actualización**: 2025-10-31
**Mantenido por**: Leonobitech Engineering Team
