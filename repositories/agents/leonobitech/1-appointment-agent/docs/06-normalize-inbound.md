# Nodo 6: Normalize_Inbound

## Información General

- **Nombre del nodo**: `Normalize_Inbound`
- **Tipo**: Code (JavaScript)
- **Función**: Transformar el payload crudo de Chatwoot en un formato normalizado y estructurado
- **Entrada**: Salida del nodo `isTexto?` (webhook completo de Chatwoot)
- **Mode**: Run Once for All Items

## Descripción

Este nodo es **crítico para la arquitectura del workflow**. Realiza una transformación profunda del payload de Chatwoot, extrayendo, limpiando y normalizando datos en dos objetos bien definidos:

1. **`profile_base`**: Información del lead (identidad, ubicación, canales)
2. **`event`**: Información del mensaje actual (contenido, timestamps)

## Funciones Auxiliares Implementadas

### 1. `pickLatestMessage(messages)`
Selecciona el mensaje más reciente de un array basándose en `created_at`.

**Lógica**:
- Normaliza timestamps a milisegundos (maneja epoch segundos, epoch ms, ISO strings)
- Compara todos los mensajes y retorna el más reciente
- Maneja casos edge: arrays vacíos, valores null, formatos mixtos

```javascript
// Maneja múltiples formatos de timestamp:
// - Epoch segundos: 1761914019
// - Epoch ms: 1761914019000
// - ISO string: "2025-10-31T12:33:39.918Z"
// - Números como string: "1761914019"
```

### 2. `parseToIso(value)`
Convierte cualquier formato de timestamp a ISO 8601 UTC.

**Casos manejados**:
- `null` → Usa `new Date()` (ahora)
- Número (epoch) → Convierte a ISO
- String numérico → Parsea y convierte
- String ISO → Valida y normaliza
- Inválido → Fallback a `new Date()`

### 3. `normalizeChannel(raw)`
Normaliza el nombre del canal de Chatwoot a un formato estándar.

**Mapeo**:
```javascript
"Channel::Whatsapp" → "whatsapp"
"Channel::Instagram" → "instagram"
"Channel::Facebook" → "facebook"
"Channel::Email" → "email"
"Channel::Web" → "web"
"WhatsApp" (inbox name) → "whatsapp"
```

### 4. `detectCountryByPhone(phone)`
Detecta el país basándose en el código de área del teléfono.

**Países soportados**:
| Código | País |
|--------|------|
| +54 | Argentina |
| +593 | Ecuador |
| +52 | México |
| +57 | Colombia |
| +56 | Chile |
| +51 | Perú |
| +58 | Venezuela |
| +55 | Brasil |
| +595 | Paraguay |
| +591 | Bolivia |
| +598 | Uruguay |
| +34 | España |
| +1 | Estados Unidos |

**Algoritmo**:
- Ordena prefijos por longitud (más largo primero)
- Permite códigos de área extendidos (ej: +5989 para Uruguay)
- Fallback: "Desconocido" si no coincide

### 5. `tzByCountry(country)`
Mapea país a zona horaria (offset UTC).

**Ejemplo**:
```javascript
"Argentina" → "-03:00"
"España" → "+01:00"
"México" → "-06:00"
"Colombia" → "-05:00"
```

**Nota**: No maneja DST (Daylight Saving Time) actualmente.

### 6. `toLocalIso(isoUtc, tzOff)`
Convierte timestamp UTC a hora local con offset incluido.

**Ejemplo**:
```javascript
Input:  "2025-10-31T12:33:41.372Z", "-03:00"
Output: "2025-10-31T09:33:41.372-03:00"
// 12:33 UTC → 09:33 Argentina (UTC-3)
```

**Algoritmo**:
1. Parsea el offset (signo + horas + minutos)
2. Calcula milisegundos del offset
3. Suma/resta al timestamp UTC
4. Formatea con el offset incluido

