# Nodo 27: UpdateLeadWithLead_Id

## Información General

- **Nombre del nodo**: `UpdateLeadWithLead_Id`
- **Tipo**: Baserow (Update)
- **Función**: Actualizar registro de Baserow con ID de lead de Odoo
- **Entrada**: Salida del nodo `CreateLeadOdoo`
- **Credential**: Baserow account

## Descripción

Este nodo ejecuta la **vinculación bidireccional** entre Baserow y Odoo, actualizando el campo `lead_id` en Baserow con el ID del lead creado en Odoo.

Responsabilidades:
1. **Obtener Row ID** de Baserow desde el nodo `CreatePayloadOdoo`
2. **Obtener Lead ID** de Odoo desde el nodo `CreateLeadOdoo`
3. **Actualizar campo `lead_id`** en el registro de Baserow
4. **Retornar registro actualizado** con la vinculación completa

Es el **cierre del flujo de registro** en ambos sistemas (Baserow + Odoo).

## Configuración del Nodo

### Credential to connect with
- **Tipo**: `Baserow account`
- **Descripción**: Credenciales de acceso a la API de Baserow

### Resource
- **Valor**: `Row`
- **Descripción**: Operación sobre filas de tabla

### Operation
- **Valor**: `Update`
- **Descripción**: Actualizar un registro existente

### Database Name or ID
- **Valor**: `Leonobitech`
- **Descripción**: Nombre de la base de datos en Baserow

### Table Name or ID
- **Valor**: `Leads`
- **Descripción**: Tabla donde se almacenan los leads

### Row ID
- **Expression**: `{{ $('CreatePayloadOdoo').item.json.baserow_row_id }}`
- **Ejemplo**: `198`
- **Descripción**: ID del registro a actualizar (obtenido de `CreatePayloadOdoo`)

### Data to Send
- **Valor**: `Define Below for Each Column`
- **Descripción**: Especificar campos manualmente

### Fields to Send

| Field Name | Field Value | Ejemplo |
|------------|-------------|---------|
| `lead_id` | `{{ $json.id }}` | `33` |

**Mapeo**:
- `$json.id` → ID del lead creado en Odoo (del nodo anterior)
- Se actualiza solo el campo `lead_id` (update parcial)

## Lógica de Funcionamiento

### Flujo de Datos entre Nodos

```javascript
// Nodo: CreatePayloadOdoo
{
  odoo_payload: { ... },
  baserow_row_id: 198,  // ← ID del registro en Baserow
  debug_country: "Argentina"
}

// Nodo: CreateLeadOdoo
{
  id: 33  // ← ID del lead creado en Odoo
}

// Nodo: UpdateLeadWithLead_Id
// Combina ambos:
Row ID: $('CreatePayloadOdoo').item.json.baserow_row_id  // 198
Field lead_id: $json.id  // 33
```

---

### Acceso a Nodos Anteriores

```javascript
// Sintaxis de acceso a nodo anterior
$('NombreDelNodo').item.json.campo

// Ejemplo:
$('CreatePayloadOdoo').item.json.baserow_row_id  // 198
```

**Ventaja**: Permite combinar datos de múltiples nodos anteriores.

---

### Operación de Update

```javascript
// Baserow API
PATCH /api/database/rows/table/{table_id}/{row_id}/
{
  "lead_id": "33"
}

// Equivalente SQL
UPDATE Leads
SET lead_id = '33'
WHERE id = 198;
```

**Nota**: Solo actualiza el campo `lead_id`, preserva todos los demás campos.

## Estructura de Entrada

Recibe el ID del lead de Odoo:

```json
{
  "id": 33
}
```

**Además** accede al `baserow_row_id` del nodo `CreatePayloadOdoo`:

```javascript
$('CreatePayloadOdoo').item.json.baserow_row_id  // 198
```

## Formato de Salida (JSON)

### Caso 1: Actualización exitosa

**Input**:
```json
{
  "id": 33
}
```

**Baserow Update**:
```
PATCH /api/database/rows/table/Leads/198/
{
  "lead_id": "33"
}
```

