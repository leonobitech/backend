#!/bin/bash

# Script para verificar configuración de Odoo en el contenedor
echo "🔍 Verificando configuración de Odoo en contenedor..."
echo ""

# 1. Verificar que el contenedor esté corriendo
echo "1️⃣ Estado del contenedor:"
docker ps | grep claude_oauth || echo "❌ Contenedor no está corriendo"
echo ""

# 2. Verificar variables de entorno de Odoo
echo "2️⃣ Variables de entorno de Odoo:"
docker exec claude_oauth env | grep ODOO
echo ""

# 3. Verificar que el archivo .env se montó correctamente
echo "3️⃣ Contenido del .env (sin secrets):"
docker exec claude_oauth sh -c "cat .env | grep ODOO | sed 's/API_KEY=.*/API_KEY=***HIDDEN***/'"
echo ""

# 4. Test de conectividad a Odoo
echo "4️⃣ Test de conectividad a Odoo:"
docker exec claude_oauth sh -c "node -e \"
const https = require('https');
const url = process.env.ODOO_URL || 'https://odoo.leonobitech.com';
console.log('Probando conexión a:', url);
https.get(url, (res) => {
  console.log('✅ Respuesta HTTP:', res.statusCode);
  res.on('data', () => {});
}).on('error', (e) => {
  console.error('❌ Error:', e.message);
});
\""
echo ""

# 5. Verificar logs recientes del contenedor
echo "5️⃣ Últimas 10 líneas de logs:"
docker logs --tail 10 claude_oauth
echo ""

echo "✅ Verificación completa"
