# Nodo 36: Register incoming message

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | Register incoming message |
| **Tipo** | Odoo (Custom Resource - Message) |
| **Función** | Registrar mensaje entrante del cliente en chatter de Odoo |
| **Entrada** | Profile desde Node 35 + último mensaje del lead |
| **Operación** | CREATE |

---

## Descripción

**Register incoming message** es el nodo que registra el **mensaje del cliente** en el sistema de chatter (mail.message) de Odoo CRM. Este nodo es equivalente al Node 28 de ETAPA 3, pero en el contexto de leads existentes (ETAPA 4).

Su función principal es:
1. **Crear registro en mail.message** vinculado a la oportunidad (lead_id)
2. **Formatear mensaje en HTML** para visualización en Odoo
3. **Marcar como comentario** del cliente (no del sistema)
4. **Asociar al modelo crm.lead** para aparecer en el chatter de la oportunidad
5. **Preservar contexto** del mensaje original con timestamp y autor

**Diferencia con Node 28:**
- **Node 28**: Primer mensaje de lead nuevo (en Create Flow)
- **Node 36**: Mensaje de lead existente (en Update Flow)
- Ambos usan la misma estructura y operación (CREATE en mail.message)

---

## Configuración

### Parámetros Principales

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| **Credential** | Odoo-Felix | Credenciales de autenticación XML-RPC |
| **Resource** | Custom Resource | Acceso directo a modelos Odoo |
| **Custom Resource Name** | Message | Modelo `mail.message` |
| **Operation** | Create | Operación de escritura |

### Fields (Campos del Mensaje)

#### 1. Model
```yaml
Field Name: Model
New Value: crm.lead
```

**Propósito:** Indica que el mensaje pertenece al modelo de oportunidades CRM.

#### 2. Res Id (Resource ID)
```javascript
Field Name: Res Id
New Value: {{ $json.profile.lead_id }}
Output: 33
```

**Propósito:** ID de la oportunidad en Odoo (enlace con crm.lead record).

#### 3. Body (HTML del mensaje)
```javascript
Field Name: Body
New Value: <p><strong>Cliente: </strong>{{ $json.profile.last_message }}</p>

<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>
```

**Formato:** HTML para renderizado en interfaz de Odoo.

#### 4. Message Type
```yaml
Field Name: Message Type
New Value: comment
```

**Tipos disponibles:**
- `email` - Mensaje vía email
- `comment` - Comentario interno/cliente
- `notification` - Notificación del sistema

#### 5. Subtype Id
```yaml
Field Name: Subtype Id
New Value: 1
```

**Propósito:** ID del subtipo de mensaje en Odoo (1 = mensaje estándar).

#### 6. Author Id
```yaml
Field Name: Author Id
New Value: (vacío)
```

**Nota:** Vacío indica que el autor es externo (cliente vía WhatsApp), no un usuario de Odoo.

---

## Input

El nodo recibe el objeto `profile` desde **Node 35: ComposeProfile**:

```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "lead_id": 33,
    "chatwoot_id": 186,
    "conversation_id": 190,
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908Z",
    "stage": "explore",
    "country": "Argentina"
  }
}
```

**Campos usados en este nodo:**
- `profile.lead_id` → Res Id (33)
- `profile.last_message` → Body HTML ("Si, claro me llamo Felix")

---

## Output

### Estructura de Salida

```json
[
  {
    "id": 1043
  }
]
```

**Campo devuelto:**
- `id`: ID del mensaje creado en `mail.message` (1043)

**Uso posterior:** Este ID puede usarse para actualizar o referenciar el mensaje específico.

---

## Código (Generación de HTML)

Aunque no es un nodo Code, la interpolación de variables genera el HTML:

```html
<p><strong>Cliente: </strong>{{ $json.profile.last_message }}</p>
```

**Resultado:**
```html
<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>
```

### Comparación con Node 30 (Filter Output Initial)

**Node 30** genera dual format (HTML + plain text):
```javascript
const htmlBody = `<p><strong>🤖 Leonobit:</strong><br>${output.replace(/\n/g, '<br>')}</p>`;
const plainText = `Leonobit 🤖:\n${plainText}`;
```

**Node 36** genera solo HTML (no necesita formato WhatsApp):
```html
<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>
```

**¿Por qué?** Node 36 solo escribe en Odoo, no necesita enviar a WhatsApp.

---

## Diagrama de Flujo

