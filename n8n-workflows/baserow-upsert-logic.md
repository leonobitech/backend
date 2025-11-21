# 🔄 Lógica de Upsert en Baserow (Update or Insert)

Esta documentación describe cómo implementar la lógica para **buscar por user_id** y:
- **Actualizar** si el registro ya existe
- **Crear** si no existe ningún registro para ese user_id

---

## 📋 Flujo Completo Modificado

```
Webhook - Upload Avatar →
Convert to File →
Validate Image →
Upload File to Baserow →
[NUEVO] Search Row by user_id →
[NUEVO] IF Node (row exists?) →
  → Branch TRUE: Update Existing Row →
  → Branch FALSE: Create New Row →
[MERGE] Extract Avatar URL →
Update Core Backend →
Webhook Response
```

---

## 🔍 NODO 5: Search Row by user_id

### **Configuración del Nodo HTTP Request**

**Nombre:** `Search Row by user_id`

**Method:**
```
GET
```

**URL:**
```
https://br.leonobitech.com/api/database/rows/table/848/?user_field_names=true&filter__user_id__equal={{ $('Validate Image').item.json.user_id }}
```

**IMPORTANTE:** La URL incluye:
- `?user_field_names=true` → Para usar nombres de campos en lugar de IDs
- `&filter__user_id__equal=VALUE` → Filtro para buscar por user_id exacto

**Authentication:**
```
Generic Credential Type: Header Auth
Credential: Baserow API Token
```

**Headers:** (ya incluidos en la credencial)
```
Authorization: Token hRyhpz42krDurs1fPxLDK09Ypn1keySq
```

**Response Esperado:**

Si **existe** el registro:
```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 12,
      "user_id": "691f6583ecb5b3dffff0e2cf",
      "filename": "old-avatar.jpg",
      "avatar": [
        {
          "url": "https://br.leonobitech.com/media/user_files/old-file.jpg",
          "name": "old-file.jpg",
          "visible_name": "old-avatar.jpg"
        }
      ]
    }
  ]
}
```

Si **NO existe** el registro:
```json
{
  "count": 0,
  "next": null,
  "previous": null,
  "results": []
}
```

---

## 🔀 NODO 6: IF Node (Check if Row Exists)

### **Configuración del Nodo IF**

**Nombre:** `IF Row Exists`

**Conditions:**

**Condition 1:**
```
Value 1: ={{ $json.count }}
Operation: Larger (>)
Value 2: 0
```

**Explicación:**
- Si `count > 0` → El usuario **ya tiene un avatar** → Branch TRUE (Update)
- Si `count = 0` → El usuario **no tiene avatar** → Branch FALSE (Create)

---

## ✏️ BRANCH TRUE: Update Existing Row

### **Nodo: HTTP Request - Update Row**

**Nombre:** `Update Existing Row`

**Method:**
```
PATCH
```

**URL:**
```
https://br.leonobitech.com/api/database/rows/table/848/{{ $('Search Row by user_id').item.json.results[0].id }}/?user_field_names=true
```

**IMPORTANTE:** La URL incluye el **ID del registro** que obtuvimos del Search:
- `results[0].id` → El ID del primer (y único) registro encontrado

**Authentication:**
```
Generic Credential Type: Header Auth
Credential: Baserow API Token
```

**Headers:**
```
Send Headers: ON

Header 1:
  Name: Content-Type
  Value: application/json
```

**Body:**
```
Send Body: ON
Body Content Type: JSON

Body:
{
  "filename": "={{ $('Validate Image').item.json.filename }}",
  "avatar": [{
    "name": "={{ $('Upload File to Baserow').item.json.name }}",
    "visible_name": "={{ $('Upload File to Baserow').item.json.original_name }}"
  }]
}
```

**Nota:** NO actualizamos `user_id` porque ya existe y es la clave de búsqueda.

**Response Esperado:**
```json
{
  "id": 12,
  "user_id": "691f6583ecb5b3dffff0e2cf",
  "filename": "new-avatar.jpg",
  "avatar": [
    {
      "url": "https://br.leonobitech.com/media/user_files/new-file.jpg",
      "name": "new-file.jpg",
      "visible_name": "new-avatar.jpg",
      "size": 123456,
      "mime_type": "image/jpeg"
    }
  ]
}
```

---

## ➕ BRANCH FALSE: Create New Row

### **Nodo: Baserow (Native) - Create Row**

**Nombre:** `Create New Row`

Este es el mismo nodo que ya teníamos configurado:

