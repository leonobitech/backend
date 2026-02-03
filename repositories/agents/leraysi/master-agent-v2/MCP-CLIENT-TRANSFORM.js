// ============================================================================
// MCP CLIENT TRANSFORM - Transforma output de MCP Client a formato backend
// ============================================================================
// Nodo: Code (n8n)
// Posición: Después de MCP Client (antes de HTTP Request a backend)
//
// Función: Bypasa los nodos nativos MCP Server de n8n y transforma
//          directamente el output del MCP Client al formato que espera
//          el backend Odoo MCP Server.
//
// Contexto: Los nodos MCP Server Trigger nativos de n8n causan errores
//           de schema validation. Esta solución directa es más robusta.
//
// Input (desde MCP Client):
// [{
//   "query": "{\"opportunityId\":64,\"subject\":\"...\",\"emailTo\":\"...\"}"
// }]
//
// Output (para backend):
// {
//   "tool": "odoo_send_email",
//   "arguments": {
//     "opportunityId": 64,
//     "subject": "...",
//     "emailTo": "...",
//     "templateType": "...",
//     "templateData": {...}
//   }
// }
// ============================================================================

const inputData = $input.first().json;

console.log('[MCP-Client-Transform] === INPUT RECIBIDO ===');
console.log('[MCP-Client-Transform]', JSON.stringify(inputData, null, 2));

// El MCP Client envía los argumentos como string JSON en el campo "query"
const queryString = inputData.query;

if (!queryString) {
  throw new Error('[MCP-Client-Transform] No se encontró "query" en el input del MCP Client');
}

// Parsear el string JSON a objeto
let args;
try {
  args = JSON.parse(queryString);
  console.log('[MCP-Client-Transform] === ARGUMENTOS PARSEADOS ===');
  console.log('[MCP-Client-Transform]', JSON.stringify(args, null, 2));
} catch (parseError) {
  console.error('[MCP-Client-Transform] Error parseando query string:', parseError.message);
  throw new Error(`[MCP-Client-Transform] Query string inválido: ${parseError.message}`);
}

// Validar campos requeridos para odoo_send_email
const requiredFields = ['opportunityId', 'subject', 'emailTo', 'templateType', 'templateData'];
const missingFields = requiredFields.filter(field => !args[field]);

if (missingFields.length > 0) {
  console.error('[MCP-Client-Transform] Campos faltantes:', missingFields);
  throw new Error(`[MCP-Client-Transform] Faltan campos requeridos: ${missingFields.join(', ')}`);
}

// Construir formato para backend Odoo MCP Server
// Backend espera: { tool: "nombre", arguments: {...} }
const backendPayload = {
  tool: "odoo_send_email",
  arguments: args
};

console.log('[MCP-Client-Transform] === PAYLOAD PARA BACKEND ===');
console.log('[MCP-Client-Transform]', JSON.stringify(backendPayload, null, 2));

// Log de info adicional
console.log('[MCP-Client-Transform] ✅ Transformación exitosa');
console.log('[MCP-Client-Transform]   - Tool: odoo_send_email');
console.log('[MCP-Client-Transform]   - Opportunity ID:', args.opportunityId);
console.log('[MCP-Client-Transform]   - Email To:', args.emailTo);
console.log('[MCP-Client-Transform]   - Template Type:', args.templateType);

// Retornar payload formateado
return [{
  json: backendPayload
}];
