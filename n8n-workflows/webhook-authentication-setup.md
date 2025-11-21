# 🔐 Configuración de Autenticación en Webhook de n8n

Esta guía explica cómo proteger el webhook de n8n con Header Authentication.

---

## 🎯 Objetivo

Proteger el endpoint del webhook `/webhook/upload-avatar` para que solo acepte requests con un header de autenticación válido.

**Antes:** Cualquiera puede enviar requests al webhook ❌
**Después:** Solo requests con el header correcto son aceptados ✅

---

## 📋 Configuración en n8n

### 1. Abrir el Workflow

1. Ve a n8n: https://n8n.leonobitech.com
2. Abre el workflow: **"Upload Avatar to Baserow"**
3. Click en el primer nodo: **"Webhook - Upload Avatar"**

---

### 2. Configurar Header Authentication

**En el Nodo Webhook:**

**Panel de Settings → Authentication:**

```
Authentication: Header Auth
```

**Header Auth Configuration:**

```
Header Name: x-n8n-webhook-key
Header Value: e847d18f76d2ff5520aecc71b23ca3003fa6bd93334764a551d69a793d902bd9
```

**Configuración Visual:**
```
┌──────────────────────────────────────────────┐
│ Webhook - Upload Avatar                     │
├──────────────────────────────────────────────┤
│ HTTP Method: POST                            │
│ Path: upload-avatar                          │
│ Authentication: Header Auth                  │
│   ├─ Header Name: x-n8n-webhook-key          │
│   └─ Header Value: e847d18f76d2...           │
└──────────────────────────────────────────────┘
```

---

### 3. Guardar el Workflow

1. Click en **"Save"** en la esquina superior derecha
2. (Opcional) Click en **"Activate"** si está desactivado

---

## 🧪 Testing

### Test 1: Request SIN autenticación (debe fallar)

```bash
curl -X POST https://n8n.leonobitech.com/webhook/upload-avatar \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test",
    "filename": "test.jpg",
    "mimeType": "image/jpeg",
    "fileData": "base64..."
  }'
```

**Response Esperado:**
```json
{
  "message": "Authorization header is required",
  "hint": "You need to add the x-n8n-webhook-key header"
}
```

HTTP Status: `401 Unauthorized`

---

### Test 2: Request CON autenticación (debe funcionar)

```bash
curl -X POST https://n8n.leonobitech.com/webhook/upload-avatar \
  -H "Content-Type: application/json" \
  -H "x-n8n-webhook-key: e847d18f76d2ff5520aecc71b23ca3003fa6bd93334764a551d69a793d902bd9" \
  -d '{
    "userId": "test",
    "filename": "test.jpg",
    "mimeType": "image/jpeg",
    "fileData": "base64..."
  }'
```

**Response Esperado:**
```json
{
  "success": true,
  "userId": "test",
  "avatarUrl": "https://br.leonobitech.com/media/user_files/...",
  "message": "Avatar uploaded successfully"
}
```

HTTP Status: `200 OK`

---

## 🔧 Integración con Frontend

### 1. Variable de Entorno

El frontend ya tiene la variable configurada en `.env.local`:

```env
NEXT_PUBLIC_N8N_WEBHOOK_KEY=e847d18f76d2ff5520aecc71b23ca3003fa6bd93334764a551d69a793d902bd9
```

**IMPORTANTE:** En producción (Vercel), agrega esta variable en:
- Vercel Dashboard → Project Settings → Environment Variables

---

### 2. Código Actualizado

El componente `ProfileTab.tsx` ya incluye el header:

```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_N8N_URL}/webhook/upload-avatar`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-n8n-webhook-key": process.env.NEXT_PUBLIC_N8N_WEBHOOK_KEY || "",
  },
  body: JSON.stringify({
    userId: user.id,
    filename: file.name,
    mimeType: file.type,
    fileData: base64Data,
  }),
});
```

---

## 🔐 Seguridad

### Ventajas de Header Auth

1. ✅ **No aparece en URLs** (no queda en logs del servidor web)
2. ✅ **HTTPS cifrado** (el header viaja encriptado)
3. ✅ **Simple de implementar** (no requiere OAuth/JWT complejo)
4. ✅ **Revocable** (puedes cambiar el key sin cambiar el endpoint)

### Rotación de Keys

Si necesitas regenerar el key:

```bash
# 1. Generar nuevo key
openssl rand -hex 32

