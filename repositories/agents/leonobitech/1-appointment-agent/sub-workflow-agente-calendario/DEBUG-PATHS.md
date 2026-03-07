# DEBUG PATHS - Sub-workflow Agente Calendario

Guía rápida de rutas para debugging. Cada path muestra los nodos en orden de ejecución.

---

## NODOS COMUNES (todos los paths)

```
When Executed by Another Workflow
    └─→ ParseInput                        [nodes-code/ParseInput.js]
        └─→ GetTurnosSemana               [Baserow: getAll rows]
            └─→ AnalizarDisponibilidad    [nodes-code/AnalizarDisponibilidad.js]
                └─→ BuildAgentPrompt      [nodes-code/BuildAgentPrompt.js]
                    └─→ Agente Calendario [AI Agent + Tools MCP]
                        └─→ ParseAgentResponse  [nodes-code/ParseAgentResponse.js]
                            └─→ SwitchAccion    [Switch por campo: accion]
```

**Tools MCP conectadas al Agente:**
- `leraysi_crear_turno`
- `leraysi_reprogramar_turno`
- `leraysi_agregar_servicio_turno`
- `leraysi_cancelar_turno`

---

## PATH: turno_creado

```
SwitchAccion (accion = "turno_creado")
    └─→ PrepararTurnoBaserow              [nodes-code/PrepararTurnoBaserow.js]
        └─→ CrearTurnoBaserow             [Baserow: create row - tabla 852]
            └─→ FormatearRespuestaExito   [nodes-code/FormatearRespuestaExito.js]
                └─→ Return (al Master Agent)
```

**Campos clave:**
| Nodo | Input | Output |
|------|-------|--------|
| PrepararTurnoBaserow | ParseAgentResponse.json | fecha, hora, servicio[], precio, sena_monto, mp_link |
| CrearTurnoBaserow | campos preparados | row_id del turno creado |
| FormatearRespuestaExito | row_id + metadata | {success, accion, turno_id, mensaje_para_clienta, turno_creado:{...}} |

---

## PATH: turno_reprogramado

```
SwitchAccion (accion = "turno_reprogramado")
    └─→ Get many rows                     [Baserow: buscar por odoo_event_id]
        └─→ PrepararReprogramadoBaserow   [nodes-code/PrepararReprogramadoBaserow.js]
            └─→ ActualizarTurnoBaserow    [Baserow: update row - tabla 852]
                └─→ FormatearRespuestaReprogramado  [nodes-code/FormatearRespuestaReprogramado.js]
                    └─→ Return (al Master Agent)
```

**Campos clave:**
| Nodo | Input | Output |
|------|-------|--------|
| Get many rows | odoo_turno_id | turno encontrado con row_id |
| PrepararReprogramadoBaserow | turno + ParseAgentResponse | fecha_nueva, hora_nueva, updated_at |
| ActualizarTurnoBaserow | row_id + campos | turno actualizado |
| FormatearRespuestaReprogramado | turno + metadata | {success, accion, turno_reprogramado:{fecha_anterior, fecha_nueva}} |

---

## PATH: servicio_agregado

```
SwitchAccion (accion = "servicio_agregado")
    └─→ BuscarTurnoServicioAgregado       [Baserow: buscar por odoo_event_id]
        └─→ PrepararServicioAgregadoBaserow  [nodes-code/PrepararServicioAgregadoBaserow.js]
            └─→ ActualizarTurnoServicioAgregado  [Baserow: update row - tabla 852]
                └─→ FormatearRespuestaServicioAgregado  [nodes-code/FormatearRespuestaServicioAgregado.js]
                    └─→ Return (al Master Agent)
```

**Campos clave:**
| Nodo | Input | Output |
|------|-------|--------|
| BuscarTurnoServicioAgregado | odoo_turno_id | turno encontrado con row_id |
| PrepararServicioAgregadoBaserow | turno + ParseAgentResponse | servicio[], servicio_detalle, precio, sena_monto, mp_link |
| ActualizarTurnoServicioAgregado | row_id + campos | turno actualizado |
| FormatearRespuestaServicioAgregado | turno + metadata | {success, accion, servicio_agregado:{servicios_combinados, precio_total, sena_diferencial, link_pago}} |

