# Nodo 33: UpdatePayload

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | UpdatePayload |
| **Tipo** | Code (JavaScript) |
| **Función** | Preparar payload limpio para UPDATE de lead existente en Baserow |
| **Entrada** | `$json` con `row_id`, `row_always`, `row_on_create` (desde node 21) |
| **Modo** | Run Once for All Items |

---

## Descripción

**UpdatePayload** es el **primer nodo de ETAPA 4** (flujo de leads existentes). Se activa cuando el nodo 22 (checkIfLeadAlreadyRegistered) detecta `exists=true`, es decir, cuando un lead ya registrado vuelve a enviar un mensaje.

Su función principal es:
1. **Extraer solo campos actualizables** (`row_always`) del objeto combinado
2. **Filtrar valores nulos/undefined** para evitar sobrescribir datos válidos con nulls
3. **Incluir `row_id`** para identificar el registro existente en Baserow
4. **Excluir campos create-only** (`row_on_create`) que nunca deben cambiar

**Contraste con Node 23 (CreatePayload):**
- **Node 23**: Usa `row_upsert` (create + always) para crear nuevo lead
- **Node 33**: Usa solo `row_always` + `row_id` para actualizar lead existente

---

## Configuración

### Settings

```yaml
Mode: Run Once for All Items
Language: JavaScript
```

### Input

El nodo recibe `$json` desde **Node 21: MergeForUpdate** con la estructura completa:

```json
{
  "row_id": 198,
  "row_on_create": {
    "chatwoot_id": 112,
    "chatwoot_inbox_id": 1,
    "conversation_id": 190,
    "full_name": "Felix Zorrilla",
    "phone_number": "+50587564521",
    "email": null,
    "country": "CR",
    "tz": "America/Costa_Rica",
    "channel": "whatsapp",
    "first_interaction": "2025-10-31 10:39:25 (UTC-6)",
    "first_interaction_utc": "2025-10-31T16:39:25.000Z",
    "estado": "ACTIVO",
    "lead_id": 128
  },
  "row_always": {
    "channel": "whatsapp",
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": 2706,
    "last_activity_iso": "2025-10-31T16:39:43.908Z"
  }
}
```

---

## Código

```javascript
// UpdatePayload — usa row_id + row_always al root (sin nulos)
const out = Object.fromEntries(
  Object.entries($json.row_always || {}).filter(([k,v]) => v !== null && v !== undefined)
);
return [{ json: { row_id: $json.row_id, ...out } }];
```

### Breakdown del Código

#### 1. Extracción y Filtrado de Campos

```javascript
const out = Object.fromEntries(
  Object.entries($json.row_always || {}).filter(([k,v]) => v !== null && v !== undefined)
);
```

- **`Object.entries($json.row_always || {})`**: Convierte objeto en array de pares `[key, value]`
- **`.filter(([k,v]) => v !== null && v !== undefined)`**: Elimina campos con valores nulos/undefined
- **`Object.fromEntries(...)`**: Reconstruye objeto limpio

**¿Por qué filtrar nulls?**

Si no se filtran, Baserow sobrescribiría campos válidos con `null`:

```json
// ❌ Sin filtrado (si email estaba vacío en último mensaje)
{
  "row_id": 198,
  "email": null  // ← Sobrescribiría email válido guardado anteriormente
}

// ✅ Con filtrado (solo actualiza campos con valores)
{
  "row_id": 198,
  "last_message": "Si, claro me llamo Felix",
  "last_message_id": 2706
}
```

#### 2. Construcción del Payload Final

```javascript
return [{ json: { row_id: $json.row_id, ...out } }];
```

- **`row_id`**: ID del registro existente en Baserow (198)
- **`...out`**: Spread de campos actualizables limpios
- Estructura lista para Baserow UPDATE operation

---

## Output

### Estructura de Salida

```json
{
  "row_id": 198,
  "channel": "whatsapp",
  "last_message": "Si, claro me llamo Felix",
  "last_message_id": 2706,
  "last_activity_iso": "2025-10-31T16:39:43.908Z"
}
```

### Campos Incluidos

