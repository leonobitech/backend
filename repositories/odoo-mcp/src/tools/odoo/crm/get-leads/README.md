# Tool: odoo_get_leads

## 📋 Descripción

Obtiene una lista de leads del CRM de Odoo con filtros opcionales por etapa, tipo y límite de resultados.

## 🎯 Categoría

**CRM / Leads**

## 📥 Parámetros

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `limit` | number | No | 10 | Número máximo de leads a retornar |
| `stage` | string | No | - | Filtrar por nombre de etapa (ej: "New", "Qualified") |
| `type` | "lead" \| "opportunity" | No | - | Tipo: "lead" para prospectos, "opportunity" para oportunidades |

## 📤 Respuesta

```typescript
{
  leads: Array<{
    id: number;
    name: string;
    partner_name: string;
    contact_name: string;
    email_from: string;
    phone: string;
    expected_revenue: number;
    probability: number;
    stage_id: [number, string];  // [ID, nombre]
    user_id: [number, string];   // [ID, nombre]
    team_id: [number, string];   // [ID, nombre]
    type: "lead" | "opportunity";
    date_deadline: string;
    create_date: string;
    description: string;
  }>
}
```

## 💡 Ejemplos de Uso

### Ejemplo 1: Últimos 5 leads
```
User: Muéstrame los últimos 5 leads

Claude ejecuta:
odoo_get_leads({"limit": 5})
```

### Ejemplo 2: Leads calificados
```
User: Dame los leads en etapa Qualified

Claude ejecuta:
odoo_get_leads({"stage": "Qualified", "limit": 10})
```

### Ejemplo 3: Solo oportunidades
```
User: Cuáles son mis oportunidades activas?

Claude ejecuta:
odoo_get_leads({"type": "opportunity", "limit": 20})
```

## 🔧 Implementación

### Archivos

- `get-leads.tool.ts` - Implementación de la tool
- `get-leads.schema.ts` - Schema Zod para validación
- `README.md` - Esta documentación

### Dependencias

- **Odoo Client**: Necesita conexión autenticada a Odoo
- **Permisos**: Usuario debe tener acceso de lectura al modelo `crm.lead`

### Flujo

1. Validar parámetros con schema Zod
2. Construir dominio de búsqueda Odoo
3. Ejecutar `search_read` en modelo `crm.lead`
4. Ordenar por `create_date desc`
5. Retornar resultados formateados

## ⚠️ Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `ODOO_AUTH_ERROR` | Credenciales incorrectas | Verificar `ODOO_API_KEY` |
| `ODOO_MODEL_ERROR` | Modelo CRM no encontrado | Verificar que Odoo tiene módulo CRM instalado |
| `INVALID_STAGE` | Nombre de etapa no existe | Usar nombre exacto de etapa en Odoo |
| `FIELD_NOT_FOUND` | Campo solicitado no existe en Odoo 19 | Actualizar lista de campos |

## 🔗 Relacionadas

- `odoo_create_lead` - Crear nuevo lead
- `odoo_get_opportunities` - Obtener solo oportunidades
- `odoo_update_deal_stage` - Cambiar etapa de lead/oportunidad
