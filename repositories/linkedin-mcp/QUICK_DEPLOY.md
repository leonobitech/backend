# Quick Deploy - Fix Mobile Field Error

## Problema Resuelto

Se eliminó el campo `mobile` de todas las consultas a `res.partner` porque no existe en Odoo 19 Community Edition.

**Error anterior:**
```
ValueError: Invalid field 'mobile' on 'res.partner'
```

**Herramientas afectadas:**
- ✅ `odoo_search_contacts` - Ahora funciona
- ✅ `odoo_create_contact` - Ahora funciona

---

## Deployment en VPS

Ejecuta estos comandos en tu VPS:

```bash
# SSH al servidor
ssh root@vmi2568874.contaboserver.net

# Pull los cambios
cd ~/backend
git pull

# Rebuild y restart
docker compose up -d --build claude_oauth

# Verifica que esté corriendo
docker logs --tail 20 claude_oauth
```

Deberías ver:
```
{"msg":"[claude-oauth] listening","port":8100}
```

---

## Probar desde Claude Desktop

Una vez deployado, prueba:

```
Busca contactos en Odoo que contengan "Digital" en el nombre
```

Ahora debería funcionar sin errores! 🎉

---

## Cambios Realizados

**Archivo modificado:** `src/lib/odoo.ts`

1. **searchContacts()** - Removido `"mobile"` de la lista de fields (línea 290)
2. **createContact()** - Removido parámetro `mobile?: string` (línea 309)
3. **createContact()** - Removida asignación `if (data.mobile) values.mobile = data.mobile;` (línea 322)
4. **Import** - Removido import no usado de `env`

---

## Campos Válidos para res.partner

En Odoo 19 CE, los campos válidos que estamos usando son:

- ✅ `id`
- ✅ `name`
- ✅ `email`
- ✅ `phone` (teléfono fijo/móvil combinado)
- ✅ `is_company`
- ✅ `street`
- ✅ `city`
- ✅ `country_id`
- ✅ `website`
- ✅ `create_date`

❌ `mobile` - NO existe en Odoo 19 CE (estaba en versiones anteriores)
