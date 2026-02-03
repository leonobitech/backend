# Nodo 26: CreateLeadOdoo

## Información General

- **Nombre del nodo**: `CreateLeadOdoo`
- **Tipo**: Odoo (Custom Resource)
- **Función**: Crear lead/oportunidad en Odoo CRM
- **Entrada**: Salida del nodo `CreatePayloadOdoo`
- **Credential**: Odoo-Felix

## Descripción

Este nodo ejecuta la **creación de lead en Odoo CRM** usando el payload preparado por `CreatePayloadOdoo`. Es el punto de integración final entre n8n y Odoo.

Responsabilidades:
1. **Conectar con Odoo** usando credenciales XML-RPC
2. **Ejecutar `create()`** en modelo `crm.lead`
3. **Mapear campos** del payload a campos de Odoo
4. **Retornar ID** del lead creado
5. **Manejar errores** de validación de Odoo

Es el equivalente a ejecutar en Odoo:
```python
odoo.env['crm.lead'].create(vals)
```

## Configuración del Nodo

### Credential to connect with
- **Tipo**: `Odoo-Felix`
- **Descripción**: Credenciales XML-RPC para conectar con Odoo
- **Contiene**:
  - URL: `https://odoo.leonobitech.com`
  - Database: Nombre de DB de Odoo
  - Username: Usuario de Odoo
  - API Key/Password: Credencial de autenticación

### Resource
- **Valor**: `Custom Resource`
- **Descripción**: Usar recurso personalizado (no predefinido)

### Custom Resource Name or ID
- **Valor**: `Lead`
- **Descripción**: Nombre del modelo en Odoo (`crm.lead`)

### Operation
- **Valor**: `Create`
- **Descripción**: Operación de creación (INSERT)

### Fields

El nodo mapea campos del payload de `CreatePayloadOdoo`:

| Field Name | Expression | Valor Ejemplo | Tipo Odoo |
|------------|------------|---------------|-----------|
| `Name` | `{{ $json.odoo_payload.name }}` | `"Felix Figueroa"` | Char |
| `Contact Name` | `{{ $json.odoo_payload.contact_name }}` | `"Felix Figueroa"` | Char |
| `Phone` | `{{ $json.odoo_payload.phone }}` | `"+5491133851987"` | Char |
| `Email From` | `{{ $json.odoo_payload.email_from }}` | `""` | Char |
| `City` | `{{ $json.odoo_payload.city }}` | `"Buenos Aires"` | Char |
| `State Id` | `{{ $json.odoo_payload.state_id }}` | `553` | Many2one |
| `Country Id` | `{{ $json.odoo_payload.country_id }}` | `10` | Many2one |
| `Tag Ids` | `{{{[6, 0, [1]]}}}` | `[[6, 0, [1]]]` | Many2many |
| `Description` | `{{ $json.odoo_payload.description }}` | `"Canal: whatsapp..."` | Text |
| `Priority` | `1` | `1` | Selection |

## Lógica de Funcionamiento

### Conexión XML-RPC

```python
# Odoo XML-RPC authentication
import xmlrpc.client

url = "https://odoo.leonobitech.com"
db = "leonobitech"
username = "felix@leonobitech.com"
password = "api_key_here"

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})

models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
```

---

### Operación Create

```python
# Execute create
lead_id = models.execute_kw(
    db, uid, password,
    'crm.lead', 'create',
    [{
        'name': 'Felix Figueroa',
        'contact_name': 'Felix Figueroa',
        'phone': '+5491133851987',
        'email_from': '',
        'city': 'Buenos Aires',
        'state_id': 553,
        'country_id': 10,
        'tag_ids': [[6, 0, [1]]],
        'description': 'Canal: whatsapp • Chatwoot: 186...',
        'priority': '1'
    }]
)

# Returns: 33 (ID of created lead)
```

---

### Mapeo de Campos

#### Campos de Texto (Char)

```javascript
// n8n expression
{{ $json.odoo_payload.name }}

// Odoo recibe
'name': 'Felix Figueroa'
```

**Campos**: `name`, `contact_name`, `phone`, `email_from`, `city`

---

#### Campos Many2one (Relaciones)

```javascript
// n8n expression
{{ $json.odoo_payload.state_id }}

// Odoo recibe (ID numérico)
'state_id': 553

// Odoo resuelve internamente
state_id → res.country.state(553) → "CABA"
```

**Campos**: `state_id`, `country_id`

**⚠️ Importante**: Odoo espera **solo el ID** (integer), no tupla `[id, name]`.

---

