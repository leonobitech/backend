# Nodo 28: Create an Item

## Información General

- **Nombre del nodo**: `Create an Item`
- **Tipo**: Odoo (Custom Resource)
- **Función**: Crear mensaje/comentario en el chatter del lead de Odoo
- **Entrada**: Salida del nodo `UpdateLeadWithLead_Id`
- **Credential**: Odoo-Felix

## Descripción

Este nodo registra el **primer mensaje del lead** en el chatter (historial de mensajes) del lead de Odoo CRM. Actúa como punto de inicio del historial de conversación.

Responsabilidades:
1. **Crear mensaje** en modelo `mail.message` de Odoo
2. **Vincular mensaje** con el lead creado (`res_id`)
3. **Formatear body** con HTML (nombre del cliente + mensaje)
4. **Establecer tipo** como "comment" (nota interna)
5. **Retornar ID** del mensaje creado

Es el equivalente a ejecutar en Odoo:
```python
odoo.env['mail.message'].create({
    'model': 'crm.lead',
    'res_id': 33,
    'body': '<p><strong>Cliente:</strong> Felix Figueroa</p><p>Hola que tal</p>',
    'message_type': 'comment',
    'subtype_id': 1
})
```

## Configuración del Nodo

### Credential to connect with
- **Tipo**: `Odoo-Felix`
- **Descripción**: Credenciales XML-RPC para Odoo

### Resource
- **Valor**: `Custom Resource`
- **Descripción**: Recurso personalizado

### Custom Resource Name or ID
- **Valor**: `Message`
- **Descripción**: Modelo `mail.message` de Odoo

### Operation
- **Valor**: `Create`
- **Descripción**: Crear nuevo mensaje

### Fields

| Field Name | Expression/Value | Ejemplo | Descripción |
|------------|------------------|---------|-------------|
| `Model` | `crm.lead` | `"crm.lead"` | Modelo del registro padre |
| `Res Id` | `{{ $json.lead_id }}` | `33` | ID del lead en Odoo |
| `Body` | `<p><strong>Cliente: </strong>{{ $('Webhook').item.json.body.conversation.messages[0].content }}</p>` | `"<p><strong>Cliente:</strong> Hola que tal</p>"` | HTML del mensaje |
| `Message Type` | `comment` | `"comment"` | Tipo de mensaje (nota interna) |
| `Subtype Id` | `1` | `1` | ID del subtipo (nota) |
| `Author Id` | (Fixed Expression) | (sin valor visible) | Autor del mensaje |

## Lógica de Funcionamiento

### Campo: Body (HTML formateado)

```javascript
// Expression
<p><strong>Cliente: </strong>{{ $('Webhook').item.json.body.conversation.messages[0].content }}</p>

// Acceso a nodo anterior
$('Webhook').item.json.body.conversation.messages[0].content
// "Hola que tal"

// Resultado HTML
<p><strong>Cliente: </strong>Hola que tal</p>
```

**Formato HTML**:
- `<p>`: Párrafo
- `<strong>`: Texto en negrita
- `Cliente:`: Label fijo
- Contenido del mensaje desde webhook original

---

### Campo: Res Id (vinculación con lead)

```javascript
// Expression
{{ $json.lead_id }}

// Valor
$json.lead_id  // "33" (string desde Baserow)

// Odoo recibe
'res_id': 33  // Convertido a integer
```

**Vinculación**:
```python
# mail.message vinculado a crm.lead
{
    'model': 'crm.lead',
    'res_id': 33,  # → crm.lead(33)
    ...
}
```

---

### Campo: Message Type

```python
message_type = fields.Selection([
    ('email', 'Email'),
    ('comment', 'Comment'),
    ('notification', 'System notification'),
], default='email')
```

**Valor usado**: `'comment'` (nota interna)

**Ventaja**: El mensaje aparece en el chatter como nota interna (no se envía por email).

---

### Campo: Subtype Id

```python
# mail.message.subtype
subtype_id = fields.Many2one('mail.message.subtype')

# ID 1 típicamente es "Activities" o "Discussions"
```

**Valor usado**: `1`

**Nota**: El ID puede variar según la instalación de Odoo. Verificar con:
```python
odoo.env['mail.message.subtype'].search([])
```

---

### Operación Create en mail.message

