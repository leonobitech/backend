# 🚀 Próxima Sesión: Odoo Command Center

## 📌 Estado Actual
- ✅ MCP Server con OAuth funcionando
- ✅ Claude Desktop conectado exitosamente
- ✅ Herramientas `ping` y `get_user_info` operativas
- ✅ Documentación completa en UNDERSTANDING.md

## 🎯 Objetivo Próxima Sesión
**Implementar Odoo Command Center via MCP**
Comandar tu CRM/ERP Odoo directamente desde Claude Desktop usando lenguaje natural.

## 🔧 Información Necesaria

### Odoo Setup
```env
ODOO_URL=https://odoo.leonobitech.com
ODOO_DB=_______________  # ← Completar: nombre de tu database
ODOO_USERNAME=admin      # ← o el usuario que uses para API
ODOO_PASSWORD=***        # ← me lo das en privado cuando arranquemos
ODOO_VERSION=__          # ← 15, 16, 17 o 18?
```

### Módulos de Odoo (verificar cuáles tienes instalados)
- [ ] CRM (crm)
- [ ] Sales Management (sale_management)
- [ ] Contacts (contacts)
- [ ] Projects (project)
- [ ] Inventory (stock)
- [ ] Accounting (account)

## 🎬 Plan de Implementación

### Fase 1: Setup (30 min)
```bash
# 1. Instalar dependencias
cd /Users/felix/leonobitech/backend/repositories/claude-oauth
npm install xmlrpc

# 2. Crear cliente Odoo
src/lib/odoo.ts          # Cliente XML-RPC
src/lib/odooModels.ts    # TypeScript types para modelos Odoo

# 3. Agregar env vars
ODOO_URL=...
ODOO_DB=...
ODOO_USERNAME=...
ODOO_PASSWORD=...
```

### Fase 2: Primeras Herramientas MCP (1-2 horas)

#### 1. CRM - Leads
```typescript
Tool: get_leads
Descripción: Obtiene lista de leads del CRM
Parámetros:
  - limit: number (opcional, default: 10)
  - stage: string (opcional: "new", "qualified", "proposition")
Uso: "Muéstrame los últimos 10 leads"
```

```typescript
Tool: create_lead
Descripción: Crea un nuevo lead en el CRM
Parámetros:
  - name: string (requerido: nombre del lead)
  - partner_name: string (requerido: nombre de la empresa/contacto)
  - email: string (opcional)
  - phone: string (opcional)
  - description: string (opcional)
Uso: "Crea un lead para Google Cloud con email info@google.com"
```

#### 2. CRM - Opportunities
```typescript
Tool: get_opportunities
Descripción: Obtiene el pipeline de ventas (oportunidades)
Parámetros:
  - stage: string (opcional: etapa del pipeline)
  - min_amount: number (opcional: monto mínimo)
Uso: "Dame las oportunidades mayores a $10,000"
```

```typescript
Tool: update_deal_stage
Descripción: Mueve una oportunidad a otra etapa del pipeline
Parámetros:
  - opportunity_id: number (requerido)
  - stage: string (requerido: "new", "qualified", "proposition", "won", "lost")
Uso: "Mueve el deal #123 a ganado"
```

#### 3. Contacts
```typescript
Tool: search_contacts
Descripción: Busca contactos/clientes/proveedores
Parámetros:
  - query: string (requerido: nombre, email o teléfono)
  - limit: number (opcional, default: 5)
Uso: "Busca el contacto de Microsoft"
```

```typescript
Tool: create_contact
Descripción: Crea un nuevo contacto
Parámetros:
  - name: string (requerido)
  - email: string (opcional)
  - phone: string (opcional)
  - is_company: boolean (opcional: si es empresa)
Uso: "Crea un contacto para Amazon con email aws@amazon.com"
```

#### 4. Reports
```typescript
Tool: get_sales_report
Descripción: Genera reporte de ventas
Parámetros:
  - period: string (opcional: "today", "week", "month", "quarter", "year")
Uso: "Dame el reporte de ventas del mes"
```

#### 5. Activities
```typescript
Tool: create_activity
Descripción: Agenda una actividad (llamada, reunión, email)
Parámetros:
  - activity_type: string ("call", "meeting", "email", "task")
  - summary: string (requerido: título)
  - opportunity_id: number (opcional: vincular a oportunidad)
  - date_deadline: string (ISO date)
Uso: "Agenda una llamada con Google para mañana"
```

### Fase 3: Testing (30 min)
1. Deploy a producción
2. Testing desde Claude Desktop
3. Verificar error handling
4. Documentar uso

## 🔍 Test de Conexión (Opcional - Para Verificar)

Si quieres probar la conexión antes de la sesión:

