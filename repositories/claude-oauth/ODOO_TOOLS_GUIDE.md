# 🎯 Guía de Herramientas Odoo MCP

Este documento explica cómo usar las 8 herramientas de Odoo desde Claude Desktop.

---

## 📋 Herramientas Disponibles

### 1. `odoo_get_leads` - Ver Leads del CRM

**Descripción:** Obtiene una lista de leads con información de contacto.

**Parámetros:**
- `limit` (opcional): Máximo de leads a retornar (default: 10, max: 50)
- `stage` (opcional): Filtrar por etapa (ej: "New", "Qualified")
- `type` (opcional): "lead" o "opportunity"

**Ejemplos de uso en Claude Desktop:**

```
Muéstrame los últimos 10 leads del CRM
```

```
Dame los leads en etapa "Qualified"
```

```
Muéstrame 20 leads tipo opportunity
```

**Respuesta ejemplo:**
```json
{
  "total": 5,
  "leads": [
    {
      "id": 1,
      "name": "Interesados en migración cloud",
      "partner_name": "Acme Corp",
      "contact_name": "John Doe",
      "email": "john@acme.com",
      "phone": "+1234567890",
      "expected_revenue": 50000,
      "probability": 20,
      "stage": "New",
      "type": "lead",
      "created": "2025-01-15"
    }
  ]
}
```

---

### 2. `odoo_create_lead` - Crear Nuevo Lead

**Descripción:** Crea un nuevo lead en el CRM de Odoo.

**Parámetros:**
- `name` (requerido): Título del lead
- `partner_name` (opcional): Nombre de la empresa
- `contact_name` (opcional): Nombre del contacto
- `email` (opcional): Email
- `phone` (opcional): Teléfono
- `description` (opcional): Descripción o notas
- `expected_revenue` (opcional): Ingreso esperado

**Ejemplos de uso:**

```
Crea un lead llamado "Tesla Motors interesada en infraestructura cloud"
con email elon@tesla.com y empresa "Tesla Inc"
```

```
Crea un lead para "Microsoft Azure Migration" con esperado de $75000
```

**Respuesta ejemplo:**
```json
{
  "success": true,
  "lead_id": 42,
  "message": "Lead created successfully with ID: 42",
  "data": {
    "name": "Tesla Motors interesada en infraestructura cloud",
    "partner_name": "Tesla Inc",
    "email": "elon@tesla.com"
  }
}
```

---

### 3. `odoo_get_opportunities` - Ver Pipeline de Ventas

**Descripción:** Obtiene oportunidades del pipeline con información de ingresos y etapas.

**Parámetros:**
- `limit` (opcional): Máximo de oportunidades (default: 20, max: 100)
- `stage` (opcional): Filtrar por etapa
- `min_amount` (opcional): Monto mínimo esperado

**Ejemplos de uso:**

```
Muéstrame el pipeline de ventas
```

```
Dame las oportunidades mayores a $50000
```

```
Muéstrame las oportunidades en etapa "Proposition"
```

**Respuesta ejemplo:**
```json
{
  "total": 12,
  "total_revenue": 450000,
  "opportunities": [
    {
      "id": 5,
      "name": "Google Cloud Migration",
      "partner": "Google LLC",
      "expected_revenue": 80000,
      "probability": 75,
      "stage": "Proposition",
      "assigned_to": "Felix",
      "deadline": "2025-02-15"
    }
  ]
}
```

---

### 4. `odoo_update_deal_stage` - Mover Deal a Otra Etapa

**Descripción:** Actualiza la etapa de una oportunidad en el pipeline.

**Parámetros:**
- `opportunity_id` (requerido): ID de la oportunidad
- `stage_name` (requerido): Nombre de la etapa destino

**Ejemplos de uso:**

```
Mueve la oportunidad #5 a etapa "Won"
```

```
Cambia el deal de Google (ID 8) a "Proposition"
```

```
Marca como perdido el deal #12
```

**Respuesta ejemplo:**
```json
{
  "success": true,
  "message": "Opportunity #5 moved to stage 'Won'",
  "opportunity_id": 5,
  "new_stage": "Won"
}
```

---

### 5. `odoo_search_contacts` - Buscar Contactos

**Descripción:** Busca contactos (clientes, proveedores, empresas) por nombre, email o teléfono.

**Parámetros:**
- `query` (requerido): Texto a buscar
- `limit` (opcional): Máximo de resultados (default: 5, max: 20)

**Ejemplos de uso:**

```
Busca el contacto de Microsoft
```

```
Dame la información de Google
```

```
Busca contactos con email @amazon.com
```