**Baserow Response** (registro completo actualizado):
```json
[
  {
    "id": 198,
    "order": "1.00000000000000000000",
    "chatwoot_id": "186",
    "phone_number": "+5491133851987",
    "email": "",
    "country": {
      "id": 3240,
      "value": "Argentina",
      "color": "cyan"
    },
    "internal_uid": "a412d4b2-78f4-4cfe-8533-e5da7cd0bd00",
    "priority": {
      "id": 3260,
      "value": "normal",
      "color": "darker-blue"
    },
    "last_message": "Hola que tal",
    "first_interaction": "2025-10-31T12:33:39Z",
    "lead_id": "33",
    "Odoo info": [],
    "full_name": "Felix Figueroa",
    "chatwoot_inbox_id": "186",
    "conversation_id": "190",
    "business_name": null,
    "tz": "-03:00",
    "channel": {
      "id": 3253,
      "value": "whatsapp",
      "color": "deep-dark-green"
    },
    "first_interaction_utc": "2025-10-31T12:33:39Z",
    "last_message_id": "2704",
    "last_activity_iso": "2025-10-31T12:33:41.372000Z",
    "notes": null,
    "stage": {
      "id": 3262,
      "value": "explore",
      "color": "yellow"
    },
    "services_seen": "0",
    "prices_asked": "0",
    "deep_interest": "0",
    "proposal_offer_done": false,
    "interests": [],
    "email_ask_ts": null,
    "addressee_ask_ts": null
  }
]
```

**Campo actualizado**:
```json
"lead_id": "33"  // ← Vinculación con Odoo completada
```

**Campos preservados** (no modificados):
- `chatwoot_id`: `"186"`
- `full_name`: `"Felix Figueroa"`
- `stage`: `{ value: "explore" }`
- Todos los demás campos se mantienen iguales

---

### Caso 2: Vinculación con lead existente en Odoo

**Input**:
```json
{
  "id": 45
}
```

**Baserow Response**:
```json
[
  {
    "id": 199,
    "lead_id": "45",
    "full_name": "Ana García",
    "chatwoot_id": "187"
  }
]
```

**Resultado**:
- Registro de Baserow (ID 199) ahora vinculado con lead de Odoo (ID 45)
- Permite consultar en Odoo: `crm.lead(45)` para ver detalles del lead

## Propósito en el Workflow

### 1. **Vinculación Bidireccional**

Completa la relación entre ambos sistemas:

```
Antes del update:

Baserow:
┌────────────────────────┐
│ id: 198                │
│ chatwoot_id: 186       │
│ lead_id: null          │ ← Sin vinculación
│ full_name: Felix       │
└────────────────────────┘

Odoo:
┌────────────────────────┐
│ id: 33                 │
│ name: Felix Figueroa   │
│ (no link to Baserow)   │
└────────────────────────┘

Después del update:

Baserow:
┌────────────────────────┐
│ id: 198                │
│ chatwoot_id: 186       │
│ lead_id: 33            │ ← ✅ Vinculado
│ full_name: Felix       │
└────────────────────────┘
         ↓ ↑
         │ │ Vinculación
         ↓ ↑
Odoo:
┌────────────────────────┐
│ id: 33                 │
│ name: Felix Figueroa   │
│ (linked via lead_id)   │
└────────────────────────┘
```

**Ventaja**: Permite navegar entre sistemas.

---

### 2. **Trazabilidad**

El campo `lead_id` permite:

```javascript
// Desde Baserow → Odoo
const baserowLead = await baserow.getRow(198);
const odooLeadId = baserowLead.lead_id;  // 33

const odooLead = await odoo.read('crm.lead', odooLeadId);
// { id: 33, name: "Felix Figueroa", stage_id: [1, "New"] }
```

```python
# Desde Odoo → Baserow (requiere búsqueda)
odoo_lead_id = 33

baserow_leads = baserow.filter(lead_id=odoo_lead_id)
# [{ id: 198, chatwoot_id: "186", ... }]
```

**Ventaja**: Sincronización entre sistemas.

---

### 3. **Evitar Duplicados en Odoo**

En futuras ejecuciones, si el lead ya tiene `lead_id`:

```javascript
// Nodo Code antes de CreateLeadOdoo
const leadId = $json.lead_id;

if (leadId) {
  // Lead ya tiene ID de Odoo → Skip creación
  console.log(`Lead already linked to Odoo: ${leadId}`);
  return null;  // No ejecutar CreateLeadOdoo
} else {
  // Continuar con creación
  return [$input.item];
}
```

**Ventaja**: Evita crear leads duplicados en Odoo.

---

### 4. **Auditoría y Reporting**

El campo `lead_id` permite consultas como:

```sql
-- Leads en Baserow SIN vinculación con Odoo
SELECT * FROM Leads WHERE lead_id IS NULL;

-- Leads vinculados con Odoo
SELECT * FROM Leads WHERE lead_id IS NOT NULL;

-- Contar por estado
SELECT stage, COUNT(*) as total, SUM(CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) as linked
FROM Leads
GROUP BY stage;
```

## Diagrama de Flujo

