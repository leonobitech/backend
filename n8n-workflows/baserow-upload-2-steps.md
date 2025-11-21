# ✅ Flujo Correcto: Upload a Baserow (2 Pasos)

**Token verificado:** `hRyhpz42krDurs1fPxLDK09Ypn1keySq` ✅

Baserow requiere **2 pasos** para subir archivos:

---

## 📋 Workflow en n8n

```
Webhook → Convert to File → Validate Image →
  → PASO 1: Upload File →
  → PASO 2: Create Row →
  → Extract Avatar URL → Update Core → Response
```

---

## 🔧 PASO 1: Upload File to Baserow

### **Nodo: HTTP Request 1 - Upload File**

**Configuración Básica:**
```
Name: Upload File to Baserow
Method: POST
URL: https://br.leonobitech.com/api/user-files/upload-file/
```

**Authentication:**
```
Authentication: None
Send Headers: ✅ ON

Header Parameters:
  Name: Authorization
  Value: Token hRyhpz42krDurs1fPxLDK09Ypn1keySq
```

**Body:**
```
Send Body: ✅ ON
Body Content Type: Multipart-Form Data

Body Parameters:
  Name: file
  [✅] Input Binary Field
  Input Data Field Name: data
```

**Response Esperado:**
```json
{
  "size": 123456,
  "mime_type": "image/jpeg",
  "is_image": true,
  "image_width": 800,
  "image_height": 600,
  "uploaded_at": "2025-11-21T02:11:59.901237Z",
  "url": "https://br.leonobitech.com/media/user_files/abc123...xyz.jpg",
  "thumbnails": {...},
  "name": "abc123...xyz.jpg",
  "original_name": "avatar.jpg"
}
```

**Campos importantes para el siguiente nodo:**
- `name`: Nombre interno del archivo en Baserow
- `original_name`: Nombre original del archivo
- `url`: URL pública del archivo

---

## 🔧 PASO 2: Create Database Row

### **Nodo: HTTP Request 2 - Create Row**

**Configuración Básica:**
```
Name: Create Row in Baserow
Method: POST
URL: https://br.leonobitech.com/api/database/rows/table/848/?user_field_names=true
```

**IMPORTANTE:** La URL debe incluir `?user_field_names=true` para usar nombres de campos en lugar de IDs.

**Authentication:**
```
Authentication: None
Send Headers: ✅ ON

Header Parameters:
  1. Name: Authorization
     Value: Token hRyhpz42krDurs1fPxLDK09Ypn1keySq

  2. Name: Content-Type
     Value: application/json
```

**Body:**
```
Send Body: ✅ ON
Body Content Type: JSON

Body (en modo JSON):
{
  "user_id": "={{ $('Validate Image').item.json.user_id }}",
  "filename": "={{ $('Validate Image').item.json.filename }}",
  "avatar": [{
    "name": "={{ $('Upload File to Baserow').item.json.name }}",
    "visible_name": "={{ $('Upload File to Baserow').item.json.original_name }}"
  }]
}
```

**Explicación del Body:**

1. **user_id**: Viene del nodo "Validate Image"
2. **filename**: Viene del nodo "Validate Image"
3. **avatar**: Es un **array** con un objeto que contiene:
   - `name`: Nombre interno del archivo (del Paso 1)
   - `visible_name`: Nombre original del archivo (del Paso 1)

**Response Esperado:**
```json
{
  "id": 12,
  "order": "2.00000000000000000000",
  "user_id": "user123",
  "filename": "avatar.jpg",
  "avatar": [{
    "url": "https://br.leonobitech.com/media/user_files/abc123...xyz.jpg",
    "thumbnails": {...},
    "visible_name": "avatar.jpg",
    "name": "abc123...xyz.jpg",
    "size": 123456,
    "mime_type": "image/jpeg",
    "is_image": true,
    "image_width": 800,
    "image_height": 600,
    "uploaded_at": "2025-11-21T02:11:59.901237+00:00"
  }]
}
```

---

## 🔧 PASO 3: Extract Avatar URL (ya existente)

**Nodo: Function - Extract Avatar URL**

Este nodo ya no necesita cambios mayores, solo ajustar para leer del nuevo nodo:

```javascript
// Extract avatar URL from Baserow response
const response = $input.first().json;

// Baserow returns file info in avatar field (array)
const fileField = response.avatar;

if (!fileField || !fileField[0]) {
  throw new Error('No file URL returned from Baserow');
}

const avatarUrl = fileField[0].url;
const userId = response.user_id;

return {
  json: {
    userId,
    avatarUrl,
    filename: fileField[0].visible_name,
    size: fileField[0].size,
    mimeType: fileField[0].mime_type
  }
};
```

---

