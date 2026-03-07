# Lógica de Negocio — Estilos Leraysi

Guía de referencia completa del sistema de turnos, precios, disponibilidad y pagos.

**Stack**: n8n + Claude Haiku 3.5 (agentes) + Claude Sonnet (visión) + Odoo 19 + Baserow + MercadoPago

---

## 1. Catálogo de Servicios (15)

### Servicios de Cabello (7) — requieren análisis de imagen

| # | Servicio | base_min | precio_base | Complejidad default |
|---|----------|----------|-------------|---------------------|
| 1 | Corte mujer | 60 min | $8.000 | media |
| 2 | Alisado brasileño | 180 min | $45.000 | muy_compleja |
| 3 | Alisado keratina | 240 min | $55.000 | muy_compleja |
| 4 | Mechas completas | 180 min | $35.000 | muy_compleja |
| 5 | Tintura raíz | 60 min | $15.000 | compleja |
| 6 | Tintura completa | 120 min | $25.000 | muy_compleja |
| 7 | Balayage | 240 min | $50.000 | muy_compleja |

### Servicios sin Cabello (8) — precio y duración fijos

| # | Servicio | base_min | precio_base | Complejidad |
|---|----------|----------|-------------|-------------|
| 8 | Manicura simple | 120 min | $5.000 | media |
| 9 | Manicura semipermanente | 180 min | $8.000 | compleja |
| 10 | Pedicura | 120 min | $6.000 | media |
| 11 | Depilación cera piernas | 120 min | $10.000 | media |
| 12 | Depilación cera axilas | 60 min | $4.000 | simple |
| 13 | Depilación cera bikini | 60 min | $6.000 | simple |
| 14 | Depilación láser piernas | 120 min | $25.000 | media |
| 15 | Depilación láser axilas | 60 min | $12.000 | simple |

> **Fuente**: `ParseInput.js` → `SERVICIOS_CONFIG`

---

## 2. Análisis de Imagen (Claude Sonnet Vision)

Cuando la clienta envía una foto de su cabello, Claude Sonnet Vision extrae:

| Campo | Valores posibles | Uso |
|-------|-----------------|-----|
| `length` (largo) | `corto`, `medio`, `largo` | Precio, duración, complejidad |
| `texture` | `liso`, `ondulado`, `rizado`, `crespo` | Contexto para el agente |
| `condition` | `excelente`, `bueno`, `regular`, `dañado` | Contexto para el agente |
| `current_color` | color detectado | Contexto para recomendaciones |
| `is_dyed` | boolean | Contexto |
| `has_roots` | boolean | Contexto |

**Solo `length` afecta los cálculos**. El resto es informativo para el agente.

### Cuándo se aplica

- **Con imagen**: los 7 servicios de cabello ajustan precio, duración y complejidad según `length`
- **Sin imagen**: se usan los valores base de `SERVICIOS_CONFIG` (sin ajuste)
- **Servicios sin cabello**: nunca se ajustan, siempre usan valores fijos

---

## 3. Cálculo Determinístico de Precio

### Constante

```
PRECIO_MULTIPLICADOR_LARGO = {
  corto:  1.0   (precio base)
  medio:  1.1   (+10%)
  largo:  1.2   (+20%)
}
```

### Fórmula

```
Si requiere_largo Y tiene imagen:
    precio = precio_base × PRECIO_MULTIPLICADOR_LARGO[largo]

Si NO requiere_largo O sin imagen:
    precio = precio_base
```

### Tabla de Precios Finales (ARS)

| Servicio | Base | Corto | Medio (+10%) | Largo (+20%) |
|----------|------|-------|--------------|--------------|
| Corte mujer | $8.000 | $8.000 | $8.800 | $9.600 |
| Alisado brasileño | $45.000 | $45.000 | $49.500 | $54.000 |
| Alisado keratina | $55.000 | $55.000 | $60.500 | $66.000 |
| Mechas completas | $35.000 | $35.000 | $38.500 | $42.000 |
| Tintura raíz | $15.000 | $15.000 | $16.500 | $18.000 |
| Tintura completa | $25.000 | $25.000 | $27.500 | $30.000 |
| Balayage | $50.000 | $50.000 | $55.000 | $60.000 |
| Manicura simple | $5.000 | — | — | — |
| Manicura semipermanente | $8.000 | — | — | — |
| Pedicura | $6.000 | — | — | — |
| Depilación cera piernas | $10.000 | — | — | — |
| Depilación cera axilas | $4.000 | — | — | — |
| Depilación cera bikini | $6.000 | — | — | — |
| Depilación láser piernas | $25.000 | — | — | — |
| Depilación láser axilas | $12.000 | — | — | — |

