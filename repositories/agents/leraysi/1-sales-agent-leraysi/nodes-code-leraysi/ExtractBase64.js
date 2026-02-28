// ============================================================================
// EXTRACT BASE64 - Sales Agent Leraysi
// ============================================================================
// Extrae el buffer binario de la imagen de Chatwoot y lo convierte a base64.
// La optimización de resize se hace en el nodo "Edit Image" (nativo n8n)
// que precede a este nodo.
// ============================================================================
// NODO: ExtractBase64 (Code)
// INPUT: EditImage (binary file response, resized)
// OUTPUT: { image_base64, image_mime_type } para Claude Vision API
// ============================================================================

const binaryData = await this.helpers.getBinaryDataBuffer(0, 'data');
const base64 = binaryData.toString('base64');
const mimeType = $input.item.binary.data.mimeType;

return [{
  json: {
    ...$input.item.json,
    image_base64: base64,
    image_mime_type: mimeType
  }
}];
