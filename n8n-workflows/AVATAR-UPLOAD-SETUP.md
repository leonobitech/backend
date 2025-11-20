# 🖼️ Sistema de Upload de Avatares

**Arquitectura:** Frontend → n8n → Baserow → Core Backend → MongoDB
**Storage:** Baserow (almacenamiento) + Nginx (servir archivos)
**Comunicación interna:** Red Docker `leonobitech-net`

---

## 📊 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────┐
│  1. Frontend (Next.js)                                      │
│     User selecciona imagen → Convierte a base64            │
│     POST https://n8n.leonobitech.com/webhook/upload-avatar │
│     Body: { userId, filename, mimeType, fileData }          │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. n8n Workflow (webhook)                                  │
│     - Recibe base64                                         │
│     - Valida tipo de archivo (JPG, PNG, WebP)              │
│     - Valida tamaño (<5MB)                                  │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Baserow API                                             │
│     POST /api/database/rows/table/{table_id}/               │
│     Headers: Authorization: Token {BASEROW_API_TOKEN}       │
│     Body: { user_id, filename, file: binary }               │
│     Response: { id, avatar: [{url, name, size}] }           │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Baserow Storage + Nginx                                 │
│     Archivo guardado en volumen: baserow_media              │
│     Nginx sirve en: https://br.leonobitech.com/media/...    │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Core Backend (Express)                                  │
│     PATCH http://core:8000/account/avatar/update-from-n8n   │
│     Headers: x-core-access-key: {CORE_API_KEY}              │
│     Body: { userId, avatarUrl }                             │
│     Action: UPDATE users SET avatar = avatarUrl             │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. MongoDB                                                 │
│     Collection: users                                       │
│     Document updated: { avatar: "https://br.leono..." }     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Configuración Paso a Paso

### **1. Configurar Tabla en Baserow**

1. **Crear tabla "avatars"** en Baserow:
   - Accede a: https://br.leonobitech.com
   - Crea una nueva tabla con estos campos:
     - `user_id` (Text)
     - `filename` (Text)
     - `avatar` (File) ← Campo principal

2. **Obtener Table ID**:
   - Ve a la tabla
   - El ID está en la URL: `https://br.leonobitech.com/database/{DATABASE_ID}/table/{TABLE_ID}`
   - Anota el `TABLE_ID`

3. **Generar API Token**:
   - Settings → API tokens → Create token
   - Dale permisos de lectura/escritura a la tabla
   - Anota el token

---

### **2. Configurar Credenciales de Baserow en n8n**

1. **En n8n**:
   - Ve a **Settings** → **Credentials**
   - Click **Add Credential**
   - Busca y selecciona **Baserow API**
   - Configura:
     - **Name**: `Baserow API` (o el nombre que prefieras)
     - **Host**: `https://br.leonobitech.com`
     - **API Token**: Pega el token que generaste en el paso 1.3
   - Click **Save**

---

### **3. Variables de Entorno en n8n**

Agrega estas variables en n8n (Settings → Environment Variables):

```bash
# Baserow Table ID
BASEROW_AVATARS_TABLE_ID=<tu_table_id>

# Core Backend API Key
CORE_API_KEY=7xeDpg4wekGuBsDhV06mIgxQ84K0f0DUK81qWkzC2wqQHpb9UqL4U0OJ7F41nHK6tw
```

**Nota**: Ya NO necesitas `BASEROW_API_TOKEN` como variable de entorno, porque ahora se usa el **nodo nativo de Baserow** que toma las credenciales configuradas en el paso 2.

---

### **4. Importar Workflow en n8n**

1. **Importar JSON**:
   ```bash
   # Copia el contenido de:
   /Users/felix/leonobitech/backend/n8n-workflows/upload-avatar-workflow.json
   ```

2. **En n8n**:
   - Canvas → Importar → Pegar JSON
   - Activar workflow
   - Copiar URL del webhook: `https://n8n.leonobitech.com/webhook/upload-avatar`

---

### **4. Variables de Entorno en Frontend**

Agrega en `frontend/.env.local`:

```bash
# n8n Webhook URL
NEXT_PUBLIC_N8N_URL=https://n8n.leonobitech.com
```

---

### **5. Variables de Entorno en Backend Core**

Verifica que existe en `backend/repositories/core/.env`:

```bash
# API Key para n8n
X_API_KEY=tu_api_key_segura
```

---

## 🔐 Seguridad

### **Autenticación por Capa**

| Capa | Método | Header | Validación |
|------|--------|--------|------------|
| Frontend → n8n | Ninguna (webhook público) | - | - |
| n8n → Baserow | API Token | `Authorization: Token ...` | Baserow valida token |
| n8n → Core | API Key | `x-core-access-key` | Core valida key |
| Core → MongoDB | Interna | - | Conexión directa |

### **Protecciones Implementadas**

✅ **Frontend**:
- Validación de tipo MIME (JPG, PNG, WebP)
- Validación de tamaño (5MB máximo)
- Preview antes de upload

✅ **n8n**:
- Validación adicional de tipo MIME
- Validación de tamaño
- Error handling con respuestas HTTP 400

✅ **Backend Core**:
- API Key obligatoria (middleware `apiKeyGuard`)
- Validación de userId (usuario debe existir)
- Validación de avatarUrl (debe ser URL válida)
- Logging de auditoría

✅ **Nginx (Baserow Media)**:
- Headers de seguridad (ver `nginx/media.conf`)
- Cache de 1 año para archivos inmutables
- Sin directory listing

---

## 🔄 Permisos en Red Docker

