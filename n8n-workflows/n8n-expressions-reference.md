# 📚 Guía de Expresiones en n8n - Referenciar Nodos

Esta guía explica cómo referenciar datos de nodos específicos en n8n workflows.

---

## 🎯 Referencia Básica

### 1. Nodo Actual o Anterior
```javascript
{{ $json.campo }}
```
- Accede al output del **nodo anterior** inmediato
- Es el shortcut más común

### 2. Nodo Específico por Nombre
```javascript
{{ $('Nombre del Nodo').item.json.campo }}
```
- Accede a un **nodo específico** sin importar su posición en el workflow
- **IMPORTANTE:** El nombre del nodo debe ser **exacto**, incluyendo espacios y mayúsculas

---

## 📝 Ejemplos Prácticos

### Ejemplo 1: Campo de Texto Simple

**Acceder al filename del nodo "Validate Image":**

```javascript
{{ $('Validate Image').item.json.filename }}
```

**Output:**
```
avatar.jpg
```

---

### Ejemplo 2: Objeto Completo

**Acceder al objeto completo del nodo "Upload File to Baserow":**

```javascript
{{ $('Upload File to Baserow').item.json }}
```

**Output:**
```json
{
  "size": 123456,
  "mime_type": "image/jpeg",
  "is_image": true,
  "name": "abc123...xyz.jpg",
  "original_name": "avatar.jpg",
  "url": "https://br.leonobitech.com/media/user_files/abc123...xyz.jpg"
}
```

---

### Ejemplo 3: Array de Objetos

**Crear array con datos de múltiples nodos:**

```javascript
[{
  "name": "={{ $('Upload File to Baserow').item.json.name }}",
  "visible_name": "={{ $('Upload File to Baserow').item.json.original_name }}"
}]
```

**Output:**
```json
[{
  "name": "abc123...xyz.jpg",
  "visible_name": "avatar.jpg"
}]
```

---

## 🔄 Métodos de Acceso

### `.item` vs `.first()` vs `.all()`

| Método | Uso | Output |
|--------|-----|--------|
| `.item` | Accede al **primer item** | `{ json: {...}, binary: {...} }` |
| `.first()` | Igual que `.item` | `{ json: {...}, binary: {...} }` |
| `.all()` | Accede a **todos los items** | `[{ json: {...} }, { json: {...} }]` |

### Ejemplos:

**Un solo item:**
```javascript
{{ $('Upload File to Baserow').item.json.name }}
// Output: "abc123...xyz.jpg"
```

**Primer item (alternativa):**
```javascript
{{ $('Upload File to Baserow').first().json.name }}
// Output: "abc123...xyz.jpg"
```

**Todos los items (loop):**
```javascript
{{ $('Upload File to Baserow').all()[0].json.name }}
// Output: "abc123...xyz.jpg"
```

---

## 🧩 Casos de Uso Específicos

### Caso 1: Nodo HTTP Request Body (JSON)

**Nodo:** Create Row in Baserow

**Campo:** Body (JSON mode)

```json
{
  "user_id": "={{ $('Validate Image').item.json.user_id }}",
  "filename": "={{ $('Validate Image').item.json.filename }}",
  "avatar": [{
    "name": "={{ $('Upload File to Baserow').item.json.name }}",
    "visible_name": "={{ $('Upload File to Baserow').item.json.original_name }}"
  }]
}
```

**IMPORTANTE:** Cada expresión debe estar entre comillas dobles y empezar con `={{`

---

### Caso 2: Nodo Native Baserow (Fields)

**Nodo:** Baserow - Create

**Campo:** avatar (File field)

**Opción 1: Expression Editor**
```javascript
[{
  "name": "={{ $('Upload File to Baserow').item.json.name }}",
  "visible_name": "={{ $('Upload File to Baserow').item.json.original_name }}"
}]
```