**Operation:** `Create`
**Database:** leonobitech
**Table:** avatars (ID: 848)

**Fields to Send:**
```
user_id: ={{ $('Validate Image').item.json.user_id }}
filename: ={{ $('Validate Image').item.json.filename }}
avatar: ={{ $('Upload File to Baserow').item.json }}
```

**IMPORTANTE:** Para el campo `avatar`, en el **Expression Editor**:

```javascript
[{
  "name": "={{ $('Upload File to Baserow').item.json.name }}",
  "visible_name": "={{ $('Upload File to Baserow').item.json.original_name }}"
}]
```

**Response Esperado:**
```json
{
  "id": 13,
  "user_id": "new-user-123",
  "filename": "avatar.jpg",
  "avatar": [
    {
      "url": "https://br.leonobitech.com/media/user_files/file.jpg",
      "name": "file.jpg",
      "visible_name": "avatar.jpg"
    }
  ]
}
```

---

## 🔗 NODO 7: Merge Branches (Extract Avatar URL)

### **Nodo: Function - Extract Avatar URL**

**Nombre:** `Extract Avatar URL`

Este nodo debe estar configurado para recibir **ambas ramas** (Update y Create).

**Settings:**
- **When Node Finishes:** Wait for all incoming items
- **Execute Once:** No

**Code:**
```javascript
// Extract avatar URL from Baserow response (works for both Create and Update)
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
    mimeType: fileField[0].mime_type,
    baserowRecordId: response.id
  }
};
```

**Output:**
```json
{
  "userId": "691f6583ecb5b3dffff0e2cf",
  "avatarUrl": "https://br.leonobitech.com/media/user_files/file.jpg",
  "filename": "avatar.jpg",
  "size": 123456,
  "mimeType": "image/jpeg",
  "baserowRecordId": 12
}
```

---

## 🧪 Testing

### **Escenario 1: Usuario Nuevo (sin avatar previo)**

**Request:**
```bash
curl -X POST https://n8n.leonobitech.com/webhook/upload-avatar \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "new-user-789",
    "filename": "first-avatar.jpg",
    "mimeType": "image/jpeg",
    "fileData": "base64_encoded_string..."
  }'
```

**Flujo esperado:**
1. Upload File → ✅
2. Search Row → `count: 0` (no existe)
3. IF Node → Branch FALSE
4. Create New Row → ✅ Nuevo registro ID: 14
5. Extract Avatar URL → ✅
6. Update Core → ✅

**Resultado:**
- ✅ Nuevo registro en Baserow (ID: 14)
- ✅ MongoDB actualizado con avatar URL

---

### **Escenario 2: Usuario Existente (ya tiene avatar)**

**Request:**
```bash
curl -X POST https://n8n.leonobitech.com/webhook/upload-avatar \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "691f6583ecb5b3dffff0e2cf",
    "filename": "new-avatar.jpg",
    "mimeType": "image/jpeg",
    "fileData": "base64_encoded_string..."
  }'
```

**Flujo esperado:**
1. Upload File → ✅ Nuevo archivo en storage
2. Search Row → `count: 1` (existe ID: 12)
3. IF Node → Branch TRUE
4. Update Existing Row (ID: 12) → ✅ Actualiza `filename` y `avatar`
5. Extract Avatar URL → ✅
6. Update Core → ✅

**Resultado:**
- ✅ Registro existente actualizado (mismo ID: 12)
- ✅ MongoDB actualizado con nueva avatar URL
- ⚠️ Archivo antiguo queda en storage (Baserow no lo borra automáticamente)

---

## 🐛 Troubleshooting

### Error: "Cannot read property 'id' of undefined"
**Causa:** El array `results` está vacío pero intentamos acceder a `results[0].id`
**Solución:** Verifica que la condición del IF esté correcta (`count > 0`)

### Error: "404 Not Found" en Update Row
**Causa:** El ID del registro es incorrecto
**Solución:** Verifica que estés usando `$('Search Row by user_id').item.json.results[0].id`

### Error: "The provided value should be a list"
**Causa:** El campo `avatar` no es un array
**Solución:** Asegúrate de usar `[{ name, visible_name }]` con corchetes

### Problema: Archivos antiguos quedan en storage
**Explicación:** Baserow no borra automáticamente archivos al actualizar
**Impacto:** Uso de disco incrementa con cada upload
**Solución Futura:** Implementar limpieza manual o usar webhook para borrar archivo antiguo antes de actualizar