### 7. `cleanText(s)`
Limpia el contenido del mensaje para formato consistente.

**Transformaciones**:
- `<br>` → `\n` (saltos de línea)
- Mantiene `<strong>` (negritas)
- Elimina otras etiquetas HTML
- Normaliza espacios múltiples a uno solo
- Trim() de espacios en blanco

**Ejemplo**:
```javascript
Input:  "Hola<br>  ¿Cómo   <em>estás</em>?"
Output: "Hola\n ¿Cómo estás?"
```

## Lógica Principal del Nodo

### Extracción de Datos

```javascript
// Navega por la estructura anidada de Chatwoot
const data = item.json || {};
const body = data.body || {};
const conv = body.conversation || {};
const msgs = Array.isArray(conv.messages) ? conv.messages : [];

// Selecciona el mensaje más reciente
const lastMsg = pickLatestMessage(msgs) || {};

// Extrae identidad del sender (múltiples fuentes posibles)
const sender = lastMsg.sender || conv.meta?.sender || data.sender || {};
```

### Construcción de `profile_base`

Objeto con información del lead:

```javascript
{
  full_name: "Felix Figueroa",        // Nombre completo
  phone_e164: "+5491133851987",       // Teléfono en formato E.164
  email: null,                        // Email (opcional)
  country: "Argentina",               // País detectado por código de área
  tz: "-03:00",                       // Zona horaria del país
  channel: "whatsapp",                // Canal normalizado
  chatwoot_id: 186,                   // ID del contacto en Chatwoot
  chatwoot_inbox_id: 186,             // ID del inbox de contacto
  conversation_id: 190                // ID de la conversación activa
}
```

### Construcción de `event`

Objeto con información del mensaje:

```javascript
{
  message_id: 2704,                           // ID del mensaje en Chatwoot
  message_text: "Hola que tal",               // Texto limpio del mensaje
  msg_created_iso: "2025-10-31T12:33:39.000Z", // Timestamp del mensaje (UTC)
  now_iso_utc: "2025-10-31T12:33:41.372Z",    // Timestamp de procesamiento (UTC)
  now_iso_local: "2025-10-31T09:33:41.372-03:00" // Timestamp local del lead
}
```

## Estructura de Entrada

Recibe el objeto completo del webhook de Chatwoot (ver [Nodo 1](./01-webhook-entrada.md)):

```json
{
  "body": {
    "sender": { "id": 186, "name": "Felix Figueroa", "phone_number": "+5491133851987" },
    "conversation": {
      "id": 190,
      "channel": "Channel::Whatsapp",
      "messages": [
        {
          "id": 2704,
          "content": "Hola que tal",
          "created_at": "2025-10-31T12:33:39.918Z",
          "sender": { /* ... */ }
        }
      ]
    }
  }
}
```

## Formato de Salida (JSON)

**Transformación completa**: El nodo **reemplaza** la estructura completa por un objeto normalizado.

```json
[
  {
    "profile_base": {
      "full_name": "Felix Figueroa",
      "phone_e164": "+5491133851987",
      "email": null,
      "country": "Argentina",
      "tz": "-03:00",
      "channel": "whatsapp",
      "chatwoot_id": 186,
      "chatwoot_inbox_id": 186,
      "conversation_id": 190
    },
    "event": {
      "message_id": 2704,
      "message_text": "Hola que tal",
      "msg_created_iso": "2025-10-31T12:33:39.000Z",
      "now_iso_utc": "2025-10-31T12:33:41.372Z",
      "now_iso_local": "2025-10-31T09:33:41.372-03:00"
    }
  }
]
```

## Casos de Uso Especiales

### Caso 1: Múltiples mensajes en el array
```javascript
// Chatwoot puede incluir múltiples mensajes en el webhook
const msgs = [
  { id: 2702, created_at: 1761914000 },
  { id: 2703, created_at: 1761914010 },
  { id: 2704, created_at: 1761914019 }  // ← Este será seleccionado
];
```

