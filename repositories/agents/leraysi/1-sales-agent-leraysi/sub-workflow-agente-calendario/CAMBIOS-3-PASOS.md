# Cambios en n8n Workflow: Flujo de 3 Pasos

## Resumen

El flujo de agendar turno pasa de 2 pasos a 3 pasos para evitar que la LLM cree turnos antes de la confirmación de la clienta.

```
ANTES (2 pasos):
  consultar_disponibilidad → LLM presenta resumen → clienta confirma → agendar (crea turno)
  PROBLEMA: LLM mezcla "presentar resumen" con "crear turno" → turno duplicado

AHORA (3 pasos):
  PASO 1: consultar_disponibilidad → devuelve opciones
  PASO 2: confirmar → valida slot + devuelve resumen (NO crea nada)
  PASO 3: crear → crea turno + link de pago
```

## Cambios en archivos locales (ya hechos)

| Archivo | Cambio |
|---------|--------|
| `system-prompt-leraysi/Master AI Agent-Main.md` | Reescrito: flujo de 2 pasos → 3 pasos con ejemplos |
| `nodes-code/RouteDecision.js` | Agregado: rama `modo: "confirmar"` → `accion: "resumen_confirmacion"` |
| `nodes-code/FormatearRespuestaConfirmacion.js` | **NUEVO**: genera resumen de confirmación sin crear turno |
| `nodes-code/ParseInput.js` | Sin cambios (ya pasa `modo` raw) |
| `nodes-code/BuildAgentPrompt.js` | Sin cambios (solo se ejecuta con `modo: "agendar"`) |

## Cambios necesarios en n8n UI

### 1. SwitchModo: agregar tercer output

El nodo `SwitchModo` actualmente tiene 2 outputs:
- Output 0: `modo === "consultar_disponibilidad"` → FormatearRespuestaOpciones
- Output 1: `modo === "agendar"` → BuildAgentPrompt

**Agregar Output 2:**
- Condición: `modo === "confirmar"`
- Conectar a: nuevo nodo `FormatearRespuestaConfirmacion`

### 2. Crear nodo FormatearRespuestaConfirmacion

- **Tipo**: Code (JavaScript)
- **Código**: copiar de `nodes-code/FormatearRespuestaConfirmacion.js`
- **Input**: SwitchModo (Output 2)
- **Output**: conectar al nodo `Return` (mismo que FormatearRespuestaOpciones)

### 3. Diagrama de flujo actualizado

```
ParseInput
    ↓
GetTurnosSemana
    ↓
AnalizarDisponibilidad
    ↓
RouteDecision
    ↓
SwitchModo ─── modo: "consultar_disponibilidad" ──→ FormatearRespuestaOpciones ──→ Return
    │
    ├──────── modo: "confirmar" ──────────────→ FormatearRespuestaConfirmacion ──→ Return  ← NUEVO
    │
    └──────── modo: "agendar" ────────────────→ BuildAgentPrompt → LLM → MCP Tools → Return
```

### 4. System Prompt del Master Agent (n8n)

En el nodo **AI Agent** del workflow `Sales_Agent_By_WhatsApp`:
- Actualizar el system prompt con el contenido de `Master AI Agent-Main.md`
- La sección "Flujo de TRES PASOS" reemplaza la anterior "Flujo de DOS PASOS"

## Verificación

1. Enviar mensaje "Quiero un balayage para mañana" → debe llamar `consultar_disponibilidad_leraysi`
2. Elegir opción (ej: "Jueves") → debe llamar `agendar_turno_leraysi` con `modo: "confirmar"` → devuelve resumen SIN crear turno
3. Confirmar ("Sí") → debe llamar `agendar_turno_leraysi` con `modo: "crear"` → CREA turno con link de pago
4. Verificar que NO se creen turnos duplicados
5. Verificar race condition: si el slot se ocupa entre paso 2 y 3, devuelve alternativas