| Campo | Origen | Descripción |
|-------|--------|-------------|
| `row_id` | Node 21 | ID del registro existente en Baserow |
| `channel` | `row_always` | Canal de comunicación (siempre "whatsapp") |
| `last_message` | `row_always` | Último mensaje recibido del cliente |
| `last_message_id` | `row_always` | ID del mensaje en Chatwoot |
| `last_activity_iso` | `row_always` | Timestamp ISO del último mensaje |

### Campos Excluidos (Protegidos)

Estos campos están en `row_on_create` pero **NO** se incluyen en el update:

- `first_interaction` - Nunca debe cambiar (dato histórico)
- `first_interaction_utc` - Nunca debe cambiar
- `chatwoot_id` - Identificador inmutable
- `conversation_id` - Identificador inmutable
- `lead_id` - Enlace con Odoo (inmutable)
- `full_name`, `phone_number`, `email` - Solo se actualizan explícitamente cuando cambian

---

## Diagrama de Flujo

```
Node 22 (exists=true)
         │
         ├─> [ETAPA 4: Update Flow]
         │
         v
   Node 33: UpdatePayload
         │
         │  Input: { row_id, row_on_create, row_always }
         │
         ├─> 1. Extraer row_always
         ├─> 2. Filtrar nulls/undefined
         ├─> 3. Agregar row_id al root
         │
         v
   Output: { row_id, channel, last_message, ... }
         │
         v
   [Próximo nodo: Baserow UPDATE operation]
```

---

## Comparación: Create vs Update

### Node 23: CreatePayload (Leads Nuevos)

```javascript
// Usa row_upsert (create + always)
const clean = {};
for (const [k, v] of Object.entries($json.row_upsert || {})) {
  if (v !== null && v !== undefined) clean[k] = v;
}
return [{ json: clean }];
```

**Output incluye:**
- Todos los campos de `row_on_create` (first_interaction, chatwoot_id, etc.)
- Todos los campos de `row_always` (last_message, last_activity, etc.)

### Node 33: UpdatePayload (Leads Existentes)

```javascript
// Usa solo row_always + row_id
const out = Object.fromEntries(
  Object.entries($json.row_always || {}).filter(([k,v]) => v !== null && v !== undefined)
);
return [{ json: { row_id: $json.row_id, ...out } }];
```

**Output incluye:**
- `row_id` para identificar registro
- Solo campos de `row_always` (actualizables)
- **Excluye** campos de `row_on_create` (protegidos)

---

## Casos de Uso

### Caso 1: Lead Existente Responde Bienvenida

**Escenario:**
1. Lead nuevo recibe bienvenida del bot (node 32)
2. Lead responde: "Si, claro me llamo Felix"
3. Webhook entra nuevamente al workflow
4. Node 22 detecta `exists=true` (row_id: 198)
5. Bifurcación a ETAPA 4

**Procesamiento en Node 33:**
```json
// Input desde Node 21
{
  "row_id": 198,
  "row_always": {
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": 2706,
    "last_activity_iso": "2025-10-31T16:39:43.908Z"
  }
}

// Output de Node 33
{
  "row_id": 198,
  "last_message": "Si, claro me llamo Felix",
  "last_message_id": 2706,
  "last_activity_iso": "2025-10-31T16:39:43.908Z"
}
```

### Caso 2: Lead Retorna Después de Días

**Escenario:**
1. Lead tuvo conversación hace 3 días
2. Vuelve a escribir: "Hola, necesito más info"
3. Node 22 detecta lead existente
4. Node 33 prepara update con nueva actividad

**Resultado en Baserow:**
- `first_interaction`: 2025-10-28 (sin cambios)
- `last_message`: "Hola, necesito más info" (actualizado)
- `last_activity_iso`: 2025-10-31T16:40:00.000Z (actualizado)

---

## Próximo Nodo Esperado

Después de UpdatePayload, el flujo probablemente continúa con:

1. **Baserow UPDATE** - Actualizar registro existente con nuevo payload
2. **Fetch Full History** - Obtener historial completo de conversación desde Odoo
3. **LLM Analista** - Analizar y resumir conversación previa (ETAPA 4)

---

## Arquitectura de Datos: row_on_create vs row_always

Esta separación definida en **Node 18: Build Lead Row** es fundamental para mantener integridad de datos:

### `row_on_create` (Inmutables)

