# Configuración del nodo HTTP Request para upload a Baserow

Este nodo reemplaza el nodo nativo "Upload to Baserow" porque el nodo nativo no soporta fácilmente uploads de archivos binarios en la Community Edition.

---

## 🎯 Configuración del Nodo HTTP Request

### 1. Información Básica
- **Nombre del nodo**: `Upload to Baserow (HTTP)`
- **Tipo**: HTTP Request
- **Posición**: Entre "Validate Image" y "Extract Avatar URL"

---

### 2. Configuración del Request

#### **Method**
```
POST
```

#### **URL**
```
https://br.leonobitech.com/api/database/rows/table/848/
```

**Notas:**
- `848` es el Table ID de la tabla "avatars" en Baserow
- Esta ruta NO pasa por ForwardAuth (línea 796 del docker-compose.yml)
- Solo requiere autenticación por token de API

---

### 3. Autenticación

#### **Authentication**
```
Generic Credential Type
```

#### **Generic Auth Type**
```
Header Auth
```

#### **Credentials**
- Click en "Create New Credential"
- **Credential Type**: Header Auth
- **Name**: `Baserow API Token`
- **Credential Data**:
  - **Name**: `Authorization`
  - **Value**: `Token <TU_BASEROW_API_TOKEN>`
    - Reemplaza `<TU_BASEROW_API_TOKEN>` con tu token real
    - **Formato importante**: `Token ` seguido del token (con espacio)
    - Ejemplo: `Token abcd1234567890xyz`

---

### 4. Body Configuration

#### **Send Body**
```
✅ ON (activado)
```

#### **Body Content Type**
```
Multipart-Form Data
```

#### **Body Parameters / Fields**

**Campo 1: user_id**
- **Name**: `user_id`
- **Type**: String
- **Value**:
  ```javascript
  ={{ $json.user_id }}
  ```

**Campo 2: filename**
- **Name**: `filename`
- **Type**: String
- **Value**:
  ```javascript
  ={{ $json.filename }}
  ```

**Campo 3: avatar** (archivo binario)
- **Name**: `avatar`
- **Type**: File
- **Input Binary Field**: ✅ ON (activado)
- **Input Data Field Name**:
  ```
  data
  ```

**IMPORTANTE:** El nombre del campo `avatar` debe coincidir EXACTAMENTE con el nombre del campo File en tu tabla de Baserow.

---

### 5. Options / Configuración Adicional

#### **Response**
- **Response Format**: `JSON` (por defecto)

#### **Timeout**
- Dejar en 300000ms (5 minutos) o ajustar si es necesario

---

## 📊 Diagrama de Flujo del Nodo

```
Input desde "Validate Image":
{
  json: {
    user_id: "abc123",
    filename: "avatar.jpg",
    mimeType: "image/jpeg",
    validated: true
  },
  binary: {
    data: {
      data: Buffer(...),
      mimeType: "image/jpeg",
      fileName: "avatar.jpg"
    }
  }
}

↓ HTTP Request POST

Output a "Extract Avatar URL":
{
  json: {
    id: 3655,
    user_id: "abc123",
    filename: "avatar.jpg",
    avatar: [
      {
        url: "https://br.leonobitech.com/media/user_files/abc123/avatar_xyz.jpg",
        name: "avatar.jpg",
        size: 123456,
        visible_name: "avatar.jpg",
        thumbnails: {...}
      }
    ]
  }
}
```

---

## 🔍 Verificación de la Configuración

### Test Manual del Endpoint

Puedes probar el endpoint manualmente desde tu terminal:

```bash
# Crear un archivo de prueba
echo "test file" > test.txt

# Upload usando curl
curl -X POST https://br.leonobitech.com/api/database/rows/table/848/ \
  -H "Authorization: Token TU_BASEROW_API_TOKEN" \
  -F "user_id=test_user_123" \
  -F "filename=test.txt" \
  -F "avatar=@test.txt"
```

**Respuesta esperada (200 OK):**
```json
{
  "id": 3656,
  "user_id": "test_user_123",
  "filename": "test.txt",
  "avatar": [
    {
      "url": "https://br.leonobitech.com/media/user_files/...",
      "name": "test.txt",
      "size": 9,
      "visible_name": "test.txt"
    }
  ]
}
```

---

## 🐛 Troubleshooting

### Error: "401 Unauthorized"
**Causa:** Token de API inválido o formato incorrecto
**Solución:**
1. Verifica que el token esté en formato `Token abc123...` (con espacio)
2. Genera un nuevo token en Baserow: Settings → API Tokens
3. Verifica que el token tenga permisos de escritura en la tabla

### Error: "404 Not Found"
**Causa:** Table ID incorrecto
**Solución:**
- Verifica el Table ID en la URL de Baserow
- URL: `https://br.leonobitech.com/database/4/table/848/3655`
- Table ID = `848` ✅

### Error: "400 Bad Request - Field 'avatar' not found"
**Causa:** Nombre del campo no coincide con el campo File en Baserow
**Solución:**
- Ve a tu tabla en Baserow
- Verifica el nombre EXACTO del campo File
- Actualiza el parámetro `avatar` por el nombre correcto

### Error: "413 Request Entity Too Large"
**Causa:** Archivo muy grande (límite del servidor)
**Solución:**
- Verificar que la validación de 5MB esté funcionando
- Revisar límites en Nginx/Traefik (client_max_body_size)

---

## 🔐 Seguridad

### Headers de Seguridad Aplicados por Traefik

Según docker-compose.yml (línea 800):
```yaml
middlewares: secure-strict@file,block-trackers@file,api-nostore-vary@file
```

Estos middlewares añaden automáticamente:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cache-Control: no-store, no-cache, must-revalidate`
- `Vary: Accept-Encoding, Authorization`

### Autenticación

- ✅ **API Token**: Protege el acceso a la API REST
- ✅ **Red interna**: n8n se comunica con Baserow via red Docker (leonobitech-net)
- ✅ **HTTPS**: Todo el tráfico externo cifrado por Traefik
- ❌ **Sin ForwardAuth**: La API REST NO requiere autenticación del Core

---

## 📝 Notas Adicionales

1. **Nombres de campos**:
   - Los campos en la request deben usar **snake_case** (`user_id`)
   - Los campos en Baserow también deben ser **snake_case**

2. **Respuesta de Baserow**:
   - El campo `avatar` es un array de objetos
   - Cada objeto tiene `url`, `name`, `size`, `visible_name`, `thumbnails`
   - La URL es pública y servida por Nginx (no requiere autenticación)

3. **Volúmenes Docker**:
   - Los archivos se guardan en el volumen `baserow_media` (línea 760 y 1529)
   - Este volumen es compartido entre `baserow_backend` y `baserow_media_server`
   - Nginx sirve los archivos desde `/baserow/media:ro` (read-only)

4. **Orden de prioridad en Traefik**:
   - API (`/api`): Sin auth, prioridad normal
   - Media (`/media`): Sin auth, prioridad normal
   - Frontend (`/`): Con ForwardAuth, catch-all

---

## 🚀 Próximos Pasos

Después de configurar este nodo:
1. Guardar workflow en n8n
2. Probar con un archivo de prueba desde el frontend
3. Verificar que el archivo aparece en Baserow
4. Verificar que la URL del archivo es accesible públicamente
5. Confirmar que el Core backend recibe la URL correctamente

---

**Creado por:** Claude Code
**Fecha:** 2025-01-20
**Referencia:** [docker-compose.yml](../docker-compose.yml:796-801)