```
┌─────────────────────────────────────┐
│ CreatePayloadOdoo                   │
│ Output: {                           │
│   odoo_payload: { ... },            │
│   baserow_row_id: 198  ← Guarda ID  │
│ }                                   │
└──────────┬──────────────────────────┘
           │
           ├──────────────────────────┐
           │                          │
           ▼                          │
┌─────────────────────────┐           │
│ CreateLeadOdoo          │           │
│ Output: {               │           │
│   id: 33  ← Lead ID     │           │
│ }                       │           │
└──────────┬──────────────┘           │
           │                          │
           └──────────────────────────┤
                          │           │
                          ▼           │
               ┌─────────────────────────────────┐
               │ UpdateLeadWithLead_Id           │ ← ESTAMOS AQUÍ
               │                                 │
               │ Row ID: $('CreatePayloadOdoo')  │ ← Recupera 198
               │         .item.json              │
               │         .baserow_row_id         │
               │                                 │
               │ Field lead_id: $json.id         │ ← Usa 33
               └──────────┬──────────────────────┘
                          │
                          ▼
               ┌─────────────────────────────────┐
               │ Baserow Response:               │
               │ {                               │
               │   id: 198,                      │
               │   lead_id: "33",  ← Actualizado │
               │   chatwoot_id: "186",           │
               │   full_name: "Felix Figueroa"   │
               │ }                               │
               └─────────────────────────────────┘
```

## Casos de Uso Detallados

### Caso 1: Vinculación después de crear lead

```javascript
// Situación:
// - Baserow creó registro con ID 198
// - Odoo creó lead con ID 33
// - Ahora se vinculan

// Nodo CreatePayloadOdoo (ejecutado antes)
{
  baserow_row_id: 198
}

// Nodo CreateLeadOdoo (ejecutado antes)
{
  id: 33
}

// UpdateLeadWithLead_Id combina ambos
Row ID: $('CreatePayloadOdoo').item.json.baserow_row_id  // 198
Field lead_id: $json.id  // 33

// Baserow UPDATE
PATCH /api/database/rows/table/Leads/198/
{ "lead_id": "33" }

// Resultado:
// ✅ Registro 198 ahora tiene lead_id = "33"
// ✅ Vinculación completada
```

---

### Caso 2: Lead con múltiples conversaciones

```javascript
// Escenario:
// - Lead en Baserow: ID 198, lead_id: 33
// - Lead vuelve a escribir (nueva conversación)
// - FindByChatwootId lo encuentra (exists: true)
// - No se crea nuevo lead en Odoo (ya tiene lead_id)
// - Se actualiza solo Baserow (last_message, etc.)

// En este flujo, UpdateLeadWithLead_Id NO se ejecuta
// (solo se ejecuta en Create Flow)
```

**Ventaja**: Evita sobrescribir `lead_id` existente.

---

### Caso 3: Recuperación de error

```javascript
// Escenario:
// - Baserow creó registro (ID 200)
// - CreateLeadOdoo falló (error de validación)
// - UpdateLeadWithLead_Id NO se ejecuta (no hay lead_id)

// Resultado:
// - Registro 200 queda con lead_id: null
// - Puede detectarse y reintentarse manualmente:

// Query para leads sin vinculación
SELECT * FROM Leads WHERE lead_id IS NULL;
// Result: [{ id: 200, chatwoot_id: "188", ... }]

// Remediation:
// 1. Corregir datos en Baserow
// 2. Ejecutar CreateLeadOdoo manualmente
// 3. Actualizar lead_id
```

## Datos Disponibles para Siguiente Nodo

Después de la actualización, el siguiente nodo tiene acceso al **registro completo de Baserow**:

| Campo | Tipo | Ejemplo | Actualizado |
|-------|------|---------|-------------|
| `id` | Number | `198` | ❌ |
| `lead_id` | String | `"33"` | ✅ |
| `chatwoot_id` | String | `"186"` | ❌ |
| `full_name` | String | `"Felix Figueroa"` | ❌ |
| `stage` | Object | `{ value: "explore" }` | ❌ |
| `last_message` | String | `"Hola que tal"` | ❌ |

**Acceso**:
```javascript
$json.id                    // 198
$json.lead_id               // "33"
$json.chatwoot_id           // "186"
$json.stage.value           // "explore"
```

## Próximo Nodo Esperado

Con el lead registrado en Baserow y Odoo, el siguiente paso es **continuar con la siguiente etapa del workflow**:

### ETAPA 4: Análisis de Historial (LLM Analista)

**Nodo esperado**: Código o HTTP Request que llama al LLM Analista

**Input esperado**:
```json
{
  "lead_id": 198,
  "chatwoot_id": "186",
  "conversation_id": "190",
  "last_message": "Hola que tal",
  "stage": "explore",
  "services_seen": 0,
  "interests": []
}
```

**Función**: Analizar historial de conversación y generar contexto para el Agente Master.

## Comparación: Update Parcial vs Completo

### Update Parcial (actual)

```javascript
// Solo actualiza lead_id
Fields to Send:
  - lead_id: {{ $json.id }}
```

