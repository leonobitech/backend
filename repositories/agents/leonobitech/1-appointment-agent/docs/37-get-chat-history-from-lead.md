# Nodo 37: Get Chat History from Lead

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | Get Chat History from Lead |
| **Tipo** | Odoo (Custom Resource - Message) |
| **Función** | Obtener historial completo de conversación desde Odoo |
| **Entrada** | Profile desde Node 35 con lead_id |
| **Operación** | GET MANY |

---

## Descripción

**Get Chat History from Lead** es el nodo que recupera **todos los mensajes** del chatter (mail.message) de Odoo para una oportunidad específica. Este historial completo será usado por el **LLM Analista** para analizar la conversación previa y generar un resumen contextual.

Su función principal es:
1. **Consultar mail.message** filtrando por `model=crm.lead` y `res_id=lead_id`
2. **Obtener todos los campos** del mensaje (body, date, author, etc.)
3. **Incluir mensajes del cliente Y del bot** para contexto completo
4. **Ordenar cronológicamente** desde el más antiguo al más reciente
5. **Preparar datos** para análisis por LLM (GPT-4)

**Diferencia con Node 36:**
- **Node 36**: Crea (CREATE) un nuevo mensaje del cliente
- **Node 37**: Obtiene (GET MANY) todos los mensajes existentes

---

## Configuración

### Parámetros Principales

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| **Credential** | Odoo-Felix | Credenciales de autenticación XML-RPC |
| **Resource** | Custom Resource | Acceso directo a modelos Odoo |
| **Custom Resource Name** | Message | Modelo `mail.message` |
| **Operation** | Get Many | Operación de lectura múltiple |
| **Return All** | ✅ Enabled | Devolver todos los mensajes (sin limit) |

### Filters (Filtros de Búsqueda)

#### Filter 1: Model = crm.lead
```yaml
Field Name or ID: Model
Operator: =
Value: crm.lead
```

**Propósito:** Solo mensajes del modelo de oportunidades CRM.

#### Filter 2: Res Id = lead_id
```javascript
Field Name or ID: Res Id
Operator: =
Value: {{ $('ComposeProfile').item.json.profile.lead_id }}
Output: 33
```

**Propósito:** Solo mensajes de la oportunidad específica (ID 33).

---

## Input

El nodo recibe el objeto `profile` desde **Node 35: ComposeProfile**:

```json
{
  "profile": {
    "row_id": 198,
    "lead_id": 33,
    "full_name": "Felix Figueroa",
    "last_message": "Si, claro me llamo Felix",
    "stage": "explore",
    "country": "Argentina"
  }
}
```

**Campo usado:**
- `profile.lead_id` → Res Id filter (33)

---

## Output

### Estructura de Salida (Array de Mensajes)

El nodo devuelve un array con **4 mensajes** en orden cronológico inverso (más reciente primero):

```json
[
  {
    "id": 1043,
    "date": "2025-10-31 16:57:17",
    "body": "<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>",
    "preview": "Cliente: Si, claro me llamo Felix",
    "message_type": "comment",
    "author_id": false,
    "res_id": 33,
    "model": "crm.lead"
  },
  {
    "id": 1042,
    "date": "2025-10-31 14:16:42",
    "body": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech...</p>",
    "preview": "🤖 Leonobit: ¡Hola! Bienvenido...",
    "message_type": "comment",
    "author_id": [6, "Leonobitech, Felix Figueroa"],
    "res_id": 33,
    "model": "crm.lead"
  },
  {
    "id": 1041,
    "date": "2025-10-31 14:05:13",
    "body": "<p><strong>Cliente: </strong>Hola que tal</p>",
    "preview": "Cliente: Hola que tal",
    "message_type": "comment",
    "author_id": false,
    "res_id": 33,
    "model": "crm.lead"
  },
  {
    "id": 1040,
    "date": "2025-10-31 13:58:18",
    "body": "<div summary=\"o_mail_notification\"><p>Hay un nuevo lead...</p></div>",
    "preview": "Hay un nuevo lead para el equipo...",
    "message_type": "notification",
    "author_id": [6, "Leonobitech, Felix Figueroa"],
    "res_id": 33,
    "model": "crm.lead"
  }
]
```