**Respuesta ejemplo:**
```json
{
  "total": 1,
  "query": "Microsoft",
  "contacts": [
    {
      "id": 10,
      "name": "Microsoft Corporation",
      "email": "info@microsoft.com",
      "phone": "+1-425-882-8080",
      "is_company": true,
      "address": "One Microsoft Way, Redmond",
      "country": "United States",
      "website": "https://microsoft.com"
    }
  ]
}
```

---

### 6. `odoo_create_contact` - Crear Nuevo Contacto

**Descripción:** Crea un nuevo contacto en Odoo (cliente o proveedor).

**Parámetros:**
- `name` (requerido): Nombre del contacto/empresa
- `email` (opcional): Email
- `phone` (opcional): Teléfono fijo
- `mobile` (opcional): Teléfono móvil
- `is_company` (opcional): true si es empresa, false si es persona
- `street` (opcional): Dirección
- `city` (opcional): Ciudad
- `website` (opcional): Sitio web

**Ejemplos de uso:**

```
Crea un contacto para "Amazon AWS" con email aws@amazon.com
y que sea empresa
```

```
Crea un contacto individual llamado "John Smith"
con teléfono +1234567890
```

**Respuesta ejemplo:**
```json
{
  "success": true,
  "contact_id": 25,
  "message": "Contact created successfully with ID: 25",
  "data": {
    "name": "Amazon AWS",
    "email": "aws@amazon.com",
    "isCompany": true
  }
}
```

---

### 7. `odoo_get_sales_report` - Reporte de Ventas

**Descripción:** Genera un reporte con métricas de ventas (ingresos, deals ganados/perdidos, tasa de conversión).

**Parámetros:**
- `period` (opcional): "today", "week", "month", "quarter", "year" (default: "month")

**Ejemplos de uso:**

```
Dame el reporte de ventas del mes
```

```
Muéstrame las métricas de ventas del último año
```

```
¿Cómo va la semana en ventas?
```

**Respuesta ejemplo:**
```json
{
  "period": "month",
  "total_revenue": 350000,
  "deals_won": 12,
  "deals_lost": 3,
  "avg_deal_size": 29166.67,
  "conversion_rate": "80.00%",
  "summary": "In the last month, you won 12 deals worth $350,000 with a 80.0% conversion rate."
}
```

---

### 8. `odoo_create_activity` - Agendar Actividad

**Descripción:** Programa una actividad (llamada, reunión, email, tarea) en Odoo.

**Parámetros:**
- `activity_type` (requerido): "call", "meeting", "email", "task"
- `summary` (requerido): Título de la actividad
- `opportunity_id` (opcional): ID de oportunidad a vincular
- `date_deadline` (opcional): Fecha límite en formato YYYY-MM-DD
- `note` (opcional): Notas adicionales

**Ejemplos de uso:**

```
Agenda una llamada con Google para mañana
```

```
Crea una reunión llamada "Demo AWS" para el 2025-01-20
vinculada a la oportunidad #5
```

```
Agenda un email de seguimiento para Microsoft
```

**Respuesta ejemplo:**
```json
{
  "success": true,
  "activity_id": 15,
  "message": "Activity 'Llamada con Google' scheduled successfully",
  "type": "call",
  "deadline": "2025-01-16"
}
```

---

## 🎯 Casos de Uso Completos

### Caso 1: Nuevo Lead hasta Cierre

```
Tú: Crea un lead para "SpaceX Starlink" con email info@spacex.com,
    teléfono +1234567890 y descripción "Interesados en infraestructura
    cloud para satélites" con esperado de $100000

Claude: [Crea el lead]
        ✅ Lead created with ID: 50

Tú: Convierte ese lead en opportunity

Claude: [Necesitas hacerlo manual en Odoo o crear herramienta]

Tú: Mueve la oportunidad #50 a etapa "Proposition"

Claude: [Actualiza la etapa]
        ✅ Opportunity moved to "Proposition"

Tú: Agenda una reunión para mañana con SpaceX
    vinculada a la oportunidad #50

Claude: [Crea actividad]
        ✅ Meeting scheduled for 2025-01-16
```

### Caso 2: Revisión de Pipeline

```
Tú: Dame un resumen del pipeline de ventas

Claude: [Obtiene oportunidades]

        📊 Pipeline Summary:
        - Total: 15 opportunities
        - Total Revenue: $750,000
        - Top 3:
          1. Google Cloud - $120,000 (Proposition)
          2. AWS Migration - $100,000 (Qualified)
          3. Azure Setup - $85,000 (Proposition)

Tú: Muéstrame solo las mayores a $50000

Claude: [Filtra]

        💰 High-value Opportunities (>$50k): 8 deals
        Total: $580,000

Tú: ¿Cuál es la tasa de conversión del mes?

Claude: [Genera reporte]

        📈 Sales Report (Last Month):
        - Revenue: $350,000
        - Deals Won: 12
        - Conversion Rate: 80%
        - Avg Deal: $29,167
```

