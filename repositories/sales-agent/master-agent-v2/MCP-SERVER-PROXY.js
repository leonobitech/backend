// ============================================================================
// MCP SERVER PROXY - Reenviar tool calls al Odoo MCP Server
// ============================================================================
// Este nodo recibe tool calls del MCP Client y los reenvía al servidor MCP
// backend (odoo_mcp:8100) que ejecuta las acciones reales en Odoo.
//
// Ubicacion: Workflow "Odoo-MCP" (MCP Server)
// Despues de: MCP Server Trigger
// Antes de: HTTP Request "Execute in Odoo MCP"
// ============================================================================

const inputData = $input.first().json;

console.log('[MCP-Server-Proxy] Input data:', JSON.stringify(inputData, null, 2));

// El MCP Server Trigger puede enviar los datos en diferentes formatos
// Intentamos extraer tool name y arguments de varias formas posibles

let toolName;
let toolArguments;

// Opcion 1: Formato directo (tool + arguments)
if (inputData.tool) {
  toolName = inputData.tool;
  toolArguments = inputData.arguments || {};
}
// Opcion 2: Formato MCP estandar (name + input)
else if (inputData.name) {
  toolName = inputData.name;
  toolArguments = inputData.input || {};
}
// Opcion 3: Nested en params
else if (inputData.params) {
  toolName = inputData.params.name || inputData.params.tool;
  toolArguments = inputData.params.arguments || inputData.params.input || {};
}
// Fallback
else {
  throw new Error('[MCP-Server-Proxy] Could not extract tool name from input');
}

console.log('[MCP-Server-Proxy] Tool name:', toolName);
console.log('[MCP-Server-Proxy] Tool arguments:', JSON.stringify(toolArguments, null, 2));

// Validacion basica
if (!toolName) {
  throw new Error('[MCP-Server-Proxy] Tool name is required');
}

// Construir body para el backend MCP server
// Formato: { tool: "odoo_send_email", arguments: {...} }
const mcpBody = {
  tool: toolName,
  arguments: toolArguments
};

console.log('[MCP-Server-Proxy] MCP body prepared:', JSON.stringify(mcpBody, null, 2));

// Return
return [{
  json: mcpBody
}];