### Múltiples servicios

Se suman los precios individuales de cada servicio (ya ajustados por largo).

**Ejemplo**: Balayage + Corte mujer, cabello largo:
- Balayage: $50.000 × 1.2 = $60.000
- Corte mujer: $8.000 × 1.2 = $9.600
- **Total: $69.600**

### Safeguard

El precio determinístico (`ParseInput.js`) **siempre sobreescribe** al precio que sugiera el LLM:

```
precio_calculado = calcularPrecio(servicios, largo_cabello)
precioFinal = precio_calculado ?? precio_del_LLM
```

> **Fuente**: `ParseInput.js` → `PRECIO_MULTIPLICADOR_LARGO` + `calcularPrecio()`

---

## 4. Cálculo Determinístico de Duración

### Constante

```
DURACION_EXTRA_LARGO = {
  corto:  +0 min
  medio:  +60 min
  largo:  +120 min
}
```

### Fórmula

```
Si requiere_largo Y tiene imagen:
    duracion = base_min + DURACION_EXTRA_LARGO[largo]

Si NO requiere_largo O sin imagen:
    duracion = base_min

Redondeo final: Math.ceil(duracion / 15) × 15  (múltiplo de 15 min)
```

### Tabla de Duraciones (minutos)

| Servicio | Base | Corto | Medio (+60) | Largo (+120) |
|----------|------|-------|-------------|--------------|
| Corte mujer | 60 | 60 | 120 | 180 |
| Alisado brasileño | 180 | 180 | 240 | 300 |
| Alisado keratina | 240 | 240 | 300 | 360 |
| Mechas completas | 180 | 180 | 240 | 300 |
| Tintura raíz | 60 | 60 | 120 | 180 |
| Tintura completa | 120 | 120 | 180 | 240 |
| Balayage | 240 | 240 | 300 | 360 |
| Manicura simple | 120 | — | — | — |
| Manicura semipermanente | 180 | — | — | — |
| Pedicura | 120 | — | — | — |
| Depilación cera piernas | 120 | — | — | — |
| Depilación cera axilas | 60 | — | — | — |
| Depilación cera bikini | 60 | — | — | — |
| Depilación láser piernas | 120 | — | — | — |
| Depilación láser axilas | 60 | — | — | — |

### Múltiples servicios

Se suman las duraciones individuales (ya ajustadas por largo), luego se redondea a 15 min.

**Ejemplo**: Balayage + Corte mujer, cabello largo:
- Balayage: 240 + 120 = 360 min
- Corte mujer: 60 + 120 = 180 min
- Total: 540 min → redondeo → **540 min (9 horas)**

> **Fuente**: `ParseInput.js` → `DURACION_EXTRA_LARGO` + `calcularDuracion()`

---

## 5. Cálculo de Complejidad

### Constante

```
COMPLEJIDAD_POR_LARGO = {
  corto:  media
  medio:  compleja
  largo:  muy_compleja
}
```

### Jerarquía (de menor a mayor)

```
simple (1) < media (2) < compleja (3) < muy_compleja (4)
```

### Reglas

| Escenario | Complejidad usada |
|-----------|-------------------|
| Servicio de cabello + imagen | `COMPLEJIDAD_POR_LARGO[largo]` |
| Servicio de cabello sin imagen | Complejidad default de `SERVICIOS_CONFIG` |
| Servicio sin cabello | Complejidad fija de `SERVICIOS_CONFIG` (siempre) |
| Múltiples servicios | Se toma la **MÁX** complejidad de todos |

**Ejemplo**: Balayage (muy_compleja default) + Manicura simple (media), cabello medio:
- Balayage con medio → `COMPLEJIDAD_POR_LARGO["medio"]` = compleja
- Manicura simple → media (fija)
- **Resultado: compleja** (la más alta)