## 📊 Resumen del Flujo Completo

### **Input desde Frontend:**
```json
{
  "userId": "user123",
  "filename": "avatar.jpg",
  "mimeType": "image/jpeg",
  "fileData": "base64_encoded_string..."
}
```

### **Paso 1: Webhook → Convert to File → Validate Image**
```javascript
// Output:
{
  json: {
    user_id: "user123",
    filename: "avatar.jpg",
    mimeType: "image/jpeg",
    validated: true
  },
  binary: {
    data: Buffer(...)
  }
}
```

### **Paso 2: Upload File to Baserow**
```
POST /api/user-files/upload-file/
→ Response: { name, original_name, url, size, mime_type }
```

### **Paso 3: Create Row in Baserow**
```
POST /api/database/rows/table/848/?user_field_names=true
Body: { user_id, filename, avatar: [{ name, visible_name }] }
→ Response: { id, user_id, filename, avatar: [{ url, ... }] }
```

### **Paso 4: Extract Avatar URL**
```javascript
// Extrae avatar[0].url
→ Output: { userId, avatarUrl }
```

### **Paso 5: Update Core Backend**
```
PATCH http://core:8000/account/avatar/update-from-n8n
Body: { userId, avatarUrl }
→ Response: { success: true, user: {...} }
```

### **Paso 6: Webhook Response**
```json
{
  "success": true,
  "userId": "user123",
  "avatarUrl": "https://br.leonobitech.com/media/user_files/abc123...xyz.jpg",
  "message": "Avatar uploaded successfully"
}
```

---

## 🧪 Test del Flujo Completo

### **Test Manual con curl:**

```bash
# Paso 1: Upload file
UPLOAD_RESPONSE=$(curl -s -X POST 'https://br.leonobitech.com/api/user-files/upload-file/' \
  -H 'Authorization: Token hRyhpz42krDurs1fPxLDK09Ypn1keySq' \
  -F 'file=@/path/to/avatar.jpg')

# Extraer 'name' y 'original_name'
FILE_NAME=$(echo $UPLOAD_RESPONSE | jq -r '.name')
ORIGINAL_NAME=$(echo $UPLOAD_RESPONSE | jq -r '.original_name')

# Paso 2: Create row
curl -X POST 'https://br.leonobitech.com/api/database/rows/table/848/?user_field_names=true' \
  -H 'Authorization: Token hRyhpz42krDurs1fPxLDK09Ypn1keySq' \
  -H 'Content-Type: application/json' \
  -d "{
    \"user_id\": \"test_user_123\",
    \"filename\": \"avatar.jpg\",
    \"avatar\": [{
      \"name\": \"$FILE_NAME\",
      \"visible_name\": \"$ORIGINAL_NAME\"
    }]
  }"
```

---

## 🔐 Credenciales en n8n

### **Opción 1: Header Auth (Recomendado)**

1. Settings → Credentials → Create New
2. Type: **Header Auth**
3. Name: `Baserow API Token`
4. Configuration:
   - **Name**: `Authorization`
   - **Value**: `Token hRyhpz42krDurs1fPxLDK09Ypn1keySq`

Luego en ambos nodos HTTP Request:
- Authentication: **Generic Credential Type**
- Generic Auth Type: **Header Auth**
- Credential: **Baserow API Token**

### **Opción 2: Headers Manuales (Más Simple)**

En ambos nodos:
- Authentication: **None**
- Send Headers: **ON**
- Header Parameters:
  - Name: `Authorization`
  - Value: `Token hRyhpz42krDurs1fPxLDK09Ypn1keySq`

---

## 🐛 Troubleshooting

### Error: "The provided token does not exist"
**Solución:** Regenera el token en Baserow (Settings → API tokens)

### Error: "The provided value should be a list"
**Causa:** El campo `avatar` debe ser un **array**, no un objeto
**Solución:** Asegúrate de usar `avatar: [{ name, visible_name }]` (con corchetes)

### Error: "Authentication credentials were not provided"
**Solución:** Verifica que el header sea `Authorization: Token ...` (con espacio después de "Token")

### Error: "Field 'user_id' does not exist"
**Solución:** Agrega `?user_field_names=true` a la URL del POST

---

## 📚 Referencias

- **Baserow API Docs**: https://baserow.io/docs/apis/rest-api
- **File Upload Endpoint**: `/api/user-files/upload-file/`
- **Create Row Endpoint**: `/api/database/rows/table/{table_id}/`
- **Token verificado**: `hRyhpz42krDurs1fPxLDK09Ypn1keySq` ✅

---

**Creado por:** Claude Code
**Fecha:** 2025-11-21
**Token válido hasta:** Indefinido (no expira, solo se revoca manualmente)