### Campos Clave del Output

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `id` | Number | ID del mensaje en mail.message | 1043 |
| `date` | DateTime | Timestamp del mensaje (UTC) | "2025-10-31 16:57:17" |
| `body` | HTML String | Contenido HTML del mensaje | `"<p><strong>Cliente: </strong>..."` |
| `preview` | String | Vista previa texto plano | "Cliente: Si, claro me llamo Felix" |
| `message_type` | String | Tipo de mensaje | "comment", "notification" |
| `author_id` | Array/False | Autor del mensaje (False = cliente externo) | `[6, "Felix Figueroa"]` |
| `res_id` | Number | ID de la oportunidad | 33 |
| `model` | String | Modelo asociado | "crm.lead" |

### Campos Adicionales (Metadata)

El output incluye ~60 campos adicionales de metadata:

- **Relaciones**: `parent_id`, `child_ids`, `linked_message_ids`
- **Email**: `email_from`, `incoming_email_to`, `outgoing_email_to`
- **Attachments**: `attachment_ids` (archivos adjuntos)
- **Reactions**: `reaction_ids`, `starred`, `needaction`
- **Tracking**: `tracking_value_ids` (cambios de estado)
- **Audit**: `create_uid`, `write_uid`, `create_date`, `write_date`

---

## Diagrama de Flujo

```
Node 35: ComposeProfile
         │
         │  { profile: { lead_id: 33, ... } }
         │
         v
   Node 37: Get Chat History from Lead
         │
         │  Odoo GET MANY Operation
         │  Model: mail.message
         │  Filters:
         │    - Model = crm.lead
         │    - Res Id = 33
         │  Return All: true
         │
         │  XML-RPC Query a Odoo
         │
         v
   Output: Array de 4 mensajes [más reciente → más antiguo]
         │
         │  [1043, 1042, 1041, 1040]
         │
         v
   [Próximo nodo: Procesar historial para LLM]
```

---

## Análisis del Historial Recuperado

### Conversación Cronológica (Invertida)

**Mensaje 4 (ID: 1040) - 2025-10-31 13:58:18**
```
Tipo: notification
Autor: Sistema Odoo
Contenido: "Hay un nuevo lead para el equipo 'Leonobitech - Sales'"
```

**Mensaje 3 (ID: 1041) - 2025-10-31 14:05:13**
```
Tipo: comment
Autor: Cliente (author_id: false)
Contenido: "Cliente: Hola que tal"
```

**Mensaje 2 (ID: 1042) - 2025-10-31 14:16:42**
```
Tipo: comment
Autor: Bot (author_id: [6, "Leonobitech, Felix Figueroa"])
Contenido: "🤖 Leonobit: ¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
```

**Mensaje 1 (ID: 1043) - 2025-10-31 16:57:17**
```
Tipo: comment
Autor: Cliente (author_id: false)
Contenido: "Cliente: Si, claro me llamo Felix"
```

### Resumen de la Conversación

**Tiempo total**: ~3 horas (13:58 → 16:57)
**Mensajes del cliente**: 2
**Mensajes del bot**: 1
**Notificaciones del sistema**: 1

**Interacciones:**
1. Sistema crea lead en Odoo
2. Cliente saluda: "Hola que tal"
3. Bot da bienvenida y pide nombre (~11 min después)
4. Cliente responde con su nombre (~2h 40min después)

---

## Casos de Uso

### Caso 1: Primera Respuesta del Lead (Este Caso)

**Context:** Lead nuevo responde por primera vez después de bienvenida.

**Historial recuperado:**
- 1 notificación del sistema
- 1 mensaje del cliente (saludo)
- 1 mensaje del bot (bienvenida)
- 1 mensaje del cliente (respuesta)

**Total**: 4 mensajes

**Uso:** LLM Analista analizará estos 4 mensajes para entender:
- Intención del lead
- Si ya dio su nombre
- Si preguntó por servicios
- Tono de la conversación

### Caso 2: Conversación Larga

**Context:** Lead con 10+ intercambios previos.

**Historial recuperado:**
- 1 notificación del sistema
- 5+ mensajes del cliente
- 5+ mensajes del bot

**Total**: 11+ mensajes

**Uso:** LLM Analista hará resumen de:
- Servicios mencionados
- Datos ya recopilados (nombre, email, empresa)
- Stage del funnel (exploring → qualified → proposal)

### Caso 3: Lead Retorna Después de Días

**Context:** Lead tuvo conversación hace 3 días y vuelve.

**Historial recuperado:** Todos los mensajes históricos (20+ mensajes).

