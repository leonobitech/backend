# Configuración: AI Agent → Sub Workflow

## Problema
El LLM genera `tool_calls` con `odoo_send_email` pero el subworkflow "Odoo_Send_Email" NO se ejecuta.

## Solución: Configurar Tool en Master AI Agent Main

### Paso 1: Abrir el nodo "Master AI Agent Main"

1. Click en el nodo "Master AI Agent Main" en n8n
2. Buscar la sección **"Tools"**

### Paso 2: Agregar Tool "Execute Workflow"

1. Click en **"Add Tool"**
2. Seleccionar tipo: **"Execute Workflow"**
3. Configurar:

```
Tool Name: odoo_send_email
Description: Send email with commercial proposal to customer
Workflow: Odoo_Send_Email (seleccionar del dropdown)
```

### Paso 3: Configurar Input Schema

El tool necesita definir qué argumentos espera. Configurar así:

```json
{
  "type": "object",
  "properties": {
    "opportunityId": {
      "type": "number",
      "description": "Lead ID from profile"
    },
    "emailTo": {
      "type": "string",
      "description": "Customer email address"
    },
    "subject": {
      "type": "string",
      "description": "Email subject"
    },
    "templateType": {
      "type": "string",
      "description": "Template type (e.g., 'proposal')"
    },
    "templateData": {
      "type": "object",
      "description": "Template variables",
      "properties": {
        "customerName": {"type": "string"},
        "productName": {"type": "string"},
        "price": {"type": "string"}
      }
    }
  },
  "required": ["opportunityId", "emailTo", "templateType"]
}
```

### Paso 4: Configurar el Subworkflow para recibir inputs

En el subworkflow "Odoo_Send_Email":

1. El nodo "When clicking 'Execute workflow'" debe tener **"Fields To Return"** configurado
2. O mejor, usar un nodo **"Workflow Trigger"** que reciba los parámetros automáticamente

### Paso 5: Verificar nombres

**CRÍTICO**: El nombre del tool DEBE coincidir EXACTAMENTE con lo que genera el LLM:

- LLM genera: `odoo_send_email`
- Tool name: `odoo_send_email`
- Subworkflow puede llamarse: `Odoo_Send_Email` (esto no importa)

### Paso 6: Guardar y Probar

1. Guardar el workflow
2. Ejecutar test con el input que ya probaste
3. Verificar que cuando el LLM genera `tool_calls`, n8n ejecute automáticamente el subworkflow

## Flujo Esperado

```
User: "felixmanuelfigueroa@gmail.com"
  ↓
Master AI Agent Main → LLM genera tool_call: odoo_send_email
  ↓
n8n detecta tool_call → Ejecuta subworkflow "Odoo_Send_Email"
  ↓
Subworkflow → HTTP Request a odoo_mcp:8100
  ↓
Email enviado ✅
  ↓
OUTPUT-MAIN-V5.js recibe resultado del tool
  ↓
Continúa flujo normal
```

## Troubleshooting

### Error: "Tool not found"
- Verificar que el tool name sea exactamente `odoo_send_email` (minúsculas, underscore)
- Verificar que el tool esté guardado en el nodo Agent

### Error: "Workflow not found"
- Verificar que el subworkflow "Odoo_Send_Email" exista y esté guardado
- Verificar que el trigger del subworkflow permita ejecución desde otro workflow

### El subworkflow no recibe los argumentos
- Verificar que el nodo trigger del subworkflow tenga "Fields To Return" configurado
- O usar "Workflow Trigger" en lugar de "When clicking 'Execute workflow'"

## Verificación

Para verificar que está bien configurado:

1. Abrir "Master AI Agent Main"
2. En la sección "Tools", debe aparecer:
   - ✅ odoo_send_email (Execute Workflow)
   - ✅ Connected to: Odoo_Send_Email

Si ves eso, debería funcionar.

---

**Autor**: Claude Code
**Fecha**: 2025-11-16
**Versión**: 1.0
