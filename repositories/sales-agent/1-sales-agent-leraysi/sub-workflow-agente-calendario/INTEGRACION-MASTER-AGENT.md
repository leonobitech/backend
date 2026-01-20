# Integración con Master AI Agent

**Fecha:** 2026-01-19

---

## Tool Definition para Master AI Agent

Actualizar la definición de la tool `agendar_turno_leraysi` en el Master AI Agent:

```markdown
## Tool: agendar_turno_leraysi

Gestiona turnos del salón Estilos Leraysi: crear turno tentativo, consultar disponibilidad,
confirmar o cancelar.

### Cuándo usar:
- Cuando la clienta quiere agendar/reservar un turno
- Cuando necesitas verificar disponibilidad para una fecha
- Cuando confirmas un turno después del pago
- Cuando cancelas un turno existente

### Parámetros REQUERIDOS (extraer de state y conversación):
- clienta_id (number): ID del lead en Baserow → state.lead_id
- nombre_clienta (string): Nombre completo → state.name
- telefono (string): Teléfono con código país → state.phone
- servicio (array): Servicios solicitados → state.preferred_services
- fecha_deseada (string): Fecha YYYY-MM-DD → extraer del mensaje
- precio (number): Precio total acordado → state.final_price o último presupuesto

### Parámetros OPCIONALES (si están disponibles):
- email (string): Email de la clienta → state.email
- hora_deseada (string): Hora preferida HH:MM → extraer del mensaje, default "09:00"
- row_id (number): ID de fila en Baserow → state.row_id
- conversation_id (number): ID de conversación Chatwoot → state.conversation_id
- image_analysis (object): Análisis de foto → state.image_analysis
- complejidad (string): Complejidad del trabajo → state.image_analysis.complexity
- largo_cabello (string): Largo del cabello → state.image_analysis.length

### Ejemplo de invocación:
{
  "clienta_id": 210,
  "nombre_clienta": "Andrea Figueroa",
  "telefono": "+5491133851987",
  "email": "andrea@gmail.com",
  "servicio": ["Alisado brasileño"],
  "fecha_deseada": "2026-01-22",
  "hora_deseada": "09:00",
  "precio": 60000,
  "row_id": 73,
  "conversation_id": 390,
  "complejidad": "alta",
  "largo_cabello": "largo"
}
```

---

## Estructura de Entrada del Sub-Workflow

El sub-workflow espera dos campos:
- `llm_output`: Lo que el LLM extrajo del mensaje (viene automático del tool)
- `state`: El estado completo del lead (se inyecta vía expresión n8n)

```json
{
  "llm_output": {
    "nombre_clienta": "Andrea Figueroa",
    "servicio": ["Alisado brasileño"],
    "fecha_deseada": "2026-01-22",
    "hora_deseada": "09:00",
    "precio": 60000
  },
  "state": {
    "row_id": 73,
    "lead_id": 210,
    "phone": "+5491133851987",
    "email": "andrea@gmail.com",
    "conversation_id": 390,
    "image_analysis": {
      "length": "largo",
      "complexity": "alta"
    }
  }
}
```

**Mapping en el tool `agendar_turno_leraysi`:**
- `llm_output` → (automático, viene del LLM)
- `state` → `{{ $('Input Main').first().json.state }}`

---

## Nodo de Invocación en n8n

En el nodo que llama al sub-workflow `Leraysi - Agente Calendario`, usar este código:

