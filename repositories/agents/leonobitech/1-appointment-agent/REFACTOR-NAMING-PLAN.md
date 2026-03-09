# Plan de Refactor: Naming Consistency - Appointment System

> **Fecha:** 2026-03-09
> **Estado:** PLANIFICACION
> **Prioridad:** Alta - El sistema funciona pero con naming inconsistente entre capas

---

## Problema

El refactor de Odoo (salon_turnos → appointment_management) actualizó los nombres en las capas bajas (addon + MCP tools), pero las capas superiores (n8n workflows, system prompts, code nodes) siguen usando nombres viejos en español. Esto genera:

1. **Confusión** al debuggear (¿qué nombre usa cada capa?)
2. **Fragilidad** si se toca una capa sin actualizar las demás
3. **Deuda técnica** creciente

---

## Estado Actual por Capa

### Capa 1: Odoo Addon (`appointment_management`) ✅ NUEVO
- Modelo: `appointment.booking` (era `salon.turno`)
- Campos: `client_name`, `phone`, `scheduled_datetime`, `total_price`, `deposit_amount`, `max_complexity`, `state`, `worker`
- Estados: `pending_payment`, `confirmed`, `completed`, `cancelled`
- Complejidad: `simple`, `medium`, `complex`, `very_complex`
- **Status:** Implementado, NO deployado a VPS aún

### Capa 2: Odoo MCP Tools (`odoo-mcp/src/tools/`) ✅ NUEVO
- Tools: `appointment_create`, `appointment_reschedule`, `appointment_add_service`, etc.
- Schemas con campos en inglés
- **Status:** Implementado en código

### Capa 3: n8n Sub-workflows (Crear Turno, Agregar Servicio, Reprogramar) ⚠️ MIXTO
- **TransformForMCP nodes en n8n:** Tool name actualizado (`appointment_create`), pero campos aún en español
- **Archivos locales (.js):** Desincronizados con n8n (aún dicen `leraysi_crear_turno`)
- **Campos de entrada:** Reciben del Agente Calendario en español (`clienta`, `telefono`, etc.)
- **Campos de salida:** Envían a Odoo MCP en español (el MCP los acepta? o mapea internamente?)

### Capa 4: n8n Agente Calendario (wXyvKF0nCCvAxGFG) ❌ VIEJO
- **14 Code nodes** usan nombres viejos: `clienta`, `telefono`, `turnoId`, `sena`, `complejidad_maxima`
- **System prompt** del AI Agent: tools `leraysi_crear_turno`, `leraysi_reprogramar_turno`, `leraysi_agregar_servicio_turno`
- **SwitchAccion values:** `turno_creado`, `turno_reprogramado`, `servicio_agregado`

### Capa 5: n8n Appointment Agent (0Hj5gpSltdjjzPT0) ❌ VIEJO
- Master AI Agent prompt: referencias a `turno`, `sena`, campos en español
- Output Main.js: parsea respuestas con campos viejos
- State fields en Baserow: `turno_agendado`, `sena_pagada`, `turno_fecha`

### Capa 6: Baserow Tables ⚠️ CAMBIO MÍNIMO (solo worker)
- **TurnosLeraysi (855):** Renombrar `trabajadora` → `worker`, opciones `primary`/`secondary`. Migrar datos existentes.
- **LeadsLeraysi (854):** Sin cambios (campos como `turno_agendado`, `sena_pagada` quedan en español)
- **Otros campos de Baserow quedan en español** — los adapters en code nodes traducen entre Odoo (inglés) y Baserow (español)
- **Razón del cambio en worker:** Multi-tenant. "Leraysi"/"Companera" no deben estar en la DB.

### Capa 7: Archivos Locales (system prompts, .js) ❌ VIEJO
- `Agente Calendario.md` - tools y campos viejos
- `LERAYSI-TOOLS-REFERENCE.md` - completamente desactualizado
- `TransformForMCP-*.js` - desincronizados con n8n
- Todos los `Formatear*.js`, `Preparar*.js` - campos viejos

---

## Pregunta Clave: ¿Qué pasa en el puente MCP?

El flujo actual es:
```
Agente Calendario (español) → TransformForMCP (traduce?) → HTTP POST → Odoo MCP (inglés)
```