**Opción 2: Fixed Mode (pegar JSON)**
```json
[{
  "name": "abc123...xyz.jpg",
  "visible_name": "avatar.jpg"
}]
```

---

### Caso 3: Nodo Function (Code)

**Nodo:** Function - Extract Avatar URL

```javascript
// Acceder a nodos específicos en Function nodes

// Método 1: Usando $node
const uploadResponse = $node["Upload File to Baserow"].json;
const filename = uploadResponse.name;

// Método 2: Usando $() - NO funciona en Function nodes
// ❌ const filename = $('Upload File to Baserow').item.json.name;

// Método 3: Desde el input actual
const item = items[0];
const data = item.json;

return {
  json: {
    name: filename,
    url: uploadResponse.url
  }
};
```

**IMPORTANTE:** En **Function nodes**, usa `$node["Nombre del Nodo"]` en lugar de `$('Nombre del Nodo')`

---

### Caso 4: URL con Parámetros

**Nodo:** HTTP Request

**URL:**
```
https://br.leonobitech.com/api/database/rows/table/848/?user_field_names=true&filter__user_id__equal={{ $('Validate Image').item.json.user_id }}
```

**Output:**
```
https://br.leonobitech.com/api/database/rows/table/848/?user_field_names=true&filter__user_id__equal=691f6583ecb5b3dffff0e2cf
```

---

## 🔍 Debugging de Expresiones

### Ver Output de un Nodo

1. Ejecuta el workflow
2. Click en el nodo que quieres inspeccionar
3. En el panel derecho, ve a la pestaña **"Output"**
4. Expande `json` para ver todos los campos disponibles

### Probar Expresiones

1. En cualquier campo, click en el ícono **fx** (expression editor)
2. Escribe tu expresión
3. El preview aparece en tiempo real debajo
4. Si hay error, aparece en rojo

### Ejemplo de Expression Editor:

```
Campo: filename
Expression: {{ $('Upload File to Baserow').item.json.original_name }}
Preview: avatar.jpg ✅
```

---

## ⚠️ Errores Comunes

### Error 1: "Item not found"
```javascript
❌ {{ $('Upload File').item.json.name }}
```
**Causa:** El nombre del nodo es incorrecto
**Solución:** Verifica el nombre exacto del nodo (con espacios, mayúsculas, etc.)
```javascript
✅ {{ $('Upload File to Baserow').item.json.name }}
```

---

### Error 2: "Cannot read property 'json' of undefined"
```javascript
❌ {{ $('Upload File to Baserow').json.name }}
```
**Causa:** Falta `.item` o `.first()`
**Solución:**
```javascript
✅ {{ $('Upload File to Baserow').item.json.name }}
```

---

### Error 3: "Unexpected token" en JSON
```json
❌ {
  "avatar": [{
    name: {{ $('Upload File to Baserow').item.json.name }}
  }]
}
```
**Causa:** Falta comillas dobles y `=`
**Solución:**
```json
✅ {
  "avatar": [{
    "name": "={{ $('Upload File to Baserow').item.json.name }}"
  }]
}
```

---

### Error 4: Referencia a nodo que no se ejecutó
```javascript
❌ {{ $('Create Row').item.json.id }}
```
**Causa:** Intentar acceder a un nodo que está en una rama IF que no se ejecutó
**Solución:** Asegúrate de que el nodo siempre se ejecute antes de referenciarlo

---

## 🎨 Buenas Prácticas

### 1. Nombres de Nodos Descriptivos

❌ Malo:
```
HTTP Request 1
HTTP Request 2
HTTP Request 3
```

✅ Bueno:
```
Upload File to Baserow
Create Row in Baserow
Update Core Backend
```

**Razón:** Hace las expresiones más legibles y menos propensas a errores

---

### 2. Consistencia en Nombres

❌ Malo:
```
Validate image  → Validate Image → validate-image
```

