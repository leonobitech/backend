# Leraysi Tools - Referencia Completa MCP

Este documento describe la estructura exacta que espera cada tool del conector odoo-mcp para Estilos Leraysi.

---

## Endpoint MCP

```
POST http://odoo_mcp:8100/internal/mcp/call-tool
Header: X-Service-Token: <token>
Content-Type: application/json
```

**Estructura base:**
```json
{
  "tool": "<nombre_tool>",
  "arguments": { ... }
}
```

---

## 1. leraysi_crear_turno

Crea un turno + genera link de pago Mercado Pago.

### Request
```json
{
  "tool": "leraysi_crear_turno",
  "arguments": {
    "clienta": "Andrea Figueroa",
    "telefono": "+5491133851987",
    "servicio": "tratamiento",
    "fecha_hora": "2026-01-22 09:00",
    "precio": 60000,
    "duracion": 2,
    "email": "andrea@gmail.com",
    "notas": "Cabello largo, complejidad alta",
    "servicio_detalle": "Alisado brasileño"
  }
}
```

### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `clienta` | string | ✅ | Nombre completo de la clienta |
| `telefono` | string | ✅ | Teléfono con código país (+54...) |
| `servicio` | enum | ✅ | corte, tintura, mechas, brushing, peinado, tratamiento, manicura, pedicura, depilacion, maquillaje, otro |
| `fecha_hora` | string | ✅ | Formato: "YYYY-MM-DD HH:MM" o "YYYY-MM-DDTHH:MM:SS" |
| `precio` | number | ✅ | Precio total en ARS (debe ser > 0) |
| `duracion` | number | ❌ | Duración en horas (default: 1) |
| `email` | string | ❌ | Email de la clienta |
| `notas` | string | ❌ | Notas adicionales |
| `servicio_detalle` | string | ❌ | Descripción detallada del servicio |

### Response
```json
{
  "success": true,
  "tool": "leraysi_crear_turno",
  "data": {
    "turnoId": 15,
    "clienta": "Andrea Figueroa",
    "fecha_hora": "2026-01-22 09:00",
    "servicio": "tratamiento",
    "precio": 60000,
    "sena": 18000,
    "link_pago": "https://mpago.la/xxxxx",
    "estado": "pendiente_pago",
    "message": "Turno creado exitosamente"
  }
}
```

### Mapeo de Servicios
| Servicio del Input | Código para tool |
|-------------------|------------------|
| Corte mujer / Corte | `corte` |
| Alisado brasileño / Alisado keratina | `tratamiento` |
| Mechas completas / Balayage | `mechas` |
| Tintura raíz / Tintura completa | `tintura` |
| Manicura / Manicura semipermanente | `manicura` |
| Pedicura | `pedicura` |
| Brushing | `brushing` |
| Peinado | `peinado` |
| Depilación | `depilacion` |
| Maquillaje | `maquillaje` |

---

## 2. leraysi_consultar_turnos_dia

Ver todos los turnos de un día específico.

### Request
```json
{
  "tool": "leraysi_consultar_turnos_dia",
  "arguments": {
    "fecha": "2026-01-22",
    "estado": "todos"
  }
}
```

### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha` | string | ✅ | Formato: "YYYY-MM-DD" |
| `estado` | enum | ❌ | pendiente_pago, confirmado, completado, cancelado, todos (default: todos) |

### Response
```json
{
  "success": true,
  "tool": "leraysi_consultar_turnos_dia",
  "data": {
    "fecha": "2026-01-22",
    "total_turnos": 3,
    "turnos": [
      {
        "id": 15,
        "clienta": "Andrea Figueroa",
        "telefono": "+5491133851987",
        "servicio": "tratamiento",
        "hora": "09:00",
        "duracion": 2,
        "precio": 60000,
        "sena_pagada": false,
        "estado": "pendiente_pago"
      }
    ],
    "resumen": {
      "pendientes_pago": 1,
      "confirmados": 2,
      "completados": 0,
      "cancelados": 0,
      "ingresos_esperados": 120000
    }
  }
}
```

---

## 3. leraysi_consultar_disponibilidad

