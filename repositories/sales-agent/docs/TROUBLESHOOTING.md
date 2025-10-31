# Troubleshooting Guide - Sales Agent WhatsApp

**Versión**: 1.0
**Fecha**: 2025-10-31

---

## Tabla de Contenidos

1. [Errores de LLM](#errores-de-llm)
2. [Problemas de Performance](#problemas-de-performance)
3. [Errores de Persistencia](#errores-de-persistencia)
4. [Problemas de RAG](#problemas-de-rag)
5. [Errores de Parsing](#errores-de-parsing)
6. [Issues de Cooldowns](#issues-de-cooldowns)
7. [Problemas de Integración](#problemas-de-integración)

---

## Errores de LLM

### Error: LLM Analyst devuelve JSON inválido

**Síntomas**:
- Node 43 (Filter Output) falla constantemente
- Logs muestran `JSON.parse error`
- Output del LLM contiene texto extra antes/después del JSON

**Causas**:
1. System prompt muy largo (>2500 tokens)
2. Few-shot examples demasiado complejos
3. Output limit muy bajo (<1800 caracteres)
4. Temperatura muy alta (>0.8)

**Diagnóstico**:
```bash
# Ver output del LLM Analyst (Node 42)
n8n workflow:logs --workflow sales-agent --node "Chat History Processor"

# Contar tokens del system prompt
wc -w prompts/llm-analyst-system-prompt.md
```

**Solución**:
1. Reducir few-shot examples de 6 a 3
2. Reducir system prompt eliminando ejemplos redundantes
3. Aumentar output limit a 2000 caracteres
4. Reducir temperatura a 0.7
5. Habilitar "Require Specific Output Format" en node config

**Prevención**:
- Monitorear tasa de errores de parsing (debe ser <5%)
- A/B testing de prompts antes de deployment

---

### Error: GPT-4 Master Agent responde fuera de contexto

**Síntomas**:
- Respuesta del Master Agent no relacionada con pregunta del usuario
- Menciona servicios que no existen
- Ignora recomendaciones del LLM Analyst

**Causas**:
1. UserPrompt (Node 49) no incluye recommendation del Analyst
2. RAG chunks no relevantes o vacíos
3. System prompt del Master Agent desactualizado
4. Service lock no enforced correctamente

**Diagnóstico**:
```javascript
// Ver UserPrompt construido en Node 49
console.log($json.userPrompt);

// Verificar que incluye:
// - <analyst_recommendation>...</analyst_recommendation>
// - <rag_chunks>...</rag_chunks>
// - <lead_state>...</lead_state>
```

**Solución**:
1. Verificar que Node 49 incluye TODAS las secciones XML del UserPrompt
2. Validar que RAG query (Node 22) devuelve chunks con score >0.7
3. Actualizar system prompt del Master Agent (Node 50) con ejemplos más recientes
4. Agregar validación de service lock en Node 51 (Output Main)

**Prevención**:
- Logging estructurado de inputs/outputs del Master Agent
- Alertas si response no menciona servicio cuando service_target != null

---

### Error: OpenAI API Rate Limit

**Síntomas**:
- Error 429 "Rate limit exceeded"
- Workflow se detiene en Nodes 42 o 50
- Mensajes de usuarios quedan sin responder

**Causas**:
1. Demasiadas llamadas concurrentes a OpenAI API
2. Límite de tokens/minuto excedido
3. Organización de OpenAI en tier gratuito

**Diagnóstico**:
```bash
# Ver límites actuales de OpenAI
curl https://api.openai.com/v1/usage \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Solución**:
1. **Inmediata**: Implementar retry con exponential backoff
   ```javascript
   // En Node 42 y 50: Enable "Retry On Fail"
   {
     maxRetries: 3,
     retryInterval: 2000,
     exponentialBackoff: true
   }
   ```

2. **Corto plazo**: Implementar queue con rate limiting
   ```javascript
   // Agregar Redis queue antes de Node 42
   const queueKey = "llm:queue";
   const rateLimitPerMinute = 50;

   await redis.lpush(queueKey, JSON.stringify(payload));
   // Procesar con rate limiting
   ```

3. **Largo plazo**: Actualizar tier de OpenAI a "Tier 2" o superior

**Prevención**:
- Monitorear uso de API con dashboard de OpenAI
- Alertas cuando uso >80% del límite
- Implementar caching para preguntas frecuentes

---

## Problemas de Performance

### Error: Workflow muy lento (>15 segundos)

**Síntomas**:
- Latencia total >15s (normal: 7-9s)
- Usuarios reportan timeouts
- Chatwoot muestra "typing..." por mucho tiempo

**Diagnóstico**:
```bash
# Ver timing por nodo
n8n workflow:timing --workflow sales-agent

# Expected breakdown:
# - ETAPA 1: ~150ms
# - ETAPA 2: ~2s (Qdrant query)
# - ETAPA 3: ~400ms
# - ETAPA 4: ~2s (GPT-3.5)
# - ETAPA 5: ~4s (GPT-4 + persistence)
```

**Causas comunes**:

#### 1. Qdrant Query Lento (>3s)
**Solución**:
```javascript
// Node 22: Reducir limit de resultados
{
  limit: 5,  // En lugar de 8
  score_threshold: 0.75  // Subir de 0.7 a 0.75
}
```

#### 2. GPT-4 Lento (>5s)
**Solución**:
```javascript
// Node 50: Reducir max_tokens
{
  model: "gpt-4",
  max_tokens: 500,  // En lugar de 800
  temperature: 0.7
}
```

#### 3. Baserow/Odoo Timeout (>2s)
**Solución**:
- Verificar que Baserow/Odoo están en misma región que n8n
- Implementar caching de lead state en Redis
- Ejecutar Nodes 53-55 (persistence) en paralelo

**Prevención**:
- Monitorear P95 latency por ETAPA
- Alertas si latencia total >12s

---

### Error: Alto uso de memoria en n8n

**Síntomas**:
- n8n se crashea con "Out of Memory"
- Workflow se detiene aleatoriamente
- RAM usage >80%

**Causas**:
1. Buffer de mensajes (Redis) muy grande
2. Historial conversacional muy largo (>50 mensajes)
3. RAG chunks muy grandes (>10KB cada uno)

**Diagnóstico**:
```bash
# Ver tamaño del buffer
redis-cli --scan --pattern "whatsapp:buffer:*" | xargs redis-cli memory usage

# Ver RAM usage de n8n
docker stats n8n
```

**Solución**:
1. Limitar buffer a 10 mensajes máximo
   ```javascript
   // Node 8: Buf_FetchAll
   const messages = await redis.lrange(bufferKey, 0, 9);  // Solo 10 últimos
   ```

2. Truncar historial conversacional a 8 mensajes
   ```javascript
   // Node 26: Chat History Filter
   const history = allMessages.slice(-8);  // Solo 8 últimos
   ```

3. Limitar tamaño de RAG chunks
   ```javascript
   // Node 24: Qdrant Format Chunks
   const chunk = content.slice(0, 500);  // Máx 500 caracteres
   ```

**Prevención**:
- Monitorear memoria de n8n con Prometheus
- Alertas si memoria >70%
- Implementar garbage collection manual

---

## Errores de Persistencia

### Error: Lead no se crea en Baserow

**Síntomas**:
- Node 18 (Fetch or Create Lead) falla
- Error: "Field validation failed"
- Usuario recibe mensaje pero lead no se registra

**Causas**:
1. Schema de Baserow cambió (columnas nuevas required)
2. Phone number en formato incorrecto
3. API Token de Baserow expirado

**Diagnóstico**:
```bash
# Verificar API token
curl -H "Authorization: Token $BASEROW_TOKEN" \
  https://api.baserow.io/api/database/rows/table/12345/1/

# Ver schema de tabla
curl -H "Authorization: Token $BASEROW_TOKEN" \
  https://api.baserow.io/api/database/fields/table/12345/
```

**Solución**:
1. Actualizar payload en Node 18 con campos requeridos:
   ```javascript
   {
     phone: normalizePhone($json.phone),  // +525512345678
     chatwoot_id: $json.conversation_id,
     stage: "explore",  // Default
     interests: [],     // Default array vacío
     counters: {        // Default
       services_seen: 0,
       prices_asked: 0,
       deep_interest: 0
     }
   }
   ```

2. Validar phone format:
   ```javascript
   function normalizePhone(raw) {
     const cleaned = raw.replace(/[^0-9+]/g, '');
     return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
   }
   ```

3. Regenerar API token en Baserow y actualizar en n8n credentials

**Prevención**:
- Schema validation automática antes de insert
- Alertas si error rate >5%

---

### Error: Odoo XML-RPC falla constantemente

**Síntomas**:
- Nodes 54-55 (Odoo updates) fallan
- Error: "Connection timeout"
- Chatter de Odoo no se actualiza

**Causas**:
1. Odoo server sobrecargado (>500ms response time)
2. XML-RPC calls muy grandes (>100KB)
3. Network latency alto entre n8n y Odoo

**Diagnóstico**:
```python
# Test directo de XML-RPC
import xmlrpc.client

url = "https://odoo.leonobitech.com"
db = "production"
username = "admin"
password = "xxx"

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})

models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
leads = models.execute_kw(db, uid, password, 'crm.lead', 'search_read', [[]], {'limit': 1})
print(leads)
```

**Solución**:
1. Aumentar timeout en Nodes 54-55:
   ```yaml
   timeout: 10000  # 10 segundos en lugar de 5
   ```

2. Reducir tamaño del body HTML en chatter:
   ```javascript
   // Node 55: Truncar body si es muy largo
   const body = body_html.slice(0, 5000);  // Máx 5KB
   ```

3. Implementar retry con exponential backoff
4. Considerar usar Odoo REST API en lugar de XML-RPC (más rápido)

**Prevención**:
- Health check de Odoo cada 5 minutos
- Fallback queue si Odoo está down

---

## Problemas de RAG

### Error: Qdrant no devuelve resultados relevantes

**Síntomas**:
- RAG chunks con score <0.5
- Respuestas genéricas sin información específica
- Master Agent dice "no tengo información sobre eso"

**Causas**:
1. Embeddings desactualizados o mal generados
2. Query muy corto (<10 caracteres)
3. Collection de Qdrant vacía o corrupta
4. Score threshold muy alto

**Diagnóstico**:
```bash
# Verificar collection existe
curl http://qdrant:6333/collections/leonobitech-docs

# Ver cantidad de vectors
curl http://qdrant:6333/collections/leonobitech-docs | jq '.result.vectors_count'

# Test query manual
curl -X POST http://qdrant:6333/collections/leonobitech-docs/points/search \
  -H 'Content-Type: application/json' \
  -d '{
    "vector": [0.1, 0.2, ...],
    "limit": 5,
    "score_threshold": 0.7
  }'
```

**Solución**:
1. Reducir score threshold:
   ```javascript
   // Node 22: Qdrant Search
   {
     score_threshold: 0.6  // Bajar de 0.7 a 0.6
   }
   ```

2. Re-generar embeddings con modelo más reciente:
   ```bash
   # Usar text-embedding-3-large en lugar de text-embedding-ada-002
   ```

3. Expandir query con sinónimos:
   ```javascript
   // Node 21: Qdrant Query Input
   const expanded = expandQuery(userMessage);  // "chatbot" → "chatbot whatsapp bot automatización"
   ```

4. Verificar que collection tiene datos:
   ```bash
   # Verificar conteo
   curl http://qdrant:6333/collections/leonobitech-docs/points/count
   ```

**Prevención**:
- Monitorear average score de RAG chunks (debe ser >0.75)
- Re-indexar documentación mensualmente
- A/B testing de diferentes modelos de embedding

---

## Errores de Parsing

### Error: Output Main (Node 51) no puede parsear respuesta del Master Agent

**Síntomas**:
- Node 51 falla con "Parse error"
- Validation warnings: "Strategy 2 used" o "Strategy 3 used"
- Respuesta final malformada

**Causas**:
1. Master Agent devuelve JSON con prefijo/sufijo de texto
2. JSON contiene caracteres especiales sin escapar
3. JSON muy grande (>10KB)

**Diagnóstico**:
```javascript
// Ver raw output del Master Agent
console.log($('Master AI Agent-Main').item.json.output);

// Debe ser JSON válido:
// {"answer_md": "...", "bullets": [...], ...}
```

**Solución**:
1. Mejorar estrategia de parsing en Node 51:
   ```javascript
   // Strategy 1: Direct parse (actual)
   try {
     return JSON.parse(raw);
   } catch (e) {
     // Strategy 2: Extract JSON from text
     const match = raw.match(/\{[\s\S]*\}/);
     if (match) return JSON.parse(match[0]);

     // Strategy 3: Regex extraction
     return extractFieldsWithRegex(raw);
   }
   ```

2. Agregar post-processing al system prompt del Master Agent:
   ```
   CRITICAL: Output ONLY valid JSON. No text before or after the JSON object.
   NO markdown fences (```json).
   NO explanations.
   ONLY the JSON object.
   ```

3. Validar JSON antes de devolver:
   ```javascript
   const validated = validateAndFix(parsed);
   ```

**Prevención**:
- Monitorear tasa de uso de Strategy 2/3 (debe ser <5%)
- Alertas si parsing falla >3%
- Fine-tuning del Master Agent para output más consistente

---

## Issues de Cooldowns

### Error: Email Gating no funciona correctamente

**Síntomas**:
- Master Agent pide email cuando NO debería
- Master Agent NO pide email cuando SÍ debería
- Usuario reporta preguntas repetitivas

**Causas**:
1. Alguna de las 7 condiciones de email_gating_policy mal validada
2. Cooldown timestamp no actualizado
3. LLM Analyst no detecta proposal_intent correctamente

**Diagnóstico**:
```javascript
// Ver flags en Node 48 (FlagsAnalyzer)
console.log($json.decision.actions);  // Debe incluir "ask_email" si debe pedir

// Ver agent_brief en Node 42 output
console.log($json.agent_brief.reask_decision);

// Resultado esperado:
{
  can_ask_email_now: true,
  can_ask_addressee_now: false,
  reason: "stage qualify; intereses≥1; services_seen≥1; deep_interest≥2; business_name presente; proposal_intent detectado; cooldown email null"
}
```

**Validación de 7 condiciones**:
```javascript
const canAskEmail = (
  state.stage in ["qualify", "proposal_ready"] &&        // ✅ 1
  state.interests.length >= 1 &&                          // ✅ 2
  state.counters.services_seen >= 1 &&                    // ✅ 3
  state.counters.deep_interest >= 1 &&                    // ✅ 4
  state.business_name !== "" &&                           // ✅ 5
  (profile.proposal_intent === true || state.counters.prices_asked >= 1) &&  // ✅ 6
  ((Date.now() - Date.parse(state.cooldowns.email_ask_ts)) > 5*60*1000 || state.cooldowns.email_ask_ts === null)  // ✅ 7
);
```

**Solución**:
1. Logging detallado de cada condición:
   ```javascript
   console.log({
     condition1_stage: state.stage in ["qualify", "proposal_ready"],
     condition2_interests: state.interests.length >= 1,
     condition3_services: state.counters.services_seen >= 1,
     condition4_deep: state.counters.deep_interest >= 1,
     condition5_business: state.business_name !== "",
     condition6_intent: profile.proposal_intent || state.counters.prices_asked >= 1,
     condition7_cooldown: (Date.now() - Date.parse(state.cooldowns.email_ask_ts)) > 5*60*1000
   });
   ```

2. Actualizar cooldown en Node 51 ANTES de enviar respuesta
3. Mejorar detección de proposal_intent en LLM Analyst (Node 42)

**Prevención**:
- Monitorear tasa de "ask_email" actions (debe ser ~10-15% de conversaciones)
- A/B testing de diferentes thresholds para deep_interest

---

## Problemas de Integración

### Error: Chatwoot no recibe mensajes del bot

**Síntomas**:
- Workflow completa exitosamente
- Node 56 (Output to Chatwoot) devuelve 200 OK
- Pero mensaje NO aparece en UI de Chatwoot

**Causas**:
1. API Token de Chatwoot expirado
2. Conversation ID inválido
3. Payload malformado (falta content o message_type)

**Diagnóstico**:
```bash
# Test manual de Chatwoot API
curl -X POST https://chatwoot.leonobitech.com/api/v1/accounts/1/conversations/190/messages \
  -H "api_access_token: $CHATWOOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test message",
    "message_type": "outgoing"
  }'

# Response esperado:
{
  "id": 12345,
  "content": "Test message",
  "message_type": 1,
  ...
}
```

**Solución**:
1. Verificar payload en Node 56:
   ```javascript
   {
     content: $json.llm.text,        // Required
     message_type: "outgoing",       // Required
     content_type: "text",           // Optional
     content_attributes: {...}       // Optional (input_select)
   }
   ```

2. Validar conversation_id:
   ```javascript
   const conversation_id = $json.meta.conversation_id || $json.conversation.id;
   if (!conversation_id) throw new Error("Missing conversation_id");
   ```

3. Regenerar API token en Chatwoot settings

**Prevención**:
- Health check de Chatwoot API cada 5 minutos
- Alertas si error rate >5%
- Retry automático con exponential backoff

---

## Recursos Adicionales

### Logs y Debugging

```bash
# Ver logs de n8n workflow
n8n workflow:logs --workflow sales-agent --tail 100

# Ver logs de Redis
redis-cli monitor

# Ver logs de Qdrant
docker logs qdrant -f

# Ver logs de Baserow
curl -H "Authorization: Token $BASEROW_TOKEN" \
  https://api.baserow.io/api/database/audit-log/table/12345/
```

### Métricas y Monitoreo

```javascript
// Métricas clave a monitorear:
{
  latency_p95: 8500,           // ms (debe ser <12000)
  error_rate: 0.02,            // 2% (debe ser <5%)
  parsing_success_rate: 0.995, // 99.5% (debe ser >95%)
  rag_avg_score: 0.78,         // (debe ser >0.70)
  llm_cost_per_msg: 0.082,     // USD (debe ser <0.10)
  email_gating_rate: 0.12      // 12% (debe ser 10-15%)
}
```

### Contacto de Soporte

- **Email**: felix@leonobitech.com
- **Slack**: #sales-agent-support
- **Documentación**: [README.md](README.md)
- **Runbook**: Ver sección de optimizaciones en [OPTIMIZATION-GUIDE.md](OPTIMIZATION-GUIDE.md)

---

**Última actualización**: 2025-10-31
**Mantenido por**: Leonobitech Engineering Team
