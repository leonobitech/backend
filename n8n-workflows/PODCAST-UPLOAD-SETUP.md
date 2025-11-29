# 🎙️ Sistema de Upload de Podcasts

**Arquitectura:** Frontend → n8n → Baserow → Core Backend → MongoDB
**Storage:** Baserow (almacenamiento) + Nginx (servir archivos)
**Comunicación interna:** Red Docker `leonobitech-net`

---

## 📊 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────┐
│  1. Frontend (Next.js) - Admin Only                         │
│     Admin selecciona MP4 + metadata → Convierte a base64   │
│     POST https://n8n.leonobitech.com/webhook/upload-podcast│
│     Body: { userId, title, description, filename,           │
│             mimeType, fileData }                            │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. n8n Workflow (webhook)                                  │
│     - Recibe base64                                         │
│     - Valida tipo de archivo (MP4)                         │
│     - Valida tamaño (<500MB)                               │
│     - Extrae duración del video (ffprobe)                  │
│     - Extrae thumbnail (frame en segundo 1)                │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Baserow API                                             │
│     POST /api/database/rows/table/{table_id}/               │
│     Headers: Authorization: Token {BASEROW_API_TOKEN}       │
│     Body: {                                                 │
│       user_id, title, description, video: binary,           │
│       thumbnail: binary, duration, published_at             │
│     }                                                       │
│     Response: {                                             │
│       id,                                                   │
│       video: [{url, name, size}],                          │
│       thumbnail: [{url, name, size}]                       │
│     }                                                       │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Baserow Storage + Nginx                                 │
│     Archivos guardados en volumen: baserow_media            │
│     Nginx sirve en: https://br.leonobitech.com/media/...    │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Core Backend (Express)                                  │
│     POST http://core:8000/api/podcasts                      │
│     Headers: x-core-access-key: {CORE_API_KEY}              │
│     Body: {                                                 │
│       title, description, videoUrl, thumbnailUrl,           │
│       duration, createdBy                                   │
│     }                                                       │
│     Action: INSERT into podcasts collection                │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. MongoDB                                                 │
│     Collection: podcasts                                    │
│     Document created: {                                     │
│       title, description, videoUrl, thumbnailUrl,           │
│       duration, publishedAt, createdBy, createdAt           │
│     }                                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Configuración Paso a Paso

### **1. Configurar Tabla en Baserow**

1. **Crear tabla "podcasts"** en Baserow:
   - Accede a: https://br.leonobitech.com
   - Crea una nueva tabla con estos campos:
     - `user_id` (Text) - ID del admin que subió el podcast
     - `title` (Text) - Título del podcast
     - `description` (Long Text) - Descripción del episodio
     - `video` (File) ← Campo principal para el MP4
     - `thumbnail` (File) - Thumbnail extraído del video
     - `duration` (Number) - Duración en segundos
     - `published_at` (Date) - Fecha de publicación

2. **Obtener Table ID**:
   - Ve a la tabla
   - El ID está en la URL: `https://br.leonobitech.com/database/{DATABASE_ID}/table/{TABLE_ID}`
   - Anota el `TABLE_ID`

3. **Generar API Token** (si no existe):
   - Settings → API tokens → Create token
   - Dale permisos de lectura/escritura a la tabla
   - Anota el token

---

### **2. Configurar Credenciales de Baserow en n8n**

1. **En n8n**:
   - Ve a **Settings** → **Credentials**
   - Si ya tienes credenciales de Baserow configuradas (del sistema de avatars), reutilízalas
   - Si no:
     - Click **Add Credential**
     - Busca y selecciona **Baserow API**
     - Configura:
       - **Name**: `Baserow API`
       - **Host**: `https://br.leonobitech.com`
       - **API Token**: Pega el token generado en el paso 1.3
     - Click **Save**

---

### **3. Variables de Entorno en n8n**

Agrega esta variable en n8n (Settings → Environment Variables):

```bash
# Baserow Podcasts Table ID
BASEROW_PODCASTS_TABLE_ID=<tu_table_id>

# Core Backend API Key (ya existe del sistema de avatars)
CORE_API_KEY=7xeDpg4wekGuBsDhV06mIgxQ84K0f0DUK81qWkzC2wqQHpb9UqL4U0OJ7F41nHK6tw
```

---

### **4. Importar Workflow en n8n**

1. **Importar JSON**:
   ```bash
   # Copia el contenido de:
   /Users/felix/leonobitech/backend/n8n-workflows/upload-podcast-workflow.json
   ```

2. **En n8n**:
   - Canvas → Importar → Pegar JSON
   - Activar workflow
   - Copiar URL del webhook: `https://n8n.leonobitech.com/webhook/upload-podcast`

---

### **5. Variables de Entorno en Frontend**

Ya existe en `frontend/.env.local`:

```bash
# n8n Webhook URL (compartido con avatars)
NEXT_PUBLIC_N8N_URL=https://n8n.leonobitech.com
```

---

### **6. Variables de Entorno en Backend Core**

Ya existe en `backend/repositories/core/.env`:

```bash
# API Key para n8n (compartido)
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
- Validación de tipo MIME (solo MP4)
- Validación de tamaño (500MB máximo)
- Preview del video antes de upload
- **Solo accesible para usuarios con role === 'admin'**

✅ **n8n**:
- Validación adicional de tipo MIME
- Validación de tamaño
- Extracción automática de duración con ffprobe
- Extracción automática de thumbnail (segundo 1)
- Error handling con respuestas HTTP 400

✅ **Backend Core**:
- API Key obligatoria (middleware `apiKeyGuard`)
- Validación de userId (usuario debe existir y ser admin)
- Validación de campos requeridos (title, description, videoUrl)
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
- Frontend → n8n: `https://n8n.leonobitech.com/webhook/upload-podcast`
- Usuarios → Archivos: `https://br.leonobitech.com/media/*`

**NO se necesita** configuración adicional de permisos en Baserow para acceso público porque:
1. Los archivos se sirven via Nginx (no Baserow API)
2. Nginx tiene acceso al volumen `baserow_media:ro` (read-only)
3. Traefik enruta `br.leonobitech.com/media/` → `baserow_media:80`

---

## 📝 Uso desde Frontend

El componente de upload será implementado como un modal fullscreen con drag & drop:

```tsx
// Estructura del request a n8n
const response = await fetch(`${process.env.NEXT_PUBLIC_N8N_URL}/webhook/upload-podcast`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: user.id,
    title: "Episodio #1: Introducción",
    description: "En este episodio hablamos de...",
    filename: file.name,
    mimeType: file.type,
    fileData: base64Data,  // base64 sin prefijo
  }),
});

// Respuesta esperada:
// {
//   success: true,
//   userId,
//   videoUrl: "https://br.leonobitech.com/media/...",
//   thumbnailUrl: "https://br.leonobitech.com/media/...",
//   duration: 1234, // segundos
//   message: "Podcast uploaded successfully"
// }
```

---

## 🧪 Testing

### **Test Manual del Flujo Completo**

1. **Frontend**:
   ```bash
   cd frontend
   npm run dev
   # Abre http://localhost:3000/podcasts
   # Click en botón "+" flotante (solo visible para admins)
   # Drag & drop un archivo MP4 o selecciona desde el explorador
   # Completa metadata (title, description)
   # Click "Upload"
   ```

2. **Verificar en n8n**:
   - Abre n8n: https://n8n.leonobitech.com
   - Ve al workflow "Upload Podcast to Baserow"
   - Check executions → Debe aparecer ejecución exitosa

3. **Verificar en Baserow**:
   - Abre https://br.leonobitech.com
   - Ve a la tabla "podcasts"
   - Debe aparecer nuevo registro con el archivo MP4 y thumbnail

4. **Verificar URLs servidas por Nginx**:
   ```bash
   # Video
   curl -I https://br.leonobitech.com/media/user_files/podcast_123.mp4
   # Debe retornar 200 OK

   # Thumbnail
   curl -I https://br.leonobitech.com/media/user_files/podcast_123_thumb.jpg
   # Debe retornar 200 OK
   ```

5. **Verificar en MongoDB**:
   ```bash
   # En MongoDB Atlas o tu cliente Mongo
   db.podcasts.find().sort({ createdAt: -1 }).limit(1)
   # Debe aparecer el nuevo podcast con videoUrl, thumbnailUrl, duration
   ```

### **Test del Endpoint Directo (Debugging)**

```bash
# Test endpoint de n8n → Core
curl -X POST http://core:8000/api/podcasts \
  -H "x-core-access-key: tu_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Podcast",
    "description": "Test description",
    "videoUrl": "https://br.leonobitech.com/media/test.mp4",
    "thumbnailUrl": "https://br.leonobitech.com/media/test_thumb.jpg",
    "duration": 120,
    "createdBy": "user_id_here"
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
  2. Verifica `BASEROW_PODCASTS_TABLE_ID`
  3. Verifica permisos del token

### **Error: "No video URL returned from Baserow"**
- **Causa**: Campo en Baserow no se llama "video"
- **Solución**: Edita función "Extract URLs" en n8n:
  ```js
  const videoField = response.video;
  const thumbnailField = response.thumbnail;
  ```

### **Error: "Failed to extract duration"**
- **Causa**: ffprobe no está instalado en el contenedor de n8n
- **Solución**: Instalar ffmpeg en el Dockerfile de n8n:
  ```dockerfile
  RUN apk add --no-cache ffmpeg
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

## 🚀 Diferencias con Avatar Upload

| Feature | Avatars | Podcasts |
|---------|---------|----------|
| Tipo de archivo | JPG, PNG, WebP | MP4 |
| Tamaño máximo | 5MB | 500MB |
| Campos adicionales | user_id, filename | title, description, duration |
| Extracción automática | No | Sí (duración + thumbnail) |
| Acceso | Todos los usuarios | Solo admins |
| Tabla Baserow | `avatars` | `podcasts` |
| Endpoint Core | `/account/avatar/update-from-n8n` | `/api/podcasts` |
| Colección MongoDB | `users` (campo avatar) | `podcasts` |

---

## 📚 Referencias

- **Avatar Upload Setup**: [AVATAR-UPLOAD-SETUP.md](./AVATAR-UPLOAD-SETUP.md)
- **n8n Docs**: https://docs.n8n.io/
- **Baserow API**: https://baserow.io/docs/apis/rest-api
- **ffmpeg Docs**: https://ffmpeg.org/ffprobe.html
- **CLAUDE.md**: [../../CLAUDE.md](../../CLAUDE.md)

---

**Creado por:** Claude Code
**Fecha:** 2025-01-24
**Stack:** Next.js 15 + Express 5 + n8n + Baserow + Nginx + Traefik + MongoDB + ffmpeg
