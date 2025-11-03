# Internal MCP API - Para n8n Sales Agent

Este documento describe cómo usar los endpoints internos del MCP Server desde n8n.

---

## 🔐 Autenticación

Todos los endpoints requieren el header `X-Service-Token`:

```http
X-Service-Token: <SERVICE_TOKEN desde .env>
```

---

## 📋 Endpoints Disponibles

### **1. Listar Tools Disponibles**

```http
GET http://odoo_mcp:8100/internal/mcp/tools
X-Service-Token: <token>
```

**Respuesta**:
```json
{
  "tools": [
    {
      "name": "odoo_schedule_meeting",
      "description": "Schedule a meeting in Odoo calendar linked to an opportunity",
      "inputSchema": {
        "type": "object",
        "properties": {
          "opportunityId": { "type": "number", "description": "..." },
          "title": { "type": "string", "description": "..." },
          ...
        }
      }
    },
    ...
  ],
  "count": 10
}
```

**Uso**: Llamar al inicio del workflow para obtener la lista de tools y pasarla al LLM en el Smart Input.

---

### **2. Ejecutar Tool**

```http
POST http://odoo_mcp:8100/internal/mcp/call-tool
X-Service-Token: <token>
Content-Type: application/json

{
  "tool": "odoo_schedule_meeting",
  "arguments": {
    "opportunityId": 123,
    "title": "Demo Odoo CRM - Restaurante Felix",
    "startDatetime": "2025-11-05 15:00:00",
    "durationHours": 0.5,
    "description": "Demo de Process Automation (Odoo/ERP)",
    "location": "Google Meet"
  }
}
```

**Respuesta Exitosa**:
```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "data": {
    "eventId": 456,
    "message": "Meeting \"Demo Odoo CRM - Restaurante Felix\" scheduled successfully"
  }
}
```

**Respuesta con Conflicto (Calendario ocupado)**:
```json
{
  "success": true,
  "tool": "odoo_schedule_meeting",
  "data": {
    "message": "Conflictos detectados al agendar la reunión",
    "conflict": {
      "conflicts": [
        {
          "start": "2025-11-05 15:00:00",
          "end": "2025-11-05 16:00:00",
          "name": "Reunión existente"
        }
      ],
      "availableSlots": [
        {
          "start": "2025-11-05 16:30:00",
          "end": "2025-11-05 17:30:00"
        },
        {
          "start": "2025-11-05 18:00:00",
          "end": "2025-11-05 19:00:00"
        }
      ]
    }
  }
}
```

**Respuesta de Error**:
```json
{
  "error": "tool_execution_failed",
  "message": "Stage \"Demo Scheduled\" not found in Odoo",
  "details": "..."
}
```

---

## 🛠️ Tools Prioritarias para Sales Agent

### **1. odoo_schedule_meeting** (Agendar Demo)

**Uso**: Cuando usuario dice "agendar demo", "quiero ver una demo", etc.

**Parámetros**:
| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `opportunityId` | number | ID de la oportunidad en Odoo | ✅ |
| `title` | string | Título de la reunión | ✅ |
| `startDatetime` | string | Fecha/hora ISO: "2025-11-05 15:00:00" | ✅ |
| `durationHours` | number | Duración en horas (ej: 0.5 = 30min) | ❌ |
| `description` | string | Descripción/agenda | ❌ |
| `location` | string | Ubicación (ej: "Google Meet") | ❌ |
| `forceSchedule` | boolean | Forzar agendar aunque haya conflictos | ❌ |

**Ejemplo n8n**:
```javascript
// HTTP Request Node
{
  "url": "http://odoo_mcp:8100/internal/mcp/call-tool",
  "method": "POST",
  "headers": {
    "X-Service-Token": "{{$env.ODOO_MCP_SERVICE_TOKEN}}",
    "Content-Type": "application/json"
  },
  "body": {
    "tool": "odoo_schedule_meeting",
    "arguments": {
      "opportunityId": "{{$json.odoo_opportunity_id}}",
      "title": "Demo {{$json.service}} - {{$json.full_name}}",
      "startDatetime": "{{$json.demo_datetime}}",
      "durationHours": 0.5,
      "location": "Google Meet"
    }
  }
}
```

---

### **2. odoo_send_email** (Enviar Propuesta)

**Uso**: Cuando usuario confirma "sí, envíame la propuesta por email"