Campos que **solo se escriben en creación**:
- `first_interaction` - Primer contacto (histórico)
- `chatwoot_id` - Identificador único Chatwoot
- `lead_id` - Enlace con Odoo CRM

**Protección:** Node 33 los ignora completamente en updates.

### `row_always` (Actualizables)

Campos que **siempre se pueden actualizar**:
- `last_message` - Mensaje más reciente
- `last_message_id` - ID mensaje más reciente
- `last_activity_iso` - Timestamp actividad más reciente

**Uso:** Node 33 los incluye en cada update.

---

## Notas Técnicas

### 1. Filtrado de Nulls

```javascript
.filter(([k,v]) => v !== null && v !== undefined)
```

**¿Por qué ambos?**
- `null`: Valor explícitamente nulo
- `undefined`: Campo no existe o sin valor

**Ejemplo:**
```javascript
const data = { name: "Felix", email: null, phone: undefined };

// Sin filtrado
Object.entries(data);  // [["name","Felix"], ["email",null], ["phone",undefined]]

// Con filtrado
Object.entries(data).filter(([k,v]) => v !== null && v !== undefined);
// [["name","Felix"]]
```

### 2. Idempotencia

El nodo es **idempotente**: ejecutar múltiples veces con mismo input produce mismo output sin efectos secundarios.

### 3. Performance

- **Operaciones**: O(n) donde n = número de campos en `row_always` (~4-6 campos)
- **Tiempo**: < 1ms
- **Memory**: Mínimo (solo copia shallow de campos)

---

## Estado del Sistema Post-Ejecución

### Antes de Node 33

```json
// Estado en Node 21 (MergeForUpdate)
{
  "row_id": 198,
  "row_on_create": { /* 12 campos inmutables */ },
  "row_always": { /* 4 campos actualizables */ }
}
```

### Después de Node 33

```json
// Payload limpio para Baserow UPDATE
{
  "row_id": 198,
  "channel": "whatsapp",
  "last_message": "Si, claro me llamo Felix",
  "last_message_id": 2706,
  "last_activity_iso": "2025-10-31T16:39:43.908Z"
}
```

### Próximo Paso

El siguiente nodo recibirá este payload limpio y lo usará para:
1. **UPDATE en Baserow** - Actualizar registro 198 con nuevos valores
2. **Continuar ETAPA 4** - Análisis de historial y respuesta contextual

---

## Mejoras Propuestas

### 1. Logging de Campos Filtrados

```javascript
const filtered = Object.entries($json.row_always || {});
const nullFields = filtered.filter(([k,v]) => v === null || v === undefined).map(([k]) => k);

if (nullFields.length > 0) {
  console.log(`[UpdatePayload] Filtered null fields: ${nullFields.join(', ')}`);
}

const out = Object.fromEntries(filtered.filter(([k,v]) => v !== null && v !== undefined));
return [{ json: { row_id: $json.row_id, ...out } }];
```

### 2. Validación de row_id

```javascript
if (!$json.row_id || $json.row_id <= 0) {
  throw new Error('[UpdatePayload] Invalid row_id: lead must exist in Baserow');
}

const out = Object.fromEntries(
  Object.entries($json.row_always || {}).filter(([k,v]) => v !== null && v !== undefined)
);
return [{ json: { row_id: $json.row_id, ...out } }];
```

### 3. Detección de Cambios

```javascript
// Solo enviar update si hay campos que actualizar
const out = Object.fromEntries(
  Object.entries($json.row_always || {}).filter(([k,v]) => v !== null && v !== undefined)
);

if (Object.keys(out).length === 0) {
  console.log('[UpdatePayload] No fields to update, skipping UPDATE operation');
  return [{ json: { row_id: $json.row_id, skip_update: true } }];
}

return [{ json: { row_id: $json.row_id, ...out } }];
```

---

## Referencias

- **Node 18**: [Build Lead Row](./18-build-lead-row.md) - Definición de `row_on_create` vs `row_always`
- **Node 21**: [MergeForUpdate](./21-merge-for-update.md) - Origen del input combinado
- **Node 22**: [checkIfLeadAlreadyRegistered](./22-check-if-lead-already-registered.md) - Bifurcación Create/Update
- **Node 23**: [CreatePayload](./23-create-payload.md) - Contraparte para leads nuevos

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Status**: ✅ Activo en producción
