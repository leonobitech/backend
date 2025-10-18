# Tool: odoo_create_lead

## 📋 Descripción

Crea un nuevo lead en el CRM de Odoo con creación automática de contacto (partner) si se proporciona email o nombre de empresa.

## 🎯 Categoría

**CRM / Leads**

## 📥 Parámetros

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `name` | string | ✅ Sí | - | Título del lead (ej: "Integración CRM Acme Corp") |
| `partner_name` | string | No | - | Nombre de la empresa (si es empresa) |
| `contact_name` | string | No | - | Nombre del contacto individual |
| `email` | string | No | - | Email del contacto |
| `phone` | string | No | - | Teléfono del contacto |
| `description` | string | No | - | Descripción o notas del lead |
| `expected_revenue` | number | No | - | Ingreso esperado (monto) |
| `type` | "lead" \| "opportunity" | No | "lead" | Tipo: "lead" para prospecto, "opportunity" para oportunidad |

## 📤 Respuesta

```typescript
{
  leadId: number;           // ID del lead creado
  partnerId?: number;       // ID del partner creado/encontrado (si aplica)
  message: string;          // Mensaje de confirmación
}
```

## 🤖 Comportamiento Inteligente

### Auto-creación de Partners
1. **Si hay email**: Busca partner existente con ese email
2. **Si no existe**: Crea nuevo partner automáticamente
3. **Si hay partner_name**: Marca como empresa (`is_company: true`)
4. **Si solo contact_name**: Crea contacto individual
5. **Vincula automáticamente** el partner al lead

### Evita Duplicados
- Busca partners existentes por email antes de crear
- Si encuentra match, reutiliza el partner existente

## 💡 Ejemplos de Uso

### Ejemplo 1: Lead simple
```
User: Crea un lead llamado "Consulta sobre software"

Claude ejecuta:
odoo_create_lead({
  "name": "Consulta sobre software"
})

Resultado:
→ Lead creado sin partner asociado
```

### Ejemplo 2: Lead con empresa
```
User: Crea un lead para Acme Corp con email contact@acme.com

Claude ejecuta:
odoo_create_lead({
  "name": "Propuesta Acme Corp - Sistema CRM",
  "partner_name": "Acme Corp",
  "email": "contact@acme.com",
  "expected_revenue": 15000
})

Resultado:
→ Lead creado
→ Partner "Acme Corp" creado automáticamente (o reutilizado si existe)
→ Partner vinculado al lead
```

### Ejemplo 3: Lead con contacto individual
```
User: Agrega lead de John Doe, email john@example.com, teléfono 555-1234

Claude ejecuta:
odoo_create_lead({
  "name": "Consulta John Doe",
  "contact_name": "John Doe",
  "email": "john@example.com",
  "phone": "555-1234",
  "description": "Consulta inicial sobre servicios"
})

Resultado:
→ Lead creado
→ Partner individual "John Doe" creado
→ Email y teléfono guardados
```

### Ejemplo 4: Crear directamente como oportunidad
```
User: Crea una oportunidad para TechStart Inc valorada en $25,000

Claude ejecuta:
odoo_create_lead({
  "name": "Oportunidad TechStart - Implementación ERP",
  "partner_name": "TechStart Inc",
  "type": "opportunity",
  "expected_revenue": 25000
})

Resultado:
→ Oportunidad creada (no lead)
→ Partner "TechStart Inc" creado
→ Visible en pipeline de oportunidades
```

## 🔧 Implementación

### Archivos

- `create-lead.tool.ts` - Implementación de la tool
- `create-lead.schema.ts` - Schema Zod para validación
- `README.md` - Esta documentación

### Dependencias

- **Odoo Client**: Necesita conexión autenticada
- **Permisos**: Usuario debe tener permisos de creación en `crm.lead` y `res.partner`

### Flujo Interno

1. Validar parámetros con schema Zod
2. **Si hay email**: Buscar partner existente
3. **Si no existe y hay datos de contacto**: Crear partner
4. Preparar valores del lead
5. Vincular partner al lead (si existe)
6. Ejecutar `create` en modelo `crm.lead`
7. Retornar IDs y mensaje de confirmación

## ⚠️ Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `MISSING_NAME` | No se proporcionó título | El parámetro `name` es obligatorio |
| `INVALID_EMAIL` | Email mal formateado | Verificar formato de email |
| `DUPLICATE_PARTNER` | Partner ya existe | Es normal, se reutiliza automáticamente |
| `PERMISSION_DENIED` | Sin permisos de creación | Usuario necesita permisos en CRM y Contactos |
| `INVALID_TYPE` | Tipo no válido | Usar "lead" o "opportunity" |

## 🔗 Relacionadas

- `odoo_get_leads` - Listar leads creados
- `odoo_update_deal_stage` - Mover lead a otra etapa
- `odoo_create_contact` - Crear contacto sin lead
- `odoo_search_contacts` - Buscar contactos existentes

## 📊 Casos de Uso

1. **Captura rápida**: Crear lead sin contacto para seguimiento posterior
2. **Lead completo**: Crear lead + contacto en un solo paso
3. **Evitar duplicados**: Reutiliza contactos existentes automáticamente
4. **Oportunidades directas**: Saltarse etapa de lead si ya es oportunidad calificada
