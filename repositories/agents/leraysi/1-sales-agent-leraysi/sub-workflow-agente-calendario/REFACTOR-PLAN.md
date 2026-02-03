# Plan de Refactor - Agente Calendario Leraysi

**Fecha:** 2026-01-19
**Estado:** Planificación
**Autor:** Felix + Claude

---

## 1. Estado Actual (Problemas Identificados)

### 1.1 Datos Faltantes desde Master AI Agent

El Master AI Agent invoca `agendar_turno_leraysi` con estructura incompleta:

```json
// Lo que envía actualmente
{
  "nombre_clienta": "Andrea Figueroa",
  "servicio": ["Alisado brasileño"],
  "fecha_deseada": "2026-01-22",
  "precio": 60000
}
```

**Campos faltantes críticos:**
| Campo | Necesario para | Disponible en state |
|-------|----------------|---------------------|
| `telefono` | Crear turno en MCP | ✅ `state.phone` |
| `email` | Confirmación email | ✅ `state.email` |
| `hora_deseada` | Agendar hora exacta | ❌ Debe extraerse del mensaje |
| `lead_id` | Actualizar Baserow | ✅ `state.lead_id` |
| `row_id` | Actualizar Baserow | ✅ `state.row_id` |
| `conversation_id` | Responder en Chatwoot | ✅ `state.conversation_id` |
| `duracion` | Calcular slot | ⚠️ Calcular según complejidad |
| `complejidad` | Calcular duración | ✅ `state.image_analysis.complexity` |
| `servicio_mapeado` | Código MCP correcto | ⚠️ Mapear servicio → código |

### 1.2 Sub-Workflows MCP Mal Estructurados

Los 5 sub-workflows de tools MCP reciben:
```json
{ "query": "{\"fecha\": \"2026-01-22\"}" }
```

Pero el MCP espera:
```json
{
  "tool": "leraysi_consultar_turnos_dia",
  "arguments": { "fecha": "2026-01-22" }
}
```

**Problema:** No hay nodo de transformación entre Trigger y HTTP Request.

### 1.3 Lógica IF_Agendar Incorrecta

- **Condición actual:** `$json.accion === "agendar"`
- **Lo que devuelve el LLM:** `"turno_creado"` o `"sin_disponibilidad"`
- **Resultado:** Siempre va a False Branch

### 1.4 Ramas True/False Sin Conectar

El IF_Agendar no tiene nodos después de las ramas, el workflow termina sin hacer nada.

---

## 2. Arquitectura Propuesta

### 2.1 Flujo Completo Revisado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MASTER AI AGENT (Main)                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cliente: "Sí quiero turno, soy Andrea, mi email es andrea@gmail.com"       │
│                              ↓                                              │
│  LLM detecta intención de agendar + extrae datos                            │
│                              ↓                                              │
│  Invoca tool: agendar_turno_leraysi con estructura COMPLETA                 │
└─────────────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUB-WORKFLOW: Leraysi - Agente Calendario                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. ParseInput (validar datos completos)                                    │
│  2. GetTurnosSemana (Baserow: TurnosLeraysi)                                │
│  3. AnalizarDisponibilidad (calcular slots libres)                          │
│  4. BuildAgentPrompt (construir contexto para LLM)                          │
│  5. Agente Calendario (LLM decide acción)                                   │
│     - Si hay disponibilidad → llama leraysi_crear_turno                     │
│     - Si no hay → sugiere alternativas                                      │
│  6. ParseAgentResponse                                                      │
│  7. Router (según acción)                                                   │
│     ├── turno_creado → BuildResponse + Return                               │
│     ├── sin_disponibilidad → BuildAlternativas + Return                     │
│     └── error → HandleError + Return                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUB-WORKFLOWS MCP (5 tools)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cada uno necesita:                                                         │
│  1. Trigger (recibe query del Agente Calendario)                            │
│  2. TransformForMCP (nuevo nodo Code)                                       │
│  3. HTTP Request (POST a odoo_mcp)                                          │
│  4. ParseResponse (formatear respuesta)                                     │
│  5. Return (devolver al Agente Calendario)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Nueva Estructura de Invocación

**Desde Master AI Agent:**
```json
{
  "query": {
    "action": "crear_turno",
    "clienta": {
      "nombre": "Andrea Figueroa",
      "telefono": "+5491133851987",
      "email": "andrea@gmail.com"
    },
    "turno": {
      "servicio": "Alisado brasileño",
      "servicio_codigo": "tratamiento",
      "fecha": "2026-01-22",
      "hora": "09:00",
      "duracion_horas": 2,
      "precio": 60000,
      "sena": 18000
    },
    "contexto": {
      "lead_id": 210,
      "row_id": 73,
      "conversation_id": 390,
      "complejidad": "alta"
    }
  }
}
```

---

## 3. Cambios Requeridos

### 3.1 Master AI Agent - Tool Definition

**Archivo:** Tool `agendar_turno_leraysi` en n8n

