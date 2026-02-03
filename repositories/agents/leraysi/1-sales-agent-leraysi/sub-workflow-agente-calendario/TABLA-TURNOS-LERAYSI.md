# Tabla: TurnosLeraysi

Base de datos de turnos del salón Estilos Leraysi.

---

## Información General

| Propiedad | Valor |
|-----------|-------|
| **Database** | Leonobitech |
| **Tabla** | TurnosLeraysi |
| **Relación** | Link a LeadsLeraysi via `clienta_id` |
| **Total campos** | 23 |

---

## Esquema de Campos

| # | Campo | Tipo | Requerido | Descripción |
|---|-------|------|-----------|-------------|
| 1 | `id` | Auto Number | Auto | ID único del turno |
| 2 | `fecha` | Date | ✅ | Fecha del turno (YYYY-MM-DD) |
| 3 | `hora` | Text | ✅ | Hora del turno (HH:MM) |
| 4 | `clienta_id` | Link to LeadsLeraysi | ✅ | Relación con la tabla de leads |
| 5 | `nombre_clienta` | Text | ✅ | Nombre completo de la clienta |
| 6 | `telefono` | Text | ✅ | Teléfono con código país (+54...) |
| 7 | `email` | Email | ❌ | Email para confirmaciones |
| 8 | `servicio` | Multiple Select | ✅ | Servicios solicitados (puede ser más de uno) |
| 9 | `servicio_detalle` | Text | ❌ | Descripción adicional del servicio |
| 10 | `tipo_servicio` | Single Select | ✅ | Categoría de peso del servicio |
| 11 | `duracion_min` | Number | ✅ | Duración total en minutos |
| 12 | `precio` | Number | ✅ | Precio total en ARS |
| 13 | `sena_monto` | Number | ✅ | Monto de la seña (30% del precio) |
| 14 | `sena_pagada` | Boolean | ✅ | Flag: ¿Se pagó la seña? |
| 15 | `estado` | Single Select | ✅ | Estado actual del turno |
| 16 | `mp_payment_id` | Text | ❌ | ID de pago de Mercado Pago |
| 17 | `mp_link` | URL | ❌ | Link de pago generado |
| 18 | `odoo_event_id` | Number | ❌ | ID del evento en Odoo Calendar |
| 19 | `conversation_id` | Number | ❌ | ID de conversación en Chatwoot |
| 20 | `created_at` | Date (con hora) | Auto | Fecha/hora de creación |
| 21 | `expira_at` | Date (con hora) | ❌ | Fecha/hora de expiración (para tentativos) |
| 22 | `confirmado_at` | Date (con hora) | ❌ | Fecha/hora de confirmación de pago |
| 23 | `notas` | Long Text | ❌ | Notas adicionales |

---

## Opciones de Campos Select

### `servicio` (Multiple Select)

| Valor | Descripción |
|-------|-------------|
| `corte` | Corte de cabello |
| `tintura` | Tintura raíz o completa |
| `mechas` | Mechas, balayage |
| `brushing` | Brushing |
| `peinado` | Peinado para evento |
| `tratamiento` | Alisado brasileño, keratina, etc. |
| `manicura` | Manicura tradicional o semipermanente |
| `pedicura` | Pedicura |
| `depilacion` | Depilación |
| `maquillaje` | Maquillaje |
| `otro` | Otro servicio |

### `tipo_servicio` (Single Select)

| Valor | Duración Típica | Descripción |
|-------|-----------------|-------------|
| `liviano` | 60 min | Servicios rápidos (corte, brushing) |
| `medio` | 90 min | Servicios estándar |
| `pesado` | 120 min | Servicios complejos (mechas, tintura) |
| `muy_pesado` | 180 min | Servicios extensos (alisado completo) |

### `estado` (Single Select)

| Valor | Color | Descripción |
|-------|-------|-------------|
| `pendiente_seña` | 🟠 Naranja | Reserva tentativa, esperando pago |
| `confirmado` | 🟡 Amarillo | Seña pagada, turno confirmado |
| `completado` | 🩵 Cyan | Turno realizado |
| `cancelado` | 🔵 Azul | Cancelado por cliente o salón |
| `expirado` | 🔴 Rojo | No pagó a tiempo, reserva expirada |

---