**Necesitamos verificar:**
1. ¿El TransformForMCP en n8n ya mapea `clienta` → `client_name`? ¿O envía `clienta` directo?
2. ¿El Odoo MCP acepta ambos nombres (backward compat)? ¿O solo los nuevos?
3. Si el MCP solo acepta nuevos → el sistema está roto y no nos damos cuenta porque no se deployó

---

## Estrategia de Refactor

### Opción A: Refactor Completo (End-to-End English)
Cambiar TODO a inglés: system prompts, code nodes, switch values, state fields.

**Pros:** Consistencia total, mantenibilidad a largo plazo
**Contras:** Impacto masivo (50+ archivos, 14 code nodes, 2 system prompts, Baserow queries)
**Riesgo:** Alto - cualquier campo olvidado rompe el flujo en producción
**Tiempo estimado:** 3-4 sesiones de trabajo

### Opción B: Translation Layer (Adapters)
Mantener español en capas superiores (n8n), poner adapters en TransformForMCP que traduzcan español→inglés.

**Pros:** Mínimo impacto, se puede hacer incremental
**Contras:** Mantiene la deuda técnica, dos vocabularios para siempre
**Riesgo:** Bajo
**Tiempo estimado:** 1 sesión

### Opción C: Refactor por Fases (Recomendada)
Refactorear de abajo hacia arriba, verificando cada capa antes de subir.

**Pros:** Controlado, testeable por fase, rollback fácil
**Contras:** Más tiempo total
**Riesgo:** Medio (contenido por fases)

---

## Plan Detallado - Opción C (Recomendada)

### FASE 0: Preparación y Baseline
- [ ] Verificar qué acepta el Odoo MCP actualmente (¿campos viejos o nuevos?)
- [ ] Exportar backup de todos los workflows actuales de n8n
- [ ] Documentar estado exacto de cada TransformForMCP en n8n vs local
- [ ] Crear tests manuales para cada flujo (crear, reprogramar, agregar servicio)

### FASE 1: TransformForMCP Adapters (Puente)
**Objetivo:** Garantizar que los TransformForMCP mapeen correctamente español→inglés
**Impacto:** Solo 3-7 Code nodes de transformación
**Archivos:**
- `TransformForMCP-crear-turno.js`
- `TransformForMCP-reprogramar-turno.js`
- `TransformForMCP-agregar-servicio.js`
- `TransformForMCP-consultar-disponibilidad.js` (si existe en n8n)
- `TransformForMCP-cancelar-turno.js` (si existe en n8n)
- `TransformForMCP-confirmar-turno.js` (si existe en n8n)
- `TransformForMCP-consultar-turnos-dia.js` (si existe en n8n)

**Cambios por archivo:**
```javascript
// ANTES
const args = {
  clienta: params.clienta,
  telefono: params.telefono,
  servicio: params.servicio,
  // ...
};
return [{ json: { tool: "leraysi_crear_turno", arguments: args } }];

// DESPUES
const args = {
  client_name: params.clienta,
  phone: params.telefono,
  service_type: params.servicio,
  service_detail: params.servicio_detalle,
  scheduled_datetime: params.fecha_hora,
  total_price: Number(params.precio),
  estimated_duration: Number(params.duracion_estimada),
  max_complexity: COMPLEXITY_MAP[params.complejidad_maxima] || params.complejidad_maxima,
  lead_id: Number(params.lead_id),
  email: params.email,
};
return [{ json: { tool: "appointment_create", arguments: args } }];
```

**Mapping de complejidad:**
```javascript
const COMPLEXITY_MAP = {
  'simple': 'simple',
  'media': 'medium',
  'compleja': 'complex',
  'muy_compleja': 'very_complex'
};
```

**Test:** Crear turno de prueba via WhatsApp → verificar que llega correcto a Odoo MCP

### FASE 2: Response Adapters (MCP → Agente Calendario)
**Objetivo:** Los code nodes del Agente Calendario esperan campos en español. Agregar adapter que traduzca la respuesta MCP (inglés) de vuelta a español.

**Archivos afectados:**
- `ParseAgentResponse.js` - parsea respuesta del agente AI
- `PrepararTurnoBaserow.js` - formatea para Baserow (ya necesita español)
- `PrepararReprogramadoBaserow.js`
- `PrepararServicioAgregadoBaserow.js`
- `FormatearRespuestaExito.js`
- `FormatearRespuestaReprogramado.js`
- `FormatearRespuestaServicioAgregado.js`