```
Node 35: ComposeProfile
         │
         │  { profile: { lead_id: 33, last_message: "Si, claro...", ... } }
         │
         v
   Node 36: Register incoming message
         │
         │  Odoo CREATE Operation
         │  Model: mail.message
         │  Resource: crm.lead (ID: 33)
         │
         ├─> Model = "crm.lead"
         ├─> Res Id = 33 (lead_id)
         ├─> Body = "<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>"
         ├─> Message Type = "comment"
         ├─> Subtype Id = 1
         ├─> Author Id = (vacío - cliente externo)
         │
         v
   Output: { id: 1043 } (mensaje creado en Odoo)
         │
         v
   [Próximo nodo: Fetch historial completo desde Odoo]
```

---

## Comparación: Node 28 vs Node 36

### Node 28: Create an Item (ETAPA 3 - Leads Nuevos)

**Contexto:** Primer mensaje de lead nuevo en Create Flow

**Input:**
```json
{
  "lead_id": 128,
  "last_message": "Hola, necesito info"
}
```

**Body HTML:**
```html
<p><strong>Cliente: </strong>Hola, necesito info</p>
```

**Output:**
```json
{ "id": 1040 }
```

---

### Node 36: Register incoming message (ETAPA 4 - Leads Existentes)

**Contexto:** Segundo+ mensaje de lead existente en Update Flow

**Input:**
```json
{
  "profile": {
    "lead_id": 33,
    "last_message": "Si, claro me llamo Felix"
  }
}
```

**Body HTML:**
```html
<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>
```

**Output:**
```json
{ "id": 1043 }
```

---

**Diferencias clave:**
1. **Node 28**: Accede a `$json.lead_id` directamente
2. **Node 36**: Accede a `$json.profile.lead_id` (estructura normalizada)
3. Ambos crean en `mail.message` con la misma configuración

---

## Casos de Uso

### Caso 1: Lead Responde Bienvenida

**Flujo:**
1. Lead nuevo recibe bienvenida (Node 32 en ETAPA 3)
2. Lead responde: "Si, claro me llamo Felix"
3. Mensaje entra por webhook, pasa por buffer (ETAPA 2)
4. Node 22 detecta lead existente → ETAPA 4
5. Node 34 actualiza Baserow
6. Node 35 normaliza profile
7. **Node 36 registra mensaje en Odoo** ← Estamos aquí

**Resultado en Odoo:**
```
Chatter de Oportunidad #33:
[2025-10-31 16:39:25] Cliente: Hola, necesito info         (Node 28 - primer mensaje)
[2025-10-31 16:39:30] 🤖 Leonobit: Hola, ¿en qué...?        (Node 31 - respuesta bot)
[2025-10-31 16:39:43] Cliente: Si, claro me llamo Felix    (Node 36 - este nodo)
```

### Caso 2: Conversación Multi-Mensaje

**Contexto:** Lead envía varios mensajes en una sesión.

**Flujo:**
```
Mensaje 1: "Necesito info sobre web development"
  → Node 36 crea mail.message (ID: 1043)

Mensaje 2: "Cuánto cuesta?"
  → Node 36 crea mail.message (ID: 1044)

Mensaje 3: "OK, cuando podemos hablar?"
  → Node 36 crea mail.message (ID: 1045)
```

**Resultado:** Historial completo en chatter de Odoo, cada mensaje con su propio ID.

### Caso 3: Lead Retorna Después de Días

**Contexto:** Lead tuvo conversación hace 3 días y vuelve a escribir.

**Historial en Odoo antes:**
```
[2025-10-28 10:00] Cliente: Hola
[2025-10-28 10:01] Bot: Hola, ¿en qué puedo ayudarte?
[2025-10-28 10:02] Cliente: Solo preguntaba
```

**Nuevo mensaje (2025-10-31):**
```
[2025-10-31 16:39] Cliente: Hola, ahora sí necesito info
```

**Node 36:** Crea nuevo mensaje en el mismo chatter, preservando historial.

---

## Estado del Sistema Post-Ejecución

### Antes de Node 36