#### Campos Many2many (Tag Ids)

```javascript
// n8n expression
{{{[6, 0, [1]]}}}

// Odoo recibe
'tag_ids': [[6, 0, [1]]]
```

**Formato de Many2many en Odoo**:
```python
# Sintaxis: (operación, dummy, [ids])
# Operación 6: "Replace all" (borra existentes y añade nuevos)

'tag_ids': [[6, 0, [1, 2, 3]]]  # Asigna tags con IDs 1, 2, 3

# Otras operaciones:
# 4: Añadir link (no crear)
# 5: Desvincular todos
# 3: Desvincular uno
```

**En este caso**:
- Operación `6`: Replace all
- Dummy `0`: Requerido por protocolo
- IDs `[1]`: Tag con ID 1 (probablemente "WhatsApp" o "n8n")

---

#### Campo Priority (Selection)

```javascript
// n8n hardcoded
'priority': '1'
```

**Valores permitidos en Odoo CRM**:
```python
priority = fields.Selection([
    ('0', 'Low'),
    ('1', 'Medium'),
    ('2', 'High'),
    ('3', 'Very High'),
], default='1')
```

**Valor `1`** = Medium (prioridad normal)

---

#### Campo Description (Text)

```javascript
// n8n expression
{{ $json.odoo_payload.description }}

// Odoo recibe
'description': 'Canal: whatsapp • Chatwoot: 186 • Inbox: 186 • Conv: 190 • TZ: -03:00 • Último: Hola que tal'
```

**Uso en Odoo**: Se muestra en la pestaña "Notas internas" del lead.

## Estructura de Entrada

Recibe el payload preparado de `CreatePayloadOdoo`:

```json
{
  "odoo_payload": {
    "type": "lead",
    "name": "Felix Figueroa",
    "contact_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email_from": "",
    "description": "Canal: whatsapp • Chatwoot: 186 • Inbox: 186 • Conv: 190 • TZ: -03:00 • Último: Hola que tal",
    "city": "Buenos Aires",
    "country_id": 10,
    "state_id": 553
  },
  "baserow_row_id": 198,
  "debug_country": "Argentina"
}
```

**Campo usado**: `$json.odoo_payload.*`

## Formato de Salida (JSON)

### Caso 1: Lead creado exitosamente

**Input**:
```json
{
  "odoo_payload": {
    "name": "Felix Figueroa",
    "phone": "+5491133851987",
    "city": "Buenos Aires",
    "state_id": 553,
    "country_id": 10
  },
  "baserow_row_id": 198
}
```

**Odoo Response**:
```json
[
  {
    "id": 33
  }
]
```

**Significado**:
- `id: 33` → ID del lead creado en Odoo CRM
- El lead ahora existe en `crm.lead` con ID 33

---

### Caso 2: Campos adicionales en respuesta (si se configuran)

Si se configura "Return All" en opciones:

```json
[
  {
    "id": 33,
    "name": "Felix Figueroa",
    "contact_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email_from": false,
    "city": "Buenos Aires",
    "state_id": [553, "CABA"],
    "country_id": [10, "Argentina"],
    "stage_id": [1, "New"],
    "user_id": false,
    "team_id": [1, "Sales Team"],
    "create_date": "2025-10-31 12:33:45",
    "write_date": "2025-10-31 12:33:45"
  }
]
```

**Campos adicionales**:
- `state_id`: `[553, "CABA"]` (formato Many2one: `[id, display_name]`)
- `stage_id`: `[1, "New"]` (etapa inicial del pipeline)
- `team_id`: `[1, "Sales Team"]` (equipo asignado por defecto)
- `create_date`: Timestamp de creación

---

### Caso 3: Error de validación

**Input con email inválido**:
```json
{
  "odoo_payload": {
    "name": "Felix Figueroa",
    "email_from": "invalid-email"
  }
}
```

**Odoo Response (Error)**:
```json
{
  "error": {
    "code": 200,
    "message": "Odoo Server Error",
    "data": {
      "name": "odoo.exceptions.ValidationError",
      "message": "Invalid email address",
      "arguments": ["Invalid email address"],
      "debug": "Traceback..."
    }
  }
}
```

**n8n behavior**: El nodo falla y muestra el error.

## Propósito en el Workflow

### 1. **Registro en CRM**

Crea el lead en Odoo para gestión comercial:

```
Antes:
- Lead solo en Baserow (datos raw)
- Sin gestión de pipeline
- Sin asignación de vendedor

Después:
- Lead en Odoo CRM con ID 33
- En etapa "New" del pipeline
- Asignado a "Sales Team"
- Listo para seguimiento comercial
```

