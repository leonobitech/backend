// ============================================================================
// USER PROMPT v2.0 - Smart Input Injection
// ============================================================================
// Este es el prompt del usuario que inyecta el Smart Input completo al Master Agent
// Compatible con GPT-4o-mini function calling
// ============================================================================

/**
 * Build User Prompt con Smart Input
 *
 * @param {Object} smartInput - Output completo del nodo Smart Input
 * @returns {string} - User prompt formateado
 */
function buildUserPrompt(smartInput) {
  const { history, profile, state, options, rules, meta } = smartInput;

  // Extraer último mensaje del usuario
  const lastUserMessage = history
    .filter(m => m.role === 'user')
    .slice(-1)[0];

  if (!lastUserMessage) {
    throw new Error('[UserPrompt] No user message found in history');
  }

  // Build prompt
  return `# Current Conversation Context

## Last User Message
"${lastUserMessage.text}"
(Timestamp: ${lastUserMessage.ts})

## Complete Smart Input

\`\`\`json
${JSON.stringify(smartInput, null, 2)}
\`\`\`

---

**Instructions**:

1. **Read the last user message** carefully
2. **Review the conversation history** for context
3. **Check the current state** (stage, interests, counters, cooldowns)
4. **Consult the rules** for business policies
5. **Use RAG** if the user mentions services or needs
6. **Update state** based on the conversation
7. **Respond naturally** in Spanish

Remember:
- Be conversational, not robotic
- Use RAG when relevant (rag_first_policy)
- Respect cooldowns and stage transitions
- Extract business context (business_name, industry)
- Only show CTAs when it makes sense

Now respond to the user following the System Prompt guidelines.`;
}

// ============================================================================
// USAGE IN N8N
// ============================================================================

// En el nodo Master Agent (Node #50), reemplazar el User Prompt actual por:

const smartInput = $json.smart_input; // Asumiendo que Smart Input viene en $json

const userPrompt = buildUserPrompt(smartInput);

// Luego pasar a OpenAI:
// messages: [
//   { role: 'system', content: SYSTEM_PROMPT_V2 },
//   { role: 'user', content: userPrompt }
// ]

// ============================================================================
// ALTERNATIVE: Direct Injection (sin función)
// ============================================================================

// Si prefieres inyectar directamente sin función:

const userPromptDirect = `# Current Conversation Context

## Last User Message
"${$json.smart_input.history.filter(m => m.role === 'user').slice(-1)[0].text}"

## Complete Smart Input

\`\`\`json
${JSON.stringify($json.smart_input, null, 2)}
\`\`\`

---

**Instructions**: Read the context above and respond following the System Prompt guidelines.

1. Use RAG if user mentions services
2. Update state based on conversation
3. Respond naturally in Spanish (2-4 sentences)
4. Only show CTAs if it makes sense

Now respond to the user.`;

// ============================================================================
// EXPORT
// ============================================================================

module.exports = { buildUserPrompt };

// Para usar en n8n Code node:
return [{
  json: {
    userPrompt: buildUserPrompt($json.smart_input)
  }
}];