**Field IDs Baserow (tabla 852):**
| Campo | Field ID |
|-------|----------|
| servicio | 8385 |
| precio | 8388 |
| sena_pagada | 8390 |
| estado | 8391 |
| notas | 8394 |
| mp_link | 8399 |
| mp_preference_id | 8403 |
| updated_at | 8405 |

---

## PATH: sin_disponibilidad

```
SwitchAccion (accion = "sin_disponibilidad")
    └─→ FormatearRespuestaSinDisponibilidad  [nodes-code/FormatearRespuestaSinDisponibilidad.js]
        └─→ Return (al Master Agent)
```

**Campos clave:**
| Nodo | Input | Output |
|------|-------|--------|
| FormatearRespuestaSinDisponibilidad | ParseAgentResponse | {success, accion, mensaje_para_clienta, alternativas[]} |

---

## PATH: error

```
SwitchAccion (accion = "error")
    └─→ FormatearRespuestaError           [nodes-code/FormatearRespuestaError.js]
        └─→ Return (al Master Agent)
```

**Campos clave:**
| Nodo | Input | Output |
|------|-------|--------|
| FormatearRespuestaError | ParseAgentResponse | {success: false, accion: "error", mensaje_para_clienta} |

---

## CHECKLIST DEBUG

### Si falla en nodos comunes:
- [ ] ParseInput: ¿Llegan todos los campos del Master Agent?
- [ ] GetTurnosSemana: ¿Conexión Baserow OK?
- [ ] AnalizarDisponibilidad: ¿Lógica de slots correcta?
- [ ] BuildAgentPrompt: ¿System prompt completo?
- [ ] Agente Calendario: ¿Respuesta JSON válida?
- [ ] ParseAgentResponse: ¿Extrae bien el estado?

### Si falla en turno_creado:
- [ ] PrepararTurnoBaserow: ¿Campos mapeados correctamente?
- [ ] CrearTurnoBaserow: ¿Field IDs correctos?
- [ ] FormatearRespuestaExito: ¿Estructura de respuesta completa?

### Si falla en servicio_agregado:
- [ ] BuscarTurnoServicioAgregado: ¿Encuentra el turno por odoo_event_id?
- [ ] PrepararServicioAgregadoBaserow: ¿Array de servicios bien formado?
- [ ] ActualizarTurnoServicioAgregado: ¿Field IDs correctos? (8385, 8388, etc.)
- [ ] FormatearRespuestaServicioAgregado: ¿link_pago incluido en respuesta?

---

## MAPEO DE ARCHIVOS

| Nodo n8n | Archivo local |
|----------|---------------|
| ParseInput | `nodes-code/ParseInput.js` |
| AnalizarDisponibilidad | `nodes-code/AnalizarDisponibilidad.js` |
| BuildAgentPrompt | `nodes-code/BuildAgentPrompt.js` |
| ParseAgentResponse | `nodes-code/ParseAgentResponse.js` |
| PrepararTurnoBaserow | `nodes-code/PrepararTurnoBaserow.js` |
| PrepararReprogramadoBaserow | `nodes-code/PrepararReprogramadoBaserow.js` |
| PrepararServicioAgregadoBaserow | `nodes-code/PrepararServicioAgregadoBaserow.js` |
| FormatearRespuestaExito | `nodes-code/FormatearRespuestaExito.js` |
| FormatearRespuestaReprogramado | `nodes-code/FormatearRespuestaReprogramado.js` |
| FormatearRespuestaServicioAgregado | `nodes-code/FormatearRespuestaServicioAgregado.js` |
| FormatearRespuestaSinDisponibilidad | `nodes-code/FormatearRespuestaSinDisponibilidad.js` |
| FormatearRespuestaError | `nodes-code/FormatearRespuestaError.js` |
| SwitchAccion | `nodes-config/SwitchToolRouter.js` |
| Agente Calendario (prompt) | `system-prompt/Agente Calendario.md` |

---

*Última actualización: 2026-02-05*
