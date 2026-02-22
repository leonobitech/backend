# Odoo MCP Tools Documentation

Esta documentación describe todas las herramientas disponibles en el conector Odoo MCP y las plantillas de email implementadas.

---

## Índice

1. [Herramientas CRM](#herramientas-crm)
2. [Herramientas de Contactos](#herramientas-de-contactos)
3. [Herramientas de Calendario](#herramientas-de-calendario)
4. [Herramientas de Email](#herramientas-de-email)
5. [Herramientas de Actividades](#herramientas-de-actividades)
6. [Plantillas de Email](#plantillas-de-email)

---

## Herramientas CRM

### `odoo_get_leads`

Obtiene leads del CRM con filtros opcionales.

**Parámetros:**
- `limit` (opcional): Número máximo de resultados (default: 10)
- `type` (opcional): Filtrar por tipo: 'lead' u 'opportunity'
- `stage` (opcional): Filtrar por etapa específica

**Retorna:** Lista de leads con 14 campos incluyendo nombre, email, teléfono, etapa, probabilidad, valor esperado, etc.

**Ejemplo de uso:**
```
Muéstrame los últimos 5 leads
```

---

### `odoo_create_lead`

Crea un nuevo lead en el CRM.

**Parámetros obligatorios:**
- `name`: Nombre del lead/oportunidad

**Parámetros opcionales:**
- `type`: 'lead' u 'opportunity' (default: 'lead')
- `contactName`: Nombre de la persona de contacto
- `email`: Email de contacto
- `phone`: Teléfono
- `companyName`: Nombre de la empresa
- `description`: Descripción o notas
- `expectedRevenue`: Ingresos esperados
- `probability`: Probabilidad de cierre (0-100)

**Retorna:** ID del lead creado

**Ejemplo de uso:**
```
Crea un lead llamado "Felix Figueroa" con email felix@example.com y teléfono +1234567890
```

---

### `odoo_get_opportunities`

Obtiene oportunidades (tipo específico de lead) ordenadas por valor esperado.

**Parámetros:**
- `limit` (opcional): Número máximo de resultados (default: 10)
- `minAmount` (opcional): Filtrar por valor mínimo esperado

**Retorna:** Lista de oportunidades con totalRevenue calculado

**Ejemplo de uso:**
```
Dame las oportunidades con valor mayor a $10,000
```

---

### `odoo_update_deal_stage`

Actualiza la etapa de una oportunidad en el pipeline y registra el cambio en el chatter.

**Parámetros:**
- `opportunityId`: ID de la oportunidad
- `stage`: Nueva etapa ('new', 'qualified', 'proposition', 'won', 'lost')
- `notes` (opcional): Notas sobre el cambio

**Retorna:** Confirmación del cambio con nombre de la oportunidad

**Ejemplo de uso:**
```
Mueve la oportunidad 42 a la etapa "qualified"
```

---

### `odoo_analyze_opportunity`

Analiza el historial completo del chatter de una oportunidad para entender contexto, necesidades y siguiente paso.

**Parámetros:**
- `opportunityId`: ID de la oportunidad a analizar

**Retorna:**
- `summary`: Resumen ejecutivo de la oportunidad
- `timeline`: Array de eventos clasificados (mensajes del cliente, emails enviados, cambios de etapa, actividades, notas)
- `detectedNeeds`: Necesidades específicas del cliente detectadas en las conversaciones
- `sentiment`: Análisis de sentimiento (positive, neutral, negative)
- `suggestedNextActions`: Acciones recomendadas basadas en el contexto

**Clasificación de eventos:**
- `client_message`: Mensajes o respuestas del cliente
- `email_sent`: Emails enviados al cliente
- `stage_change`: Cambios de etapa en el pipeline
- `activity`: Actividades completadas o creadas
- `note`: Notas internas del equipo
- `other`: Otros eventos del sistema

**Ejemplo de uso:**
```
Dame el status de la oportunidad "Felix Figueroa"
```

---

## Herramientas de Contactos

### `odoo_search_contacts`

Busca contactos existentes en Odoo.

**Parámetros:**
- `query`: Texto a buscar (busca en nombre, email y teléfono)
- `limit` (opcional): Número máximo de resultados (default: 10)

**Retorna:** Lista de contactos con nombre, email, teléfono, empresa, ciudad

**Ejemplo de uso:**
```
Busca contactos con "felix" en su nombre
```

---

### `odoo_create_contact`

Crea un nuevo contacto/partner en Odoo.

**Parámetros obligatorios:**
- `name`: Nombre del contacto

**Parámetros opcionales:**
- `email`: Email
- `phone`: Teléfono
- `mobile`: Teléfono móvil
- `companyName`: Empresa
- `street`: Dirección
- `city`: Ciudad
- `zip`: Código postal
- `countryCode`: Código del país (ej: 'US', 'MX')
- `website`: Sitio web
- `comment`: Notas internas

**Retorna:** ID del contacto creado

**Ejemplo de uso:**
```
Crea un contacto llamado "Felix Figueroa" con email felix@leonobitech.com
```

---

## Herramientas de Calendario

### `odoo_schedule_meeting`

Agenda una reunión en el calendario y **automáticamente crea una actividad vinculada**.

**Parámetros obligatorios:**
- `opportunityId`: ID de la oportunidad
- `name`: Título de la reunión
- `startDate`: Fecha y hora de inicio (formato ISO: '2025-01-15T10:00:00')
- `duration`: Duración en horas (ej: 1, 0.5, 2)

**Parámetros opcionales:**
- `description`: Descripción o agenda de la reunión
- `location`: Ubicación o enlace de videollamada
- `attendeeEmails`: Array de emails de asistentes

**Comportamiento automático:**
- ✅ **Crea y vincula contacto automáticamente** (si no existe, busca o crea partner)
- ✅ Crea el evento en el calendario
- ✅ Crea una actividad de tipo "meeting" vinculada a la oportunidad
- ✅ Envía email de confirmación al contacto con detalles de la reunión
- ✅ Avanza la oportunidad a etapa "proposition" si está en "qualified"
- ✅ Registra la acción en el chatter

**Retorna:** `eventId` y `activityId` creados

**Ejemplo de uso:**
```
Agenda un demo para la oportunidad 42 el 15 de enero a las 10:00 AM, duración 1 hora
```

---

## Herramientas de Email

### `odoo_send_email`

Envía un email profesional usando plantillas predefinidas o contenido personalizado.

**Parámetros obligatorios:**
- `opportunityId`: ID de la oportunidad

**Parámetros para templates:**
- `templateType`: Tipo de plantilla ('proposal', 'demo', 'followup', 'welcome', 'custom')
- `templateData`: Objeto con datos para la plantilla (ver sección [Plantillas de Email](#plantillas-de-email))

**Parámetros para custom:**
- `subject`: Asunto del email (requerido si templateType es 'custom')
- `body`: Cuerpo HTML del email (requerido si templateType es 'custom')

**Comportamiento automático:**
- ✅ **SOLO para `proposal` y `demo`**: Crea y vincula contacto automáticamente (busca o crea partner)
- ✅ Registra el email enviado en el chatter
- ✅ Avanza la oportunidad según el tipo:
  - `proposal` → crea contacto + mueve a "proposition"
  - `demo` → crea contacto + mueve a "proposition"
  - `followup`, `welcome`, `custom` → NO crea contacto, no cambia etapa

**Retorna:** Confirmación con messageId y template usado

**Ejemplo de uso con template:**
```
Envía una propuesta comercial a la oportunidad 42 para el producto "ERP Leonobitech" con precio $5,000
```

**Ejemplo de uso custom:**
```
Envía un email custom a la oportunidad 42 con asunto "Hola Felix" y body "<p>Contenido personalizado</p>"
```

---

## Herramientas de Actividades

### `odoo_complete_activity`

Marca una actividad como completada con feedback opcional y puede crear seguimiento automático.

**Parámetros (al menos uno requerido):**
- `activityId`: ID de la actividad a completar
- `opportunityId`: ID de la oportunidad (busca la actividad más reciente pendiente)

**Parámetros opcionales:**
- `feedback`: Notas o feedback sobre la actividad completada
- `createFollowUp`: Boolean para crear seguimiento automático (default: false)
- `followUpDays`: Días para el seguimiento (default: 2)

**Comportamiento:**
- ✅ Marca la actividad como "done" en Odoo
- ✅ Registra la completación en el chatter
- ✅ Si `createFollowUp: true`, crea una nueva actividad de tipo "Llamada de seguimiento"

**Retorna:** Confirmación con activityId completado y followUpId si se creó

**Ejemplo de uso:**
```
Completa la actividad 123 con feedback "Cliente muy interesado" y crea seguimiento en 3 días
```

---

### `odoo_send_meeting_reminder`

Envía un recordatorio profesional por email sobre una reunión próxima.

**Parámetros obligatorios:**
- `opportunityId`: ID de la oportunidad

**Parámetros opcionales:**
- `eventId`: ID del evento específico (si no se proporciona, encuentra la próxima reunión automáticamente)
- `customMessage`: Mensaje personalizado para incluir en el recordatorio

**Comportamiento:**
- ✅ Si no se proporciona `eventId`, busca la próxima reunión programada automáticamente
- ✅ Calcula el tiempo hasta la reunión ("en 2 días", "en 3 horas", "en 30 minutos")
- ✅ Genera email HTML profesional con marca Leonobitech
- ✅ Incluye todos los detalles: fecha, hora, duración, ubicación
- ✅ Registra el recordatorio enviado en el chatter

**Retorna:** Confirmación con detalles de la reunión y tiempo hasta el evento

**Ejemplo de uso:**
```
Envía un recordatorio de reunión a la oportunidad 42
```

```
Envía un recordatorio de la reunión 567 a la oportunidad 42 con mensaje "No olvides preparar las preguntas"
```

---

## Plantillas de Email

El sistema incluye 4 plantillas profesionales con diseño responsive y marca Leonobitech.

### Base Template

Todas las plantillas usan un diseño consistente:
- **Header**: Logo Leonobitech con degradado azul-verde
- **Contenido**: Fondo blanco con padding responsive
- **Footer**: Información de contacto y enlaces a redes sociales
- **Diseño**: Responsive, ancho máximo 600px, fuentes web-safe

---

### 1. Plantilla `proposal` (Propuesta Comercial)

**Uso:** Enviar propuestas comerciales con detalles de producto y precio.

**Campos de `templateData`:**
- `customerName` (requerido): Nombre del cliente
- `productName` (requerido): Nombre del producto/servicio
- `price` (requerido): Precio (ej: "$5,000 USD")
- `description` (opcional): Descripción adicional del producto
- `validUntil` (opcional): Fecha de validez de la propuesta

**Estructura:**
1. Saludo personalizado
2. Introducción de Leonobitech
3. Detalles del producto/servicio
4. Precio destacado en caja azul
5. Fecha de validez (si se proporciona)
6. Call-to-action para agendar llamada
7. Firma de Felix Figueroa, CEO

**Ejemplo de uso:**
```javascript
{
  templateType: "proposal",
  templateData: {
    customerName: "Felix",
    productName: "ERP Leonobitech Cloud",
    price: "$5,000 USD",
    description: "Sistema ERP completo con módulos de CRM, inventario, ventas y reportes en tiempo real",
    validUntil: "15 de febrero de 2025"
  }
}
```

---

### 2. Plantilla `demo` (Confirmación de Demo)

**Uso:** Confirmar demos o reuniones agendadas.

**Campos de `templateData`:**
- `customerName` (requerido): Nombre del cliente
- `demoDate` (requerido): Fecha y hora del demo
- `demoLink` (opcional): Enlace de videollamada (Zoom, Meet, etc.)
- `productName` (opcional): Producto a demostrar

**Estructura:**
1. Confirmación de demo agendado
2. Fecha y hora destacada en caja verde
3. Enlace de videollamada (si se proporciona)
4. Producto a demostrar (si se proporciona)
5. Instrucciones para preparar la sesión
6. Contacto para reagendar si es necesario

**Ejemplo de uso:**
```javascript
{
  templateType: "demo",
  templateData: {
    customerName: "Felix",
    demoDate: "15 de enero de 2025 a las 10:00 AM",
    demoLink: "https://meet.google.com/abc-defg-hij",
    productName: "ERP Leonobitech Cloud"
  }
}
```

---

### 3. Plantilla `followup` (Seguimiento)

**Uso:** Hacer seguimiento después de reuniones, demos o propuestas.

**Campos de `templateData`:**
- `customerName` (requerido): Nombre del cliente
- `previousInteraction` (opcional): Qué interacción se está siguiendo (ej: "nuestro demo del viernes")
- `nextSteps` (opcional): Siguientes pasos propuestos

**Estructura:**
1. Saludo de seguimiento
2. Referencia a interacción previa
3. Recordatorio de valor de Leonobitech
4. Siguientes pasos (si se proporcionan)
5. Preguntas abiertas para continuar conversación
6. Call-to-action para agendar llamada

**Ejemplo de uso:**
```javascript
{
  templateType: "followup",
  templateData: {
    customerName: "Felix",
    previousInteraction: "nuestro demo del sistema ERP el viernes pasado",
    nextSteps: "Enviar propuesta formal con pricing personalizado para tu empresa"
  }
}
```

---

### 4. Plantilla `welcome` (Bienvenida / Primer Contacto)

**Uso:** Primer contacto con nuevos leads o clientes.

**Campos de `templateData`:**
- `customerName` (requerido): Nombre del cliente
- `companyName` (opcional): Nombre de la empresa del cliente

**Estructura:**
1. Bienvenida a Leonobitech
2. Presentación de la empresa
3. Servicios principales destacados:
   - Automatización inteligente con IA
   - Integración de sistemas
   - Optimización de procesos
4. Propuesta de llamada inicial
5. Información de contacto completa

**Ejemplo de uso:**
```javascript
{
  templateType: "welcome",
  templateData: {
    customerName: "Felix",
    companyName: "Acme Corp"
  }
}
```

---

### Plantilla Custom

Si ninguna plantilla se ajusta, puedes usar `templateType: "custom"` y proporcionar tu propio HTML:

```javascript
{
  templateType: "custom",
  subject: "Asunto personalizado",
  body: "<html>Tu HTML personalizado aquí</html>"
}
```

---

## Flujos Automáticos Implementados

### 1. Auto-vinculación de Contactos (Solo Acciones Formales)

**Cuándo se activa:**
- `odoo_send_email` con `templateType: 'proposal'` o `'demo'`
- `odoo_schedule_meeting` (cualquier reunión)

**Qué hace:**
- ✅ Verifica si la oportunidad ya tiene contacto vinculado
- ✅ Busca si existe un contacto con el mismo email (evita duplicados)
- ✅ Si existe, lo vincula a la oportunidad
- ✅ Si no existe, crea un nuevo contacto con los datos del lead
- ✅ Registra la acción en el chatter

**Por qué solo en acciones formales:**
- Los leads (Nuevo) son prospectos sin contacto formal
- Las oportunidades (Calificado) todavía no requieren contacto
- Solo al enviar propuestas/demos o agendar reuniones se crea el contacto
- Esto respeta el flujo natural de ventas: Lead → Opportunity → Proposition

### 2. Auto-creación de Actividades

Cuando se agenda una reunión con `odoo_schedule_meeting`:
- ✅ Crea evento en `calendar.event`
- ✅ Crea actividad en `mail.activity` de tipo "meeting"
- ✅ Ambos quedan vinculados a la oportunidad
- ✅ La actividad aparece en la columna "Actividades" de Odoo

### 3. Progresión Automática de Pipeline

Las herramientas mueven oportunidades automáticamente cuando hay acciones formales:

| Acción | Condición | Resultado |
|--------|-----------|-----------|
| `send_email` con `proposal` | Cualquier etapa | → "proposition" + crea contacto |
| `send_email` con `demo` | Cualquier etapa | → "proposition" + crea contacto |
| `schedule_meeting` | Desde "qualified" | → "proposition" + crea contacto |
| `send_email` otros templates | Cualquier etapa | Sin cambios, NO crea contacto |

**Flujo completo:**
1. **Lead (Nuevo)**: Prospecto inicial, sin contacto
2. **Opportunity (Calificado)**: Oportunidad calificada, todavía sin contacto
3. **Proposition (Propuesta)**: Se envía propuesta/demo o agenda reunión → **AQUÍ se crea el contacto**
4. **Won/Lost**: Cierre de la oportunidad

---

## Próximas Mejoras

Funcionalidades planificadas para futuras versiones:
- Auto-completar actividades después de reuniones
- Recordatorios automáticos antes de reuniones
- Seguimientos automáticos después de demos
- Webhooks para eventos de Odoo
- Métricas y reportes de conversión

---

## Soporte

Para reportar issues o sugerir mejoras:
- **Email**: felix@leonobitech.com
- **Website**: https://leonobitech.com
