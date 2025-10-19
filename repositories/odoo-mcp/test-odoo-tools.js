#!/usr/bin/env node

/**
 * Script para probar las herramientas de Odoo del MCP server
 *
 * Este script NO requiere autenticación OAuth completa.
 * Solo necesita el token de acceso que ya tienes en tu sesión.
 *
 * Uso:
 * 1. Obtén tu access token desde Claude Desktop (inspecciona las cookies)
 * 2. node test-odoo-tools.js <ACCESS_TOKEN>
 */

const https = require('https');

const MCP_URL = 'odoo-mcp.leonobitech.com';
const ACCESS_TOKEN = process.argv[2];

if (!ACCESS_TOKEN) {
  console.error('❌ Uso: node test-odoo-tools.js <ACCESS_TOKEN>');
  console.error('\nPara obtener el token:');
  console.error('1. Abre Claude Desktop');
  console.error('2. Abre las DevTools (Cmd+Option+I en Mac)');
  console.error('3. Ve a Application → Cookies');
  console.error('4. Busca el cookie "accessKey" o revisa el localStorage');
  process.exit(1);
}

console.log('🔍 Probando conexión MCP...\n');

// 1. Test: List tools
function listTools() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1
    });

    const options = {
      hostname: MCP_URL,
      port: 443,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Mcp-Session-Id': require('crypto').randomUUID()
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// 2. Test: Call a specific Odoo tool
function callOdooTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: 2
    });

    const options = {
      hostname: MCP_URL,
      port: 443,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Mcp-Session-Id': require('crypto').randomUUID()
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Main execution
(async () => {
  try {
    // Test 1: List all available tools
    console.log('📋 Paso 1: Listando todas las herramientas disponibles...\n');
    const toolsResponse = await listTools();

    if (toolsResponse.error) {
      console.error('❌ Error:', toolsResponse.error);
      process.exit(1);
    }

    const allTools = toolsResponse.result?.tools || [];
    const odooTools = allTools.filter(t => t.name.startsWith('odoo_'));

    console.log(`✅ Total de herramientas: ${allTools.length}`);
    console.log(`✅ Herramientas de Odoo: ${odooTools.length}\n`);

    if (odooTools.length === 0) {
      console.error('❌ No se encontraron herramientas de Odoo!');
      console.log('\n📝 Herramientas disponibles:');
      allTools.forEach(tool => {
        console.log(`  - ${tool.name}`);
      });
      process.exit(1);
    }

    console.log('🎯 Herramientas de Odoo encontradas:\n');
    odooTools.forEach((tool, i) => {
      console.log(`${i + 1}. ${tool.name}`);
      console.log(`   ${tool.description}`);
      console.log('');
    });

    // Test 2: Try calling odoo_get_leads
    console.log('📞 Paso 2: Probando odoo_get_leads con límite de 3...\n');
    const leadsResponse = await callOdooTool('odoo_get_leads', { limit: 3 });

    if (leadsResponse.error) {
      console.error('❌ Error al llamar odoo_get_leads:', leadsResponse.error);
      process.exit(1);
    }

    console.log('✅ Respuesta de odoo_get_leads:');
    console.log(JSON.stringify(leadsResponse.result, null, 2));

    console.log('\n🎉 ¡Todas las pruebas pasaron exitosamente!');
    console.log('\n💡 Ahora puedes usar estas herramientas desde Claude Desktop:');
    console.log('   - Abre Claude Desktop');
    console.log('   - Prueba: "Muéstrame los últimos 5 leads de Odoo"');
    console.log('   - Claude automáticamente usará la herramienta odoo_get_leads');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que el token sea válido');
    console.error('   2. Verifica que el servidor MCP esté corriendo');
    console.error('   3. Revisa los logs: docker logs claude_oauth');
    process.exit(1);
  }
})();
