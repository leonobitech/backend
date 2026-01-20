# Sistema de Turnos Configurable - Estilos Leraysi

## Arquitectura Configurable

El sistema usa una tabla de configuración en Baserow que permite ajustar parámetros sin modificar código.

---

## Tabla: ConfigLeraysi (Baserow)

| Campo | Tipo | Valor Default | Descripción |
|-------|------|---------------|-------------|
| `config_key` | Text (Primary) | - | Clave única del parámetro |
| `config_value` | Text | - | Valor del parámetro |
| `config_type` | Single Select | number/string/boolean | Tipo de dato |
| `description` | Long Text | - | Descripción para el admin |
| `updated_at` | Date | Auto | Última modificación |

### Valores de Configuración

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONFIGURACIÓN DE RESERVAS                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  config_key                    │ config_value │ Descripción                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  RESERVA_EXPIRACION_MINUTOS    │ 120          │ Tiempo para pagar (2h)      │
│  RESERVA_SEÑA_PORCENTAJE       │ 30           │ % del total como seña       │
│  RESERVA_RECORDATORIO_MINUTOS  │ 30           │ Recordar antes de expirar   │
│  RESERVA_MAX_POR_DIA           │ 6            │ Máximo turnos por día       │
│  RESERVA_HORARIO_APERTURA      │ 09:00        │ Hora de apertura            │
│  RESERVA_HORARIO_CIERRE        │ 19:00        │ Hora de cierre              │
│  RESERVA_DIAS_CERRADOS         │ 0            │ Días cerrados (0=domingo)   │
│  RESERVA_ANTICIPACION_MIN_DIAS │ 0            │ Mínimo días de anticipación │
│  RESERVA_ANTICIPACION_MAX_DIAS │ 30           │ Máximo días de anticipación │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CONFIGURACIÓN DE SERVICIOS                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SERVICIO_DURACION_BAJA        │ 60           │ Minutos para baja complej.  │
│  SERVICIO_DURACION_MEDIA       │ 90           │ Minutos para media complej. │
│  SERVICIO_DURACION_ALTA        │ 120          │ Minutos para alta complej.  │
│  SERVICIO_DURACION_MUY_ALTA    │ 180          │ Minutos para muy alta       │
│  SERVICIO_MAX_PESADOS_DIA      │ 2            │ Máx servicios pesados/día   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CONFIGURACIÓN DE NOTIFICACIONES                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NOTIF_RECORDATORIO_24H        │ true         │ Recordar 24h antes          │
│  NOTIF_RECORDATORIO_2H         │ true         │ Recordar 2h antes           │
│  NOTIF_ENVIAR_RECIBO_EMAIL     │ true         │ Enviar recibo por email     │
│  NOTIF_ENVIAR_CONFIRMACION_WA  │ true         │ Confirmar por WhatsApp      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo con Configuración Dinámica

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FLUJO DE RESERVA CON CONFIG DINÁMICA                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Cliente quiere turno                                                    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ Cargar Config   │◄──── Baserow: ConfigLeraysi                           │
│  │ desde Baserow   │      (cachear en variable)                            │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           │  config = {                                                     │
│           │    expiracion: 120,     // minutos                              │
│           │    sena_pct: 30,        // %                                    │
│           │    horario: { apertura: "09:00", cierre: "19:00" },            │
│           │    ...                                                          │
│           │  }                                                              │
│           │                                                                 │
│           ▼                                                                 │
│  2. Verificar disponibilidad                                                │
│     - Usar config.RESERVA_HORARIO_*                                        │
│     - Usar config.RESERVA_MAX_POR_DIA                                      │
│           │                                                                 │
│           ▼                                                                 │
│  3. Calcular duración del servicio                                          │
│     - Usar config.SERVICIO_DURACION_* según complejidad                    │
│           │                                                                 │
│           ▼                                                                 │
│  4. Calcular seña                                                           │
│     - sena = precio * (config.RESERVA_SEÑA_PORCENTAJE / 100)              │
│           │                                                                 │
│           ▼                                                                 │
│  5. Crear reserva tentativa                                                 │
│     - expira_at = NOW + config.RESERVA_EXPIRACION_MINUTOS                  │
│           │                                                                 │
│           ▼                                                                 │
│  6. Programar recordatorio                                                  │
│     - Si config.RESERVA_RECORDATORIO_MINUTOS > 0                           │
│     - Recordar en (expiracion - recordatorio) minutos                      │
│           │                                                                 │
│           ▼                                                                 │
│  7. Enviar mensaje con tiempo límite                                        │
│     "Tenés {{ config.expiracion }} minutos para confirmar..."              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementación: Nodo LoadConfig