```javascript
// ============================================================================
// INVOKE AGENTE CALENDARIO - Construir query completo
// ============================================================================
// Este nodo se coloca DESPUÉS del AI Agent cuando detecta intención de agendar
// ============================================================================

const toolCall = $input.first().json;
const state = $('Set State')?.first()?.json || {};

// El LLM ya extrajo algunos datos en el tool_input
const llmInput = toolCall.tool_input || toolCall.input || {};

// Construir query completo combinando state + datos del LLM
const query = {
  // Del state (siempre disponibles)
  clienta_id: state.lead_id,
  nombre_clienta: state.name || llmInput.nombre_clienta,
  telefono: state.phone || llmInput.telefono,
  email: state.email || llmInput.email || null,

  // Del LLM (extraídos del mensaje del cliente)
  servicio: llmInput.servicio || state.preferred_services || [],
  fecha_deseada: llmInput.fecha_deseada || llmInput.fecha,
  hora_deseada: llmInput.hora_deseada || llmInput.hora || '09:00',
  precio: llmInput.precio || state.final_price || state.last_quote || 0,

  // IDs para tracking
  lead_row_id: state.row_id,
  conversation_id: state.conversation_id,

  // Análisis de imagen (si existe)
  image_analysis: state.image_analysis || null,
  complejidad: state.image_analysis?.complexity || llmInput.complejidad || 'media',
  largo_cabello: state.image_analysis?.length || llmInput.largo_cabello || 'medio'
};

// Validar campos críticos
const camposFaltantes = [];
if (!query.nombre_clienta) camposFaltantes.push('nombre_clienta');
if (!query.telefono) camposFaltantes.push('telefono');
if (!query.fecha_deseada) camposFaltantes.push('fecha_deseada');
if (!query.servicio || query.servicio.length === 0) camposFaltantes.push('servicio');
if (!query.precio) camposFaltantes.push('precio');

if (camposFaltantes.length > 0) {
  throw new Error(`[Invoke Agente Calendario] Campos faltantes: ${camposFaltantes.join(', ')}. Revisar state y tool_input del LLM.`);
}

return [{
  json: {
    query: JSON.stringify(query)
  }
}];
```

---

## Respuestas del Sub-Workflow

El sub-workflow devuelve una de estas estructuras:

### Éxito - Turno Creado

```json
{
  "success": true,
  "action": "turno_creado",
  "turno": {
    "id": 15,
    "clienta": "Andrea Figueroa",
    "telefono": "+5491133851987",
    "servicio": "Alisado brasileño",
    "fecha_hora": "2026-01-22 09:00",
    "duracion": 150,
    "precio": 60000,
    "estado": "tentativo"
  },
  "pago": {
    "monto_deposito": 18000,
    "monto_restante": 42000,
    "mp_link": null,
    "expira_at": "2026-01-19T15:30:00.000Z"
  },
  "mensaje_clienta": "✅ *Turno Reservado (Tentativo)*...",
  "lead_update": {
    "row_id": 73,
    "state": "turno_tentativo",
    "turno_id": 15,
    "ultimo_servicio": "Alisado brasileño",
    "fecha_proximo_turno": "2026-01-22"
  }
}
```

### Sin Disponibilidad - Alternativas

```json
{
  "success": false,
  "action": "sin_disponibilidad",
  "solicitud_original": {
    "fecha": "2026-01-22",
    "hora": "09:00",
    "servicio": "Alisado brasileño",
    "duracion_requerida": 150
  },
  "alternativas": [
    { "opcion": 1, "fecha": "2026-01-22", "hora": "14:00", "duracion_disponible": 180 },
    { "opcion": 2, "fecha": "2026-01-23", "hora": "09:00", "duracion_disponible": 180 }
  ],
  "tiene_alternativas": true,
  "mensaje_clienta": "😊 El horario que pediste...",
  "lead_update": null
}
```

### Error

```json
{
  "success": false,
  "action": "error",
  "error": {
    "tipo": "validacion",
    "mensaje_interno": "Parámetros inválidos enviados al MCP",
    "detalle": "...",
    "timestamp": "2026-01-19T14:30:00.000Z"
  },
  "mensaje_clienta": "😅 Hubo un problema...",
  "lead_update": null,
  "puede_reintentar": false
}
```

---

## Output Main - Procesar Respuesta

En `Output Main.js`, procesar la respuesta del sub-workflow:

```javascript
// Detectar si viene respuesta del Agente Calendario
const calendarioResponse = $('Agente Calendario')?.first()?.json;

if (calendarioResponse) {
  if (calendarioResponse.success) {
    // Turno creado exitosamente
    return [{
      json: {
        content_whatsapp: calendarioResponse.mensaje_clienta,
        state_patch: {
          stage: 'pago_pendiente',
          turno_id: calendarioResponse.turno.id,
          turno_estado: 'tentativo',
          mp_deposito: calendarioResponse.pago.monto_deposito
        },
        baserow_update: calendarioResponse.lead_update
      }
    }];
  } else if (calendarioResponse.action === 'sin_disponibilidad') {
    // Ofrecer alternativas
    return [{
      json: {
        content_whatsapp: calendarioResponse.mensaje_clienta,
        state_patch: {
          stage: 'seleccionando_horario',
          alternativas_ofrecidas: calendarioResponse.alternativas
        }
      }
    }];
  } else {
    // Error
    return [{
      json: {
        content_whatsapp: calendarioResponse.mensaje_clienta,
        state_patch: {
          last_error: calendarioResponse.error.tipo
        }
      }
    }];
  }
}
```

---

## Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│  Cliente: "Sí, quiero turno para el miércoles"                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Master AI Agent                                                 │
│  - Detecta intención: agendar turno                              │
│  - Extrae fecha: 2026-01-22 (miércoles)                          │
│  - Invoca tool: agendar_turno_leraysi                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Invoke Agente Calendario                                        │
│  - Construye query completo desde state + tool_input             │
│  - Valida campos requeridos                                      │
│  - Llama sub-workflow                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Sub-Workflow: Leraysi - Agente Calendario                       │
│  1. ParseInput (valida, calcula duración)                        │
│  2. GetTurnosSemana (consulta Baserow TurnosLeraysi)             │
│  3. AnalizarDisponibilidad (encuentra slots)                     │
│  4. Agente Calendario LLM (decide acción)                        │
│  5. Switch (rutea según tool a llamar)                           │
│     ├── leraysi_crear_turno → [ver flujo abajo]                  │
│     ├── leraysi_consultar_disponibilidad → ResponseAlternativas  │
│     └── error → ResponseError                                    │
└─────────────────────────────────────────────────────────────────┘

## Flujo Detallado: Crear Turno (rama exitosa)

┌─────────────────────────────────────────────────────────────────┐
│  Switch Output 0: leraysi_crear_turno                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TransformForMCP-crear-turno                                     │
│  - Valida campos requeridos del MCP                              │
│  - Estructura: { tool: "...", arguments: {...} }                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  HTTP Request → odoo-mcp                                         │
│  - Crea evento en Odoo Calendar                                  │
│  - Retorna: { id, fecha_hora, ... }                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PersistTurnoBaserow                                             │
│  - Construye registro para TurnosLeraysi                         │
│  - Estado: "tentativo"                                           │
│  - Calcula: expira_at, monto_deposito                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Baserow - Create Row (TurnosLeraysi)                            │
│  - Persiste turno en cache local                                 │
│  - Vincula con LeadsLeraysi via clienta_id                       │
│  - Retorna: row_id del turno creado                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  AfterBaserowCreate                                              │
│  - Combina IDs: turno_id (Baserow) + odoo_event_id               │
│  - Prepara lead_update para actualizar LeadsLeraysi              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ResponseSuccess                                                 │
│  - Genera mensaje para clienta                                   │
│  - Incluye: precio, depósito, hora expiración                    │
│  - Retorna estructura completa al Master Agent                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Output Main                                                     │
│  - Procesa respuesta del calendario                              │
│  - Genera content_whatsapp + state_patch                         │
│  - Actualiza LeadsLeraysi con lead_update                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Cliente recibe: "✅ Turno Reservado (Tentativo)..."             │
└─────────────────────────────────────────────────────────────────┘
```

---

*Documento creado: 2026-01-19*