> **Fuente**: `ParseInput.js` → `COMPLEJIDAD_POR_LARGO` + `obtenerComplejidadMaxima()`

---

## 6. Seña y Sistema de Pagos

### Seña (depósito para reservar)

```
seña = precio_total × 0.30  (siempre 30%)
```

### Campos en Odoo (`salon.turno`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `precio` | Float | Precio total del turno |
| `sena` | Computed | `precio × 0.30` (readonly, NO writable) |
| `monto_pago_pendiente` | Float | Monto real a cobrar (writable) |
| `total_pagado` | Computed | Suma de pagos aprobados |
| `sena_pagada` | Boolean | Si ya se pagó la seña |

### Turno nuevo

```
precio = calcularPrecio(servicios, largo)
sena = precio × 0.30
monto_pago_pendiente = sena    ← se usa para generar link MP
```

### Agregar servicio a turno existente

```
precioTotal = precioExistente + precioNuevoServicio
senaTotalNueva = precioTotal × 0.30
montoAPagar = senaTotalNueva - totalPagado    ← diferencial

Si montoAPagar > 0:
    monto_pago_pendiente = montoAPagar
    → genera nuevo link MP por la diferencia
```

**Ejemplo**: Turno con Corte mujer (largo) $9.600, seña pagada $2.880.
Agrega Manicura simple $5.000:
- Precio total: $9.600 + $5.000 = $14.600
- Seña total nueva: $14.600 × 0.30 = $4.380
- Monto a pagar: $4.380 - $2.880 = **$1.500**

### Historial de pagos (`salon.turno.pago`)

| Campo | Descripción |
|-------|-------------|
| `mp_payment_id` | ID único de MP (constraint UNIQUE para dedup) |
| `monto` | Monto pagado |
| `tipo` | `sena`, `sena_adicional`, `saldo` |
| `estado` | `approved`, `pending`, `rejected`, `cancelled` |
| `payer_email` | Email del pagador |

> **Fuente**: `crear-turno.tool.ts`, `agregar-servicio-turno.tool.ts`, `salon_turno.py`

---

## 7. Disponibilidad del Calendario

### Parámetros del sistema

| Parámetro | Valor |
|-----------|-------|
| Horario | 09:00 - 19:00 (10 horas) |
| Día cerrado | Domingo |
| Granularidad slots | 30 minutos |
| Cobertura | Próximos 30 días |
| Reserva mismo día | NO permitida |

### Capacidad diaria por complejidad

| Complejidad | Máximo por día |
|-------------|----------------|
| muy_compleja | 2 |
| compleja | 3 |
| media | 4 |
| simple | 5 |
| **Total turnos** | **8** (hard cap) |

### Algoritmo de generación de slots

1. Filtrar días: abiertos (no domingo), con capacidad disponible, mínimo mañana
2. Para cada día, recorrer de 09:00 a 19:00 en pasos de 30 min
3. Verificar que el slot no se solape con turnos existentes
4. Verificar que la complejidad no exceda el límite diario
5. Asignar puntaje (scoring) a cada slot

### Algoritmo de scoring

| Factor | Puntos | Condición |
|--------|--------|-----------|
| Hora exacta solicitada | +10 | El slot coincide con la hora pedida |
| Fecha solicitada | +8 | El slot es en la fecha pedida |
| Preferencia horaria | +5 | Mañana (09-12) o tarde (13-19) según preferencia |
| Adyacencia | +3 | El slot está a ≤30 min de otro turno existente |
| Carga baja | +2 | El día tiene <30% de ocupación |

Se devuelven los **top 3 slots** ordenados por score.

### Jornada completa

Si la duración del servicio supera 600 min (10h), se buscan días con <20% de carga y se ofrecen como "Jornada completa" (09:00-19:00).

> **Fuente**: `AnalizarDisponibilidad.js`

---

## 8. Flujo de Reserva (Two-Call Architecture)

### Turno nuevo (2 pasos)