```javascript
// ============================================================================
// LOAD CONFIG - Cargar configuración desde Baserow
// ============================================================================

// Este nodo se ejecuta al inicio del workflow
// Cachea la configuración para no consultar Baserow en cada mensaje

const configRows = $('GetConfig').all();

// Convertir rows a objeto de configuración
const config = {};

configRows.forEach(row => {
  const key = row.json.config_key;
  let value = row.json.config_value;

  // Convertir según tipo
  switch (row.json.config_type) {
    case 'number':
      value = Number(value);
      break;
    case 'boolean':
      value = value === 'true';
      break;
    case 'json':
      value = JSON.parse(value);
      break;
    // 'string' se queda como está
  }

  config[key] = value;
});

// Valores por defecto si no están en la tabla
const defaults = {
  RESERVA_EXPIRACION_MINUTOS: 120,
  RESERVA_SEÑA_PORCENTAJE: 30,
  RESERVA_RECORDATORIO_MINUTOS: 30,
  RESERVA_MAX_POR_DIA: 6,
  RESERVA_HORARIO_APERTURA: '09:00',
  RESERVA_HORARIO_CIERRE: '19:00',
  RESERVA_DIAS_CERRADOS: [0], // Domingo
  SERVICIO_DURACION_BAJA: 60,
  SERVICIO_DURACION_MEDIA: 90,
  SERVICIO_DURACION_ALTA: 120,
  SERVICIO_DURACION_MUY_ALTA: 180,
};

// Merge con defaults
const finalConfig = { ...defaults, ...config };

return [{
  json: {
    config: finalConfig,
    loaded_at: new Date().toISOString()
  }
}];
```

---

## Uso en el Flujo

### En AnalizarDisponibilidad.js

```javascript
// Obtener config
const config = $('LoadConfig').first().json.config;

// Usar valores dinámicos
const CAPACIDAD = {
  max_turnos_dia: config.RESERVA_MAX_POR_DIA,
  max_pesados: config.SERVICIO_MAX_PESADOS_DIA || 2,
};

const HORARIO = {
  apertura: config.RESERVA_HORARIO_APERTURA,
  cierre: config.RESERVA_HORARIO_CIERRE,
};

const DIAS_CERRADOS = config.RESERVA_DIAS_CERRADOS || [0];
```

### En Calcular Seña

```javascript
const config = $('LoadConfig').first().json.config;
const precio = input.precio;

const sena = Math.round(precio * (config.RESERVA_SEÑA_PORCENTAJE / 100));
const expira_minutos = config.RESERVA_EXPIRACION_MINUTOS;
const expira_at = new Date(Date.now() + expira_minutos * 60 * 1000).toISOString();
```

### En Mensaje al Cliente

```javascript
const config = $('LoadConfig').first().json.config;
const minutos = config.RESERVA_EXPIRACION_MINUTOS;
const horas = Math.floor(minutos / 60);
const mins = minutos % 60;

const tiempoTexto = horas > 0
  ? `${horas} hora${horas > 1 ? 's' : ''}${mins > 0 ? ` y ${mins} minutos` : ''}`
  : `${mins} minutos`;

const mensaje = `Tu turno está reservado tentativamente. ` +
  `Confirmalo pagando la seña en las próximas ${tiempoTexto}.`;
```

---