**Cambios:**
1. Actualizar descripción de la tool para que el LLM sepa qué datos pasar
2. Definir schema de parámetros más completo
3. En el nodo que invoca el sub-workflow, construir la estructura completa desde el state

**Nueva definición de tool:**
```markdown
## Tool: agendar_turno_leraysi

Gestiona turnos del salón: crear, consultar disponibilidad, confirmar o cancelar.

### Parámetros requeridos:
- nombre_clienta (string): Nombre completo
- telefono (string): Teléfono con código país
- email (string): Email para confirmación
- servicio (string): Nombre del servicio solicitado
- fecha_deseada (string): Fecha YYYY-MM-DD
- hora_deseada (string): Hora HH:MM (si no se especifica, usar "09:00")
- precio (number): Precio total acordado

### Parámetros del contexto (automáticos):
- lead_id, row_id, conversation_id: Se obtienen del state
- complejidad: Se obtiene de image_analysis.complexity
- duracion: Se calcula según complejidad
```

### 3.2 Input Main - Pasar Datos Completos

**Archivo:** `nodes-code-leraysi/Input Main.js`

**Cambios:**
El state ya contiene todos los datos necesarios. El LLM debe extraerlos cuando invoca la tool.

Asegurar que el state incluya:
- `phone` ✅
- `email` ✅
- `lead_id` ✅
- `row_id` ✅
- `conversation_id` ✅
- `image_analysis.complexity` ✅

### 3.3 Sub-Workflow Agente Calendario

#### 3.3.1 ParseInput.js (Refactor)

```javascript
// ============================================================================
// PARSE INPUT - Agente Calendario Leraysi v2.0
// ============================================================================
const raw = $input.first().json;
const input = typeof raw.query === 'string' ? JSON.parse(raw.query) : raw.query || raw;

// Validar campos requeridos
const required = ['nombre_clienta', 'telefono', 'servicio', 'fecha_deseada', 'precio'];
const missing = required.filter(f => !input[f]);

if (missing.length > 0) {
  throw new Error(`Campos requeridos faltantes: ${missing.join(', ')}`);
}

// Mapear servicio a código MCP
const SERVICIO_MAP = {
  'Alisado brasileño': 'tratamiento',
  'Alisado keratina': 'tratamiento',
  'Corte mujer': 'corte',
  'Corte': 'corte',
  'Mechas completas': 'mechas',
  'Balayage': 'mechas',
  'Tintura raíz': 'tintura',
  'Tintura completa': 'tintura',
  'Manicura': 'manicura',
  'Manicura semipermanente': 'manicura',
  'Pedicura': 'pedicura',
  'Brushing': 'brushing',
  'Peinado': 'peinado',
  'Depilación': 'depilacion',
  'Maquillaje': 'maquillaje'
};

// Calcular duración según complejidad
const DURACION_MAP = {
  'baja': 1,
  'media': 1.5,
  'alta': 2,
  'muy_alta': 3
};

const servicioNombre = Array.isArray(input.servicio) ? input.servicio[0] : input.servicio;
const servicioCodigo = SERVICIO_MAP[servicioNombre] || 'otro';
const complejidad = input.complejidad || input.image_analysis?.complexity || 'media';
const duracion = DURACION_MAP[complejidad] || 1.5;

return [{
  json: {
    // Datos de la clienta
    nombre_clienta: input.nombre_clienta,
    telefono: input.telefono,
    email: input.email || null,

    // Datos del turno
    servicio_nombre: servicioNombre,
    servicio_codigo: servicioCodigo,
    fecha_deseada: input.fecha_deseada,
    hora_deseada: input.hora_deseada || '09:00',
    duracion_horas: duracion,
    precio: input.precio,
    sena: Math.round(input.precio * 0.30),
    complejidad: complejidad,

    // Contexto para actualizar después
    lead_id: input.lead_id,
    row_id: input.row_id,
    conversation_id: input.conversation_id,

    // Metadata
    received_at: new Date().toISOString()
  }
}];
```

#### 3.3.2 IF_Agendar → Switch Node

Cambiar el IF por un **Switch** con múltiples ramas:

| Condición | Acción |
|-----------|--------|
| `accion === "turno_creado"` | → BuildSuccessResponse |
| `accion === "sin_disponibilidad"` | → BuildAlternativasResponse |
| `accion === "error"` | → HandleError |
| default | → HandleUnknown |

#### 3.3.3 Agregar Nodos de Respuesta

**BuildSuccessResponse:**
```javascript
const data = $input.first().json;

return [{
  json: {
    success: true,
    action: "turno_creado",
    turno: {
      id: data.turno_id,
      fecha: data.fecha_turno,
      hora: data.hora || "09:00",
      servicio: data.servicio,
      precio: data.precio,
      sena: data.sena_monto
    },
    link_pago: data.link_pago,
    mensaje_para_clienta: data.mensaje_para_clienta,
    // Para actualizar Baserow
    baserow_update: {
      stage: "pago_pendiente",
      turno_agendado: true,
      turno_fecha: `${data.fecha_turno} ${data.hora || "09:00"}`
    }
  }
}];
```

