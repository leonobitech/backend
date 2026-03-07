# Nodo 4: If_Estado_!=_OFF

## Información General

- **Nombre del nodo**: `If_Estado_!=_OFF`
- **Tipo**: Switch (Condicional)
- **Función**: Verificar que el lead NO tenga estado "OFF" en Chatwoot
- **Entrada**: Salida del nodo `checkIfClientMessage`

## Descripción

Este nodo verifica el **custom attribute `estado`** del contacto en Chatwoot. Si el estado es "OFF", el workflow se detiene (lead desactivado/bloqueado). Si es cualquier otro valor o no existe, continúa el flujo.

Este filtro permite **desactivar temporalmente** la atención automatizada a ciertos leads sin eliminarlos de la base de datos.

## Configuración del Nodo

### Conditions (Condiciones)

```javascript
{{ $json.body.conversation.messages[0].sender.custom_attributes.estado }} is not equal to OFF
```

### Settings
- **Convert types where required**: ✅ Enabled

### Options
- No properties configuradas

## Lógica de Filtrado

### Condición Evaluada
```javascript
$json.body.conversation.messages[0].sender.custom_attributes.estado !== "OFF"
```

### Path de Acceso al Estado
```
body
 └─ conversation
     └─ messages[0]
         └─ sender
             └─ custom_attributes
                 └─ estado  // ⭐ Campo evaluado
```

### Valores posibles y comportamiento:

| Valor de `estado` | ¿Continúa? | Descripción |
|-------------------|-----------|-------------|
| `"OFF"` | ❌ NO | Lead desactivado, se detiene el workflow |
| `"ON"` | ✅ SI | Lead activo, continúa |
| `"PENDING"` | ✅ SI | Cualquier otro valor continúa |
| `undefined` | ✅ SI | Si no existe el atributo, continúa |
| `null` | ✅ SI | Valor nulo, continúa |

## Estructura de Entrada

El nodo busca el `estado` en el objeto `sender` dentro del primer mensaje:

```json
{
  "body": {
    "conversation": {
      "messages": [
        {
          "sender": {
            "id": 186,
            "name": "Felix Figueroa",
            "phone_number": "+5491133851987",
            "custom_attributes": {
              "estado": "OFF"  // ⭐ Campo evaluado
            }
          }
        }
      ]
    }
  }
}
```

## Formato de Salida (JSON)

### ✅ Cuando la condición se cumple (estado ≠ "OFF")

El nodo pasa **exactamente el mismo objeto** sin modificaciones:

```json
[
  {
    "headers": { /* ... */ },
    "body": {
      "event": "message_created",
      "message_type": "incoming",
      "content": "Hola que tal",
      "sender": {
        "id": 186,
        "name": "Felix Figueroa",
        "phone_number": "+5491133851987",
        "custom_attributes": {
          // estado no es "OFF" o no existe
        }
      },
      "conversation": { /* ... */ }
    }
  }
]
```

### ❌ Cuando la condición NO se cumple (estado = "OFF")

El flujo se detiene completamente. El lead no recibe respuesta automática.

## Casos de Uso

### ¿Cuándo se marca un lead como "OFF"?

1. **Cliente solicita no ser contactado**: Opt-out manual
2. **Lead de baja calidad**: Spam, trolling, o comportamiento abusivo
3. **Lead ya convertido**: Cliente existente que no necesita atención del agente
4. **Periodo de espera**: Cooldown temporal después de una venta
5. **Mantenimiento**: Pruebas internas sin procesar mensajes

### Ejemplo de uso en Chatwoot:
```javascript
// Actualizar custom attribute desde Chatwoot UI o API
PATCH /api/v1/accounts/{account_id}/contacts/{contact_id}/custom_attributes
{
  "custom_attributes": {
    "estado": "OFF"
  }
}
```

## Diagrama de Flujo Acumulado

```
┌─────────────┐
│   webhook   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ checkIfMessageCreated   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ checkIfClientMessage    │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ If_Estado_!=_OFF        │ ← ESTAMOS AQUÍ
│ IF: estado !== "OFF"    │
└──────┬──────────────────┘
       │
    ┌──┴──┐
    │     │
   ✅ SI  ❌ NO
    │     │
    │  (Stop - Lead desactivado)
    │
    ▼
[Siguiente Nodo]
```

## Observación Importante

⚠️ **Posible inconsistencia de datos**: El nodo accede a:
```javascript
$json.body.conversation.messages[0].sender.custom_attributes.estado
```

Pero existe también:
```javascript
$json.body.sender.custom_attributes.estado
```

Ambos deberían contener el mismo valor, pero es importante verificar cuál es la fuente de verdad. Recomiendo usar `$json.body.sender.custom_attributes.estado` directamente, ya que:
- Es más directo
- No depende del array `messages[0]`
- Es el objeto principal del sender en el webhook

### Refactor Sugerido:
```javascript
// Versión actual (accede al sender dentro de messages)
{{ $json.body.conversation.messages[0].sender.custom_attributes.estado }}

// Versión recomendada (accede al sender principal)
{{ $json.body.sender.custom_attributes.estado }}
```

## Estado Actual del Flujo

Después de pasar estos 4 nodos, tenemos garantizado:
1. ✅ Es un evento de mensaje creado
2. ✅ Es un mensaje entrante del cliente
3. ✅ El lead NO está en estado "OFF"
4. ✅ El mensaje puede ser procesado por el agente

## Próximo Nodo Esperado

Ahora que sabemos que el lead está activo, el siguiente paso lógico debería ser:

1. **Consultar Baserow**: Verificar si el lead existe por `phone_number`
2. O **Consultar Odoo**: Verificar si ya hay una oportunidad abierta

---

**Documentado el**: 2025-10-31
**Estado**: ✅ Completado
**Salida**: Objeto webhook sin modificar (solo si `estado !== "OFF"`)
**Refactor recomendado**: Cambiar path de acceso a `$json.body.sender.custom_attributes.estado`