---

### 2. **Vinculación con Baserow**

El ID retornado permite vincular ambos sistemas:

```javascript
// Después de crear en Odoo
odoo_lead_id = 33
baserow_row_id = 198

// Próximo paso: Actualizar Baserow
UPDATE Leads SET lead_id = 33 WHERE id = 198
```

**Ventaja**: Bidireccionalidad entre sistemas.

---

### 3. **Enriquecimiento de Datos**

Odoo añade metadata automáticamente:

```python
# Campos auto-generados por Odoo
{
    'id': 33,
    'stage_id': [1, 'New'],         # Etapa inicial
    'team_id': [1, 'Sales Team'],   # Equipo por defecto
    'user_id': False,               # Sin vendedor asignado aún
    'probability': 10.0,            # Probabilidad inicial
    'create_date': '2025-10-31...',
    'write_date': '2025-10-31...'
}
```

---

### 4. **Integración con Pipeline**

El lead entra al proceso de ventas de Odoo:

```
Pipeline CRM:
┌──────┐  ┌─────────┐  ┌──────────┐  ┌──────┐  ┌──────┐
│ New  │→ │Qualified│→ │Proposition│→ │ Won  │  │ Lost │
└──────┘  └─────────┘  └──────────┘  └──────┘  └──────┘
   ↑
   └─ Lead creado aquí (stage_id: 1)
```

## Diagrama de Flujo

```
┌─────────────────────────────────────┐
│ CreatePayloadOdoo                   │
│ Output: {                           │
│   odoo_payload: {                   │
│     name: "Felix Figueroa",         │
│     phone: "+5491133851987",        │
│     state_id: 553,                  │
│     ...                             │
│   },                                │
│   baserow_row_id: 198               │
│ }                                   │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ CreateLeadOdoo                      │ ← ESTAMOS AQUÍ
│                                     │
│ Credential: Odoo-Felix              │
│ Resource: Lead                      │
│ Operation: Create                   │
│                                     │
│ Fields:                             │
│ - Name: {{ $json.odoo_payload.name }}│
│ - Phone: {{ $json.odoo_payload.phone }}│
│ - State Id: {{ $json.odoo_payload.state_id }}│
│ - ...                               │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Odoo XML-RPC                        │
│                                     │
│ models.execute_kw(                  │
│   'crm.lead', 'create',             │
│   [{ name: "Felix Figueroa", ... }] │
│ )                                   │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Odoo Response:                      │
│ {                                   │
│   id: 33                            │
│ }                                   │
└─────────────────────────────────────┘
```

## Casos de Uso Detallados

### Caso 1: Lead nuevo con ubicación deducida

```javascript
// Input
{
  odoo_payload: {
    name: "Felix Figueroa",
    phone: "+5491133851987",
    city: "Buenos Aires",
    state_id: 553,
    country_id: 10,
    description: "Canal: whatsapp • Chatwoot: 186..."
  },
  baserow_row_id: 198
}

// Odoo Create
crm.lead.create({
  'name': 'Felix Figueroa',
  'phone': '+5491133851987',
  'city': 'Buenos Aires',
  'state_id': 553,       // CABA
  'country_id': 10,      // Argentina
  'description': '...',
  'tag_ids': [[6, 0, [1]]]
})

// Odoo Response
{ id: 33 }

// Resultado en Odoo CRM:
// ✅ Lead ID 33 creado
// ✅ Ubicación: Buenos Aires, CABA, Argentina
// ✅ Tag asignado (ID 1)
// ✅ Etapa: New
```

---

### Caso 2: Lead sin email

```javascript
// Input
{
  odoo_payload: {
    name: "Ana García",
    phone: "+5491155551234",
    email_from: "",  // ← Vacío
    city: "Buenos Aires"
  }
}

// Odoo Create (email_from vacío es válido)
crm.lead.create({
  'name': 'Ana García',
  'email_from': ''
})

// Odoo Response
{ id: 34 }

// Resultado:
// ✅ Lead creado sin email
// ✅ Campo email_from = False en Odoo
```

---

### Caso 3: Lead con descripción larga

```javascript
// Input
{
  odoo_payload: {
    name: "Carlos López",
    description: "Canal: whatsapp • Chatwoot: 187 • Inbox: 186 • Conv: 195 • TZ: -03:00 • Último: Hola, estoy interesado en sus servicios de diseño web y desarrollo de aplicaciones móviles. ¿Podrían enviarme información sobre precios y tiempos de entrega?"
  }
}

// Odoo Create (descripción completa)
crm.lead.create({
  'description': 'Canal: whatsapp • Chatwoot: 187...'
})

// Odoo Response
{ id: 35 }

// Resultado:
// ✅ Descripción completa guardada en "Notas internas"
// ✅ Visible para vendedores en Odoo
```