**Mapping de respuesta:**
```javascript
// Adapter: MCP response (inglés) → interno (español para Baserow)
function adaptMCPResponse(mcp) {
  return {
    turnoId: mcp.bookingId,
    clienta: mcp.client_name,
    telefono: mcp.phone,
    fecha_hora: mcp.scheduled_datetime,
    servicio: mcp.service_type,
    servicio_detalle: mcp.service_detail,
    precio: mcp.total_price,
    sena: mcp.deposit_amount,
    link_pago: mcp.payment_link,
    mp_preference_id: mcp.mp_preference_id,
    estado: STATE_MAP[mcp.state] || mcp.state,
    complejidad_maxima: COMPLEXITY_MAP_REVERSE[mcp.max_complexity],
    duracion_estimada: mcp.estimated_duration,
    message: mcp.message,
  };
}
```

### FASE 3: System Prompt Agente Calendario
**Objetivo:** Actualizar el prompt para que el AI use nombres nuevos de tools
**Archivos:**
- `Agente Calendario.md`

**Decisión:** ¿El AI agent llama tools con nombres viejos o nuevos?
- Si Fase 1 pone adapters → el AI puede seguir usando nombres viejos
- Si queremos consistencia → actualizar prompt a `appointment_create` etc.

**Recomendación:** Actualizar a nombres nuevos. El tool name en n8n se configura en el toolWorkflow node, no en el prompt. El prompt solo documenta qué tools existen para que el AI sepa usarlas.

### FASE 4: Code Nodes del Agente Calendario (Opcional/Futuro)
**Objetivo:** Migrar los 14 code nodes internos a nombres inglés
**Impacto:** Alto - muchos archivos, lógica compleja
**Prerequisito:** Fases 1-3 completas y testeadas

**Archivos (14 code nodes):**
- `ParseInput.js`
- `ParseAgentResponse.js`
- `BuildAgentPrompt.js`
- `AnalizarDisponibilidad.js`
- `RouteDecision.js`
- `PrepararTurnoBaserow.js`
- `PrepararReprogramadoBaserow.js`
- `PrepararServicioAgregadoBaserow.js`
- `FormatearRespuestaExito.js`
- `FormatearRespuestaReprogramado.js`
- `FormatearRespuestaServicioAgregado.js`
- `FormatearRespuestaSinDisponibilidad.js`
- `FormatearRespuestaOpciones.js`
- `FormatearRespuestaConfirmacion.js`
- `FormatearRespuestaError.js`

**Nota:** Esta fase puede posponerse. Con adapters en Fases 1-2, el sistema funciona correctamente.

### FASE 5: Appointment Agent (Master) y Payment Webhook
**Objetivo:** Actualizar el workflow principal y el webhook de pago
**Archivos:**
- `Output Main.js` - parseo de respuestas
- `TurnoLeadConfirmado.js` - webhook pago confirmado
- `Master AI Agent-Main.md` - system prompt principal

### FASE 6: Sincronizar archivos locales con n8n
**Objetivo:** Que los .js y .md locales reflejen exactamente lo que está en n8n
**Método:** Exportar workflows actualizados y extraer code nodes

---

## Mapeo Completo de Campos

### Tool Names
| Viejo | Nuevo |
|-------|-------|
| `leraysi_crear_turno` | `appointment_create` |
| `leraysi_reprogramar_turno` | `appointment_reschedule` |
| `leraysi_agregar_servicio_turno` | `appointment_add_service` |
| `leraysi_consultar_disponibilidad` | `appointment_check_availability` |
| `leraysi_confirmar_turno` | `appointment_confirm` |
| `leraysi_cancelar_turno` | `appointment_cancel` |
| `leraysi_consultar_turnos_dia` | `appointment_list_by_date` |

### Campos de Request (español → inglés)
| Español | Inglés | Tipo |
|---------|--------|------|
| `clienta` | `client_name` | string |
| `telefono` | `phone` | string |
| `email` | `email` | string (sin cambio) |
| `servicio` | `service_type` | string enum |
| `servicio_detalle` | `service_detail` | string |
| `fecha_hora` | `scheduled_datetime` | "YYYY-MM-DD HH:MM" |
| `precio` | `total_price` | number |
| `duracion_estimada` | `estimated_duration` | number (minutos) |
| `complejidad_maxima` | `max_complexity` | string enum (ver abajo) |
| `lead_id` | `lead_id` | number (sin cambio) |
| `turno_id` | `booking_id` | number |
| `nuevo_servicio` | `new_service` | string enum |
| `nuevo_servicio_detalle` | `new_service_detail` | string |
| `nuevo_precio` | `new_price` | number |
| `nueva_hora` | `new_time` | "HH:MM" |
| `nueva_fecha_hora` | `new_datetime` | "YYYY-MM-DD HH:MM" |
| `motivo` | `reason` | string |
| `notas` | `notes` | string |
| `es_turno_adicional` | `is_additional_booking` | boolean |
| `trabajadora` | `worker` | "primary" / "secondary" |