```python
# Odoo XML-RPC
models.execute_kw(
    db, uid, password,
    'mail.message', 'create',
    [{
        'model': 'crm.lead',
        'res_id': 33,
        'body': '<p><strong>Cliente:</strong> Hola que tal</p>',
        'message_type': 'comment',
        'subtype_id': 1,
        'author_id': False  # Sistema
    }]
)

# Returns: 1041 (ID del mensaje)
```

## Estructura de Entrada

Recibe el registro actualizado de Baserow:

```json
{
  "id": 198,
  "lead_id": "33",
  "chatwoot_id": "186",
  "full_name": "Felix Figueroa",
  "last_message": "Hola que tal"
}
```

**Además** accede al payload original del webhook:

```javascript
$('Webhook').item.json.body.conversation.messages[0].content
// "Hola que tal"
```

## Formato de Salida (JSON)

### Caso 1: Mensaje creado exitosamente

**Input**:
```json
{
  "lead_id": "33",
  "full_name": "Felix Figueroa"
}
```

**Webhook original**:
```json
{
  "body": {
    "conversation": {
      "messages": [
        {
          "content": "Hola que tal"
        }
      ]
    }
  }
}
```

**Odoo Create**:
```python
mail.message.create({
    'model': 'crm.lead',
    'res_id': 33,
    'body': '<p><strong>Cliente:</strong> Hola que tal</p>',
    'message_type': 'comment',
    'subtype_id': 1
})
```

**Odoo Response**:
```json
[
  {
    "id": 1041
  }
]
```

**Significado**:
- `id: 1041` → ID del mensaje creado en `mail.message`
- El mensaje ahora aparece en el chatter del lead 33

---

### Caso 2: Mensaje con contenido HTML

**Input**:
```json
{
  "lead_id": "34"
}
```

**Webhook**:
```json
{
  "messages": [
    {
      "content": "Hola, estoy interesado en sus servicios.\n¿Podrían enviarme información?"
    }
  ]
}
```

**Body generado**:
```html
<p><strong>Cliente:</strong> Hola, estoy interesado en sus servicios.
¿Podrían enviarme información?</p>
```

**Odoo Response**:
```json
[
  {
    "id": 1042
  }
]
```

**Visualización en Odoo**:
```
Lead: Ana García (ID 34)
Chatter:
  [Nota] Hace 1 minuto
  Cliente: Hola, estoy interesado en sus servicios.
  ¿Podrían enviarme información?
```

## Propósito en el Workflow

### 1. **Registro de Primer Mensaje**

Guarda el mensaje inicial del lead en Odoo:

```
Antes:
- Lead en Odoo: ID 33, sin mensajes en chatter
- Conversación solo en Chatwoot

Después:
- Lead en Odoo: ID 33, con 1 mensaje en chatter
- Mensaje: "Cliente: Hola que tal"
- Historial iniciado
```

**Ventaja**: El vendedor ve el mensaje original sin tener que buscar en Chatwoot.

---

### 2. **Contexto para Vendedor**

El mensaje formateado incluye "Cliente:" para identificación:

```html
<p><strong>Cliente:</strong> Hola que tal</p>
```

**Visualización en Odoo**:
```
Cliente: Hola que tal
```

**Vs sin formato**:
```
Hola que tal
```

**Ventaja**: Claridad de que el mensaje proviene del cliente, no del sistema.

---

### 3. **Inicio de Timeline**

El mensaje es el primer item del historial:

```
Lead Timeline (Odoo):
┌─────────────────────────────────┐
│ Creado: 31/10/2025 12:33        │
├─────────────────────────────────┤
│ [Nota] Hace 1 minuto            │ ← Create an Item
│ Cliente: Hola que tal           │
└─────────────────────────────────┘
```

**Futuras interacciones** se añadirán al timeline.

---

### 4. **Trazabilidad de Origen**

El mensaje indica que proviene de un canal automatizado:

```python
# Futuras mejoras: añadir metadata
{
    'body': '<p><strong>Cliente (WhatsApp):</strong> Hola que tal</p>',
    # O en descripción:
    'body': '<p><strong>Cliente:</strong> Hola que tal</p><p><em>Origen: Chatwoot #186</em></p>'
}
```

## Diagrama de Flujo

