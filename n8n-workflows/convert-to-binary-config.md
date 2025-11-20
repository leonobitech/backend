# Configuración del nodo "Convert to Binary"

## Parámetros a configurar:

### 1. Mode
- **JSON to Binary**

### 2. Convert All Data
- **OFF** (desactivado)

### 3. JSON Property (Source Key)
```
body.fileData
```

### 4. Options

#### File Name:
```
={{ $json.body.filename || 'avatar.jpg' }}
```

#### MIME Type:
```
={{ $json.body.mimeType || 'image/jpeg' }}
```

---

## Cambios importantes:

**ANTES (incorrecto):**
- Source Key: `fileData`
- File Name: `{{ $json.filename }}`
- MIME Type: `{{ $json.mimeType }}`

**DESPUÉS (correcto):**
- Source Key: `body.fileData`
- File Name: `{{ $json.body.filename }}`
- MIME Type: `{{ $json.body.mimeType }}`

---

## Por qué este cambio:

Los datos del webhook vienen en esta estructura:
```json
{
  "headers": {...},
  "body": {           // ← Los datos están aquí
    "userId": "...",
    "filename": "...",
    "mimeType": "...",
    "fileData": "..."
  }
}
```

Por eso necesitamos acceder a `body.fileData`, `body.filename` y `body.mimeType`.