### Caso 3: Gestión de Contactos

```
Tú: Busca el contacto de Tesla

Claude: [Busca]

        📇 Tesla Inc
        Email: info@tesla.com
        Phone: +1-650-681-5000
        Website: tesla.com

Tú: No existe, créalo con esos datos

Claude: [Crea contacto]
        ✅ Contact created: Tesla Inc (ID: 99)

Tú: Ahora crea un lead para Tesla llamado
    "Interesados en Cybertruck fleet management"

Claude: [Crea lead vinculado al contacto]
        ✅ Lead created (ID: 51)
```

---

## 🔧 Tips y Mejores Prácticas

### 1. **Usa lenguaje natural**
Claude entiende contexto. No necesitas comandos rígidos:

❌ **Malo:** `odoo_get_leads limit=10 type=lead`
✅ **Bueno:** "Muéstrame los últimos 10 leads"

### 2. **Combina acciones**
Puedes hacer varias cosas en una conversación:

```
Tú: Muéstrame las oportunidades mayores a $50k,
    luego mueve la de Google a "Won" y
    agenda una llamada de celebración
```

### 3. **Pide análisis**
Claude puede analizar los datos que obtiene:

```
Tú: Dame el reporte de ventas del trimestre y
    dime si vamos bien comparado con el promedio

Claude: [Obtiene datos y analiza]
```

### 4. **Contexto en conversación**
Claude recuerda el contexto:

```
Tú: Muéstrame las oportunidades
Claude: [Muestra lista con IDs]

Tú: Mueve la #5 a Won
Claude: [Sabe que #5 es de la lista anterior]
```

---

## 🚨 Troubleshooting

### Error: "Odoo authentication failed"

**Problema:** No puede conectarse a Odoo.

**Solución:**
1. Verifica que la API Key sea correcta
2. Verifica que el usuario `felix@leonobitech.com` tenga permisos CRM
3. Revisa los logs: `docker logs -f claude_oauth`

### Error: "No se encontró la etapa"

**Problema:** El nombre de la etapa no existe o está mal escrito.

**Solución:**
1. Pregunta a Claude: "¿Qué etapas hay disponibles en el CRM?"
2. Claude puede listar las etapas disponibles
3. Usa el nombre exacto (con mayúsculas)

### Error: "Unknown tool"

**Problema:** La herramienta no está registrada.

**Solución:**
1. Verifica que el servidor esté actualizado
2. Reconecta Claude Desktop
3. Revisa logs del servidor

---

## 📊 Métricas y Performance

- **Latencia típica:** 500-1500ms por llamada
- **Rate limit:** Sin límite (controlado por Odoo)
- **Max resultados:**
  - Leads: 50
  - Opportunities: 100
  - Contacts: 20

---

## 🔐 Seguridad

✅ **Lo que está protegido:**
- API Key nunca se expone a Claude Desktop
- Autenticación OAuth en cada request
- Tokens con expiración de 5 minutos
- Logs de todas las acciones

⚠️ **Ten en cuenta:**
- Claude Desktop tiene acceso completo al CRM
- Puede crear/modificar leads, oportunidades y contactos
- Puede ver toda la información de ventas
- No puede eliminar datos (no hay herramienta `delete`)

---

## 🚀 Próximas Mejoras (Futuras)

Ideas para extender la funcionalidad:

### Ventas
- `odoo_create_quotation`: Crear cotizaciones
- `odoo_send_quotation`: Enviar cotización por email
- `odoo_confirm_sale_order`: Confirmar orden de venta

### Analytics
- `odoo_get_pipeline_by_stage`: Pipeline detallado por etapa
- `odoo_get_team_performance`: Rendimiento por vendedor
- `odoo_get_lead_source_report`: Reporte por fuente de leads

### Automation
- `odoo_auto_qualify_lead`: IA califica lead automáticamente
- `odoo_suggest_next_action`: Claude sugiere siguiente paso
- `odoo_generate_proposal`: Generar propuesta con IA

### Integraciones
- Email: Enviar cotizaciones via Resend
- Calendar: Sincronizar actividades con Google Calendar
- WhatsApp: Notificaciones de nuevos deals

---

**¿Necesitas ayuda?** Pregunta a Claude en lenguaje natural:

```
Claude, ¿cómo puedo ver todas mis oportunidades abiertas?
Claude, ¿cómo creo un lead nuevo?
Claude, ¿puedes explicarme cómo funciona odoo_get_sales_report?
```

**¡Claude está aquí para ayudarte a comandar tu CRM!** 🎯