## Workflow Scheduled: Limpiar Expirados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW: Leraysi - Cleanup Reservas Expiradas                             │
│  Trigger: Schedule (cada 15 minutos)                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. [Schedule Trigger] ───► Cada 15 minutos                                │
│           │                                                                 │
│           ▼                                                                 │
│  2. [Baserow: Get] ───► TurnosLeraysi                                      │
│     Filtro: estado = "tentativo" AND expira_at < NOW                       │
│           │                                                                 │
│           ▼                                                                 │
│  3. [Loop] Para cada turno expirado:                                       │
│           │                                                                 │
│           ├──► [Odoo MCP] Eliminar evento del calendario                   │
│           │                                                                 │
│           ├──► [Baserow] Update turno: estado = "expirado"                 │
│           │                                                                 │
│           ├──► [Baserow] Update lead: stage = "presupuesto"                │
│           │    (volver al estado anterior)                                  │
│           │                                                                 │
│           └──► [Chatwoot] Enviar mensaje:                                  │
│                "Tu reserva tentativa para el [fecha] expiró.               │
│                 ¿Querés que te reserve otro horario?"                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tabla: TurnosLeraysi (Actualizada)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Auto Number | ID único |
| `lead_id` | Link to LeadsLeraysi | Relación con lead |
| `clienta` | Text | Nombre |
| `telefono` | Text | Teléfono |
| `email` | Email | Email |
| `servicio` | Single Select | Código del servicio |
| `servicio_detalle` | Text | Descripción completa |
| `fecha` | Date | Fecha del turno |
| `hora` | Text | Hora (HH:MM) |
| `duracion_min` | Number | Duración en minutos |
| `precio` | Number | Precio total |
| `sena` | Number | Monto de la seña |
| `estado` | Single Select | tentativo/pendiente_pago/confirmado/completado/cancelado/expirado |
| `odoo_event_id` | Number | ID del evento en Odoo Calendar |
| `mp_payment_id` | Text | ID de pago Mercado Pago |
| `mp_link` | URL | Link de pago |
| `created_at` | Date | Fecha de creación |
| `expira_at` | Date | Fecha de expiración (para tentativos) |
| `confirmado_at` | Date | Fecha de confirmación |
| `notas` | Long Text | Notas adicionales |

---

## Estados del Turno

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   tentativo ────────────► expirado                                         │
│       │                      │                                              │
│       │ (paga)               │ (no pagó a tiempo)                           │
│       ▼                      ▼                                              │
│   confirmado ───────────► cancelado                                        │
│       │                      │                                              │
│       │ (asiste)             │ (cancela)                                    │
│       ▼                      │                                              │
│   completado                 │                                              │
│                              │                                              │
│   ◄──────────────────────────┘                                              │
│   (puede reagendar)                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Ajustar Configuración

### Desde Baserow (UI)

El dueño del salón puede modificar directamente en Baserow:

1. Abrir tabla `ConfigLeraysi`
2. Buscar `RESERVA_EXPIRACION_MINUTOS`
3. Cambiar valor de `120` a `60` (1 hora)
4. Los cambios aplican en la próxima ejecución

### Desde n8n (Admin)

También se puede crear un workflow admin:

```
POST /admin/config
{
  "key": "RESERVA_EXPIRACION_MINUTOS",
  "value": "60"
}
```

---

## Ejemplo de Ajustes Futuros

| Escenario | Config a Ajustar |
|-----------|------------------|
| "Quiero dar más tiempo para pagar" | `RESERVA_EXPIRACION_MINUTOS: 240` (4h) |
| "La seña debe ser 50%" | `RESERVA_SEÑA_PORCENTAJE: 50` |
| "Abrimos hasta las 21h" | `RESERVA_HORARIO_CIERRE: 21:00` |
| "Cerramos sábados y domingos" | `RESERVA_DIAS_CERRADOS: [0, 6]` |
| "Máximo 4 turnos por día" | `RESERVA_MAX_POR_DIA: 4` |
| "No recordar antes de expirar" | `RESERVA_RECORDATORIO_MINUTOS: 0` |

---

*Sistema diseñado para ser flexible y ajustable sin modificar código.*