### Complejidad
| Español | Inglés |
|---------|--------|
| `simple` | `simple` |
| `media` | `medium` |
| `compleja` | `complex` |
| `muy_compleja` | `very_complex` |

### Estados
| Español | Inglés |
|---------|--------|
| `pendiente_pago` | `pending_payment` |
| `confirmado` | `confirmed` |
| `completado` | `completed` |
| `cancelado` | `cancelled` |
| `expirado` | (no existe, se cancela) |

### Campos de Response (inglés → español para Baserow)
| MCP Response (inglés) | Interno/Baserow (español) |
|----------------------|---------------------------|
| `bookingId` | `turnoId` / `odoo_turno_id` |
| `client_name` | `clienta` / `nombre_clienta` |
| `phone` | `telefono` |
| `scheduled_datetime` | `fecha_hora` |
| `service_type` | `servicio` |
| `service_detail` | `servicio_detalle` |
| `total_price` | `precio` |
| `deposit_amount` | `sena` / `sena_monto` |
| `payment_link` | `link_pago` / `mp_link` |
| `mp_preference_id` | `mp_preference_id` (sin cambio) |
| `state` | `estado` |
| `max_complexity` | `complejidad_maxima` |
| `estimated_duration` | `duracion_estimada` / `duracion_min` |
| `worker` | `trabajadora` |
| `previous_booking_id` | `turno_id_anterior` |
| `new_booking_id` | `turno_id_nuevo` |
| `previous_datetime` | `fecha_hora_anterior` |
| `new_datetime` | `fecha_hora_nueva` |
| `previous_state` | `estado_anterior` |
| `actions` | `acciones` |
| `services` | `servicios` |
| `message` | `message` (sin cambio) |

---

## Archivos Involucrados (Inventario Completo)

### System Prompts (2)
1. `sub-workflow-agente-calendario/system-prompt/Agente Calendario.md`
2. `system-prompt-leraysi/Master AI Agent-Main.md`

### Transform Nodes - Puente MCP (7)
3. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-crear-turno.js`
4. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-reprogramar-turno.js`
5. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-agregar-servicio.js`
6. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-consultar-disponibilidad.js`
7. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-cancelar-turno.js`
8. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-confirmar-turno.js`
9. `sub-workflow-agente-calendario/tools-mcp/TransformForMCP-consultar-turnos-dia.js`

### Code Nodes - Agente Calendario (14)
10. `sub-workflow-agente-calendario/nodes-code/ParseInput.js`
11. `sub-workflow-agente-calendario/nodes-code/ParseAgentResponse.js`
12. `sub-workflow-agente-calendario/nodes-code/BuildAgentPrompt.js`
13. `sub-workflow-agente-calendario/nodes-code/AnalizarDisponibilidad.js`
14. `sub-workflow-agente-calendario/nodes-code/RouteDecision.js`
15. `sub-workflow-agente-calendario/nodes-code/PrepararTurnoBaserow.js`
16. `sub-workflow-agente-calendario/nodes-code/PrepararReprogramadoBaserow.js`
17. `sub-workflow-agente-calendario/nodes-code/PrepararServicioAgregadoBaserow.js`
18. `sub-workflow-agente-calendario/nodes-code/FormatearRespuestaExito.js`
19. `sub-workflow-agente-calendario/nodes-code/FormatearRespuestaReprogramado.js`
20. `sub-workflow-agente-calendario/nodes-code/FormatearRespuestaServicioAgregado.js`
21. `sub-workflow-agente-calendario/nodes-code/FormatearRespuestaSinDisponibilidad.js`
22. `sub-workflow-agente-calendario/nodes-code/FormatearRespuestaOpciones.js`
23. `sub-workflow-agente-calendario/nodes-code/FormatearRespuestaConfirmacion.js`

