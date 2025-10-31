# Optimization Guide - Sales Agent WhatsApp

**Versión**: 1.0
**Fecha**: 2025-10-31

---

## Tabla de Contenidos

1. [Overview de Optimizaciones](#overview-de-optimizaciones)
2. [Performance Optimization](#performance-optimization)
3. [Cost Optimization](#cost-optimization)
4. [Quality Optimization](#quality-optimization)
5. [Infrastructure Optimization](#infrastructure-optimization)
6. [Monitoring & Metrics](#monitoring--metrics)

---

## Overview de Optimizaciones

### Estado Actual (Baseline)

| Métrica | Valor Actual | Target | Prioridad |
|---------|--------------|--------|-----------|
| **Latency P95** | 8.8s | <6s | 🔴 Alta |
| **Cost per message** | $0.08-0.10 | <$0.05 | 🟡 Media |
| **LLM parsing success** | 95% | >98% | 🟢 Baja |
| **RAG relevance score** | 0.78 | >0.85 | 🟡 Media |
| **Memory usage** | 2.5GB | <1.5GB | 🟡 Media |

### Roadmap de Optimización

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OPTIMIZATION ROADMAP                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Q1 2025 (Quick Wins)                                               │
│  ├─ ✅ Caching de RAG queries (ahorro 1.2s en 30% msgs)             │
│  ├─ ✅ Parallel persistence (ahorro 530ms)                          │
│  ├─ ⏳ GPT-3.5 para casos simples (ahorro $0.078 en 25% msgs)      │
│  └─ ⏳ Streaming de LLM outputs (reduce TTFB 47%)                   │
│                                                                      │
│  Q2 2025 (Medium Effort)                                            │
│  ├─ Fine-tuning GPT-3.5-turbo Analyst (ahorro 47% latency)         │
│  ├─ Prompt compression (ahorro 2000 tokens)                         │
│  ├─ Intent classifier previo (ahorro 95% cost en casos simples)    │
│  └─ Batch updates a Odoo (ahorro 100ms)                            │
│                                                                      │
│  Q3 2025 (High Impact, Long Term)                                   │
│  ├─ Vector DB optimization (sharding, indexing)                     │
│  ├─ Model distillation (GPT-4 → fine-tuned GPT-3.5)                │
│  └─ Infrastructure migration (edge computing)                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Performance Optimization

### 1. Caching de RAG Queries ⚡

**Problema**: Qdrant query toma ~1.2-1.5s por mensaje

**Impacto Estimado**:
- Latency: -1.2s en 30-40% de mensajes
- Latency promedio: 8.8s → 7.5s (-15%)

**Implementación**:

#### Step 1: Agregar Redis cache layer antes de Qdrant

```javascript
// Nuevo nodo ANTES de Node 22 (Qdrant Search)
// Nombre: "RAG Cache Lookup"

const crypto = require('crypto');
const query = $json.query_text;

// Hash query para cache key
const hash = crypto.createHash('md5').update(query).digest('hex');
const cacheKey = `rag:cache:${hash}`;

// Intentar fetch de cache
const cached = await redis.get(cacheKey);

if (cached) {
  // Cache HIT
  const results = JSON.parse(cached);
  console.log(`[RAG CACHE HIT] ${query.slice(0, 50)}...`);

  return {
    source: 'cache',
    results: results,
    query: query
  };
}
else {
  // Cache MISS → continuar a Qdrant
  console.log(`[RAG CACHE MISS] ${query.slice(0, 50)}...`);

  return {
    source: 'qdrant',
    query: query
  };
}
```

#### Step 2: Modificar Node 22 (Qdrant Search) para usar cache conditionally

```javascript
// Agregar Switch antes de Node 22
// Ruta 1: source === 'cache' → skip Qdrant, usar cached results
// Ruta 2: source === 'qdrant' → ejecutar Qdrant query
```

#### Step 3: Agregar nodo para ESCRIBIR a cache después de Qdrant

```javascript
// Nuevo nodo DESPUÉS de Node 23 (Qdrant Parse Results)
// Nombre: "RAG Cache Write"

const results = $json.results;
const query = $json.query;

const hash = crypto.createHash('md5').update(query).digest('hex');
const cacheKey = `rag:cache:${hash}`;

// Guardar en cache por 1 hora
await redis.setex(cacheKey, 3600, JSON.stringify(results));

console.log(`[RAG CACHE WRITE] ${query.slice(0, 50)}...`);

return $json;
```

**Configuración**:
- TTL: 1 hora (3600 segundos)
- Max cache size: 1000 queries (LRU eviction)
- Invalidación: Cuando se re-indexa documentación

**Métricas a monitorear**:
```javascript
{
  cache_hit_rate: 0.35,      // 35% (target: 30-40%)
  avg_latency_cache: 50,     // ms
  avg_latency_qdrant: 1200,  // ms
  cache_size_mb: 15          // MB
}
```

---

### 2. Parallel Persistence ⚡⚡

**Problema**: Nodes 53-55 se ejecutan secuencialmente (~600ms total)

**Impacto Estimado**:
- Latency: -530ms (ahorro del 88%)
- Latency promedio: 8.8s → 8.3s

**Implementación Actual (Sequential)**:
```
Node 53 (Baserow) → 300ms
  ↓
Node 54 (Odoo Email) → 150ms
  ↓
Node 55 (Odoo Chatter) → 150ms

TOTAL: 600ms
```

**Implementación Optimizada (Parallel)**:
```
                    ┌─ Node 53 (Baserow) → 300ms ─┐
Node 52 (Gate) ────┼─ Node 54 (Odoo Email) → 150ms ─┼─→ Node 56 (Chatwoot)
                    └─ Node 55 (Odoo Chatter) → 150ms ─┘

TOTAL: max(300, 150, 150) = 300ms
```

**Pasos**:
1. Eliminar conexiones secuenciales entre Nodes 53-55
2. Conectar los 3 nodos en paralelo desde Node 52
3. Agregar nodo "Merge" después para sincronizar
4. Conectar Merge → Node 56

**Código del nodo Merge**:
```javascript
// Nuevo nodo: "Merge Persistence Results"
// Type: Code
// Input: 3 items (desde Nodes 53, 54, 55)

const baserow = $('StatePatchLead').item.json;
const odooEmail = $('UpdateEmailLead').item.json;
const odooChatter = $('RecordAgentResponse').item.json;

return {
  persistence: {
    baserow_updated: baserow.updated,
    odoo_email_updated: odooEmail.updated,
    odoo_chatter_created: odooChatter.id
  },
  llm: $json.llm,  // Pass-through para Node 56
  timing: {
    parallel_persistence_ms: Date.now() - $json.timing.start
  }
};
```

---

### 3. GPT-3.5 para Casos Simples ⚡⚡⚡

**Problema**: GPT-4 cuesta $0.08/call para todos los mensajes (incluso saludos simples)

**Impacto Estimado**:
- Cost: -$117-234/mes (para 5K msgs, 25% casos simples)
- Latency: -1.9s en 25% de mensajes
- Cost por mensaje: $0.08 → $0.06 (-25%)

**Implementación**:

#### Step 1: Intent Classifier Lightweight

```javascript
// Nuevo nodo ANTES de Node 50 (Master Agent)
// Nombre: "Quick Intent Classifier"

const intent = $json.agent_brief.intent;
const stage = $json.agent_brief.stage;

// Casos simples que NO necesitan GPT-4
const simpleIntents = [
  'greeting',
  'thank',
  'acknowledge',
  'off_topic'
];

// Casos simples por stage
const isSimpleGreeting = (intent === 'greeting' && stage === 'explore');
const isSimpleThank = (intent === 'thank');
const isOffTopic = (intent === 'off_topic');

const useGPT35 = simpleIntents.includes(intent) || isSimpleGreeting || isSimpleThank || isOffTopic;

return {
  ...context,
  routing: {
    model: useGPT35 ? 'gpt-3.5-turbo' : 'gpt-4',
    reason: useGPT35 ? 'simple_case' : 'complex_case'
  }
};
```

#### Step 2: Dynamic Model Selection en Node 50

```javascript
// Modificar Node 50 (Master AI Agent-Main)
// Configuración:

{
  model: "{{ $json.routing.model }}",  // Dynamic
  temperature: 0.7,
  max_tokens: "{{ $json.routing.model === 'gpt-3.5-turbo' ? 400 : 600 }}"
}
```

**Casos cubiertos**:
```javascript
// GPT-3.5-turbo (~$0.002, 600ms):
- "Hola"
- "Gracias"
- "Ok"
- "¿Dónde están ubicados?" (off-topic)

// GPT-4 (~$0.08, 2500ms):
- "Quiero info del chatbot de WhatsApp"
- "¿Cuánto cuesta?"
- "Quiero una cotización"
```

**Métricas**:
```javascript
{
  gpt35_usage_rate: 0.25,     // 25% de mensajes
  cost_savings_month: 234,    // USD (para 5K msgs)
  avg_latency_gpt35: 600,     // ms
  avg_latency_gpt4: 2500      // ms
}
```

---

### 4. Streaming de LLM Outputs ⚡⚡

**Problema**: Master Agent espera 2.5s para completar respuesta antes de empezar formatting

**Impacto Estimado**:
- TTFB (Time To First Byte): -47% (1500ms → 800ms)
- Latency percibida por usuario: -30%

**Implementación**:

```javascript
// Modificar Node 50 (Master AI Agent-Main)
// Habilitar streaming en OpenAI config

{
  model: "gpt-4",
  stream: true,  // ← NUEVO
  max_tokens: 600
}
```

**Agregar nodo procesador de streaming**:

```javascript
// Nuevo nodo DESPUÉS de Node 50
// Nombre: "Stream Processor"

let partialResponse = "";
let recommendation = "";

// Streaming handler
for await (const chunk of $json.stream) {
  const delta = chunk.choices[0]?.delta?.content || "";
  partialResponse += delta;

  // Extractar recommendation early (primeros 280 chars)
  if (partialResponse.length >= 280 && !recommendation) {
    const match = partialResponse.match(/"recommendation":"([^"]+)"/);
    if (match) {
      recommendation = match[1];

      // EARLY EMIT: Pasar recommendation a nodes downstream
      emit('early_recommendation', {recommendation});
    }
  }
}

// Respuesta completa
return {
  full_response: partialResponse,
  recommendation: recommendation
};
```

**Beneficio**: Nodes downstream pueden empezar a preparar mientras GPT-4 sigue generando

---

### 5. Reducir Context Window de Historial ⚡

**Problema**: Fetch de 8-10 mensajes previos de Chatwoot (~200ms + tokens extra)

**Impacto Estimado**:
- Latency: -50ms
- Tokens: -500-800 input tokens
- Cost: -$0.005-0.008/call

**Implementación**:

```javascript
// Modificar Node 20 (Fetch Last Messages)

// Actual:
const messageCount = 10;

// Optimizado:
const messageCount = (counters.messages_since_last_offer < 5) ? 5 : 8;

// Lógica:
// - Conversaciones nuevas (pocos mensajes): Solo 5 últimos
// - Conversaciones largas: 8 últimos
```

**Trade-off**: Menos contexto puede degradar calidad de análisis en conversaciones complejas

**Mitigación**: Monitorear métricas de calidad (user satisfaction, conversion rate) antes/después

---

## Cost Optimization

### 1. Fine-tuning de GPT-3.5-turbo Analyst ⚡⚡⚡

**Problema**: System prompt de 200+ líneas aumenta tokens input

**Impacto Estimado**:
- Tokens input: 1500 → 800 (-47%)
- Cost: $0.002 → $0.001 (-50%)
- Latency: 1500ms → 800ms (-47%)

**Implementación**:

#### Step 1: Crear dataset de entrenamiento

```jsonl
{"messages": [
  {"role": "system", "content": "Eres Analista Conversacional de Leonobitech. Output: JSON con {agent_brief, state}."},
  {"role": "user", "content": "<history>[{\"role\":\"user\",\"text\":\"Hola\"}]</history><profile>{\"stage\":\"explore\"}</profile><state>{\"counters\":{\"services_seen\":0}}</state>"},
  {"role": "assistant", "content": "{\"agent_brief\":{\"intent\":\"greeting\",\"stage\":\"explore\",\"recommendation\":\"Mantener diálogo exploratorio\"},\"state\":{\"stage\":\"explore\",\"counters\":{\"services_seen\":0}}}"}
]}
{"messages": [
  {"role": "system", "content": "Eres Analista Conversacional de Leonobitech. Output: JSON con {agent_brief, state}."},
  {"role": "user", "content": "<history>[{\"role\":\"user\",\"text\":\"Quiero info del chatbot\"}]</history><profile>{\"stage\":\"explore\"}</profile><state>{\"counters\":{\"services_seen\":0}}</state>"},
  {"role": "assistant", "content": "{\"agent_brief\":{\"intent\":\"service_info\",\"stage\":\"match\",\"service_target\":{\"canonical\":\"WhatsApp Chatbot\"}},\"state\":{\"stage\":\"match\",\"interests\":[\"WhatsApp\"],\"counters\":{\"services_seen\":1}}}"}
]}
... (1000+ ejemplos)
```

#### Step 2: Fine-tune

```bash
# Subir dataset
openai api fine_tunes.create \
  -t train.jsonl \
  -v validation.jsonl \
  -m gpt-3.5-turbo \
  --suffix "leonobitech-analyst-v1"

# Costo: ~$100-200 (one-time)
# ROI: Break-even en ~10K mensajes
```

#### Step 3: Usar modelo fine-tuned

```javascript
// Modificar Node 42 (Chat History Processor)

{
  model: "ft:gpt-3.5-turbo:leonobitech:analyst-v1:xxx",  // Fine-tuned model
  system_prompt: "Eres Analista... (VERSION CORTA: 50 líneas)",
  temperature: 0.7
}
```

**Ahorro mensual** (5K msgs):
- Antes: 5000 * $0.002 = $10
- Después: 5000 * $0.001 = $5
- **Ahorro: $5/mes** (ROI en 20-40 meses)

---

### 2. Caching de Options/Rules ⚡⚡

**Problema**: Options + Rules se envían en cada llamada (~1000 tokens)

**Impacto Estimado**:
- Tokens input: 1500 → 800 (-47%)
- Cost: $0.002 → $0.001 (-50%)

**Implementación**:

```javascript
// Modificar Node 41 (Smart Input)

// Antes (actual):
const userPrompt = `
<options>${JSON.stringify(options)}</options>
<rules>${JSON.stringify(rules)}</rules>
... (12KB de texto)
`;

// Después (optimizado):
const systemPrompt = `
Eres Analista Conversacional...

CONFIG REFERENCE:
- options: Ver config@v2.json (services_allowed, stage_allowed, etc.)
- rules: Ver rules@v3.json (11 políticas de negocio)
`;

const userPrompt = `
<config_version>options@v2, rules@v3</config_version>
<history>...</history>
<state>...</state>
`;
```

**Requiere**: Subir config files a OpenAI Files API o incluir en fine-tuning

---

### 3. Model Distillation (GPT-4 → GPT-3.5 Fine-tuned) ⚡⚡⚡

**Problema**: GPT-4 cuesta $0.08/call, pero muchos casos son simples

**Impacto Estimado**:
- Cost: $0.08 → $0.002 (-97.5%) en casos cubiertos por modelo distilado
- Latency: 2500ms → 800ms (-68%)

**Implementación**:

#### Step 1: Generar dataset con GPT-4

```python
# Usar 1000 conversaciones reales
# Para cada una, ejecutar GPT-4 y guardar input/output

dataset = []
for conversation in real_conversations[:1000]:
    gpt4_input = build_user_prompt(conversation)
    gpt4_output = call_gpt4(gpt4_input)

    dataset.append({
        "messages": [
            {"role": "system", "content": master_agent_system_prompt_short},
            {"role": "user", "content": gpt4_input},
            {"role": "assistant", "content": gpt4_output}
        ]
    })

# Guardar
with open('distillation_dataset.jsonl', 'w') as f:
    for item in dataset:
        f.write(json.dumps(item) + '\n')
```

#### Step 2: Fine-tune GPT-3.5-turbo con dataset de GPT-4

```bash
openai api fine_tunes.create \
  -t distillation_dataset.jsonl \
  -m gpt-3.5-turbo \
  --suffix "leonobitech-master-distilled-v1"

# Costo: ~$200-300 (one-time)
```

#### Step 3: A/B testing

```javascript
// 50% tráfico a GPT-4, 50% a GPT-3.5 distilled
const model = (lead_id % 2 === 0) ? 'gpt-4' : 'ft:gpt-3.5-turbo:...:distilled-v1';
```

**Métricas a comparar**:
- User satisfaction (feedback)
- Conversion rate (email collection, proposal requests)
- Response quality (manual review)

**Objetivo**: Si calidad es equivalente, migrar 100% a distilled model

---

## Quality Optimization

### 1. RAG Reranking ⚡⚡

**Problema**: Qdrant devuelve chunks con score 0.7-0.9, pero no todos son igualmente relevantes

**Impacto Estimado**:
- RAG relevance score: 0.78 → 0.87 (+12%)
- User satisfaction: +5-10%

**Implementación**:

```javascript
// Nuevo nodo DESPUÉS de Node 23 (Qdrant Parse Results)
// Nombre: "RAG Reranker"

const chunks = $json.rag_chunks;
const userQuery = $json.query;

// Llamar a modelo de reranking (Cohere Rerank o OpenAI)
const reranked = await rerank({
  query: userQuery,
  documents: chunks.map(c => c.content),
  top_n: 5
});

// Ordenar chunks por nuevo score
const reorderedChunks = reranked.results.map(r => ({
  ...chunks[r.index],
  original_score: chunks[r.index].score,
  rerank_score: r.relevance_score
}));

return {
  rag_chunks: reorderedChunks,
  reranking: {
    applied: true,
    model: 'cohere-rerank-v3',
    latency_ms: reranked.latency
  }
};
```

**Costo adicional**: ~$0.002/call (Cohere Rerank API)

---

### 2. Prompt Versioning & A/B Testing ⚡⚡⚡

**Problema**: No sabemos si system prompts actuales son óptimos

**Implementación**:

```javascript
// Modificar Node 41 (Smart Input)

const variants = {
  'v3.3': SYSTEM_PROMPT_V3_3,  // Actual
  'v3.4': SYSTEM_PROMPT_V3_4,  // Nuevo (más corto)
  'v3.5': SYSTEM_PROMPT_V3_5   // Nuevo (con más ejemplos)
};

// Asignar variant basado en lead_id
const variantKey = ['v3.3', 'v3.4', 'v3.5'][lead_id % 3];
const systemPrompt = variants[variantKey];

// Trackear variant
return {
  ...context,
  meta: {
    ...meta,
    prompt_variant: variantKey
  }
};
```

**Métricas por variant**:
```javascript
{
  variant: 'v3.4',
  metrics: {
    avg_latency: 1800,
    cost_per_call: 0.0018,
    parsing_success_rate: 0.97,
    user_satisfaction: 4.2,
    conversion_rate: 0.14
  }
}
```

**Análisis**: Después de 1000 mensajes por variant, elegir el ganador

---

## Infrastructure Optimization

### 1. Regional Deployment (Edge Computing) ⚡⚡⚡

**Problema**: n8n/Baserow/Odoo en diferentes regiones → latency alta

**Impacto Estimado**:
- Network latency: -200-400ms
- Latency total: 8.8s → 7.5s (-15%)

**Implementación**:

```
Actual (Multi-region):
┌──────────────────────────────────────────┐
│ n8n (US-East)                            │
│  ↓ 100ms latency                         │
│ Baserow (EU-West)                        │
│  ↓ 150ms latency                         │
│ Odoo (US-West)                           │
│  ↓ 120ms latency                         │
│ Qdrant (EU-Central)                      │
└──────────────────────────────────────────┘
TOTAL NETWORK LATENCY: ~370ms

Optimizado (Same region):
┌──────────────────────────────────────────┐
│ n8n (US-East-1a)                         │
│  ↓ 10ms latency                          │
│ Baserow (US-East-1a)                     │
│  ↓ 10ms latency                          │
│ Odoo (US-East-1a)                        │
│  ↓ 10ms latency                          │
│ Qdrant (US-East-1a)                      │
└──────────────────────────────────────────┘
TOTAL NETWORK LATENCY: ~30ms
AHORRO: 340ms
```

**Pasos**:
1. Migrar todos los servicios a la misma región AWS (US-East-1)
2. Usar VPC peering para conectividad privada
3. Configurar DNS privado

---

### 2. Database Indexing (Baserow/Odoo) ⚡

**Problema**: Queries a Baserow/Odoo lentos (>300ms)

**Implementación**:

```sql
-- Baserow: Indexar por chatwoot_id (búsqueda principal)
CREATE INDEX idx_leads_chatwoot_id ON leads(chatwoot_id);

-- Odoo: Indexar por phone
CREATE INDEX idx_crm_lead_phone ON crm_lead(phone);
```

**Impacto**: Baserow query de 300ms → 50ms (-83%)

---

## Monitoring & Metrics

### Métricas Clave a Monitorear

```javascript
const metrics = {
  // Performance
  latency_p50: 7500,           // ms
  latency_p95: 8800,           // ms
  latency_p99: 12000,          // ms

  // Cost
  cost_per_message: 0.082,     // USD
  monthly_cost_5k: 410,        // USD (5K msgs)
  monthly_cost_50k: 4100,      // USD (50K msgs)

  // Quality
  parsing_success_rate: 0.995, // 99.5%
  rag_avg_score: 0.78,
  user_satisfaction: 4.1,      // /5
  conversion_rate: 0.12,       // 12%

  // Infrastructure
  cpu_usage: 0.45,             // 45%
  memory_usage: 0.62,          // 62%
  error_rate: 0.02,            // 2%

  // A/B Testing
  prompt_variants: {
    'v3.3': {messages: 3500, conversion: 0.12},
    'v3.4': {messages: 1500, conversion: 0.14}
  }
};
```

### Dashboard Recomendado

```
┌────────────────────────────────────────────────────────────────┐
│                     SALES AGENT DASHBOARD                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Latency (P95):      8.8s  ▼ 12% vs last week                 │
│  Cost/Msg:        $0.082    ▲ 3% vs last week                  │
│  Success Rate:      99.5%   ✓ On target                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Latency Breakdown (P95)                                  │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ ETAPA 1 (Ingesta):          150ms  ████                  │  │
│  │ ETAPA 2 (RAG):             2100ms  ████████████████████  │  │
│  │ ETAPA 3 (FLAGS):            400ms  █████                 │  │
│  │ ETAPA 4 (LLM Analyst):     2200ms  ████████████████████  │  │
│  │ ETAPA 5 (Master Agent):    4300ms  ██████████████████████│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Cost Breakdown (per 1K messages)                         │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ GPT-4 (Master):          $80  ████████████████████████   │  │
│  │ GPT-3.5 (Analyst):        $2  █                          │  │
│  │ Infrastructure:           $8  ██                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ A/B Test Results (Prompt v3.3 vs v3.4)                   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                     v3.3       v3.4      Delta           │  │
│  │ Latency:           1800ms     1500ms     -17% ✓          │  │
│  │ Cost:            $0.002     $0.0015     -25% ✓          │  │
│  │ Conversion:         12%        14%       +2% ✓          │  │
│  │ Recommendation: Deploy v3.4 to 100%                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Quick Wins (1-2 weeks)

- [ ] Implementar caching de RAG queries
- [ ] Paralelizar persistence (Nodes 53-55)
- [ ] Agregar routing a GPT-3.5 para casos simples
- [ ] Reducir context window de historial a 5-8 mensajes
- [ ] Habilitar streaming en OpenAI config

**Expected Impact**: Latency -20%, Cost -15%

### Phase 2: Medium Effort (1-2 months)

- [ ] Fine-tuning de GPT-3.5-turbo Analyst
- [ ] Prompt compression (remover options/rules del user prompt)
- [ ] Intent classifier previo con DistilBERT
- [ ] Batch updates a Odoo (single XML-RPC call)
- [ ] RAG reranking con Cohere

**Expected Impact**: Latency -30%, Cost -35%

### Phase 3: Long Term (3-6 months)

- [ ] Model distillation (GPT-4 → GPT-3.5 fine-tuned)
- [ ] Regional deployment (todo en US-East-1)
- [ ] Database indexing (Baserow + Odoo)
- [ ] Vector DB optimization (sharding, indexing)
- [ ] Infrastructure migration a edge computing

**Expected Impact**: Latency -50%, Cost -60%

---

## ROI Calculator

```javascript
function calculateROI(monthlyMessages, optimizationPhase) {
  const baseline = {
    latency: 8.8,        // seconds
    cost_per_msg: 0.082  // USD
  };

  const phases = {
    phase1: {latency: 7.0, cost_per_msg: 0.070, effort_hours: 40},
    phase2: {latency: 6.2, cost_per_msg: 0.053, effort_hours: 160},
    phase3: {latency: 4.4, cost_per_msg: 0.033, effort_hours: 480}
  };

  const target = phases[optimizationPhase];

  const monthly_savings = (baseline.cost_per_msg - target.cost_per_msg) * monthlyMessages;
  const implementation_cost = target.effort_hours * 50;  // $50/hour
  const roi_months = implementation_cost / monthly_savings;

  return {
    monthly_savings: monthly_savings.toFixed(2),
    latency_improvement: ((baseline.latency - target.latency) / baseline.latency * 100).toFixed(1) + '%',
    cost_improvement: ((baseline.cost_per_msg - target.cost_per_msg) / baseline.cost_per_msg * 100).toFixed(1) + '%',
    implementation_cost: implementation_cost,
    roi_months: roi_months.toFixed(1)
  };
}

// Ejemplo: 5K mensajes/mes, Phase 2
console.log(calculateROI(5000, 'phase2'));
// {
//   monthly_savings: "145.00",      // USD/mes
//   latency_improvement: "29.5%",
//   cost_improvement: "35.4%",
//   implementation_cost: 8000,      // USD (one-time)
//   roi_months: "55.2"              // Break-even en 55 meses
// }
```

---

**Última actualización**: 2025-10-31
**Mantenido por**: Leonobitech Engineering Team