## Diagrama de Estados

```
                    ┌─────────────────┐
                    │ pendiente_seña  │
                    │    (tentativo)  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ confirmado  │   │  expirado   │   │  cancelado  │
    │  (pagó)     │   │ (no pagó)   │   │             │
    └──────┬──────┘   └─────────────┘   └─────────────┘
           │
           ▼
    ┌─────────────┐
    │ completado  │
    │ (asistió)   │
    └─────────────┘
```

---

## Relaciones

### Con LeadsLeraysi (via `clienta_id`)

```
LeadsLeraysi (1) ◄────────► (N) TurnosLeraysi
    │                              │
    ├── row_id                     ├── clienta_id (FK)
    ├── full_name                  ├── nombre_clienta
    ├── phone                      ├── telefono
    ├── email                      ├── email
    └── ...                        └── ...
```

### Con Odoo Calendar (via `odoo_event_id`)

```
TurnosLeraysi.odoo_event_id ──────► Odoo Calendar Event ID
```

### Con Chatwoot (via `conversation_id`)

```
TurnosLeraysi.conversation_id ────► Chatwoot Conversation ID
```

### Con Mercado Pago (via `mp_payment_id`)

```
TurnosLeraysi.mp_payment_id ──────► Mercado Pago Payment ID
```

---

## Flujo de Datos

### Al Crear Turno

```javascript
{
  fecha: "2026-01-24",
  hora: "15:00",
  clienta_id: [73],  // Link a LeadsLeraysi
  nombre_clienta: "Andrea Figueroa",
  telefono: "+5491133851987",
  email: "andrea@gmail.com",
  servicio: ["tratamiento"],
  servicio_detalle: "Alisado brasileño",
  tipo_servicio: "pesado",
  duracion_min: 120,
  precio: 60000,
  sena_monto: 18000,
  sena_pagada: false,
  estado: "pendiente_seña",
  mp_link: "https://mpago.la/2aB3cD4",
  odoo_event_id: 456,
  conversation_id: 390,
  created_at: "2026-01-19T01:30:00Z",
  expira_at: "2026-01-19T03:30:00Z",  // +2 horas
  notas: "Cabello largo, complejidad alta"
}
```

### Al Confirmar Pago

```javascript
{
  sena_pagada: true,
  estado: "confirmado",
  mp_payment_id: "MP123456789",
  confirmado_at: "2026-01-19T02:15:00Z"
}
```

### Al Expirar

```javascript
{
  estado: "expirado",
  notas: "Expiró automáticamente - no pagó en 2 horas"
}
```

---

## Queries Comunes

### Turnos Pendientes de Pago

```
Filtro: estado = "pendiente_seña"
Ordenar: expira_at ASC
```

### Turnos Expirados (para cleanup)

```
Filtro: estado = "pendiente_seña" AND expira_at < NOW
```

### Turnos del Día

```
Filtro: fecha = "2026-01-24" AND estado IN ["confirmado", "pendiente_seña"]
Ordenar: hora ASC
```

### Turnos de una Clienta

```
Filtro: clienta_id = [73]
Ordenar: fecha DESC
```

---

## Índices Recomendados

| Campo(s) | Uso |
|----------|-----|
| `fecha` + `hora` | Buscar turnos por fecha/hora |
| `estado` | Filtrar por estado |
| `clienta_id` | Buscar turnos de una clienta |
| `expira_at` | Cleanup de expirados |
| `conversation_id` | Responder en Chatwoot |

---

## Validaciones

| Campo | Validación |
|-------|------------|
| `fecha` | Debe ser >= hoy |
| `hora` | Formato HH:MM, dentro de horario de atención |
| `precio` | Debe ser > 0 |
| `sena_monto` | Debe ser = precio * 0.30 |
| `duracion_min` | Debe ser > 0 |
| `telefono` | Debe empezar con + |
| `email` | Formato email válido (si se proporciona) |

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-01-19 | Agregados campos: hora, email, servicio_detalle, mp_payment_id, mp_link, conversation_id, expira_at, confirmado_at |
| 2026-01-19 | Campo `servicio` cambiado de Single Select a Multiple Select |
| 2026-01-19 | Agregada opción `expirado` al campo `estado` |

---

*Documentación actualizada: 2026-01-19*