```python
# test_odoo_connection.py
import xmlrpc.client

url = "https://odoo.leonobitech.com"
db = "TU_DATABASE"  # ← cambiar
username = "admin"
password = "TU_PASSWORD"  # ← cambiar

# Autenticar
common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
print(f"✅ Conectado! UID: {uid}")

# Listar primeros 3 leads
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
leads = models.execute_kw(db, uid, password,
    'crm.lead', 'search_read',
    [[]],
    {'fields': ['name', 'partner_name', 'email_from'], 'limit': 3}
)
print(f"\n✅ Primeros 3 leads:")
for lead in leads:
    print(f"  - {lead['name']} ({lead.get('partner_name', 'Sin empresa')})")
```

## 📚 Recursos Útiles

### Documentación Odoo API
- [Odoo External API](https://www.odoo.com/documentation/17.0/developer/reference/external_api.html)
- [XML-RPC Reference](https://www.odoo.com/documentation/17.0/developer/reference/external_api.html#xml-rpc-library)

### Modelos de Odoo que usaremos
- `crm.lead` - Leads y Oportunidades
- `res.partner` - Contactos (clientes, proveedores)
- `sale.order` - Órdenes de venta
- `mail.activity` - Actividades (tareas, llamadas, reuniones)
- `crm.stage` - Etapas del pipeline

### Cliente npm recomendado
```bash
npm install xmlrpc
```

## 🎯 Resultado Esperado

Después de esta sesión podrás hacer esto desde Claude Desktop:

**Ejemplo 1: Crear Lead**
```
Tú: Crea un lead para "Tesla Motors" con email elon@tesla.com
    y descripción "Interesados en migración cloud"

Claude: Usando create_lead...
        ✅ Lead creado: #456 - Tesla Motors
        📧 Email: elon@tesla.com
        📝 Descripción guardada
```

**Ejemplo 2: Ver Pipeline**
```
Tú: Muéstrame las oportunidades abiertas

Claude: Usando get_opportunities...

        📊 Pipeline de Ventas (12 oportunidades):

        🆕 Nuevas (3):
          - Microsoft Azure - $45,000
          - Google Cloud - $30,000
          - Amazon AWS - $25,000

        ✅ Calificadas (4):
          - IBM Watson - $80,000
          - Oracle Database - $60,000
          ...

        💰 Total pipeline: $340,000
```

**Ejemplo 3: Actualizar Deal**
```
Tú: Mueve el deal de Microsoft a la etapa de propuesta

Claude: Usando update_deal_stage...
        ✅ Oportunidad #123 (Microsoft Azure - $45,000)
        ✅ Movida a etapa: "Propuesta"
        ✅ Fecha actualizada
```

**Ejemplo 4: Buscar Contacto**
```
Tú: Dame la información de contacto de Microsoft

Claude: Usando search_contacts...

        📇 Microsoft Corporation
        📧 info@microsoft.com
        📱 +1 425-882-8080
        🏢 Empresa
        💼 Leads activos: 2
        💰 Oportunidades: $120,000
```

## 🚀 Comandos para Empezar

```bash
# 1. Ver el estado actual
cd /Users/felix/leonobitech/backend/repositories/claude-oauth
git status
docker logs -f claude_oauth

# 2. Ver las herramientas actuales funcionando
# En Claude Desktop, escribir:
# "Usa ping con mensaje 'Hello Odoo integration!'"

# 3. Leer documentación
cat UNDERSTANDING.md
```

## 📌 Checklist Pre-Sesión

Antes de empezar, ten a mano:
- [ ] URL de Odoo: `odoo.leonobitech.com` ✅
- [ ] Nombre de la database de Odoo
- [ ] Usuario para API (admin u otro)
- [ ] Password (lo darás en privado)
- [ ] Versión de Odoo (ver en About)
- [ ] Módulos instalados (CRM al menos)

## 💡 Ideas Extra (Fase 2 - Futuras Sesiones)

### Herramientas Avanzadas
```typescript
// Sales
- create_quotation: Crear cotización
- send_quotation: Enviar cotización por email
- confirm_sale_order: Confirmar orden de venta

// Analytics
- get_pipeline_metrics: Métricas detalladas del pipeline
- get_team_performance: Rendimiento por vendedor
- get_conversion_rate: Tasa de conversión

// Automation
- auto_qualify_lead: IA califica el lead automáticamente
- suggest_next_action: Claude sugiere siguiente acción
- generate_proposal: Generar propuesta con IA
```

### Integraciones Posibles
- Email (Resend) + Odoo: Enviar cotizaciones
- Calendar + Odoo: Sincronizar reuniones
- WhatsApp + Odoo: Notificaciones de deals

## 🎊 Motivación

**Esto va a ser INCREÍBLE porque:**

1. 🥇 **Serás pionero** - No existe un Odoo MCP Server público
2. 💼 **Caso de uso real** - Lo usarás todos los días en tu negocio
3. 🚀 **Productividad x10** - Comandar Odoo en lenguaje natural
4. 🌟 **Open source potential** - Podrías publicarlo y ayudar a miles
5. 💰 **Valor comercial** - Empresas pagarían por esto

---

**¡Nos vemos en la próxima sesión!** 🚀

Cuando vuelvas, solo di:
> "Vamos con el Odoo Command Center. Aquí está mi database: [nombre]"

Y arrancamos directo a implementar 🔥
