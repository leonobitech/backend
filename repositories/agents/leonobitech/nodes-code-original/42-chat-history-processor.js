// ============================================================================
// NODE: Chat History Processor (Node #42) - LLM Analyst
// ============================================================================
// Description: Analista Conversacional (GPT-3.5) - Procesa history y actualiza state
// Input: { history, profile, state, options, rules, meta }
// Output: { agent_brief: {...}, state: {...} }
//
// AI Model: GPT-3.5 Turbo (gpt-3.5-turbo)
// Temperature: 0.1
// Max Tokens: 2048
//
// Features:
// - JSON-only output (no markdown, no code fences)
// - Minified, 1 line, ≤1800 chars
// - State transitions without regression
// - Interests normalization
// - Service_target enrichment with RAG hints
// - Email/addressee reask decision
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

// =============================================================================
// USER MESSAGE PROMPT (Prompt Template)
// =============================================================================

const USER_PROMPT = `<role>Eres Analista Conversacional de Leonobitech.</role>

<task>
Debes devolver SOLO un JSON minificado, en UNA línea, ≤1800 caracteres, sin markdown ni texto extra, con EXACTAMENTE estas dos claves top-level y en este orden:
{"agent_brief":{...},"state":{...}}

Pipeline:
1) Analiza <history> ascendente.
2) Determina intent y ACTUALIZA <state>:
   - Transiciones de stage sin regresión (options.stage_allowed + rules.stage_policy).
   - Counters (máx +1 por tipo).
   - Normaliza interests (options.services_aliases → options.interests_allowed; sin duplicados).
   - Mantén inmutables: lead_id, chatwoot_id, phone_number, country, tz, channel.
3) Construye agent_brief y luego reask_decision con base en el state ACTUALIZADO.

Respeta System v3.3 (CTA=4 ítems; rag_hints máx 5–6; recommendation ≤280; privacidad; no menú general si stage≥match). Aplica "Recortes Seguros" antes que cortar el JSON. Nunca devuelvas JSON dentro de un string ni dentro de un array.
</task>

<options>{{JSON.stringify($json.options)}}</options>
<rules>{{JSON.stringify($json.rules)}}</rules>
<meta>{{JSON.stringify($json.meta)}}</meta>
<history>{{JSON.stringify($json.history)}}</history>
<profile>{{JSON.stringify($json.profile)}}</profile>
<state>{{JSON.stringify($json.state)}}</state>`;

// =============================================================================
// SYSTEM MESSAGE PROMPT
// =============================================================================

const SYSTEM_PROMPT = `🛡️ System — Leonobitech / Analyst v3.3 (Filter-Output Compatible)

ROL/OBJETIVO
Devuelve EXCLUSIVAMENTE un objeto JSON válido con EXACTAMENTE estas dos claves top-level y en este orden:
{"agent_brief":{...},"state":{...}}
Sin texto extra, sin markdown, sin bloques de código, sin arrays, sin envolver en string. JSON minificado, 1 línea, ≤1800 caracteres. El shape de "state" debe ser EXACTO al de entrada (solo actualiza campos permitidos).

ENTRADAS
<history> ascendente, <profile>, <state> (shape inmutable), <options>, <rules>, <meta>.

CONTRATO DE SALIDA
{
  "agent_brief":{
    "history_summary":"≤120 palabras, factual, SIN PII (usar "el usuario")",
    "last_incoming":{"role":"user","text":"string","ts":"ISO-8601"},
    "intent":"greeting|service_info|price|request_proposal|demo_request|contact_share|schedule_request|negotiation|support|off_topic|unclear",
    "stage":"explore|match|price|qualify|proposal_ready",
    "service_target":{"canonical":"string","bundle":["..."],"rag_hints":["..."]},
    "cta_menu":{"prompt":"¿Cómo querés avanzar?","kind":"service","items":["Ver precios","Beneficios e integraciones","Agendar demo","Solicitar propuesta"],"max_picks":1},
    "recommendation":"INSTRUCCIONES PARA MASTER: ... (≤280 caracteres, técnico, contextual, sin PII/emojis)",
    "reask_decision":{"can_ask_email_now":true|false,"can_ask_addressee_now":true|false,"reason":"string breve sin PII"}
  },
  "state":{...mismo shape que entrada; actualizar solo stage/interests/counters/cooldowns/proposal_offer_done/last_proposal_offer_ts...}
}

REGLAS CLAVE
1) JSON-only, minificado, 1 línea, ≤1800 chars. Nunca doble-encode ni fences.
2) Transiciones sin regresión; counters máx +1; interests ⊆ options.interests_allowed (normalizar aliases).
3) service_target: si existe canonical, completar bundle/rag_hints desde options.service_defaults[canonical]. rag_hints máx 5–6, bundle máx 3 si hace falta recortar.
4) No reiniciar menú general si stage≥match. CTA siempre 4 ítems (en price puedes cambiar "Beneficios e integraciones" por "Calcular presupuesto").
5) Privacidad: summary/reason sin PII; last_incoming literal.
6) reask_decision.reason basado en el state YA actualizado.

RECORTES SEGUROS (si te acercas a 1800)
1) recommendation ≤280; 2) rag_hints ≤5; 3) bundle ≤3; 4) history_summary ≤90 palabras.

CHECKLIST ANTES DE EMITIR
- JSON válido, 1 línea, sin texto extra.
- agent_brief y state presentes.
- service_target completo si hay servicio.
- reask_decision.reason coherente con el state.
- Sin PII en summary/reason; sin menú general si stage≥match.`;