```
PASO 1: consultar_disponibilidad
  Clienta: "Quiero un turno para balayage"
  → ParseInput calcula: precio, duración, complejidad
  → AnalizarDisponibilidad genera slots con scoring
  → FormatearRespuestaOpciones devuelve 3-5 opciones
  → Respuesta determinística (NO pasa por LLM)
  → Clienta elige una opción

PASO 2: agendar_turno
  Clienta: "Quiero la opción 2, el jueves a las 10"
  → Master Agent llama tool leraysi_crear_turno
  → Odoo crea salon.turno + genera link MP
  → Bot envía link de pago a la clienta
  → Turno queda en estado "pendiente_pago"
  → Expira en 120 minutos si no paga
```

### Agregar servicio (1 paso directo)

```
Clienta: "Además quiero manicura"
  → Master Agent llama tool leraysi_agregar_servicio_turno
  → Recalcula: precio total, duración combinada, complejidad máx
  → Calcula seña diferencial
  → Genera nuevo link MP por la diferencia
  → Bot envía nuevo link de pago
```

### Reprogramar turno (2 pasos)

```
PASO 1: consultar_disponibilidad con accion: "reprogramar"
  → Misma lógica de slots pero excluye la fecha actual del turno
  → Clienta elige nueva fecha

PASO 2: agendar_turno con accion: "reprogramar"
  → Master Agent llama tool leraysi_reprogramar_turno
  → Actualiza fecha/hora en Odoo + calendario
  → No genera nuevo pago (ya pagó la seña)
```

### Datos obligatorios para crear turno

Gate determinístico en ParseInput.js:
- `full_name` — nombre completo de la clienta
- `email` — email para factura y calendario

Si falta alguno, el sistema fuerza modo `consultar_disponibilidad` y el agente pide los datos.

> **Fuente**: `BuildAgentPrompt.js`, `ParseInput.js` (gate)

---

## 9. Generación de Link MercadoPago

### Flujo

```
1. Se crea/actualiza el turno con monto_pago_pendiente
2. Odoo ejecuta action_generar_link_pago():
   - Lee monto_pago_pendiente (o sena como fallback)
   - Crea MP Preference con título, monto, datos del turno
   - Guarda link_pago y mp_preference_id en el turno
3. El link se envía a la clienta por WhatsApp
```

### Parámetros del link

| Parámetro | Valor |
|-----------|-------|
| Monto | `monto_pago_pendiente` o `sena` |
| Expiración | 120 minutos |
| Título | "Seña - [Servicio] - Estilos Leraysi" |
| Webhook | URL de Odoo para notificación de pago |

### Webhook MercadoPago

| Aspecto | Detalle |
|---------|---------|
| Formato | V2 (`?data.id=xxx&type=payment`), rechaza IPN legacy |
| Seguridad | Verifica firma HMAC + consulta API de MP |
| Concurrencia | `SELECT FOR UPDATE` (row lock) antes de dedup |
| Deduplicación | Verifica `mp_payment_id` en `salon.turno.pago` |
| Respuesta | **Siempre HTTP 200** (evita reintentos de MP) |
| Post-proceso | Commit → llama MCP `leraysi_confirmar_pago_completo` |

> **Fuente**: `salon_turno.py` → `action_generar_link_pago()`, `mercadopago_webhook.py`

---

## 10. Confirmación Post-Pago (9 pasos)

Cuando MercadoPago confirma el pago, el webhook de Odoo llama al MCP tool `leraysi_confirmar_pago_completo` que ejecuta:

| Paso | Acción | Detalle |
|------|--------|---------|
| 1 | Confirmar turno | `estado='confirmado'`, `sena_pagada=true`, guardar `mp_payment_id` |
| 2 | Crear/buscar contacto | Busca `res.partner` por email o teléfono, crea si no existe |
| 3 | Vincular a lead CRM | Asocia `partner_id` al `crm.lead`, reemplaza tags de complejidad |
| 4 | Mover lead | Cambia deal stage a "Qualified" |
| 5 | Evento calendario | Si existe `odoo_event_id`: actualiza (con `mail_notrack=true`). Si no: crea nuevo + guarda ID |
| 6 | Factura | Busca borrador existente → agrega línea. Si no existe → crea nueva. Queda en DRAFT |
| 7 | PDF | Genera PDF público de la factura via `render_invoice_pdf()` |
| 8 | Emails | Email a clienta (confirmación + PDF) + email a vendedora (notificación pago) |
| 9 | WhatsApp | Mensaje de confirmación con detalles del turno |

