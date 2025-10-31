# Prompt Engineering Guide - Sales Agent WhatsApp

**Versión**: 1.0
**Fecha**: 2025-10-31

---

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [LLM Analyst (GPT-3.5-turbo)](#llm-analyst-gpt-35-turbo)
3. [Master Agent (GPT-4)](#master-agent-gpt-4)
4. [Best Practices](#best-practices)
5. [Testing & Iteration](#testing--iteration)
6. [Common Pitfalls](#common-pitfalls)

---

## Introducción

Esta guía documenta cómo iterar sobre los prompts de los 2 LLMs del sistema:

1. **LLM Analyst** (Node 42, GPT-3.5-turbo): Analiza conversación y genera recomendaciones
2. **Master Agent** (Node 50, GPT-4): Genera respuesta final al usuario

### Ubicación de los Prompts

Los prompts están separados en archivos standalone para facilitar iteración:

- `prompts/llm-analyst-system-prompt.md` (~200 líneas)
- `prompts/master-agent-system-prompt.md` (~800 líneas)

---

## LLM Analyst (GPT-3.5-turbo)

### Archivo

[prompts/llm-analyst-system-prompt.md](../prompts/llm-analyst-system-prompt.md)

### Propósito

Analizar conversación completa y generar:
1. **Intent** (greeting, service_info, price, etc.)
2. **Stage** transition (explore → match → price → qualify → proposal_ready)
3. **Service target** (canonical + bundle + rag_hints)
4. **Recommendation** para Master Agent (≤280 chars)
5. **Reask decision** (email gating con 7 condiciones)
6. **State updates** (counters, interests, cooldowns)

### Estructura del System Prompt

```markdown
🛡️ System — Leonobitech / Analyst v3.3 (Filter-Output Compatible)

ROL/OBJETIVO
Devuelves EXCLUSIVAMENTE un objeto JSON válido con EXACTAMENTE estas dos claves...

ENTRADAS
<history> ascendente, <profile>, <state>, <options>, <rules>, <meta>.

CONTRATO DE SALIDA
{
  "agent_brief": {
    "history_summary": "≤120 palabras...",
    "intent": "greeting|service_info|price|...",
    "stage": "explore|match|price|...",
    "service_target": {...},
    "recommendation": "≤280 caracteres...",
    "reask_decision": {...}
  },
  "state": {...}
}

REGLAS CLAVE
1) JSON-only, minificado, 1 línea, ≤1800 chars
2) Transiciones sin regresión; counters máx +1
3) service_target: si canonical, completar bundle/rag_hints
4) No reiniciar menú general si stage≥match
5) Privacidad: summary/reason sin PII
6) reask_decision.reason basado en state YA actualizado

RECORTES SEGUROS (si te acercas a 1800)
1) recommendation ≤280; 2) rag_hints ≤5; 3) bundle ≤3

CHECKLIST ANTES DE EMITIR
- JSON válido, 1 línea, sin texto extra
- agent_brief y state presentes
- service_target completo si hay servicio
...
```

### Iteración del Prompt

#### 1. Modificar el Archivo

```bash
# Editar prompt
vim prompts/llm-analyst-system-prompt.md

# Incrementar versión (v3.3 → v3.4)
```

#### 2. Actualizar Node 42 en n8n

```javascript
// Node 42: Chat History Processor
// System Message:

{{
  $nodeParameter["system_prompt_version"] === "v3.4"
    ? $binary.data.toString('utf8')  // Cargar de archivo
    : SYSTEM_PROMPT_V3_3             // Hardcoded actual
}}
```

#### 3. A/B Testing

```javascript
// En Node 41 (Smart Input), agregar:

const variant = (lead_id % 2 === 0) ? 'v3.3' : 'v3.4';

return {
  ...context,
  meta: {
    ...meta,
    llm_analyst_variant: variant
  }
};
```

### Ejemplos de Mejoras

#### Mejora 1: Reducir Tamaño del Prompt (v3.3 → v3.4)

**Problema**: Prompt de 200 líneas genera ~1500 tokens de input

**Solución**: Eliminar ejemplos redundantes

```diff
- SCENARIO 1: Usuario saluda
- Input: {"history": [{"role": "user", "text": "Hola"}], ...}
- Output: {"agent_brief": {"intent": "greeting", ...}, ...}
-
- SCENARIO 2: Usuario dice "Buenos días"
- Input: {"history": [{"role": "user", "text": "Buenos días"}], ...}
- Output: {"agent_brief": {"intent": "greeting", ...}, ...}
-
- SCENARIO 3: Usuario dice "Hola, ¿cómo estás?"
- Input: {"history": [{"role": "user", "text": "Hola, ¿cómo estás?"}], ...}
- Output: {"agent_brief": {"intent": "greeting", ...}, ...}

+ SCENARIO 1: Usuario saluda (múltiples variantes)
+ Input: {"history": [{"role": "user", "text": "Hola|Buenos días|Hey"}], ...}
+ Output: {"agent_brief": {"intent": "greeting", ...}, ...}
```

**Ahorro**: ~400 tokens (-27%)

#### Mejora 2: Agregar Constraint Explícito para Service Lock

**Problema**: LLM a veces permite menú general cuando stage≥match

**Solución**: Agregar regla explícita con ejemplo

```diff
  REGLAS CLAVE
  ...
+ 4.1) CRITICAL: Si stage≥match, NUNCA incluir menú general de servicios
+      ❌ INCORRECTO: cta_menu.items = ["WhatsApp Chatbot", "Landing Page", ...]
+      ✅ CORRECTO: cta_menu.items = ["Ver precios", "Beneficios e integraciones", ...]
```

#### Mejora 3: Clarificar Email Gating Policy

**Problema**: LLM a veces confunde las 7 condiciones

**Solución**: Agregar checklist numerado

```diff
  EMAIL GATING POLICY
- Solo recomendar pedir email si se cumplen condiciones...

+ CHECKLIST (TODAS deben ser TRUE):
+ ☐ 1. stage in ["qualify", "proposal_ready"]
+ ☐ 2. interests.length >= 1
+ ☐ 3. counters.services_seen >= 1
+ ☐ 4. counters.deep_interest >= 1
+ ☐ 5. state.business_name !== ""
+ ☐ 6. proposal_intent === true OR counters.prices_asked >= 1
+ ☐ 7. (now - email_ask_ts) > 5min OR email_ask_ts === null
+
+ Si TODAS son TRUE → can_ask_email_now = true
+ Si ALGUNA es FALSE → can_ask_email_now = false
```

---

## Master Agent (GPT-4)

### Archivo

[prompts/master-agent-system-prompt.md](../prompts/master-agent-system-prompt.md)

### Propósito

Generar respuesta final al usuario con:
1. **answer_md**: Texto de la respuesta (≤1400 chars, Markdown)
2. **bullets**: Puntos clave (máx 5)
3. **cta_menu**: Menú interactivo (4 items)
4. **cta**: Preferred action
5. **flags_patch**: Actualizaciones de flags
6. **state_patch**: Actualizaciones de estado

### Estructura del System Prompt

```markdown
# Master Agent - Leonobitech Sales Agent

Eres el agente conversacional de ventas de Leonobitech...

## 1) Contract & Language Policy
- Español (neutral latinoamericano)
- No hallucinations (solo info de RAG)
- Strict JSON output

## 2) Output Contract
{
  "answer_md": "≤1400 chars, Markdown",
  "bullets": ["max 5"],
  "cta_menu": {
    "kind": "services|actions",
    "items": [{"id": "...", "label": "...", "desc": "..."}]
  },
  "cta": {
    "preferred": "ask_price:whatsapp-chatbot",
    "alternatives": ["ask_demo:whatsapp-chatbot"]
  },
  "flags_patch": {...},
  "state_patch": {...}
}

## 4.13 Service Lock Rules (CRITICAL)
if (service != null || service_target != null) {
  cta_menu.kind = "actions"; // NOT "services"
  // All items must be namespaced: "ask_price:whatsapp-chatbot"
}

## Few-Shot Examples (A-J)
...
```

### Iteración del Prompt

#### 1. Agregar Nuevo Few-Shot Example

**Problema**: Master Agent no maneja bien negociaciones de precio

**Solución**: Agregar Scenario K

```markdown
## Scenario K: Negociación de Precio

**UserPrompt**:
```xml
<analyst_recommendation>
INSTRUCCIONES: Usuario negocia precio. Dice que competencia ofrece más barato.
Mantener tono profesional, explicar value proposition, NO bajar precio sin aprobación.
</analyst_recommendation>
<lead_state>
  {"stage": "price", "service": "WhatsApp Chatbot"}
</lead_state>
<user_latest_message>
Me parece caro, en otro lugar me ofrecen lo mismo por $500/mes
</user_latest_message>
```

**Expected Output**:
```json
{
  "answer_md": "Entiendo tu preocupación, Juan. 😊\n\nNuestro chatbot de WhatsApp incluye características premium que justifican la inversión:\n\n• **IA avanzada** (GPT-4) vs bots con reglas básicas\n• **Soporte 24/7** con equipo técnico dedicado\n• **Integraciones ilimitadas** (CRM, ERP, bases de datos)\n• **Escalabilidad** hasta 100K mensajes/mes sin cargos extra\n\nMuchos clientes inicialmente comparan solo por precio, pero luego valoran el **ahorro en tiempo** (40+ horas/mes de atención manual) y la **tasa de conversión** (2.5x mayor que competencia).\n\n¿Te gustaría que agendemos una llamada para revisar tu caso específico y ver si hay algún plan que se ajuste mejor a tu presupuesto?",
  "bullets": [
    "IA avanzada (GPT-4) vs reglas básicas",
    "Soporte 24/7 con equipo dedicado",
    "Integraciones ilimitadas",
    "Escalabilidad hasta 100K msgs/mes"
  ],
  "cta_menu": {
    "kind": "actions",
    "items": [
      {"id": "schedule_call", "label": "📞 Agendar llamada", "desc": "Revisar caso específico"},
      {"id": "see_case_studies", "label": "📊 Ver casos de éxito", "desc": "ROI de clientes similares"},
      {"id": "ask_custom_plan", "label": "💼 Plan personalizado", "desc": "Ajustar a presupuesto"}
    ]
  },
  "cta": {
    "preferred": "schedule_call",
    "alternatives": ["see_case_studies"]
  }
}
```
\`\`\`

**Resultado**: Master Agent ahora maneja negociaciones sin bajar precio automáticamente

#### 2. Reforzar Service Lock Enforcement

**Problema**: Master Agent a veces ofrece menú de servicios cuando ya hay service lock

**Solución**: Agregar validación explícita en Output Contract

```diff
  ## 4.13 Service Lock Rules (CRITICAL)
+
+ VALIDATION BEFORE OUTPUT:
+ ```javascript
+ if (lead.service !== null || service_target.canonical !== undefined) {
+   // CHECK: cta_menu.kind MUST be "actions"
+   if (cta_menu.kind === "services") {
+     throw new Error("SERVICE_LOCK_VIOLATION: Cannot show service menu when service is locked");
+   }
+
+   // CHECK: All items MUST be namespaced
+   for (const item of cta_menu.items) {
+     if (!item.id.includes(':')) {
+       throw new Error("SERVICE_LOCK_VIOLATION: Items must be namespaced (e.g., 'ask_price:whatsapp-chatbot')");
+     }
+   }
+ }
+ ```
```

#### 3. Mejorar Natural Flow Policy

**Problema**: Master Agent muestra menú incluso cuando contexto es de "soft close"

**Solución**: Agregar ejemplos específicos de soft close

```diff
  ## Natural Flow Policy

+ SOFT CLOSE EXAMPLES:
+ - Usuario: "Ok, gracias. Lo voy a pensar y te contacto"
+   → expect_menu: false
+   → answer_md: "¡Perfecto! Estoy aquí cuando lo necesites. 😊"
+
+ - Usuario: "Gracias por la info, luego veo"
+   → expect_menu: false
+   → answer_md: "De nada! Cualquier duda, escríbeme. 👍"
```

---

## Best Practices

### 1. Versionado de Prompts

```bash
# Estructura de versiones
prompts/
  llm-analyst-system-prompt.md           # Actual (v3.3)
  llm-analyst-system-prompt-v3.2.md      # Anterior
  llm-analyst-system-prompt-v3.4-draft.md # Draft

  master-agent-system-prompt.md          # Actual (v2.0)
  master-agent-system-prompt-v1.9.md     # Anterior
```

### 2. Changelog en el Prompt

```markdown
# LLM Analyst System Prompt

**Version**: v3.4
**Date**: 2025-10-31
**Changes**:
- Reducido tamaño de 200 → 150 líneas (-25%)
- Agregado checklist explícito para email gating
- Clarificado service lock enforcement
- Removidos 3 ejemplos redundantes de greeting

**Version**: v3.3
**Date**: 2025-10-15
**Changes**:
- Agregado "Filter-Output Compatible" al título
...
```

### 3. Testing Before Deployment

```bash
# 1. Test con 10 conversaciones reales
for i in {1..10}; do
  conversation=$(cat test_data/conversation_$i.json)
  result=$(call_llm_analyst "$conversation" --prompt-version v3.4)
  validate_output "$result"
done

# 2. Comparar outputs v3.3 vs v3.4
diff <(call_llm --version v3.3) <(call_llm --version v3.4)

# 3. Si todos los tests pasan → deploy
deploy_prompt v3.4
```

### 4. A/B Testing en Producción

```javascript
// Node 41: Smart Input

const variants = {
  'v3.3': {weight: 0.5, prompt: PROMPT_V3_3},
  'v3.4': {weight: 0.5, prompt: PROMPT_V3_4}
};

// Weighted random selection
const rand = Math.random();
let cumulative = 0;
let selectedVariant = 'v3.3';

for (const [version, config] of Object.entries(variants)) {
  cumulative += config.weight;
  if (rand < cumulative) {
    selectedVariant = version;
    break;
  }
}

return {
  ...context,
  meta: {
    ...meta,
    prompt_variant: selectedVariant
  }
};
```

**Métricas a comparar**:
- Parsing success rate
- Average latency
- Token usage
- User satisfaction (manual review)
- Conversion rate

**Criterio de éxito**: Si v3.4 mejora ≥2% en conversion rate Y no degrada latency → deploy 100%

---

## Testing & Iteration

### Test Suite

```javascript
// test/prompts/llm-analyst.test.js

const testCases = [
  {
    name: "Greeting - Simple",
    input: {
      history: [{role: "user", text: "Hola"}],
      state: {stage: "explore", counters: {services_seen: 0}}
    },
    expected: {
      intent: "greeting",
      stage: "explore",
      can_ask_email_now: false
    }
  },
  {
    name: "Service Info - First Question",
    input: {
      history: [{role: "user", text: "Quiero info del chatbot"}],
      state: {stage: "explore", counters: {services_seen: 0}}
    },
    expected: {
      intent: "service_info",
      stage: "match",  // Transition
      service_target: {canonical: "WhatsApp Chatbot"},
      counters_increment: {services_seen: 1, deep_interest: 1}
    }
  },
  {
    name: "Email Gating - All 7 Conditions Met",
    input: {
      history: [{role: "user", text: "Quiero una cotización"}],
      state: {
        stage: "qualify",
        interests: ["WhatsApp"],
        business_name: "Acme Corp",
        counters: {services_seen: 1, prices_asked: 1, deep_interest: 2},
        cooldowns: {email_ask_ts: null}
      }
    },
    expected: {
      can_ask_email_now: true,
      reason: /stage qualify.*intereses≥1.*services_seen≥1/
    }
  },
  // ... 20+ casos más
];

// Run tests
for (const testCase of testCases) {
  const result = await callLLMAnalyst(testCase.input);
  assert.deepEqual(result.agent_brief.intent, testCase.expected.intent);
  assert.deepEqual(result.agent_brief.stage, testCase.expected.stage);
  // ...
}
```

### Regression Testing

```bash
# Antes de deploy de v3.4, correr test suite completo
npm run test:prompts

# Si algún test falla, investigar:
# - ¿Es regresión? (funcionaba en v3.3)
# - ¿Es mejora? (v3.4 detecta mejor)
# - ¿Necesita actualizar test?
```

### Manual Review

```javascript
// Revisar manualmente 50 conversaciones reales
const sample = getSampleConversations(50);

for (const conversation of sample) {
  const result_v33 = await callLLMAnalyst(conversation, 'v3.3');
  const result_v34 = await callLLMAnalyst(conversation, 'v3.4');

  // Mostrar lado a lado
  console.log(`
    ┌─────────────────────────────────────────────┐
    │ Conversation ${conversation.id}              │
    ├─────────────────────────────────────────────┤
    │ v3.3:                                       │
    │   intent: ${result_v33.intent}              │
    │   stage: ${result_v33.stage}                │
    │   recommendation: ${result_v33.recommendation.slice(0, 50)}... │
    ├─────────────────────────────────────────────┤
    │ v3.4:                                       │
    │   intent: ${result_v34.intent}              │
    │   stage: ${result_v34.stage}                │
    │   recommendation: ${result_v34.recommendation.slice(0, 50)}... │
    └─────────────────────────────────────────────┘

    Which is better? (1=v3.3, 2=v3.4, 0=tie): _
  `);

  const vote = await getUserInput();
  recordVote(conversation.id, vote);
}

// Análisis de votos
const results = analyzeVotes();
// v3.3: 15 votes
// v3.4: 28 votes
// Tie: 7 votes
// → v3.4 wins (65% preference)
```

---

## Common Pitfalls

### Pitfall 1: Prompt Demasiado Largo

**Síntoma**: Tokens de input >2500, latency >3s, costo alto

**Causa**: Demasiados ejemplos, explicaciones redundantes

**Solución**:
1. Eliminar ejemplos similares (consolidar)
2. Usar lenguaje conciso (bullets en lugar de párrafos)
3. Mover configuración estática a fine-tuning

**Antes (malo)**:
```markdown
Cuando el usuario pregunta por un servicio, debes:
1. Primero, identificar el servicio mencionado
2. Luego, buscar el nombre canónico en options.services_aliases
3. Después, construir el bundle con servicios relacionados
4. Finalmente, generar rag_hints basados en keywords del mensaje
```

**Después (bueno)**:
```markdown
Service detection:
• Identify → normalize via aliases → build bundle → generate hints
```

### Pitfall 2: Instrucciones Ambiguas

**Síntoma**: LLM produce outputs inconsistentes

**Causa**: Instrucciones que pueden interpretarse de múltiples formas

**Solución**: Ser explícito, dar ejemplos concretos

**Antes (ambiguo)**:
```markdown
Genera recomendaciones útiles para el Master Agent
```

**Después (explícito)**:
```markdown
Genera recommendation:
• Formato: "INSTRUCCIONES PARA MASTER: [acción]"
• Máximo: 280 caracteres
• Incluye: qué hacer, cómo hacerlo, qué actualizar
• Ejemplo: "INSTRUCCIONES PARA MASTER: Consultar RAG con hints ['chatbot']; presentar beneficios; ofrecer CTA 'Ver precios'"
```

### Pitfall 3: No Validar Output Schema

**Síntoma**: Workflow falla porque LLM devuelve JSON inválido o incompleto

**Causa**: No hay enforcement estricto del schema

**Solución**: Agregar validación explícita + ejemplos

```markdown
CRITICAL: Output MUST be valid JSON with EXACTLY these keys:
{
  "agent_brief": {
    "history_summary": string,  // REQUIRED
    "intent": string,            // REQUIRED, enum: [...]
    "stage": string,             // REQUIRED, enum: [...]
    ...
  },
  "state": {
    "lead_id": number,           // REQUIRED, immutable
    "stage": string,             // REQUIRED
    ...
  }
}

VALIDATION CHECKLIST:
☐ JSON is valid (no syntax errors)
☐ Both "agent_brief" and "state" keys present
☐ All REQUIRED fields present
☐ No extra keys at top level
☐ intent is one of the allowed values
☐ stage is one of the allowed values
```

### Pitfall 4: Olvidar Manejar Edge Cases

**Síntoma**: LLM falla en casos raros (usuario envía solo emojis, mensaje muy largo, etc.)

**Solución**: Agregar sección de edge cases

```markdown
EDGE CASES:

1. User message is only emojis/symbols
   → intent: "unclear"
   → recommendation: "Solicitar clarificación con pregunta abierta"

2. User message >500 caracteres
   → Analizar solo primeros 300 + últimos 100 caracteres

3. History is empty
   → stage: "explore"
   → recommendation: "Saludo inicial profesional"

4. User asks about non-existent service
   → intent: "service_info"
   → service_target: {} (empty)
   → recommendation: "Mencionar servicios disponibles, preguntar cuál le interesa"
```

---

## Recursos Adicionales

### Herramientas

- **Prompt Playground**: [OpenAI Playground](https://platform.openai.com/playground)
- **Token Counter**: [OpenAI Tokenizer](https://platform.openai.com/tokenizer)
- **Diff Tool**: `git diff prompts/llm-analyst-system-prompt-v3.3.md prompts/llm-analyst-system-prompt-v3.4.md`

### Referencias

- [OpenAI Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic Prompt Engineering](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [LangChain Prompts](https://python.langchain.com/docs/modules/model_io/prompts/)

### Contacto

- **Prompt Engineering Lead**: felix@leonobitech.com
- **Documentación**: [README.md](README.md)
- **Slack**: #sales-agent-prompts

---

**Última actualización**: 2025-10-31
**Mantenido por**: Leonobitech Engineering Team