## Datos Disponibles para Siguiente Nodo

Después de la creación, el siguiente nodo tiene acceso al **ID del lead**:

| Campo | Tipo | Ejemplo | Descripción |
|-------|------|---------|-------------|
| `id` | Number | `33` | ID del lead creado en Odoo |

**Acceso**:
```javascript
$json.id  // 33
```

**⚠️ Limitación**: Por defecto, solo retorna `id`. Para obtener más campos, configurar "Return All" en opciones.

## Próximo Nodo Esperado

El siguiente nodo debería **actualizar Baserow** con el `lead_id` de Odoo:

### Nodo: Update Baserow with Odoo Lead ID

**Tipo**: Baserow Update

**Configuración**:
```javascript
Operation: Update
Database: Leonobitech
Table: Leads
Row ID: {{ $('CreatePayloadOdoo').item.json.baserow_row_id }}

Fields to Update:
  lead_id: {{ $json.id }}
```

**SQL equivalente**:
```sql
UPDATE Leads
SET lead_id = 33
WHERE id = 198;
```

**Resultado**:
```json
{
  "id": 198,
  "chatwoot_id": "186",
  "lead_id": 33,  // ← Vinculación completada
  "full_name": "Felix Figueroa"
}
```

## Manejo de Errores

### Error 1: Campo requerido faltante

```python
# Odoo schema
name = fields.Char(required=True)

# Input sin name
{ 'phone': '+549...' }

# Odoo Error
ValidationError: "The field 'Subject' is required"
```

**Mitigación**: CreatePayloadOdoo genera `name` con fallback.

---

### Error 2: ID de relación inválido

```python
# Input con state_id inexistente
{ 'state_id': 9999 }

# Odoo Error
ValidationError: "The record res.country.state(9999) does not exist"
```

**Mitigación**: Validar mapeo de IDs en CreatePayloadOdoo.

---

### Error 3: Credenciales inválidas

```python
# Credencial incorrecta
password = "wrong_password"

# Odoo Error
xmlrpc.client.Fault: "FATAL: password authentication failed"
```

**Mitigación**: Verificar credencial "Odoo-Felix" en n8n.

---

### Error 4: Permisos insuficientes

```python
# Usuario sin permisos de creación
# Odoo Error
AccessError: "You are not allowed to create leads"
```

**Mitigación**: Otorgar rol "Sales Manager" al usuario.

## Mejoras Sugeridas

### 1. Retornar más campos

```javascript
// Configuración de nodo
Options:
  Return All: true

// Output con todos los campos
{
  id: 33,
  name: "Felix Figueroa",
  stage_id: [1, "New"],
  user_id: false,
  probability: 10.0
}
```

**Ventaja**: Más contexto para nodos siguientes.

---

### 2. Asignar vendedor automáticamente

```javascript
// Añadir campo user_id
Fields:
  User Id: 2  // ID del vendedor asignado
```

**Ventaja**: Lead asignado inmediatamente.

---

### 3. Logging de creación

```javascript
// Nodo Code después de CreateLeadOdoo
console.log({
  action: "odoo_lead_created",
  odoo_id: $json.id,
  baserow_id: $('CreatePayloadOdoo').item.json.baserow_row_id,
  timestamp: new Date().toISOString()
});
```

---

### 4. Retry en caso de error temporal

```javascript
// Configuración de n8n
Retry On Fail: true
Max Tries: 3
Wait Between Tries: 5 seconds
```

**Ventaja**: Tolera errores de red transitorios.

---

### 5. Tag dinámico según canal

```javascript
// En CreatePayloadOdoo
const tagsByChannel = {
  whatsapp: 1,
  instagram: 2,
  facebook: 3
};

const tag_id = tagsByChannel[channel] || 1;

vals.tag_ids = [[6, 0, [tag_id]]];
```

**Ventaja**: Tags automáticos según origen.

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: CREATE en modelo `crm.lead` de Odoo
**Credential**: Odoo-Felix (XML-RPC)
**Mapeo**: Campos manuales desde `$json.odoo_payload.*`
**Output**: `{ id: 33 }` (ID del lead creado)
**Próximo paso**: Update Baserow con `lead_id`
**Mejora crítica**: Retornar más campos y asignación automática de vendedor