### Agregar servicio a turno existente

En el paso 6, busca la factura borrador existente (`invoice_origin LIKE Turno #${id}`) y **agrega una línea** en vez de crear factura nueva.

### Timezone

- Odoo almacena fechas en **UTC**
- Para display: UTC → Argentina (UTC-3) con `utcToArgentinaDate()`
- Para crear eventos: input en hora Argentina → se suma 3h → se guarda en UTC

> **Fuente**: `confirmar-pago-completo.tool.ts`

---

## 11. Retry Loop — Resiliencia del Master Agent

Si el Master Agent o Output Main fallan (timeout API, rate limit, respuesta malformada), el flujo NO muere. Un retry loop controlado reintenta hasta 3 veces y envía un mensaje fallback si todo falla.

### Flujo

```
Master Agent [error] ──┐
Output Main  [error] ──┤
                       ↓
                RetryController (cuenta intentos, max 3)
                       ↓
                   RetryGate (¿canRetry?)
                  /          \
                true        false
                 ↓            ↓
            RetryWait     FallbackMessage
             (3 seg)      ("Disculpá mi amor, problemita técnico...")
                 ↓            ↓
          RetryPassthrough   Gate → StatePatch → Chatwoot (flujo normal)
          (restaura data)
                 ↓
          Master Agent (loop back)
```

### Mecanismo

| Componente | Implementación |
|------------|---------------|
| Contador de intentos | `$execution.customData.get/set('masterAgentAttempt')` — persiste dentro de la ejecución |
| Error routing | `onError: "continueErrorOutput"` en Master Agent y Output Main — errores van a output index 1 |
| Backoff | Wait node 3 segundos entre reintentos |
| Restauración de datos | `$('Input Main').first().json` — mismo input original en cada reintento |
| Fallback | Mensaje amable en personalidad Leraysi + `state` original sin modificar |

### Nodos (5 nuevos)

| Nodo | Tipo | Función |
|------|------|---------|
| RetryController | Code | Incrementa contador, decide si puede reintentar |
| RetryGate | IF | `canRetry === true` → retry, `false` → fallback |
| RetryWait | Wait | 3 segundos de espera |
| RetryPassthrough | Code | Restaura userPrompt original de Input Main |
| FallbackMessage | Code | Genera respuesta fallback compatible con Gate + StatePatch |

### Mensaje Fallback

> ⋆˚🧝‍♀️ Disculpá mi amor, estoy teniendo un problemita técnico 😅 Dame unos minutitos y ya te respondo 💕

El fallback NO modifica el `state` del lead. Solo envía el mensaje y registra `notes: 'Error técnico - fallback enviado'`.

### Comportamiento

| Escenario | Resultado |
|-----------|-----------|
| Master Agent falla 1 vez, funciona al 2do | Clienta recibe respuesta normal (3s extra de delay) |
| Output Main falla al parsear JSON, funciona al 2do | Idem |
| 3 fallos consecutivos | Clienta recibe mensaje fallback amable |
| Error transitorio API (rate limit, timeout) | Se resuelve solo con el backoff de 3s |

---

## 12. Tablas Rápidas de Referencia

### Tabla Maestra: Servicio × Largo → Todo