```
┌─────────────────────────────────┐
│ UpdateLeadWithLead_Id           │
│ Output: {                       │
│   id: 198,                      │
│   lead_id: "33",                │
│   full_name: "Felix Figueroa"   │
│ }                               │
└──────────┬──────────────────────┘
           │
           ├──────────────────────┐
           │                      │
           ▼                      │
┌─────────────────────┐           │
│ Webhook (acceso a   │           │
│ mensaje original)   │           │
│                     │           │
│ messages[0].content │           │
│ "Hola que tal"      │           │
└──────────┬──────────┘           │
           │                      │
           └──────────────────────┤
                      │           │
                      ▼           │
           ┌─────────────────────────────────┐
           │ Create an Item                  │ ← ESTAMOS AQUÍ
           │                                 │
           │ Model: crm.lead                 │
           │ Res Id: {{ $json.lead_id }}     │ ← 33
           │ Body: <p><strong>Cliente:</strong>│
           │       {{ $('Webhook')...content }}│ ← "Hola que tal"
           │       </p>                      │
           │ Message Type: comment           │
           │ Subtype Id: 1                   │
           └──────────┬──────────────────────┘
                      │
                      ▼
           ┌─────────────────────────────────┐
           │ Odoo XML-RPC                    │
           │                                 │
           │ mail.message.create({           │
           │   model: 'crm.lead',            │
           │   res_id: 33,                   │
           │   body: '<p><strong>Cliente:...',│
           │   message_type: 'comment'       │
           │ })                              │
           └──────────┬──────────────────────┘
                      │
                      ▼
           ┌─────────────────────────────────┐
           │ Odoo Response:                  │
           │ {                               │
           │   id: 1041                      │
           │ }                               │
           └─────────────────────────────────┘
```

## Casos de Uso Detallados

### Caso 1: Primer mensaje de lead nuevo

```javascript
// Situación:
// - Lead creado en Odoo: ID 33
// - Mensaje original: "Hola que tal"

// Input
{
  lead_id: "33",
  full_name: "Felix Figueroa"
}

// Webhook access
$('Webhook').item.json.body.conversation.messages[0].content
// "Hola que tal"

// Body generado
<p><strong>Cliente:</strong> Hola que tal</p>

// Odoo Create
mail.message.create({
  model: 'crm.lead',
  res_id: 33,
  body: '<p><strong>Cliente:</strong> Hola que tal</p>',
  message_type: 'comment',
  subtype_id: 1
})

// Response
{ id: 1041 }

// Resultado en Odoo:
// ✅ Mensaje ID 1041 creado
// ✅ Aparece en chatter del lead 33
// ✅ Tipo: Nota interna
```

---

### Caso 2: Mensaje con saltos de línea

```javascript
// Webhook
{
  messages: [{
    content: "Hola\nNecesito ayuda\nEs urgente"
  }]
}

// Body generado (preserva saltos de línea)
<p><strong>Cliente:</strong> Hola
Necesito ayuda
Es urgente</p>

// Visualización en Odoo:
Cliente: Hola
Necesito ayuda
Es urgente
```

---

### Caso 3: Mensaje con caracteres especiales

```javascript
// Webhook
{
  messages: [{
    content: "Hola 👋 ¿Tienen servicio de \"diseño\"?"
  }]
}

// Body generado (HTML escapa caracteres especiales)
<p><strong>Cliente:</strong> Hola 👋 ¿Tienen servicio de &quot;diseño&quot;?</p>

// Visualización en Odoo:
Cliente: Hola 👋 ¿Tienen servicio de "diseño"?
```

## Datos Disponibles para Siguiente Nodo

| Campo | Tipo | Ejemplo | Descripción |
|-------|------|---------|-------------|
| `id` | Number | `1041` | ID del mensaje creado |

**Acceso**:
```javascript
$json.id  // 1041
```

## Próximo Nodo Esperado

Con el lead y el mensaje inicial registrados en Odoo, el workflow debería continuar con la **ETAPA 4: Análisis de Historial (LLM Analista)**.

### Nodo esperado: LLM Analista

**Input esperado**:
```json
{
  "lead_id": 198,
  "chatwoot_id": "186",
  "conversation_id": "190",
  "last_message": "Hola que tal",
  "stage": "explore",
  "services_seen": 0,
  "interests": [],
  "history": []  // Primer mensaje, sin historial previo
}
```

**Función**: Analizar el mensaje y generar contexto para el Agente Master.

## Mejoras Sugeridas

### 1. Incluir nombre del cliente en body

```javascript
// Body mejorado
<p><strong>Cliente:</strong> {{ $('UpdateLeadWithLead_Id').item.json.full_name }}</p>
<p>{{ $('Webhook').item.json.body.conversation.messages[0].content }}</p>
```

