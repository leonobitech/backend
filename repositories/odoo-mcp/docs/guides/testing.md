# Cómo Probar las Herramientas de Odoo desde Claude Desktop

## Opción 1: Probar Directamente desde Claude Desktop (MÁS FÁCIL) ✅

**Ya tienes el MCP server conectado a Claude Desktop**, así que solo necesitas:

### 1. Abre Claude Desktop

### 2. Verifica que el servidor esté conectado

En la configuración de Claude Desktop, deberías ver:
- **leonobitech_claude** (conectado con ✅)

### 3. Prueba las herramientas con lenguaje natural

Simplemente haz preguntas como estas y Claude automáticamente usará las herramientas:

#### **Prueba 1: Ver leads**
```
Muéstrame los últimos 5 leads de mi CRM de Odoo
```

#### **Prueba 2: Crear un lead**
```
Crea un nuevo lead en Odoo:
- Nombre: "Proyecto Web Corporativo"
- Empresa: "Tech Solutions SA"
- Email: contact@techsolutions.com
- Teléfono: +34 600 123 456
- Descripción: "Interesados en desarrollo de sitio web corporativo con e-commerce"
```

#### **Prueba 3: Ver oportunidades (pipeline)**
```
Muéstrame todas las oportunidades activas en mi pipeline de ventas
```

#### **Prueba 4: Buscar contactos**
```
Busca contactos en Odoo que contengan "Tech" en el nombre
```

#### **Prueba 5: Reporte de ventas**
```
Genera un reporte de ventas del último mes
```

#### **Prueba 6: Crear una actividad**
```
Programa una llamada para mañana a las 10:00 AM con el lead "Proyecto Web Corporativo"
```

### 4. Observa los logs en tiempo real (Opcional)

Si quieres ver qué está pasando en el backend mientras pruebas:

```bash
# En tu VPS (vmi2568874)
docker logs -f claude_oauth
```

---

## Opción 2: Probar con Script Node.js (Para debugging)

Si quieres probar sin Claude Desktop o depurar problemas:

### 1. Necesitas un access token

El token se genera automáticamente cuando Claude Desktop se conecta. Para obtenerlo:

**Desde el VPS:**
```bash
# Revisa los logs recientes para ver tokens generados
docker logs --tail 100 claude_oauth | grep -i "token\|access"
```

O **inspecciona desde Claude Desktop** (modo desarrollador):
1. Abre Claude Desktop
2. Cmd+Option+I (Mac) o Ctrl+Shift+I (Windows/Linux)
3. Ve a Application → Local Storage
4. Busca tokens relacionados con `leonobitech`

### 2. Ejecuta el script de prueba

```bash
cd /Users/felix/leonobitech/backend/repositories/claude-oauth
node test-odoo-tools.js <TU_ACCESS_TOKEN>
```

---

## Herramientas Disponibles

Cuando pruebes desde Claude Desktop, estas son las 8 herramientas que deberían funcionar:

| Herramienta | Qué hace | Ejemplo de uso |
|-------------|----------|----------------|
| `odoo_get_leads` | Obtiene leads del CRM | "Muéstrame los últimos 10 leads" |
| `odoo_create_lead` | Crea un nuevo lead | "Crea un lead para la empresa XYZ" |
| `odoo_get_opportunities` | Ver pipeline de ventas | "Cuáles son mis oportunidades activas?" |
| `odoo_update_deal_stage` | Mover deals entre etapas | "Mueve el deal #123 a Qualified" |
| `odoo_search_contacts` | Buscar clientes/proveedores | "Busca contactos de Madrid" |
| `odoo_create_contact` | Crear nuevo contacto | "Añade un contacto nuevo" |
| `odoo_get_sales_report` | Reporte de ventas | "Reporte de ventas del trimestre" |
| `odoo_create_activity` | Programar llamadas/reuniones | "Programa una reunión mañana a las 3pm" |

---

## Verificación Rápida en el VPS

Si las herramientas no aparecen, verifica:

### 1. Variables de entorno cargadas
```bash
docker exec claude_oauth env | grep ODOO
```

Deberías ver:
```
ODOO_URL=https://odoo.leonobitech.com
ODOO_DB=leonobitech
ODOO_USERNAME=felix@leonobitech.com
ODOO_API_KEY=0a36c32239aa30260a9f78ef41cc2b9dfc13168d
ODOO_VERSION=19
```

### 2. Servidor funcionando
```bash
docker ps --filter name=claude_oauth
```

Debería mostrar estado "Up".

### 3. Conexión a Odoo
```bash
docker exec claude_oauth node -e "
const xmlrpc = require('xmlrpc');
const client = xmlrpc.createSecureClient({
  url: 'https://odoo.leonobitech.com/xmlrpc/2/common',
  rejectUnauthorized: true
});
client.methodCall('authenticate', [
  'leonobitech',
  'felix@leonobitech.com',
  '0a36c32239aa30260a9f78ef41cc2b9dfc13168d',
  {}
], (err, uid) => {
  if (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
  console.log('✅ Autenticado! UID:', uid);
});
"
```

Deberías ver: `✅ Autenticado! UID: <número>`

### 4. Reiniciar si es necesario
```bash
docker compose restart claude_oauth
```

---

## Troubleshooting

### "No veo las herramientas de Odoo en Claude Desktop"

1. **Reconecta el servidor MCP:**
   - Ve a Settings → Developer → MCP Servers
   - Desconecta `leonobitech_claude`
   - Vuelve a conectar

2. **Verifica los logs del servidor:**
   ```bash
   docker logs --tail 50 claude_oauth
   ```

3. **Reinicia Claude Desktop:**
   - Cierra completamente la app
   - Vuelve a abrir

### "Error al ejecutar herramienta de Odoo"

1. **Verifica autenticación:**
   ```bash
   docker logs claude_oauth | grep -i "odoo\|error"
   ```

2. **Verifica que Odoo esté accesible:**
   ```bash
   curl -I https://odoo.leonobitech.com
   ```

3. **Verifica el API key en Odoo:**
   - Ve a Settings → Users → felix@leonobitech.com
   - Verifica que el API key `0a36c32239aa30260a9f78ef41cc2b9dfc13168d` esté activo

---

## Siguiente Paso

**¡Empieza con la Opción 1!** Es la forma más natural de probar. Simplemente abre Claude Desktop y pide:

```
"Muéstrame los últimos 3 leads de Odoo"
```

Claude detectará automáticamente que tiene la herramienta `odoo_get_leads` disponible y la usará para responder. 🚀