| Servicio | Largo | Precio | Duración | Complejidad | Seña (30%) |
|----------|-------|--------|----------|-------------|------------|
| Corte mujer | corto | $8.000 | 60 min | media | $2.400 |
| Corte mujer | medio | $8.800 | 120 min | compleja | $2.640 |
| Corte mujer | largo | $9.600 | 180 min | muy_compleja | $2.880 |
| Alisado brasileño | corto | $45.000 | 180 min | media | $13.500 |
| Alisado brasileño | medio | $49.500 | 240 min | compleja | $14.850 |
| Alisado brasileño | largo | $54.000 | 300 min | muy_compleja | $16.200 |
| Alisado keratina | corto | $55.000 | 240 min | media | $16.500 |
| Alisado keratina | medio | $60.500 | 300 min | compleja | $18.150 |
| Alisado keratina | largo | $66.000 | 360 min | muy_compleja | $19.800 |
| Mechas completas | corto | $35.000 | 180 min | media | $10.500 |
| Mechas completas | medio | $38.500 | 240 min | compleja | $11.550 |
| Mechas completas | largo | $42.000 | 300 min | muy_compleja | $12.600 |
| Tintura raíz | corto | $15.000 | 60 min | media | $4.500 |
| Tintura raíz | medio | $16.500 | 120 min | compleja | $4.950 |
| Tintura raíz | largo | $18.000 | 180 min | muy_compleja | $5.400 |
| Tintura completa | corto | $25.000 | 120 min | media | $7.500 |
| Tintura completa | medio | $27.500 | 180 min | compleja | $8.250 |
| Tintura completa | largo | $30.000 | 240 min | muy_compleja | $9.000 |
| Balayage | corto | $50.000 | 240 min | media | $15.000 |
| Balayage | medio | $55.000 | 300 min | compleja | $16.500 |
| Balayage | largo | $60.000 | 360 min | muy_compleja | $18.000 |
| Manicura simple | — | $5.000 | 120 min | media | $1.500 |
| Manicura semipermanente | — | $8.000 | 180 min | compleja | $2.400 |
| Pedicura | — | $6.000 | 120 min | media | $1.800 |
| Dep. cera piernas | — | $10.000 | 120 min | media | $3.000 |
| Dep. cera axilas | — | $4.000 | 60 min | simple | $1.200 |
| Dep. cera bikini | — | $6.000 | 60 min | simple | $1.800 |
| Dep. láser piernas | — | $25.000 | 120 min | media | $7.500 |
| Dep. láser axilas | — | $12.000 | 60 min | simple | $3.600 |

### Baserow Field IDs — TurnosLeraysi (tabla 852)

| Field ID | Campo | Tipo |
|----------|-------|------|
| 8378 | fecha | Date |
| 8396 | hora | Text |
| 8381 | clienta_id | Number |
| 8383 | nombre_clienta | Text |
| 8384 | telefono | Text |
| 8397 | email | Text |
| 8385 | servicio | Multiple Select |
| 8406 | servicio_detalle | Long Text |
| 8386 | complejidad_maxima | Single Select |
| 8387 | duracion_min | Number |
| 8388 | precio | Number |
| 8389 | sena_monto | Number |
| 8390 | sena_pagada | Boolean |
| 8391 | estado | Single Select |
| 8392 | odoo_event_id | Number |
| 8404 | odoo_turno_id | Number |
| 8393 | created_at | Date |
| 8405 | updated_at | Date |
| 8394 | notas | Long Text |
| 8398 | mp_payment_id | Text |
| 8399 | mp_link | URL |
| 8403 | mp_preference_id | Text |
| 8400 | conversation_id | Number |
| 8401 | expira_at | Date |
| 8402 | confirmado_at | Date |

### Estados del Turno

```
pendiente_pago → confirmado → completado
       ↓              ↓
   cancelado      cancelado
       ↓
    expirado (auto, 120 min sin pago)
```

### Archivos Fuente por Componente

| Componente | Archivo |
|------------|---------|
| Servicios + Precios + Duración + Complejidad | `ParseInput.js` |
| Tabla de precios para el LLM | `Input Main.js` |
| Disponibilidad + Scoring | `AnalizarDisponibilidad.js` |
| Decision tree + Parámetros tools | `BuildAgentPrompt.js` |
| Crear turno + Link MP | `crear-turno.tool.ts` |
| Agregar servicio + Seña diferencial | `agregar-servicio-turno.tool.ts` |
| Confirmación post-pago (9 pasos) | `confirmar-pago-completo.tool.ts` |
| Modelo Odoo turno | `salon_turno.py` |
| Webhook MercadoPago | `mercadopago_webhook.py` |
| Prompt Master Agent | `Master AI Agent-Main.md` |
| Prompt Agente Calendario | `Agente Calendario.md` |
| Retry loop (5 nodos) | Nodos en workflow `7WjUcj8Jms1Rmm1o` |