---

## 📊 Diagrama del Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Webhook - Upload Avatar                                  │
│    POST /webhook/upload-avatar                              │
│    Body: { userId, filename, mimeType, fileData }           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Convert to File                                          │
│    base64 → binary Buffer                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Validate Image                                           │
│    Check: type, size, extract metadata                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Upload File to Baserow                                   │
│    POST /api/user-files/upload-file/                        │
│    Response: { name, original_name, url }                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Search Row by user_id                                    │
│    GET /api/database/rows/table/848/                        │
│    ?filter__user_id__equal=VALUE                            │
│    Response: { count, results: [...] }                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. IF Row Exists                                            │
│    Condition: count > 0                                     │
└────────┬────────────────────────────────────────────┬───────┘
         │ TRUE (exists)                              │ FALSE (new)
         ▼                                            ▼
┌─────────────────────────┐              ┌─────────────────────────┐
│ 7a. Update Existing Row │              │ 7b. Create New Row      │
│ PATCH /rows/table/848/  │              │ POST /rows/table/848/   │
│ {ID}/?user_field_names  │              │ ?user_field_names=true  │
│ Body: {filename,avatar} │              │ Body: {user_id,...}     │
└────────┬────────────────┘              └────────┬────────────────┘
         │                                        │
         └────────────┬───────────────────────────┘
                      ▼
         ┌─────────────────────────────────────────┐
         │ 8. Extract Avatar URL (Merge)           │
         │ Extract: avatarUrl, userId, filename    │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │ 9. Update Core Backend                  │
         │ PATCH /account/avatar/update-from-n8n   │
         │ Header: x-core-access-key               │
         │ Body: { userId, avatarUrl }             │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │ 10. Webhook Response                    │
         │ { success: true, ... }                  │
         └─────────────────────────────────────────┘
```

---

## 🔐 Seguridad

### Protección contra Race Conditions

**Problema:** Si un usuario sube 2 avatares simultáneamente, podrían crearse 2 registros.

**Mitigación Actual:**
- Baserow no soporta `UPSERT` nativo
- La búsqueda + creación/actualización es secuencial en n8n (no hay paralelismo)
- El frontend debería deshabilitar el botón de upload mientras procesa

**Solución Futura:**
- Implementar un lock en Redis usando el `userId` como clave
- Bloquear durante todo el proceso de upload
- Liberar lock al finalizar

### Limpieza de Archivos Antiguos

**Problema:** Cada vez que un usuario actualiza su avatar, el archivo antiguo queda en storage.

**Opciones:**

1. **Opción 1: Webhook de Baserow**
   - Baserow puede disparar webhooks en eventos de actualización
   - Usar webhook para detectar cambio en campo `avatar`
   - Extraer nombre del archivo antiguo
   - Llamar a API de Baserow para borrar archivo: `DELETE /api/user-files/{name}/`

2. **Opción 2: Cron Job en n8n**
   - Ejecutar diariamente
   - Buscar archivos en storage que no estén referenciados en ninguna fila
   - Borrar archivos huérfanos

3. **Opción 3: Borrado Manual**
   - Implementar endpoint en Core backend: `DELETE /admin/cleanup-old-avatars`
   - Protegido con admin role
   - Lógica: comparar storage vs DB, borrar huérfanos

**Recomendación:** Implementar Opción 1 (webhook) para borrado inmediato y Opción 2 (cron) como backup.

---

## 📝 Notas Adicionales

1. **Filtros en Baserow:**
   - Formato: `filter__{field_name}__{operator}=value`
   - Operadores: `equal`, `not_equal`, `contains`, `higher_than`, etc.
   - Documentación: https://baserow.io/docs/apis/rest-api#filtering-rows

2. **Múltiples filtros:**
   - Baserow soporta múltiples filtros en la misma query
   - Ejemplo: `?filter__user_id__equal=X&filter__active__equal=true`
   - Los filtros se combinan con operador AND

3. **Performance:**
   - La búsqueda por `user_id` es rápida si el campo tiene índice en Baserow
   - Considera crear índice en el campo `user_id` si la tabla crece

4. **Límite de resultados:**
   - Por defecto, Baserow retorna hasta 100 resultados
   - Para tablas grandes, usar paginación: `?page=1&size=100`
   - En este caso, esperamos máximo 1 resultado por `user_id`

---

**Creado por:** Claude Code
**Fecha:** 2025-11-21
**Versión:** 2.0 (con lógica de upsert)