### Code Nodes - Appointment Agent (2)
24. `nodes-code/Output Main.js`
25. `sub-workflow-webhook-pago-confirmado/nodes-code/TurnoLeadConfirmado.js`

### Documentacion (2)
26. `sub-workflow-agente-calendario/tools-mcp/LERAYSI-TOOLS-REFERENCE.md`
27. `sub-workflow-agente-calendario/CONFIG-SISTEMA-TURNOS.md`

### n8n Workflows a actualizar (5)
28. Agente Calendario (`wXyvKF0nCCvAxGFG`) - 14 code nodes + system prompt
29. Crear Turno MCP (`RSjHu3HHONPnVmPe`) - 1 transform node
30. Agregar Servicio MCP (`Pgfz7XoGE2D7B63M`) - 1 transform node
31. Reprogramar Turno MCP (ID?) - 1 transform node
32. Appointment Agent (`0Hj5gpSltdjjzPT0`) - Output Main + prompts

---

## Prerequisito: Deploy appointment_management a VPS

Antes de ejecutar cualquier fase, se necesita:
1. Uninstall `salon_turnos` del DB `leonobitech`
2. Install `appointment_management`
3. Migrar MP access token: `salon_turnos.mp_access_token` → `appointment.mp_access_token`
4. Recrear container `odoo_mcp`
5. Verificar que las 9 tools responden correctamente

**Sin este deploy, no tiene sentido actualizar los workflows porque el MCP en producción aún usa los nombres viejos.**

---

## Orden de Ejecución

```
PASO 0: Deploy appointment_management a VPS
   ↓
PASO 1: Verificar qué acepta el MCP (campos viejos, nuevos, o ambos)
   ↓
FASE 1: Actualizar TransformForMCP (puente español→inglés)
   ↓
FASE 2: Actualizar response adapters (inglés→español para Baserow)
   ↓
FASE 3: Actualizar system prompt Agente Calendario
   ↓
TEST: Flujo completo crear turno + pagar + confirmar
   ↓
FASE 4: (Opcional) Migrar code nodes internos a inglés
   ↓
FASE 5: Actualizar Appointment Agent + webhook pago
   ↓
FASE 6: Sincronizar archivos locales
```

---

## Feature Nueva: Workers Genéricos Multi-Tenant

### Problema Actual

El sistema tiene "Leraysi" y "Companera" hardcodeados en **todas las capas**:
- 14 code nodes del Agente Calendario
- Baserow field `trabajadora` (select con opciones `Leraysi`/`Companera`)
- Mensajes WhatsApp a la clienta
- Simulación de carga semanal
- Y además: **el worker NO se envía a Odoo MCP** (siempre recibe default `"primary"`)

Esto impide reusar el sistema para otro cliente sin reescribir todo.

### Flujo Deseado (Multi-Tenant)

```
$env vars (n8n)          →  WORKER_PRIMARY_NAME=Leraysi
                             WORKER_SECONDARY_NAME=Companera

AnalizarDisponibilidad   →  worker: "primary" | "secondary" (genérico)
    ↓
BuildAgentPrompt         →  worker genérico + display name de $env para mensajes
    ↓
ParseAgentResponse       →  propaga worker genérico
    ↓
PrepararTurnoBaserow     →  worker: "primary" (genérico en Baserow)
    ↓
TransformForMCP          →  worker: "primary" ✅ → Odoo MCP
    ↓
Mensajes WhatsApp        →  $env.WORKER_PRIMARY_NAME para display
```

### Estrategia: $env + Helpers

**Los display names viven en variables de entorno de n8n:**

```bash
# n8n environment variables (docker-compose o .env)
WORKER_PRIMARY_NAME=Leraysi
WORKER_SECONDARY_NAME=Companera
```

Para otro cliente:
```bash
WORKER_PRIMARY_NAME=Ana
WORKER_SECONDARY_NAME=Lucía
```

**Helper block (al inicio de cada code node que necesite workers):**

```javascript
// ── WORKER CONFIG (from n8n env vars) ──
const WORKERS = ['primary', 'secondary'];
const WORKER_DISPLAY = {
  primary: $env.WORKER_PRIMARY_NAME || 'Primary',
  secondary: $env.WORKER_SECONDARY_NAME || 'Secondary',
};
const WORKER_FROM_DISPLAY = Object.fromEntries(
  Object.entries(WORKER_DISPLAY).flatMap(([k, v]) => [
    [v.toLowerCase(), k],
    [k, k], // identity: "primary" → "primary"
  ])
);

function toGenericWorker(name) {
  if (!name) return 'primary';
  return WORKER_FROM_DISPLAY[name.toLowerCase().trim()] || 'primary';
}

function toDisplayWorker(generic) {
  return WORKER_DISPLAY[generic] || WORKER_DISPLAY.primary;
}
```