**Resultado**: Solo se procesa el mensaje más reciente (`id: 2704`).

### Caso 2: Email presente
```javascript
{
  "sender": {
    "email": "felix@leonobitech.com",
    "phone_number": "+5491133851987"
  }
}
```

**Salida**: `profile_base.email = "felix@leonobitech.com"`

### Caso 3: País desconocido
```javascript
{
  "sender": {
    "phone_number": "+881234567890"  // Teléfono satélite
  }
}
```

**Salida**:
```javascript
{
  country: "Desconocido",
  tz: "-03:00"  // Fallback a Argentina
}
```

### Caso 4: Mensaje con HTML
```javascript
{
  "content": "Hola,<br><strong>necesito</strong> <em>ayuda</em> urgente"
}
```

**Salida**:
```javascript
{
  message_text: "Hola,\n necesito ayuda urgente"
}
```

## Propósito en el Workflow

1. **Separación de concerns**: Divide datos de identidad (profile) y evento (message)
2. **Normalización de timestamps**: Tres formatos de tiempo para diferentes usos
3. **Detección de contexto**: País y zona horaria para personalización
4. **Limpieza de datos**: Texto consistente sin HTML basura
5. **Simplificación**: Los nodos siguientes trabajan con estructura plana y predecible

## Beneficios de esta Normalización

### ✅ Para Baserow/Odoo
- Campos predecibles y consistentes
- País y timezone para segmentación
- IDs de Chatwoot para sincronización

### ✅ Para LLMs
- Texto limpio sin HTML
- Timestamps en formato estándar
- Contexto de país/idioma

### ✅ Para debugging
- Timestamps múltiples para auditoría
- Estructura plana fácil de inspeccionar
- Trazabilidad con `message_id`, `conversation_id`

## Datos Disponibles para Siguiente Nodo

| Campo | Disponible en | Descripción |
|-------|---------------|-------------|
| `$json.profile_base.full_name` | profile_base | Nombre del lead |
| `$json.profile_base.phone_e164` | profile_base | Teléfono (clave única) |
| `$json.profile_base.country` | profile_base | País detectado |
| `$json.profile_base.tz` | profile_base | Zona horaria |
| `$json.profile_base.chatwoot_id` | profile_base | ID en Chatwoot |
| `$json.profile_base.conversation_id` | profile_base | ID de conversación |
| `$json.event.message_text` | event | Mensaje del cliente (limpio) |
| `$json.event.message_id` | event | ID del mensaje |
| `$json.event.now_iso_local` | event | Timestamp local del lead |

## Mejoras Sugeridas

### 1. Detección automática de idioma
```javascript
// Basado en país o análisis del texto
profile_base.language = detectLanguage(country, msgText);
// "Argentina" → "es"
// "Brasil" → "pt"
```

### 2. Validación de E.164
```javascript
// Validar que el teléfono esté en formato correcto
if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
  // Log warning o normalizar
}
```

### 3. Soporte para DST (Daylight Saving Time)
```javascript
// Usar librería como moment-timezone o date-fns-tz
const tz = getTimezoneByCountry(country, now);
// "Argentina" + verano → "-03:00"
// "España" + verano → "+02:00"
```

### 4. Extracción de metadatos adicionales
```javascript
profile_base.device_type = detectDevice(sender.additional_attributes);
profile_base.first_contact_date = conv.created_at;
profile_base.total_messages = msgs.length;
```

## Próximo Nodo Esperado

Con esta estructura normalizada, el siguiente nodo probablemente será:

1. **Redis: Set/Get** - Almacenar en buffer temporal
2. **Baserow: Search** - Buscar lead por `phone_e164`
3. **Code: Enrich data** - Añadir más contexto antes de continuar

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Tipo de transformación**: Destructiva (reemplaza estructura completa)
**Salida**: Objeto normalizado `{ profile_base, event }`
