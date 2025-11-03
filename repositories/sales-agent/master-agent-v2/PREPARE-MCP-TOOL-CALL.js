// ============================================================================
// PREPARE MCP TOOL CALL - Construir body dinámico para POST /internal/mcp/call-tool
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de OUTPUT-MAIN-v2 (cuando has_tool_calls = true)
//
// Recibe: Output de OUTPUT-MAIN-v2 con tool_calls
// Output: Body formateado para HTTP POST al MCP Server
// ============================================================================

const inputData = $input.first().json;

// ============================================================================
// 1. VALIDAR INPUT
// ============================================================================

if (!inputData.tool_calls || !Array.isArray(inputData.tool_calls) || inputData.tool_calls.length === 0) {
  throw new Error('[PrepareMCPTool] No tool_calls found in input. This node should only receive data when has_tool_calls=true.');
}

console.log('[PrepareMCPTool] ✅ Tool calls detected:', inputData.tool_calls.length);

// ============================================================================
// 2. EXTRAER PRIMER TOOL CALL
// ============================================================================
// El LLM puede generar múltiples tool_calls, pero procesamos uno a la vez

const toolCall = inputData.tool_calls[0];

// Soportar ambos formatos: OpenAI (tc.function.name) y simplificado (tc.name)
const toolName = toolCall.function?.name || toolCall.name;

if (!toolName) {
  throw new Error('[PrepareMCPTool] Tool call missing name. Invalid format.');
}

console.log('[PrepareMCPTool] Processing tool:', toolName);

// ============================================================================
// 3. PARSEAR ARGUMENTS (viene como string JSON desde el LLM)
// ============================================================================

let toolArguments;

try {
  // Obtener arguments (puede venir en tc.function.arguments o tc.arguments)
  const argsString = toolCall.function?.arguments || toolCall.arguments;

  if (!argsString) {
    throw new Error('Tool call missing arguments');
  }

  // Si es string JSON, parsearlo a objeto
  if (typeof argsString === 'string') {
    toolArguments = JSON.parse(argsString);
  } else {
    // Ya es un objeto
    toolArguments = argsString;
  }

  console.log('[PrepareMCPTool] ✅ Arguments parsed successfully');
  console.log('[PrepareMCPTool] Arguments:', JSON.stringify(toolArguments, null, 2));

} catch (e) {
  console.error('[PrepareMCPTool] ❌ Failed to parse tool arguments:', e.message);
  console.error('[PrepareMCPTool] Raw arguments:', toolCall.function?.arguments || toolCall.arguments);
  throw new Error(`[PrepareMCPTool] Failed to parse tool arguments: ${e.message}`);
}

// ============================================================================
// 4. CONSTRUIR BODY PARA MCP SERVER
// ============================================================================
// Este body se enviará tal cual en el POST request

const mcpBody = {
  tool: toolName,
  arguments: toolArguments
};

console.log('[PrepareMCPTool] 🚀 MCP body prepared:');
console.log(JSON.stringify(mcpBody, null, 2));

// ============================================================================
// 5. VALIDAR CAMPOS REQUERIDOS (según el tool)
// ============================================================================

if (toolName === 'odoo_send_email') {
  if (!toolArguments.opportunityId) {
    throw new Error('[PrepareMCPTool] odoo_send_email requires opportunityId');
  }
  if (!toolArguments.subject) {
    console.warn('[PrepareMCPTool] ⚠️ odoo_send_email missing subject (optional but recommended)');
  }
  console.log('[PrepareMCPTool] ✅ Sending email to opportunity:', toolArguments.opportunityId);
}

if (toolName === 'odoo_schedule_meeting') {
  if (!toolArguments.opportunityId || !toolArguments.title || !toolArguments.startDatetime) {
    throw new Error('[PrepareMCPTool] odoo_schedule_meeting requires opportunityId, title, and startDatetime');
  }
  console.log('[PrepareMCPTool] ✅ Scheduling meeting:', toolArguments.title);
}

// ============================================================================
// 6. OUTPUT
// ============================================================================
// Pass through todos los datos necesarios para el siguiente nodo

return [{
  json: {
    // Body formateado para el HTTP Request (será usado como {{ $json.mcp_body }})
    mcp_body: mcpBody,

    // Pass through datos originales (necesarios para Process Tool Result)
    lead_id: inputData.lead_id,
    profile: inputData.profile,
    state: inputData.state,
    message: inputData.message,
    state_update: inputData.state_update,
    cta_menu: inputData.cta_menu,
    internal_reasoning: inputData.internal_reasoning,
    tool_calls: inputData.tool_calls,

    // Metadata útil para debugging
    tool_name: toolName,
    tool_arguments_preview: JSON.stringify(toolArguments).substring(0, 200) + '...'
  }
}];