### Cambios en Baserow

**TurnosLeraysi (855) — campo `trabajadora`:**
- Renombrar a `worker` (o mantener `trabajadora` y cambiar solo las opciones del select)
- Opciones: `Leraysi`/`Companera` → `primary`/`secondary`
- **Migrar datos existentes:** UPDATE filas con `Leraysi` → `primary`, `Companera` → `secondary`

**Decisión:** Renombrar campo a `worker` y usar valores genéricos. Motivo:
1. El nuevo cliente no debería ver "trabajadora" ni "Leraysi" en su Baserow
2. Los code nodes ya van a usar el valor genérico internamente
3. Es un cambio de una vez — después no se toca más

**Impacto del rename en Baserow:**
- Todos los nodos n8n Baserow que referencien el campo `trabajadora` → cambiar a `worker`
- Filtros y vistas en Baserow UI → actualizar manualmente
- Code nodes que lean `turno.trabajadora` → cambiar a `turno.worker`

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| **Code Nodes Internos** | |
| `AnalizarDisponibilidad.js` | `TRABAJADORAS` → `WORKERS = ['primary', 'secondary']`, lógica interna genérica, `toDisplayWorker()` solo en opciones para clienta |
| `BuildAgentPrompt.js` | `_precalculado.trabajadora` → `_precalculado.worker`, display via `toDisplayWorker()` |
| `ParseAgentResponse.js` | `.trabajadora` → `.worker`, normalizar con `toGenericWorker()` |
| `PrepararTurnoBaserow.js` | `trabajadora: data.trabajadora` → `worker: data.worker` (genérico directo a Baserow) |
| `PrepararServicioAgregadoBaserow.js` | Idem PATH A/B |
| `FormatearRespuestaOpciones.js` | Display names via `toDisplayWorker()` |
| `FormatearRespuestaServicioAgregado.js` | Idem |
| `FormatearRespuestaConfirmacion.js` | Idem si muestra nombre worker |
| `SimulacionCargaSemanal.js` | Constantes y datos de test |
| **Transform Nodes (puente MCP)** | |
| `TransformForMCP-crear-turno.js` | Agregar `worker: params.worker` al payload |
| `TransformForMCP-agregar-servicio.js` | Idem si aplica |
| **System Prompt** | |
| `Agente Calendario.md` | Documentar `worker` como parámetro de tools |
| **Baserow** | |
| TurnosLeraysi (855) | Renombrar `trabajadora` → `worker`, opciones `primary`/`secondary` |
| **n8n Baserow Nodes** | |
| Todos los nodos que referencien `trabajadora` | Cambiar a `worker` |
| **n8n Env Vars** | |
| Docker Compose / .env | Agregar `WORKER_PRIMARY_NAME`, `WORKER_SECONDARY_NAME` |

### Para Otro Cliente

Solo necesita:
1. Cambiar env vars: `WORKER_PRIMARY_NAME=Ana`, `WORKER_SECONDARY_NAME=Lucía`
2. Crear sus tablas Baserow (con campo `worker` genérico)
3. Los mensajes WhatsApp automáticamente dirán "Ana" en vez de "Leraysi"
4. Odoo MCP sigue recibiendo `primary`/`secondary` (agnóstico del negocio)

---

## Notas Importantes

1. **Baserow: solo se toca `trabajadora` → `worker`** - Resto de campos quedan en español. Los adapters traducen.
2. **Deploy Odoo primero** - Sin el addon nuevo en VPS, todo lo demás es inútil.
3. **Testear cada fase** - No avanzar sin verificar el flujo end-to-end.
4. **Los archivos locales son referencia** - Lo que importa es lo que está en n8n. Los .js locales se sincronizan al final.
5. **El Appointment Agent (master) se toca al final** - Es el más complejo y el que más riesgo tiene.
6. **Worker field es nuevo en Odoo** - Aprovechar el refactor para propagarlo correctamente desde AnalizarDisponibilidad hasta Odoo MCP.