✅ Bueno:
```
Validate Image → Upload File to Baserow → Create Row in Baserow
```

**Razón:** Title Case consistente facilita recordar nombres exactos

---

### 3. Evitar Cadenas Largas

❌ Malo:
```javascript
{{ $('Upload File to Baserow').item.json.thumbnails.tiny.url.split('/').pop() }}
```

✅ Bueno:
```javascript
// Usar un Function node para lógica compleja
const uploadData = $node["Upload File to Baserow"].json;
const thumbnailUrl = uploadData.thumbnails?.tiny?.url || '';
const filename = thumbnailUrl.split('/').pop();

return { json: { filename } };
```

---

### 4. Validación de Datos

❌ Malo:
```javascript
{{ $('Upload File to Baserow').item.json.name }}
```

✅ Bueno (con fallback):
```javascript
{{ $('Upload File to Baserow').item.json.name || 'unknown.jpg' }}
```

---

## 📖 Funciones Útiles en Expresiones

### String Manipulation

```javascript
// Uppercase
{{ $('Validate Image').item.json.filename.toUpperCase() }}
// Output: AVATAR.JPG

// Lowercase
{{ $('Validate Image').item.json.filename.toLowerCase() }}
// Output: avatar.jpg

// Replace
{{ $('Validate Image').item.json.filename.replace('.jpg', '.png') }}
// Output: avatar.png

// Split
{{ $('Upload File to Baserow').item.json.url.split('/').pop() }}
// Output: abc123...xyz.jpg
```

---

### Conditional Logic

```javascript
// Ternario
{{ $('Validate Image').item.json.mimeType === 'image/jpeg' ? 'JPEG' : 'Other' }}
// Output: JPEG

// Nullish coalescing
{{ $('Upload File to Baserow').item.json.name ?? 'default.jpg' }}
// Output: abc123...xyz.jpg (or 'default.jpg' if null)

// Optional chaining
{{ $('Upload File to Baserow').item.json?.thumbnails?.tiny?.url ?? '' }}
// Output: URL or empty string
```

---

### Date/Time

```javascript
// Current timestamp
{{ new Date().toISOString() }}
// Output: 2025-11-21T03:30:00.000Z

// Format date
{{ new Date().toLocaleDateString('es-ES') }}
// Output: 21/11/2025

// Unix timestamp
{{ Date.now() }}
// Output: 1700537400000
```

---

### Math

```javascript
// File size in MB
{{ ($('Upload File to Baserow').item.json.size / 1024 / 1024).toFixed(2) }}
// Output: 0.12

// Round
{{ Math.round($('Upload File to Baserow').item.json.size / 1024) }}
// Output: 120 (KB)
```

---

## 🔗 Referencias Oficiales

- **n8n Expressions Guide**: https://docs.n8n.io/code/expressions/
- **n8n Expression Functions**: https://docs.n8n.io/code/builtin/overview/
- **JavaScript Reference**: https://developer.mozilla.org/en-US/docs/Web/JavaScript

---

## 📝 Resumen Rápido

| Contexto | Sintaxis | Ejemplo |
|----------|----------|---------|
| **Campo de texto** | `{{ $('Nodo').item.json.campo }}` | `{{ $('Upload File to Baserow').item.json.name }}` |
| **JSON body** | `"={{ $('Nodo').item.json.campo }}"` | `"name": "={{ $('Upload File to Baserow').item.json.name }}"` |
| **Function node** | `$node["Nodo"].json.campo` | `$node["Upload File to Baserow"].json.name` |
| **URL** | `{{ $('Nodo').item.json.campo }}` | `?user_id={{ $('Validate Image').item.json.user_id }}` |
| **Array** | `[{ "key": "={{ ... }}" }]` | `[{ "name": "={{ $('Upload File to Baserow').item.json.name }}" }]` |

---

**Creado por:** Claude Code
**Fecha:** 2025-11-21
**Versión:** 1.0