**Output**:
```html
<p><strong>Cliente:</strong> Felix Figueroa</p>
<p>Hola que tal</p>
```

**Ventaja**: Identifica claramente quién escribió.

---

### 2. Añadir metadata de origen

```javascript
// Body con metadata
<p><strong>Cliente:</strong> Hola que tal</p>
<p><em>Canal: WhatsApp | Chatwoot: #186 | Conversación: #190</em></p>
```

**Ventaja**: Trazabilidad completa del origen.

---

### 3. Formateo de saltos de línea

```javascript
// Si el mensaje tiene \n, convertir a <br>
const content = $('Webhook').item.json.body.conversation.messages[0].content;
const formattedContent = content.replace(/\n/g, '<br>');

// Body
<p><strong>Cliente:</strong> ${formattedContent}</p>
```

**Ventaja**: Mejor visualización de mensajes multilínea.

---

### 4. Crear mensaje en thread/subtipo correcto

```javascript
// Verificar subtipo correcto
// En lugar de hardcodear subtype_id: 1
// Buscar el subtipo "Discussions"

const subtypes = await odoo.search('mail.message.subtype', [
  ['name', '=', 'Discussions']
]);

const subtype_id = subtypes[0];  // ID dinámico
```

**Ventaja**: Portable entre instancias de Odoo.

---

### 5. Logging de creación

```javascript
// Nodo Code después de Create an Item
console.log({
  action: "message_created_in_odoo",
  message_id: $json.id,
  lead_id: $('UpdateLeadWithLead_Id').item.json.lead_id,
  timestamp: new Date().toISOString()
});
```

---

### 6. Manejo de mensajes vacíos

```javascript
// Nodo Code antes de Create an Item
const content = $('Webhook').item.json.body.conversation.messages[0].content;

if (!content || content.trim() === '') {
  console.warn("⚠️ Empty message, skipping Odoo message creation");
  return null;  // No ejecutar Create an Item
}

return [$input.item];
```

**Ventaja**: Evita crear mensajes vacíos en Odoo.

## Manejo de Errores

### Error 1: Lead ID inválido

```python
# Input
res_id = 9999  # Lead no existe

# Odoo Error
ValidationError: "The record crm.lead(9999) does not exist"
```

**Mitigación**: Validar que `lead_id` existe antes de crear mensaje.

---

### Error 2: Contenido vacío

```python
# Input
body = ""  # Vacío

# Odoo
# ✅ Permite body vacío (no es requerido)
# Pero no es deseable
```

**Mitigación**: Validar que `content` no está vacío.

---

### Error 3: Subtype ID inválido

```python
# Input
subtype_id = 999  # No existe

# Odoo Error
ValidationError: "The record mail.message.subtype(999) does not exist"
```

**Mitigación**: Usar ID válido o consultar dinámicamente.

## Comparación: Modelo de Mensaje

### mail.message (actual)

```python
# Modelo de bajo nivel
mail.message.create({
    'model': 'crm.lead',
    'res_id': 33,
    'body': '<p>...</p>'
})
```

**Ventajas**:
- ✅ Control total sobre campos
- ✅ Más rápido (sin lógica adicional)

**Desventajas**:
- ❌ No dispara notificaciones automáticas
- ❌ No actualiza contadores de actividad

---

### message_post (alternativa)

```python
# Método de alto nivel
crm.lead(33).message_post(
    body='<p>...</p>',
    message_type='comment',
    subtype_xmlid='mail.mt_note'
)
```

**Ventajas**:
- ✅ Dispara lógica de negocio
- ✅ Actualiza contadores
- ✅ Puede notificar a seguidores

**Desventajas**:
- ❌ Más lento
- ❌ Requiere más permisos

**Conclusión**: `mail.message.create()` es adecuado para este caso (registro simple sin notificaciones).

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: CREATE en modelo `mail.message` de Odoo
**Vinculación**: `model: 'crm.lead'`, `res_id: lead_id`
**Body**: HTML formateado con label "Cliente:" + contenido del mensaje
**Message Type**: `comment` (nota interna)
**Output**: `{ id: 1041 }` (ID del mensaje)
**Próximo paso**: ETAPA 4 - Análisis de Historial (LLM Analista)
**Mejora crítica**: Incluir nombre del cliente y metadata de origen en body