**Parámetros**:
| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `opportunityId` | number | ID de la oportunidad en Odoo | ✅ |
| `subject` | string | Asunto del email | ✅ |
| `templateType` | string | "proposal", "demo", "followup", "welcome", "custom" | ❌ |
| `templateData` | object | Datos para el template | ❌ |
| `body` | string | Cuerpo del email (si templateType es "custom") | ❌ |
| `emailTo` | string | Email del destinatario (override) | ❌ |

**Ejemplo n8n**:
```javascript
{
  "url": "http://odoo_mcp:8100/internal/mcp/call-tool",
  "method": "POST",
  "headers": {
    "X-Service-Token": "{{$env.ODOO_MCP_SERVICE_TOKEN}}",
    "Content-Type": "application/json"
  },
  "body": {
    "tool": "odoo_send_email",
    "arguments": {
      "opportunityId": "{{$json.odoo_opportunity_id}}",
      "subject": "Propuesta Comercial - {{$json.service}}",
      "templateType": "proposal",
      "templateData": {
        "customerName": "{{$json.full_name}}",
        "productName": "{{$json.service}}",
        "price": "USD 1200",
        "customContent": "<ul><li>CRM automatizado</li><li>Integración WhatsApp</li></ul>"
      },
      "emailTo": "{{$json.email}}"
    }
  }
}
```

---

### **3. odoo_update_deal_stage** (Actualizar Pipeline)

**Uso**: Sincronizar stage de Baserow → Odoo

**Parámetros**:
| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `opportunityId` | number | ID de la oportunidad en Odoo | ✅ |
| `stageName` | string | "New", "Qualified", "Proposition", "Won", "Lost" | ✅ |

**Mapeo Baserow → Odoo**:
- `explore` → "New"
- `match` → "Qualified"
- `price` → "Proposition"
- `qualify` → "Qualified"
- `proposal_ready` → "Proposition"

**Ejemplo n8n**:
```javascript
{
  "url": "http://odoo_mcp:8100/internal/mcp/call-tool",
  "method": "POST",
  "headers": {
    "X-Service-Token": "{{$env.ODOO_MCP_SERVICE_TOKEN}}",
    "Content-Type": "application/json"
  },
  "body": {
    "tool": "odoo_update_deal_stage",
    "arguments": {
      "opportunityId": "{{$json.odoo_opportunity_id}}",
      "stageName": "Qualified"
    }
  }
}
```

---

## ⚠️ Prerequisitos

### **1. Campo `odoo_opportunity_id` en Baserow**

Agregar campo en tabla "Leads":
- **Nombre**: `odoo_opportunity_id`
- **Tipo**: Number
- **Nullable**: Sí
- **Default**: null

### **2. Sincronización Inicial**

Antes de usar las tools, asegurarse de que el lead existe en Odoo:

```javascript
// Verificar si existe odoo_opportunity_id
if (!$json.odoo_opportunity_id) {
  // Crear oportunidad en Odoo
  // (puedes usar odoo_create_lead o crear manualmente)
  // Guardar odoo_opportunity_id en Baserow
}
```

### **3. Variables de Entorno (.env en odoo-mcp)**

```env
SERVICE_TOKEN=<generar-token-64-chars>
ODOO_SERVICE_URL=http://odoo:8069
ODOO_SERVICE_DB=leonobitech
ODOO_SERVICE_USER=admin@leonobitech.com
ODOO_SERVICE_API_KEY=<api-key-de-odoo>
```

---

## 🔄 Flujo Completo: Agendar Demo

```
1. Usuario: "Agendame una demo"
   ↓
2. n8n: Verificar odoo_opportunity_id en Baserow
   ↓
3. Si null → Crear opportunity en Odoo (odoo_create_lead)
   ↓
4. LLM decide: "Necesito agendar demo"
   ↓
5. n8n: POST /internal/mcp/call-tool
   {
     "tool": "odoo_schedule_meeting",
     "arguments": {
       "opportunityId": 123,
       "title": "Demo Odoo CRM - Felix Figueroa",
       "startDatetime": "2025-11-05 15:00:00"
     }
   }
   ↓
6. MCP Server → Odoo XML-RPC:
   - Crea evento en calendar.event
   - Actualiza stage de oportunidad
   - Envía email de confirmación
   ↓
7. Respuesta al usuario:
   "Perfecto Felix! Te agendé la demo para el martes 5 de noviembre a las 15:00hs."
```

---

## 📚 Más Information

- **Tools completas**: Ver `/tools/init.ts` para todas las tools disponibles
- **Schemas**: Cada tool tiene su schema en `/tools/odoo/<category>/<tool>/<tool>.schema.ts`
- **OdooClient**: Ver `/lib/odoo.ts` para métodos disponibles del cliente Odoo
