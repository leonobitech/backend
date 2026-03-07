# Qdrant RAG Backup - Sales Agent

Este directorio contiene **backup del sistema RAG (Retrieval-Augmented Generation)** basado en Qdrant vector store que alimenta al Master Agent (Node #50).

## Propósito

- Documentar la configuración del vector store y embeddings
- Preservar el workflow de ingesta de servicios desde Baserow
- Facilitar disaster recovery del índice de vectores
- Servir como referencia para optimizaciones del RAG

---

## Archivos

### `services-vectors.json` (270 líneas)

**Descripción**: Workflow n8n completo "Load Services" que:
1. Obtiene servicios desde Baserow
2. Procesa y limpia los datos
3. Genera embeddings con OpenAI
4. Carga vectores en Qdrant collection "services"

**Export Date**: 2025-11-01 (mismo día que backup Baserow)

---

## Arquitectura del RAG System

```
┌──────────────────────────────────────────────────────────┐
│                    n8n Workflow: Load Services           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Manual Trigger                                       │
│     └─> Ejecuta ingesta manual (admin)                  │
│                                                          │
│  2. Baserow: Get many rows                              │
│     └─> SELECT * FROM Services (table ID: 720)          │
│     └─> Database ID: 4                                   │
│     └─> returnAll: true (trae los 12 servicios)         │
│                                                          │
│  3. Code Node: FilterJsonClean                          │
│     └─> Transforma raw Baserow → clean RAG format       │
│     └─> text: description + features + usecases +       │
│             differentiators + audience                   │
│     └─> metadata/payload: service_id, slug, name,       │
│             category, pricing_model, starting_price,     │
│             integrations, tags, languages, etc.          │
│     └─> baseId: serviceId (para stable chunk IDs)       │
│                                                          │
│  4. Default Data Loader (LangChain)                     │
│     └─> Lee campo "text" de cada servicio               │
│     └─> Attach metadata: service, id                    │
│                                                          │
│  5. Token Splitter (LangChain)                          │
│     └─> chunkSize: 200 tokens                           │
│     └─> chunkOverlap: 20 tokens                         │
│     └─> Split long descriptions into chunks             │
│                                                          │
│  6. Embeddings OpenAI (LangChain)                       │
│     └─> Model: text-embedding-ada-002 (default)         │
│     └─> Batch size: 200                                 │
│     └─> Genera vectores 1536-dimensional                │
│                                                          │
│  7. Qdrant Vector Store (LangChain)                     │
│     └─> Collection: "services"                          │
│     └─> Mode: insert                                    │
│     └─> URL: http://qdrant:6333                         │
│     └─> Almacena vectores + payload/metadata            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Configuración de Qdrant

### Collection: `services`

**Vector Dimension**: 1536 (OpenAI text-embedding-ada-002)

**Distance Metric**: Cosine similarity (default para OpenAI embeddings)

**Payload Schema**:
```json
{
  "service_id": "svc-whatsapp-chatbot",
  "slug": "whatsapp-chatbot",
  "name": "WhatsApp Chatbot",
  "category": "Chatbots",
  "pricing_model": "Mensual",
  "starting_price": 79,
  "sla_tier": "Pro",
  "audience": "PYMES de servicios y retail",
  "status": "Active",
  "languages": ["ES", "EN"],
  "integrations": ["WhatsApp Business", "Chatwoot", "Odoo", "n8n"],
  "tags": ["whatsapp", "pedidos", "faq", "reservas"],
  "public_url": "https://www.leonobitech.com",
  "owner": "Felix",
  "updated_at": "12/09/2025 12:00",
  "schema_v": 1,
  "source": "baserow.Services"
}
```

**Indexed Fields** (para filtros):
- `metadata.service.tags` (array de strings)
- `metadata.service.category` (string)
- `metadata.service.status` (string)
- `metadata.service.integrations` (array de strings)

---

## Pipeline de Ingesta

### 1. Extracción desde Baserow

```javascript
// Node: "Get many rows"
GET /api/database/rows/table/720/
- Database ID: 4
- Table ID: 720 (Services table)
- returnAll: true
```

### 2. Transformación (FilterJsonClean)

**Lógica de Limpieza**:
```javascript
// Manejo de select/multiselect de Baserow
function val(x) {
  if (x && typeof x === 'object' && 'value' in x) return x.value;
  return x ?? '';
}

// Arrays limpios (remueve nulls/empties)
function arrValues(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(v => val(v)).filter(Boolean);
}
```

**Construcción del Texto Canónico**:
```javascript
// Concatena campos relevantes para embeddings
const parts = [];
if (description)     parts.push(description);
if (keyFeatures)     parts.push(`Features: ${keyFeatures}`);
if (useCases)        parts.push(`Use cases: ${useCases}`);
if (differentiators) parts.push(`Differentiators: ${differentiators}`);
if (audience)        parts.push(`Audience: ${audience}`);
const text = parts.join('\n\n');
```

**Ejemplo de Output**:
```
Automatiza conversaciones en WhatsApp Business: captura leads, responde FAQs, toma pedidos/reservas y deriva a humano cuando corresponde.

Features: captura de leads; respuestas rápidas; toma de pedidos; reservas; handoff a humano; verificación de datos

Use cases: Restaurantes que toman pedidos; Retail con FAQs repetitivas; Talleres que coordinan turnos

Differentiators: Plantillas conversacionales optimizadas en ES; integración nativa con Chatwoot/Odoo; analítica conversacional incluida

Audience: PYMES de servicios y retail
```

### 3. Chunking

**Strategy**: Token-based splitting
- **Chunk Size**: 200 tokens (~800 caracteres)
- **Overlap**: 20 tokens (~80 caracteres)

**Razón**: Los servicios tienen descriptions cortas (1-3 párrafos), así que la mayoría resulta en 1-2 chunks por servicio.

**Total Chunks Esperados**: ~15-20 chunks para 12 servicios

### 4. Embedding Generation

**Model**: OpenAI text-embedding-ada-002
- **Dimension**: 1536
- **Batch Size**: 200 (procesa todos los chunks en 1 batch)
- **Cost**: ~$0.0001 per 1K tokens (muy bajo para 12 servicios)

### 5. Vector Storage

**Qdrant Endpoint**: `http://qdrant:6333`
**Collection**: `services`
**Mode**: `insert` (sobrescribe si ya existe chunk con mismo ID)

**ID Strategy**:
```javascript
// baseId proporcionado por FilterJsonClean
const baseId = serviceId; // "svc-whatsapp-chatbot"
// Vector Store genera: `${baseId}:${chunkIndex}`
// Ejemplo: "svc-whatsapp-chatbot:0", "svc-whatsapp-chatbot:1"
```

---

## Consulta desde Sales Agent

### Flujo de RAG Query

```
┌──────────────────────────────────────────────────────────┐
│         Sales Agent Workflow: RAG Retrieval             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Master Agent (Node #50)                                │
│     └─> Tiene disponible tool: qdrant_query             │
│     └─> System prompt indica cuándo usar RAG            │
│                                                          │
│  RAG Decision Logic (en System Prompt):                 │
│     - Usuario pregunta por servicios específicos        │
│     - Usuario menciona industria/use case               │
│     - Usuario pregunta "qué ofrecen"                    │
│     - Intent: "explore_services", "price_question"      │
│                                                          │
│  qdrant_query(query, filters)                           │
│     └─> Embedding de query: OpenAI ada-002             │
│     └─> Similarity search en collection "services"      │
│     └─> Top K: 3-5 chunks más relevantes               │
│     └─> Filtros opcionales:                             │
│         - tags: ["odoo", "integraciones"]               │
│         - category: "Chatbots"                          │
│         - status: "Active"                              │
│                                                          │
│  Output: rag_hints                                      │
│     └─> Array de servicios con scores                   │
│     └─> Metadatos: name, category, pricing, features    │
│     └─> Usado para personalizar response                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Ejemplo de Query

**HTTP Request Node** (en workflow):
```bash
POST http://qdrant:6333/collections/services/points/scroll
Content-Type: application/json

{
  "limit": 12,
  "with_payload": true,
  "with_vector": false,
  "filter": {
    "must": [
      {
        "key": "metadata.service.tags",
        "match": {
          "any": ["odoo", "integraciones"]
        }
      }
    ]
  }
}
```

**Response** (simplified):
```json
{
  "result": {
    "points": [
      {
        "id": "svc-odoo-automation:0",
        "payload": {
          "service_id": "svc-odoo-automation",
          "name": "Process Automation (Odoo/ERP)",
          "category": "Automations",
          "starting_price": 1200,
          "tags": ["odoo", "crm", "erp", "integraciones"]
        }
      },
      {
        "id": "svc-data-sync:0",
        "payload": {
          "service_id": "svc-data-sync",
          "name": "Data Sync Hub",
          "category": "Integrations",
          "starting_price": 700,
          "tags": ["sync", "integraciones", "dedupe"]
        }
      }
    ]
  }
}
```

---

## Integración con Master Agent

### System Prompt - RAG Usage Policy

**Cuándo usar RAG** (según System Prompt Node #50):

1. **explore_services**: Usuario pregunta "qué servicios tienen", "qué ofrecen"
2. **price_question**: Usuario menciona presupuesto o pregunta por precios
3. **match_intent**: Usuario describe problema específico (automatizar WhatsApp, CRM, etc.)
4. **industry_context**: Usuario menciona industria (restaurante, clínica, retail) → RAG filtra por use_cases
5. **integration_question**: Usuario pregunta "integran con X" → RAG filtra por integrations

**Proceso**:
```javascript
// 1. Master Agent recibe inputs
const inputs = {
  last_incoming: "Necesito automatizar mi restaurante",
  state: { stage: "explore", interests: [] },
  flags: { purpose: "benefits_cta", allow_rag: true }
};

// 2. Master Agent decide usar RAG
if (flags.allow_rag && needsServiceInfo(last_incoming)) {
  const query = extractKeywords(last_incoming); // "automatizar restaurante"
  const filters = { tags: ["restaurante", "pedidos", "reservas"] };
  const rag_results = await qdrant_query(query, filters);
}

// 3. Master Agent formatea response
const rag_hints = rag_results.map(r => ({
  name: r.payload.name,
  category: r.payload.category,
  audience: r.payload.audience,
  features: r.payload.key_features,
  price: r.payload.starting_price
}));

// 4. Response incluye servicios relevantes
output = {
  text: "Para restaurantes, tenemos 2 soluciones perfectas:\n1. WhatsApp Chatbot...\n2. Smart Reservations...",
  rag_used: true,
  sources: ["svc-whatsapp-chatbot", "svc-reservations"]
};
```

### Bug Documentado: RAG Not Used (83%)

**Issue**: En 5 de 6 mensajes de testing, Master Agent NO usó RAG cuando debía.

**Evidencia** (AGENT-TESTING-LOG.md):
- FALLA #1, #3, #5, #7, #11, #13, #17, #21: `rag_used: false`, `sources: []`
- Respuestas genéricas sin personalización
- No mencionó servicios específicos relevantes

**MEJORA #3 propuesta**: RAG Usage Mandate
- Modificar System Prompt con policy más estricta
- Ejemplos concretos de cuándo usar RAG
- Penalizar respuestas genéricas

---

## Mantenimiento del Vector Store

### Actualizar Servicios

**Proceso**:
1. Editar servicio en Baserow (tabla Services)
2. Ejecutar workflow "Load Services" manualmente en n8n
3. Qdrant hace upsert (reemplaza chunks del servicio actualizado)

**Trigger**: Manual (botón "Execute workflow" en n8n)

**Frecuencia Recomendada**:
- Después de agregar nuevo servicio
- Después de modificar description/features/usecases
- Después de cambiar pricing (para que RAG tenga info actualizada)

### Re-indexación Completa

**Cuándo**:
- Cambio de modelo de embeddings
- Cambio de chunking strategy
- Corrupción del índice

**Pasos**:
1. Eliminar collection en Qdrant: `DELETE /collections/services`
2. Crear nueva collection con mismo schema
3. Ejecutar "Load Services" workflow

### Monitoreo

**Métricas Clave**:
- **Total Points**: Debería ser ~15-20 (1-2 chunks por servicio)
- **Collection Size**: ~50-100KB (12 servicios × 1536 dims × 4 bytes)
- **Query Latency**: <50ms para top-5 similarity search

**Health Check** (HTTP Request):
```bash
GET http://qdrant:6333/collections/services
```

**Expected Response**:
```json
{
  "result": {
    "status": "green",
    "vectors_count": 18,
    "points_count": 18,
    "segments_count": 1,
    "config": {
      "params": {
        "vectors": {
          "size": 1536,
          "distance": "Cosine"
        }
      }
    }
  }
}
```

---

## Debugging RAG Issues

### Issue: RAG no devuelve resultados

**Posibles Causas**:
1. Collection vacía (run "Load Services")
2. Filtros demasiado restrictivos
3. Query embedding falló (OpenAI API error)
4. Qdrant service down

**Debug Steps**:
```bash
# 1. Verificar collection existe
curl http://qdrant:6333/collections/services

# 2. Verificar puntos cargados
curl -X POST http://qdrant:6333/collections/services/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 1, "with_payload": true, "with_vector": false}'

# 3. Test query simple (sin filtros)
curl -X POST http://qdrant:6333/collections/services/points/search \
  -H "Content-Type: application/json" \
  -d '{"vector": [0.1, 0.2, ...], "limit": 5}'
```

### Issue: RAG devuelve servicios irrelevantes

**Posibles Causas**:
1. Query muy genérica ("ayuda", "info")
2. Embeddings no capturan semántica (model issue)
3. Metadata en payload incorrecta

**Mitigations**:
- Mejorar extracción de keywords en Master Agent
- Usar filtros por category/tags cuando sea posible
- Aumentar chunk overlap para mejor contexto

---

## Relación con Baserow

```
Baserow Services Table (source of truth)
    ↓
n8n Workflow "Load Services" (ETL)
    ↓
Qdrant Collection "services" (indexed vectors)
    ↓
Master Agent RAG Query (retrieval)
    ↓
Personalized Response (generation)
```

**Sincronización**:
- **Baserow → Qdrant**: Manual trigger (on-demand)
- **Qdrant → Master Agent**: Real-time query en cada mensaje (si flags.allow_rag)

**Inconsistencia Risk**:
- Si se edita Baserow pero NO se corre "Load Services", RAG tendrá data vieja
- **Mitigación**: Agregar webhook de Baserow → n8n para auto-refresh

---

## Optimizaciones Futuras

### 1. Chunking Inteligente
- Actualmente: Token-based (200 tokens, overlap 20)
- **Mejora**: Semantic chunking (split por secciones: description, features, use cases)
- **Beneficio**: Chunks más coherentes, mejor retrieval

### 2. Hybrid Search
- Actualmente: Solo vector similarity
- **Mejora**: Combinar con keyword search (BM25)
- **Beneficio**: Mejor matching para queries específicas ("Odoo CRM")

### 3. Reranking
- Actualmente: Top-K por cosine similarity
- **Mejora**: Second-stage reranker (cross-encoder)
- **Beneficio**: Mejores top-3 results

### 4. Metadata Enrichment
- Agregar: testimonials, case studies, compatibility matrix
- **Beneficio**: Respuestas más ricas y convincentes

### 5. Incremental Updates
- Actualmente: Full re-index en cada "Load Services"
- **Mejora**: Detectar cambios en Baserow, solo actualizar deltas
- **Beneficio**: Más rápido, menos API calls a OpenAI

---

## Referencias

- **Services Catalog**: `../baserow-schema/services-table.csv`
- **Master Agent**: `../nodes-code-original/50-master-ai-agent-main.js`
- **System Prompt**: `../nodes-code-original/50-System-Prompt.md`
- **Testing Log**: `../docs/AGENT-TESTING-LOG.md` (MEJORA #3: RAG Usage Mandate)
- **Qdrant Docs**: https://qdrant.tech/documentation/
- **LangChain n8n**: https://docs.n8n.io/integrations/langchain/

---

**Última actualización**: 2025-11-01
**Mantenido por**: Felix Figueroa + Claude Code
**Backup Date**: 2025-11-01 (export from n8n production)