**Ventajas**:
- ✅ Rápido (solo un campo)
- ✅ Preserva todos los demás campos
- ✅ Sin riesgo de sobrescribir datos

**Desventajas**:
- ❌ No actualiza otros campos (si fuera necesario)

---

### Update Completo (alternativa)

```javascript
// Actualiza múltiples campos
Fields to Send:
  - lead_id: {{ $json.id }}
  - updated_at: {{ $now }}
  - sync_status: "synced"
```

**Ventajas**:
- ✅ Puede actualizar metadata adicional
- ✅ Útil para auditoría

**Desventajas**:
- ❌ Más complejo
- ❌ Riesgo de sobrescribir datos si no se maneja bien

**Conclusión**: Update parcial es la opción correcta para este caso.

## Manejo de Errores

### Error 1: Row ID no existe

```javascript
// Input
baserow_row_id = 999  // No existe

// Baserow Error
404 Not Found: "The row with id 999 does not exist"
```

**Mitigación**: Validar que `baserow_row_id` existe antes de actualizar.

---

### Error 2: Lead ID es null

```javascript
// Input
$json.id = null  // CreateLeadOdoo falló

// Baserow Update
{ "lead_id": null }

// Resultado:
// ✅ Update exitoso (lead_id se setea a null)
// ⚠️ Pero la vinculación no se completa
```

**Mitigación**: Validar que `$json.id` existe antes de ejecutar update.

---

### Error 3: Campo lead_id no existe en Baserow

```javascript
// Baserow schema no tiene campo "lead_id"

// Baserow Error
400 Bad Request: "Field 'lead_id' does not exist"
```

**Mitigación**: Verificar schema de Baserow y crear campo `lead_id` si falta.

## Mejoras Sugeridas

### 1. Validación antes de actualizar

```javascript
// Nodo Code antes de UpdateLeadWithLead_Id
const leadId = $json.id;
const baserowRowId = $('CreatePayloadOdoo').item.json.baserow_row_id;

if (!leadId) {
  throw new Error("Lead ID is missing from CreateLeadOdoo");
}

if (!baserowRowId) {
  throw new Error("Baserow Row ID is missing from CreatePayloadOdoo");
}

console.log(`Linking Baserow ${baserowRowId} → Odoo ${leadId}`);

return [$input.item];
```

**Ventaja**: Evita updates con datos faltantes.

---

### 2. Actualizar timestamp de sincronización

```javascript
// Fields to Send
- lead_id: {{ $json.id }}
- synced_at: {{ $now.toISO() }}
```

**Ventaja**: Permite saber cuándo se vinculó.

---

### 3. Logging de vinculación

```javascript
// Nodo Code después de UpdateLeadWithLead_Id
console.log({
  action: "baserow_odoo_linked",
  baserow_id: $json.id,
  odoo_id: $json.lead_id,
  chatwoot_id: $json.chatwoot_id,
  timestamp: new Date().toISOString()
});

return [$input.item];
```

**Ventaja**: Trazabilidad de vinculaciones.

---

### 4. Retry en caso de error

```javascript
// Configuración de n8n
Retry On Fail: true
Max Tries: 3
Wait Between Tries: 2 seconds
```

**Ventaja**: Tolera errores temporales de red.

---

### 5. Actualizar Odoo info (relación Many2many)

```javascript
// Si Baserow tiene campo "Odoo info" (relación con tabla de Odoo)
Fields to Send:
  - lead_id: {{ $json.id }}
  - Odoo info: [{{ $json.id }}]  // Link a tabla relacional
```

**Ventaja**: Relación bidireccional en Baserow.

## Validación de Datos

### Verificar vinculación

```javascript
// Nodo Code después de UpdateLeadWithLead_Id
const leadId = $json.lead_id;

if (!leadId) {
  console.error("⚠️ lead_id not updated!");
} else {
  console.log(`✅ Lead linked: Baserow ${$json.id} ↔ Odoo ${leadId}`);
}

return [$input.item];
```

---

### Verificar consistencia

```javascript
// Verificar que lead_id coincide con el creado
const expectedLeadId = $('CreateLeadOdoo').item.json.id;
const actualLeadId = $json.lead_id;

if (String(expectedLeadId) !== String(actualLeadId)) {
  console.error(`⚠️ Lead ID mismatch: expected ${expectedLeadId}, got ${actualLeadId}`);
}
```

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Operación**: UPDATE en tabla Leads de Baserow
**Row ID**: `$('CreatePayloadOdoo').item.json.baserow_row_id` (198)
**Campo actualizado**: `lead_id` = `$json.id` (33)
**Output**: Registro completo de Baserow con vinculación completada
**Próximo paso**: ETAPA 4 - Análisis de Historial (LLM Analista)
**Mejora crítica**: Validación de IDs antes de actualizar y logging de vinculación