Ver horarios disponibles de un día.

### Request
```json
{
  "tool": "leraysi_consultar_disponibilidad",
  "arguments": {
    "fecha": "2026-01-22",
    "duracion": 2
  }
}
```

### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha` | string | ✅ | Formato: "YYYY-MM-DD" |
| `duracion` | number | ❌ | Duración del servicio en horas (default: 1) |

### Response
```json
{
  "success": true,
  "tool": "leraysi_consultar_disponibilidad",
  "data": {
    "fecha": "2026-01-22",
    "horario_atencion": {
      "apertura": "09:00",
      "cierre": "19:00"
    },
    "turnos_ocupados": [
      {
        "hora_inicio": "09:00",
        "hora_fin": "11:00",
        "servicio": "tratamiento",
        "clienta": "María García"
      }
    ],
    "horarios_disponibles": ["11:00", "13:00", "15:00", "17:00"],
    "mensaje": "4 horarios disponibles para servicios de 2 horas"
  }
}
```

---

## 4. leraysi_confirmar_turno

Confirmar turno cuando la clienta pagó.

### Request
```json
{
  "tool": "leraysi_confirmar_turno",
  "arguments": {
    "turno_id": 15,
    "mp_payment_id": "MP123456789",
    "notas": "Pago recibido vía Mercado Pago"
  }
}
```

### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `turno_id` | number | ✅ | ID del turno a confirmar |
| `mp_payment_id` | string | ❌ | ID de pago de Mercado Pago |
| `notas` | string | ❌ | Notas adicionales |

### Response
```json
{
  "success": true,
  "tool": "leraysi_confirmar_turno",
  "data": {
    "turnoId": 15,
    "clienta": "Andrea Figueroa",
    "estado_anterior": "pendiente_pago",
    "estado_nuevo": "confirmado",
    "fecha_hora": "2026-01-22 09:00",
    "servicio": "tratamiento",
    "message": "Turno confirmado exitosamente"
  }
}
```

---

## 5. leraysi_cancelar_turno

Cancelar un turno existente.

### Request
```json
{
  "tool": "leraysi_cancelar_turno",
  "arguments": {
    "turno_id": 15,
    "motivo": "Cliente canceló por enfermedad",
    "notificar_clienta": true
  }
}
```

### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `turno_id` | number | ✅ | ID del turno a cancelar |
| `motivo` | string | ❌ | Motivo de la cancelación |
| `notificar_clienta` | boolean | ❌ | Enviar notificación a la clienta (default: false) |

### Response
```json
{
  "success": true,
  "tool": "leraysi_cancelar_turno",
  "data": {
    "turnoId": 15,
    "clienta": "Andrea Figueroa",
    "telefono": "+5491133851987",
    "estado_anterior": "confirmado",
    "estado_nuevo": "cancelado",
    "fecha_hora": "2026-01-22 09:00",
    "servicio": "tratamiento",
    "sena_pagada": true,
    "message": "Turno cancelado. La clienta será notificada."
  }
}
```

---

## Errores Comunes

### Bad Request (400)
```json
{
  "error": "invalid_request",
  "message": "Missing 'tool' or 'arguments' in request body"
}
```
**Causa:** El body no tiene la estructura `{ "tool": "...", "arguments": {...} }`

### Validation Error
```json
{
  "error": "validation_error",
  "message": "Teléfono es requerido"
}
```
**Causa:** Falta un campo requerido o tiene formato incorrecto

### Tool Not Found
```json
{
  "error": "tool_not_found",
  "message": "Tool 'leraysi_xyz' not found"
}
```
**Causa:** El nombre de la tool no existe

---

## Notas de Implementación

1. **Seña automática:** `leraysi_crear_turno` calcula automáticamente la seña como 30% del precio
2. **Link de pago:** Se genera automáticamente al crear el turno
3. **Estados del turno:** pendiente_pago → confirmado → completado (o cancelado)
4. **Duraciones sugeridas:**
   - Complejidad baja: 1 hora
   - Complejidad media: 1.5 horas
   - Complejidad alta: 2 horas
   - Complejidad muy_alta: 3 horas
