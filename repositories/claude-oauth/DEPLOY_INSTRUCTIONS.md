# Instrucciones de Deployment

El código ya está pusheado a GitHub. Ahora necesitas hacer el deploy en tu VPS.

## Paso 1: Conéctate a tu VPS

```bash
ssh root@vmi2568874.contaboserver.net
```

## Paso 2: Ve al directorio del proyecto

```bash
cd ~/backend/repositories/claude-oauth
```

## Paso 3: Pull los últimos cambios

```bash
git pull
```

## Paso 4: Rebuild y restart el contenedor Docker

```bash
cd ~/backend
docker compose build claude_oauth
docker compose up -d claude_oauth
```

O si prefieres hacerlo todo en un comando:

```bash
docker compose up -d --build claude_oauth
```

## Paso 5: Verifica que el contenedor esté corriendo

```bash
docker ps | grep claude_oauth
```

Deberías ver el contenedor con status "Up".

## Paso 6: Verifica los logs

```bash
docker logs -f claude_oauth
```

Espera a ver el mensaje:
```
{"msg":"[claude-oauth] listening","port":8100}
```

Presiona `Ctrl+C` para salir del modo follow.

## Paso 7: Prueba desde Claude Desktop

Ahora abre **Claude Desktop** (la aplicación de escritorio) y prueba:

```
Muéstrame los últimos 5 leads de mi CRM de Odoo
```

Claude debería usar la herramienta `odoo_get_leads` y mostrarte los resultados.

---

## Verificación Rápida (Opcional)

Si quieres verificar que el fix funcionó antes de probar desde Claude Desktop:

```bash
# Verifica que las variables de entorno están cargadas
docker exec claude_oauth env | grep ODOO

# Prueba la conexión a Odoo
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

---

## ¿Qué se arregló?

**Problema anterior:**
- Error: `ValueError: Invalid field 'mobile' on 'crm.lead'`
- El campo `mobile` no existe en el modelo `crm.lead` de Odoo 19

**Solución:**
- Removido el campo `mobile` de la lista de campos solicitados en `getLeads()`
- El campo `mobile` solo existe en `res.partner` (contactos), no en leads

**Archivos modificados:**
- `src/lib/odoo.ts` - Removida línea 171 que pedía el campo `mobile`

---

## Siguiente Paso

Una vez que hayas hecho el deployment en el VPS, prueba desde Claude Desktop con:

1. **Test básico:**
   ```
   Muéstrame los últimos 3 leads de Odoo
   ```

2. **Crear un lead:**
   ```
   Crea un nuevo lead llamado "Test desde Claude" con email test@example.com
   ```

3. **Ver oportunidades:**
   ```
   Cuáles son mis oportunidades activas?
   ```

Si todo funciona, ¡las 8 herramientas de Odoo estarán listas para usar! 🚀