**Uso:** LLM Analista identificará:
- Último tema de conversación
- Si quedaron pendientes
- Cambios en intención
- Necesidad de follow-up

---

## Próximo Nodo Esperado

Después de obtener el historial, el flujo probablemente continúa con:

1. **Parse/Transform History** - Convertir array de mensajes a formato para LLM
2. **LLM Analista** - Analizar conversación completa con GPT-4
3. **Extract Insights** - Extraer intenciones, datos faltantes, next actions
4. **Context Builder** - Combinar profile + history + analysis para Agente Master

---

## Notas Técnicas

### 1. Return All = true

```yaml
Return All: ✅ Enabled
```

**Implicación:** No hay limit en cantidad de mensajes devueltos.

**Riesgo:** Si lead tiene 100+ mensajes, el payload puede ser muy grande (>100KB).

**Recomendación:** Agregar limit opcional:
```javascript
// Solo últimos 20 mensajes
limit: 20
// Ordenar por fecha descendente
sort: "date DESC"
```

### 2. Orden de Mensajes

El output viene en **orden cronológico inverso** (más reciente primero):
```json
[1043, 1042, 1041, 1040]  // DESC
```

**Para LLM Analista**, probablemente necesitamos invertir:
```javascript
// En nodo siguiente
const messages = $json.reverse();  // [1040, 1041, 1042, 1043] ASC
```

### 3. Message Types

```javascript
message_type: "comment" | "notification" | "email"
```

**Filtrado recomendado:**
```javascript
// Solo mensajes relevantes para análisis
const relevantMessages = $json.filter(msg =>
  msg.message_type === 'comment' &&
  (msg.author_id === false || msg.body.includes('Leonobit'))
);
```

**¿Por qué?** Notifications del sistema no aportan al contexto conversacional.

### 4. Author ID Patterns

```javascript
author_id: false              // Cliente externo (WhatsApp)
author_id: [6, "Felix..."]    // Bot o usuario interno
```

**Clasificación:**
```javascript
const isClient = msg.author_id === false;
const isBot = msg.body.includes('🤖') || msg.body.includes('Leonobit');
const isSystem = msg.message_type === 'notification';
```

### 5. HTML Body Parsing

```html
<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>
```

**Para LLM:** Convertir HTML a texto plano:
```javascript
const stripHtml = (html) => html.replace(/<[^>]*>/g, '').trim();
const plainText = stripHtml(msg.body);
// "Cliente: Si, claro me llamo Felix"
```

---

## Performance y Optimización

### Tiempo de Ejecución

| Operación | Tiempo | Descripción |
|-----------|--------|-------------|
| **XML-RPC call** | 200-500ms | Query a Odoo con filtros |
| **Data transfer** | 50-200ms | Transferir array de mensajes |
| **Parsing** | <10ms | n8n procesa JSON response |
| **Total** | **250-710ms** | Dependiente de cantidad de mensajes |

### Payload Size

**Por mensaje:**
- ~2KB con todos los campos (60+ campos)
- ~500 bytes solo campos esenciales

**Total:**
- 4 mensajes = ~8KB
- 20 mensajes = ~40KB
- 100 mensajes = ~200KB

### Optimización: Proyección de Campos

**Problema:** Se traen 60+ campos por mensaje, solo necesitamos ~10.

**Solución:** Agregar proyección en nodo siguiente:
```javascript
const essentialFields = $json.map(msg => ({
  id: msg.id,
  date: msg.date,
  body: msg.body,
  preview: msg.preview,
  message_type: msg.message_type,
  author_id: msg.author_id,
  is_client: msg.author_id === false
}));

return essentialFields;
```

**Reducción:** 8KB → 2KB (75% menos)

---

## Mejoras Propuestas

### 1. Limit Configurable

```javascript
// Agregar parámetro Options en nodo Odoo
{
  "limit": 50,
  "sort": "date DESC"
}
```

**Ventaja:** Evitar cargar historial completo si hay 100+ mensajes.

### 2. Filter por Message Type

```javascript
// Solo comments (excluir notifications del sistema)
{
  "filters": [
    ["model", "=", "crm.lead"],
    ["res_id", "=", lead_id],
    ["message_type", "=", "comment"]  // ← Nueva filter
  ]
}
```

### 3. Date Range Filter