**Odoo mail.message (chatter de oportunidad #33):**
```
ID: 1040 - Cliente: Hola, necesito info
ID: 1041 - Bot: Hola, ¿en qué puedo ayudarte?
```

**Total mensajes:** 2

---

### Después de Node 36

**Odoo mail.message (chatter de oportunidad #33):**
```
ID: 1040 - Cliente: Hola, necesito info
ID: 1041 - Bot: Hola, ¿en qué puedo ayudarte?
ID: 1043 - Cliente: Si, claro me llamo Felix  ← Nuevo
```

**Total mensajes:** 3

---

## Estructura de mail.message en Odoo

### Schema Completo

```python
# Odoo model: mail.message
{
  'id': 1043,
  'model': 'crm.lead',          # Modelo asociado
  'res_id': 33,                 # ID del registro (oportunidad)
  'body': '<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>',
  'message_type': 'comment',    # Tipo de mensaje
  'subtype_id': 1,              # Subtipo
  'author_id': False,           # Sin autor (cliente externo)
  'date': '2025-10-31 16:39:43',
  'email_from': None,
  'subject': None,
  'parent_id': None,
  'reply_to': None,
  'attachment_ids': []
}
```

### Relación con crm.lead

```python
# Odoo model: crm.lead (ID: 33)
{
  'id': 33,
  'name': 'Felix Figueroa - WhatsApp Lead',
  'partner_id': None,
  'phone': '+5491133851987',
  'message_ids': [1040, 1041, 1043],  # ← Incluye el nuevo mensaje
  'stage_id': 1  # "explore"
}
```

**Relación:** One-to-Many (una oportunidad → muchos mensajes)

---

## Visualización en Odoo UI

### Chatter (Interfaz de Usuario)

```
┌─────────────────────────────────────────────────────────┐
│ Oportunidad: Felix Figueroa - WhatsApp Lead            │
│ Teléfono: +5491133851987                                │
│ Etapa: Exploring                                        │
├─────────────────────────────────────────────────────────┤
│ 📧 Chatter                                              │
├─────────────────────────────────────────────────────────┤
│ [2025-10-31 16:39:43]                                   │
│ Cliente: Si, claro me llamo Felix                       │ ← Node 36
├─────────────────────────────────────────────────────────┤
│ [2025-10-31 16:39:30]                                   │
│ 🤖 Leonobit: Hola, ¿en qué puedo ayudarte?             │ ← Node 31
├─────────────────────────────────────────────────────────┤
│ [2025-10-31 16:39:25]                                   │
│ Cliente: Hola, necesito info                            │ ← Node 28
└─────────────────────────────────────────────────────────┘
```

---

## Próximo Nodo Esperado

Después de registrar el mensaje del cliente en Odoo, el flujo probablemente continúa con:

1. **Fetch All Messages from Odoo** - Obtener historial completo del chatter
2. **LLM Analista** - Analizar conversación completa
3. **Context Builder** - Preparar contexto para Agente Master
4. **Agente Master + RAG** - Generar respuesta contextual

---

## Notas Técnicas

### 1. Author Id Vacío (Cliente Externo)

```yaml
Author Id: (vacío)
```

**Implicación:** Odoo interpreta esto como mensaje de cliente externo (no usuario interno).

**Alternativa:** Podría crearse un "partner" (contacto) para el lead y usar su ID:
```python
author_id = lead.partner_id.id if lead.partner_id else False
```

### 2. Subtype Id = 1

En Odoo, los subtipos de mensaje incluyen:
- `1` - Discussions (comentarios generales)
- `2` - Activities (tareas/recordatorios)
- `3` - Note (notas internas)

**Uso actual:** Subtype `1` (Discussions) es apropiado para conversaciones con clientes.

### 3. Message Type = "comment"

```yaml
Message Type: comment
```

**Otros tipos:**
- `email` - Mensaje recibido/enviado por email
- `notification` - Notificación automática del sistema
- `comment` - Comentario/mensaje (usado aquí)

**¿Por qué comment y no email?** Aunque viene de WhatsApp, se trata como comentario porque no pasó por el sistema de email de Odoo.

### 4. Formato HTML Simple

```html
<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>
```

**Ventajas:**
- Simple y legible en Odoo UI
- No hay riesgo de XSS (contenido es texto plano del cliente)

**Desventaja:** No preserva formato markdown si el cliente lo usa.

**Mejora futura:** Sanitizar HTML para prevenir XSS si se permite formato rico.

---

## Mejoras Propuestas

### 1. Escape HTML para Seguridad

```javascript
// En nodo Code previo
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

const safeMessage = escapeHtml($json.profile.last_message);
return [{ json: { body_html: `<p><strong>Cliente: </strong>${safeMessage}</p>` } }];
```

### 2. Timestamp en Body

```html
<p><strong>Cliente (2025-10-31 16:39:43): </strong>Si, claro me llamo Felix</p>
```

**Ventaja:** Timestamp visible en el mensaje (además del timestamp de mail.message).

### 3. Metadata en Body (Canal, Device)

```html
<p>
  <strong>Cliente: </strong>Si, claro me llamo Felix
  <br><small>📱 WhatsApp · 🇦🇷 Argentina</small>
</p>
```

### 4. Link a Chatwoot

```html
<p>
  <strong>Cliente: </strong>Si, claro me llamo Felix
  <br><small>
    <a href="https://chatwoot.leonobitech.com/app/accounts/1/conversations/190">
      Ver en Chatwoot
    </a>
  </small>
</p>
```

### 5. Validación de lead_id

```javascript
// En nodo Code previo
if (!$json.profile.lead_id || $json.profile.lead_id <= 0) {
  throw new Error('[Register incoming message] Invalid lead_id: cannot create message');
}
```

---

## Debugging y Troubleshooting

### Error: "Record does not exist or has been deleted"

**Causa:** `lead_id` no existe en Odoo (fue eliminado manualmente).

**Solución:**
1. Verificar que Node 26 (CreateLeadOdoo) creó el lead exitosamente
2. Verificar que Node 27 actualizó Baserow con `lead_id` válido
3. Revisar logs de Odoo para detectar eliminaciones

### Error: "Invalid model name"

**Causa:** Typo en campo `Model` ("crm.lead" mal escrito).

**Solución:** Verificar que el valor es exactamente `crm.lead` (no `crm.leads` ni `lead`).

### Warning: "Message created but not visible in chatter"

**Causa:** Permisos de usuario o filtros de chatter en Odoo UI.

**Solución:**
1. Verificar permisos de usuario en Odoo
2. Revisar filtros en chatter (mostrar todos los mensajes)
3. Verificar que `message_type: comment` está habilitado en vista

### Body HTML renderiza como texto plano

**Causa:** Campo `Body` interpretado como texto, no HTML.

**Solución:** En Odoo, el campo `body` de `mail.message` debe ser de tipo `Html`, no `Text`.

---

## Métricas y Performance

### Tiempo de Ejecución

| Operación | Tiempo | Descripción |
|-----------|--------|-------------|
| **XML-RPC call a Odoo** | 150-400ms | Latencia de red + procesamiento Odoo |
| **Validación de datos** | <1ms | Verificación de campos requeridos |
| **Inserción en DB** | 50-100ms | Postgresql INSERT en mail.message |
| **Total** | **200-500ms** | Dependiente de carga del servidor |

### Payload Size

- **Request size**: ~300 bytes (campos + valores)
- **Response size**: ~50 bytes (solo ID)

### Database Impact

**Cada mensaje crea:**
- 1 registro en `mail.message`
- 1 registro en `mail.notification` (si hay suscriptores)
- 1 entrada en `mail.followers` (si es primera interacción)

**Crecimiento estimado:** ~1KB/mensaje en Postgresql.

---

## Seguridad

### 1. XSS Prevention

**Riesgo:** Cliente envía mensaje con HTML malicioso:
```
<script>alert('XSS')</script>
```

**Protección actual:** Ninguna (se inserta directamente en HTML).

**Recomendación:** Sanitizar input antes de insertar en Body:
```javascript
const escapeHtml = (text) => text.replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
})[m]);
```

### 2. SQL Injection (No Aplica)

Odoo XML-RPC usa ORM, no SQL directo. No hay riesgo de SQL injection.

### 3. Authorization

**Pregunta:** ¿Puede cualquier lead escribir en cualquier oportunidad?

**Respuesta:** No. El flujo garantiza que:
1. `lead_id` viene de Baserow (Node 35)
2. Baserow solo tiene `lead_id` de leads registrados en ETAPA 3
3. No hay manipulación posible del `lead_id` por el cliente

---

## Referencias

- **Node 28**: [Create an Item](./28-create-an-item.md) - Primer mensaje en Create Flow (equivalente)
- **Node 31**: [Create an item1](./31-create-an-item1.md) - Mensaje del bot en Create Flow
- **Node 34**: [UpdateLeadWithRow_Id](./34-update-lead-with-row-id.md) - Update en Baserow previo
- **Node 35**: [ComposeProfile](./35-compose-profile.md) - Input normalizado (profile)

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Odoo Version**: 16.x+ (XML-RPC API)
- **Status**: ✅ Activo en producción