Todos los servicios se comunican internamente por `leonobitech-net`:

```yaml
# docker-compose.yml
networks:
  leonobitech-net:
    driver: bridge
```

**Comunicación interna:**
- n8n → Baserow: `http://backend:8000` (baserow backend)
- n8n → Core: `http://core:8000`
- Nginx → Baserow media: volumen compartido `baserow_media`

**Acceso público:**
- Frontend → n8n: `https://n8n.leonobitech.com/webhook/upload-avatar`
- Usuarios → Archivos: `https://br.leonobitech.com/media/*`

**NO se necesita** configuración adicional de permisos en Baserow para acceso público porque:
1. Los archivos se sirven via Nginx (no Baserow API)
2. Nginx tiene acceso al volumen `baserow_media:ro` (read-only)
3. Traefik enruta `br.leonobitech.com/media/` → `baserow_media:80`

---

## 📝 Uso desde Frontend

El componente [ProfileTab.tsx](../../frontend/app/settings/components/ProfileTab.tsx) ya está implementado:

```tsx
// Usuario selecciona archivo
<input
  type="file"
  accept="image/jpeg,image/jpg,image/png,image/webp"
  onChange={handleFileSelect}
/>

// Se envía automáticamente a n8n
const response = await fetch(`${process.env.NEXT_PUBLIC_N8N_URL}/webhook/upload-avatar`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: user.id,
    filename: file.name,
    mimeType: file.type,
    fileData: base64Data,  // base64 sin prefijo
  }),
});

// Respuesta:
// { success: true, userId, avatarUrl, message }
```

---

## 🧪 Testing

### **Test Manual del Flujo Completo**

1. **Frontend**:
   ```bash
   cd frontend
   npm run dev
   # Abre http://localhost:3000/settings
   # Click en "Upload Photo"
   # Selecciona una imagen
   ```

2. **Verificar en n8n**:
   - Abre n8n: https://n8n.leonobitech.com
   - Ve al workflow "Upload Avatar to Baserow"
   - Check executions → Debe aparecer ejecución exitosa

3. **Verificar en Baserow**:
   - Abre https://br.leonobitech.com
   - Ve a la tabla "avatars"
   - Debe aparecer nuevo registro con el archivo

4. **Verificar URL servida por Nginx**:
   ```bash
   curl -I https://br.leonobitech.com/media/user_files/...
   # Debe retornar 200 OK con headers de cache
   ```

5. **Verificar en MongoDB**:
   ```bash
   # En MongoDB Atlas o tu cliente Mongo
   db.users.findOne({ id: "userId_aqui" })
   # Campo avatar debe tener la URL de Baserow
   ```

### **Test del Endpoint Directo (Debugging)**

```bash
# Test endpoint de n8n → Core
curl -X PATCH http://core:8000/account/avatar/update-from-n8n \
  -H "x-core-access-key: tu_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_id_here",
    "avatarUrl": "https://br.leonobitech.com/media/test.jpg"
  }'
```

---

## 🐛 Troubleshooting

### **Error: "Invalid API key"**
- **Causa**: `x-core-access-key` no coincide con `X_API_KEY` en backend `.env`
- **Solución**: Verifica que `CORE_API_KEY` en n8n = `X_API_KEY` en backend

### **Error: "Failed to upload to Baserow"**
- **Causa**: Token de Baserow inválido o tabla no existe
- **Solución**:
  1. Verifica `BASEROW_API_TOKEN` en n8n
  2. Verifica `BASEROW_AVATARS_TABLE_ID`
  3. Verifica permisos del token

### **Error: "No file URL returned from Baserow"**
- **Causa**: Campo en Baserow no se llama "avatar" o "file"
- **Solución**: Edita función "Extract Avatar URL" en n8n:
  ```js
  const fileField = response.tu_nombre_de_campo;
  ```

### **Archivos no se ven (404)**
- **Causa**: Nginx no tiene acceso al volumen o ruta incorrecta
- **Solución**:
  ```bash
  # Verificar volumen montado
  docker inspect baserow_media_server | grep Mounts

  # Verificar config de Nginx
  docker exec baserow_media_server cat /etc/nginx/conf.d/default.conf
  ```

### **Frontend: "Avatar uploaded successfully" pero no se ve**
- **Causa**: Cache del navegador
- **Solución**: Hard refresh (Cmd+Shift+R) o esperar a que recargue

---

## 📊 Logs de Debugging

```bash
# Ver logs de n8n
docker logs n8n_main -f

# Ver logs del backend Core
docker logs core -f

# Ver logs de Nginx media server
docker logs baserow_media_server -f

# Ver logs de Baserow backend
docker logs baserow_backend -f
```

---

## 🚀 Próximas Mejoras

- [ ] Añadir compresión de imágenes en n8n (resize automático)
- [ ] Añadir watermark opcional
- [ ] Implementar borrado de avatar anterior (cleanup)
- [ ] Añadir límite de uploads por usuario
- [ ] Implementar virus scanning (ClamAV)
- [ ] Añadir soporte para GIFs animados

---

## 📚 Referencias

- **n8n Docs**: https://docs.n8n.io/
- **Baserow API**: https://baserow.io/docs/apis/rest-api
- **Traefik Docs**: https://doc.traefik.io/traefik/
- **CLAUDE.md**: [../../CLAUDE.md](../../CLAUDE.md)

---

**Creado por:** Claude Code
**Fecha:** 2025-01-20
**Stack:** Next.js 15 + Express 5 + n8n + Baserow + Nginx + Traefik + MongoDB
