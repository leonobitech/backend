// ============================================================================
// EXTRACT BASE64 + OPTIMIZE IMAGE - Sales Agent Leraysi
// ============================================================================
// Descarga el buffer binario de la imagen de Chatwoot, la redimensiona
// a max 1024px (lado largo) para optimizar tokens de Claude Vision,
// y la convierte a base64.
//
// Requiere: sharp (incluido en n8n Docker image)
// ============================================================================
// NODO: ExtractBase64 (Code)
// INPUT: GetImageFromChatwoot (binary file response)
// OUTPUT: { image_base64, image_mime_type } optimizados para Claude Vision API
// ============================================================================

const sharp = require('sharp');

const MAX_DIMENSION = 1024; // px lado largo — suficiente para análisis de cabello
const JPEG_QUALITY = 85;    // balance calidad/tamaño

const binaryData = await this.helpers.getBinaryDataBuffer(0, 'data');

// Redimensionar manteniendo aspect ratio, sin agrandar imágenes chicas
const optimized = await sharp(binaryData)
  .resize(MAX_DIMENSION, MAX_DIMENSION, {
    fit: 'inside',          // mantiene aspect ratio dentro del box
    withoutEnlargement: true // no agranda si ya es < 1024px
  })
  .jpeg({ quality: JPEG_QUALITY })
  .toBuffer();

const base64 = optimized.toString('base64');

return [{
  json: {
    ...$input.item.json,
    image_base64: base64,
    image_mime_type: 'image/jpeg' // siempre JPEG post-optimización
  }
}];