# 2. Actualizar en n8n (nodo Webhook)
# 3. Actualizar en .env.local del frontend
# 4. Actualizar en Vercel Environment Variables
# 5. Redeploy del frontend (si es necesario)
```

---

## 🛡️ Capas de Seguridad

Este webhook ahora tiene **múltiples capas** de protección:

1. **Header Auth** (n8n) → Valida el header `x-n8n-webhook-key`
2. **HTTPS/TLS** (Traefik) → Todo el tráfico cifrado
3. **ForwardAuth** (Traefik + Core) → Protege el acceso a n8n UI
4. **CORS** (n8n) → Solo acepta requests del dominio frontend
5. **Validación de datos** (Function node) → Valida tipo/tamaño del archivo
6. **API Key** (Core) → Protege el endpoint de actualización del backend

---

## ⚠️ Troubleshooting

### Error: "Authorization header is required"

**Causa:** El header `x-n8n-webhook-key` no está presente en la request

**Solución:**
1. Verifica que la variable de entorno esté configurada
2. Reinicia el dev server si modificaste `.env.local`
3. En Vercel, verifica que la variable esté en Environment Variables

---

### Error: "Invalid authorization header"

**Causa:** El valor del header no coincide con el configurado en n8n

**Solución:**
1. Verifica que el valor en `.env.local` sea exactamente el mismo que en n8n
2. No debe tener espacios extra ni saltos de línea
3. Es case-sensitive (sensible a mayúsculas/minúsculas)

---

### Frontend no envía el header

**Causa:** Variable de entorno no se carga correctamente

**Debug:**
```typescript
console.log('Webhook Key:', process.env.NEXT_PUBLIC_N8N_WEBHOOK_KEY);
```

**Solución:**
1. Verifica que el nombre sea `NEXT_PUBLIC_N8N_WEBHOOK_KEY` (exacto)
2. Reinicia el dev server: `npm run dev`
3. En producción, redeploy después de agregar la variable

---

## 📊 Monitoreo

### Ver Requests Fallidos en n8n

1. Ve a n8n → Executions
2. Filtra por "Error"
3. Busca errores de autenticación

### Logs en n8n

Los requests sin autenticación correcta **no ejecutan el workflow**, por lo que no aparecen en los logs de ejecución.

Para ver estos requests, revisa los logs de Traefik:

```bash
docker logs traefik_proxy --tail 100 | grep "webhook/upload-avatar"
```

---

## 📝 Resumen

| Componente | Configuración | Valor |
|------------|---------------|-------|
| **n8n Webhook** | Authentication → Header Auth | ✅ Configurado |
| **Header Name** | `x-n8n-webhook-key` | Fijo |
| **Header Value** | Secret key | `e847d18f76d2...` |
| **Frontend .env.local** | `NEXT_PUBLIC_N8N_WEBHOOK_KEY` | `e847d18f76d2...` |
| **Vercel Env Vars** | `NEXT_PUBLIC_N8N_WEBHOOK_KEY` | ⚠️ Pendiente configurar |

---

## 🚀 Próximos Pasos

1. ✅ Configurar Header Auth en n8n webhook
2. ✅ Probar con curl (sin auth → debe fallar)
3. ✅ Probar con curl (con auth → debe funcionar)
4. ✅ Probar desde frontend local
5. ⬜ Agregar variable en Vercel Environment Variables
6. ⬜ Redeploy del frontend en Vercel
7. ⬜ Probar desde producción

---

**Creado por:** Claude Code
**Fecha:** 2025-11-21
**Secret Key:** `e847d18f76d2ff5520aecc71b23ca3003fa6bd93334764a551d69a793d902bd9`
**Header Name:** `x-n8n-webhook-key`