### 3.4 Sub-Workflows MCP (5 tools)

Cada uno necesita el nodo **TransformForMCP**:

```javascript
// ============================================================================
// TRANSFORM FOR MCP - [TOOL_NAME]
// ============================================================================
const input = $input.first().json;
const query = typeof input.query === 'string' ? JSON.parse(input.query) : input.query || input;

return [{
  json: {
    tool: "[TOOL_NAME]",
    arguments: query
  }
}];
```

**Crear para cada tool:**
1. `leraysi_crear_turno`
2. `leraysi_consultar_turnos_dia`
3. `leraysi_consultar_disponibilidad`
4. `leraysi_confirmar_turno`
5. `leraysi_cancelar_turno`

---

## 4. Plan de Implementación

### Fase 1: Preparación (Actual ✅)
- [x] Documentar estado actual
- [x] Identificar problemas
- [x] Documentar estructura MCP esperada
- [x] Crear plan de refactor

### Fase 2: Sub-Workflows MCP
- [ ] Agregar nodo TransformForMCP a `leraysi_consultar_turnos_dia`
- [ ] Agregar nodo TransformForMCP a `leraysi_consultar_disponibilidad`
- [ ] Agregar nodo TransformForMCP a `leraysi_crear_turno`
- [ ] Agregar nodo TransformForMCP a `leraysi_confirmar_turno`
- [ ] Agregar nodo TransformForMCP a `leraysi_cancelar_turno`
- [ ] Probar cada tool individualmente

### Fase 3: Sub-Workflow Agente Calendario
- [ ] Refactorizar ParseInput.js con validación y mapeos
- [ ] Cambiar IF_Agendar por Switch node
- [ ] Agregar BuildSuccessResponse
- [ ] Agregar BuildAlternativasResponse
- [ ] Agregar HandleError
- [ ] Probar flujo completo del sub-workflow

### Fase 4: Master AI Agent
- [ ] Actualizar tool definition de `agendar_turno_leraysi`
- [ ] Modificar invocación para pasar estructura completa
- [ ] Probar integración Master → Sub-Workflow

### Fase 5: Integración Completa
- [ ] Probar flujo: Cliente pide turno → Turno creado → Link de pago
- [ ] Probar flujo: Sin disponibilidad → Alternativas
- [ ] Probar flujo: Error → Mensaje amigable
- [ ] Probar actualización de Baserow

### Fase 6: Webhook de Pago (Futuro)
- [ ] Crear workflow para webhook de Mercado Pago
- [ ] Confirmar turno automáticamente
- [ ] Enviar confirmación a cliente
- [ ] Generar recibo en Odoo

---

## 5. Archivos a Modificar

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| `sub-workflow-agente-calendario/nodes-code/ParseInput.js` | Refactor completo | Alta |
| `Leraysi - Consultar Turnos Día` (n8n) | Agregar TransformForMCP | Alta |
| `Leraysi - Consultar Disponibilidad` (n8n) | Agregar TransformForMCP | Alta |
| `Leraysi - Crear Turno` (n8n) | Agregar TransformForMCP | Alta |
| `Leraysi - Confirmar Turno` (n8n) | Agregar TransformForMCP | Media |
| `Leraysi - Cancelar Turno` (n8n) | Agregar TransformForMCP | Media |
| `Leraysi - Agente Calendario` (n8n) | Cambiar IF por Switch | Alta |
| Tool `agendar_turno_leraysi` (Master) | Actualizar definición | Alta |

---

## 6. Nuevo Stage del Funnel

Agregar `pago_pendiente` al flujo:

```
explore → consulta → presupuesto → turno_pendiente → pago_pendiente → turno_confirmado
```

**Campos a actualizar en Baserow cuando se crea turno:**
```json
{
  "stage": "pago_pendiente",
  "turno_agendado": true,
  "turno_fecha": "2026-01-22 09:00",
  "turno_id": 15,
  "link_pago": "https://mpago.la/xxxxx"
}
```

---

## 7. Criterios de Éxito

1. ✅ Las 5 tools MCP responden correctamente (sin "Bad request")
2. ✅ El Agente Calendario crea turnos con todos los datos
3. ✅ Se genera link de pago real de Mercado Pago
4. ✅ El state se actualiza correctamente en Baserow
5. ✅ El cliente recibe mensaje con link de pago
6. ✅ Si no hay disponibilidad, se ofrecen alternativas

---

## 8. Notas Adicionales

- **Tiempo estimado:** No especificado (trabajar por fases)
- **Dependencias:** odoo-mcp debe estar corriendo
- **Testing:** Usar conversación de prueba con Andrea Figueroa
- **Rollback:** Mantener código actual comentado hasta validar

---

*Documento actualizado: 2026-01-19*