```javascript
// Solo últimos 7 días
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

{
  "filters": [
    ["model", "=", "crm.lead"],
    ["res_id", "=", lead_id],
    ["date", ">=", sevenDaysAgo.toISOString()]
  ]
}
```

### 4. Campos Específicos (Reduce Payload)

```javascript
// Solo traer campos necesarios
{
  "fields": ["id", "date", "body", "preview", "message_type", "author_id"]
}
```

**Reducción:** 2KB → 500 bytes por mensaje (75% menos)

### 5. Cache de Historial

```javascript
// En Redis, guardar historial por lead_id
const cacheKey = `history:lead:${lead_id}`;
const cached = await redis.get(cacheKey);

if (cached && (Date.now() - cached.timestamp) < 60000) {
  return cached.messages;  // Cache de 1 minuto
}

// Si no hay cache, hacer query a Odoo
const messages = await odoo.getMessages(filters);
await redis.set(cacheKey, { messages, timestamp: Date.now() }, 'EX', 60);
return messages;
```

---

## Debugging y Troubleshooting

### Error: "No messages found"

**Causa:** lead_id no tiene mensajes en Odoo.

**Solución:**
1. Verificar que Node 26 (CreateLeadOdoo) creó el lead
2. Verificar que Node 28 o 36 crearon al menos un mensaje
3. Revisar filtros (model, res_id)

### Warning: "Too many messages (100+)"

**Causa:** Lead con historial muy largo.

**Solución:**
1. Agregar limit en nodo
2. Implementar paginación
3. Filtrar por date range (últimos 30 días)

### Error: "XML-RPC timeout"

**Causa:** Query muy lenta en Odoo (DB grande, sin índices).

**Solución:**
1. Agregar índices en mail.message (model, res_id, date)
2. Reducir cantidad de campos proyectados
3. Aumentar timeout del nodo

### Body HTML renderiza incorrectamente

**Causa:** HTML malformado o caracteres especiales.

**Solución:**
```javascript
// Sanitizar HTML antes de procesar
const sanitizeHtml = (html) => {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<script.*?<\/script>/gi, '');  // Remove scripts
};
```

---

## Seguridad y Validación

### 1. Authorization Check

**Pregunta:** ¿Puede un lead acceder a mensajes de otro lead?

**Respuesta:** No. El flujo garantiza que:
1. `lead_id` viene de Baserow (Node 35)
2. Baserow solo tiene `lead_id` de leads registrados
3. No hay manipulación posible del `lead_id` por el cliente

### 2. XSS en Body HTML

**Riesgo:** Mensaje del cliente con HTML malicioso guardado en Odoo:
```html
<p><strong>Cliente: </strong><script>alert('XSS')</script></p>
```

**Protección:** Sanitizar al crear mensaje (Node 36) o al leer (Node siguiente).

### 3. Data Leakage

**Riesgo:** Incluir mensajes de otros leads en respuesta.

**Verificación:**
```javascript
// Después de obtener mensajes
const allFromSameLead = $json.every(msg => msg.res_id === lead_id);
if (!allFromSameLead) {
  throw new Error('[Get History] Data leakage detected: messages from different leads');
}
```

---

## Métricas y Observabilidad

### KPIs del Nodo

| Métrica | Valor Esperado | Alertar Si |
|---------|----------------|------------|
| **Latency** | 250-710ms | > 2s |
| **Success Rate** | 99.5% | < 98% |
| **Messages Retrieved** | 1-50 | > 100 |
| **Payload Size** | 2-40KB | > 200KB |

### Logging Recomendado

```javascript
console.log('[Get History] Fetching messages', {
  lead_id,
  filters: { model: 'crm.lead', res_id: lead_id },
  timestamp: new Date().toISOString()
});

// Después de obtener
console.log('[Get History] Retrieved messages', {
  lead_id,
  message_count: $json.length,
  oldest_date: $json[$json.length - 1]?.date,
  newest_date: $json[0]?.date,
  size_kb: (JSON.stringify($json).length / 1024).toFixed(2)
});
```

---

## Referencias

- **Node 28**: [Create an Item](./28-create-an-item.md) - Crear primer mensaje (equivalente)
- **Node 35**: [ComposeProfile](./35-compose-profile.md) - Input de lead_id
- **Node 36**: [Register incoming message](./36-register-incoming-message.md) - Crear mensaje actual

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Odoo Version**: 16.x+ (XML-RPC API)
- **Status**: ✅ Activo en producción