// =============================================================================
// N8N CONFIGURATION (AI Agent settings)
// =============================================================================

/*
N8N AI Agent Node Configuration:

Agent Type: Conversational Agent (OpenAI Functions Agent)
Model: gpt-3.5-turbo
Temperature: 0.1
Max Tokens: 2048

Prompt:
- System Message: (Use SYSTEM_PROMPT above)
- User Message: (Use USER_PROMPT above with template variables)

Memory: None (stateless - receives full context in each call)

Output Parser: JSON Parser
Expected Output:
{
  "agent_brief": {
    "history_summary": "string",
    "last_incoming": {"role":"user","text":"string","ts":"ISO"},
    "intent": "string",
    "stage": "string",
    "service_target": {"canonical":"string","bundle":[],"rag_hints":[]},
    "cta_menu": {"prompt":"string","kind":"string","items":[],"max_picks":1},
    "recommendation": "string",
    "reask_decision": {"can_ask_email_now":boolean,"can_ask_addressee_now":boolean,"reason":"string"}
  },
  "state": {
    // Same shape as input state
    // Only updated fields: stage, interests, counters, cooldowns, proposal_offer_done, last_proposal_offer_ts
  }
}
*/

// =============================================================================
// NOTES
// =============================================================================

/*
CRITICAL BUGS DETECTED (from AGENT-TESTING-LOG.md):

1. FALLA #18, #22: NO extrae business_type/business_name
   - Contexto disponible: "Soy dueño de un restaurante pequeño"
   - State no actualiza: business_name, business_type
   - MEJORA SUGERIDA: Agregar lógica de extracción de metadatos en rules

2. Counters funcionan correctamente desde Mensaje 5 y 6
   - deep_interest se incrementa y persiste
   - Bug #2 (counter merge) arreglado en Output Main

3. Intent detection generalmente correcto
   - "qualify" detectado correctamente en Mensaje 5 y 6
   - Stage transitions funcionan bien

RECOMMENDED IMPROVEMENTS:

1. Add business metadata extraction to rules:
   ```
   business_metadata_policy:
     "Extraer business_type e business_name del contexto cuando el usuario lo mencione.
     Keywords: 'restaurante', 'tienda', 'negocio', 'empresa', 'comercio', 'dueño de'.
     Actualizar state.business_type y state.business_name (si disponible)."
   ```

2. Add to counters_policy validation:
   - deep_interest+1 solo si: pide demo, aporta volumen específico, menciona pain points
   - NO incrementar deep_interest por solo mencionar industry o business_type

3. Improve interests extraction:
   - Si menciona "restaurante" → NO agregar "restaurante" a interests
   - Solo agregar: "Odoo", "CRM", "WhatsApp" (interests_allowed)
   - business_type va en state.business_type, NO en state.interests
*/
