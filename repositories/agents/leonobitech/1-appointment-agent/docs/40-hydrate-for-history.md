# Nodo 40: HydrateForHistory

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | HydrateForHistory |
| **Tipo** | Merge (Combine) |
| **Función** | Combinar history + profile + state en un solo objeto |
| **Modo** | Combine |
| **Combine By** | All Possible Combinations |

---

## Descripción

**HydrateForHistory** es un nodo **Merge** que une los datos de dos flujos paralelos (Salida A de ComposeProfile y Salida A de LoadProfileAndState) para crear un objeto completo con **history**, **profile** y **state**. Este objeto combinado será usado por el **LLM Analista** o **Agente Master** para generar respuestas contextuales.

Su función principal es:
1. **Combinar datos de 2 inputs**:
   - Input 1: history + lead_id (desde Node 38: Chat History Filter)
   - Input 2: profile + state (desde Node 39: LoadProfileAndState - Salida A)
2. **Crear objeto unificado** con toda la información del lead
3. **Preservar estructura** de ambos inputs sin pérdida de datos

**¿Por qué es necesario este Merge?**

Los flujos paralelos generan datos independientes:
- **Flujo A** (Node 35 → 36-38): Procesa historial de conversación
- **Flujo B** (Node 35 → 39): Carga profile y genera state

**Merge** los une para tener contexto completo.

---

## Configuración

### Parámetros

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| **Mode** | Combine | Combina items de múltiples inputs |
| **Combine By** | All Possible Combinations | Cada item del Input 1 con cada item del Input 2 |
| **Options** | No properties | Sin opciones adicionales |

---

## Input

### Input 1: Chat History Filter (Node 38)

```json
{
  "history": [
    {
      "role": "user",
      "text": "Hola que tal",
      "ts": "2025-10-31T14:05:13.000Z"
    },
    {
      "role": "assistant",
      "text": "¡Hola! Bienvenido a Leonobitech...",
      "ts": "2025-10-31T14:16:42.000Z"
    },
    {
      "role": "user",
      "text": "Si, claro me llamo Felix",
      "ts": "2025-10-31T18:59:47.000Z"
    }
  ],
  "lead_id": 33
}
```

### Input 2: LoadProfileAndState (Node 39 - Salida A)

```json
{
  "profile": {
    "row_id": 198,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": null,
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "explore",
    "priority": "normal",
    "services_seen": 0,
    "prices_asked": 0,
    "deep_interest": 0,
    "proposal_offer_done": false,
    "interests": [],
    "lead_id": 33,
    "chatwoot_id": 186,
    "chatwoot_inbox_id": 186,
    "conversation_id": 190,
    "last_message": "Si, claro me llamo Felix",
    "last_message_id": "2706",
    "last_activity_iso": "2025-10-31T16:39:43.908000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null
  },
  "state": {
    "lead_id": 33,
    "chatwoot_id": 186,
    "full_name": "Felix Figueroa",
    "business_name": null,
    "email": null,
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "explore",
    "interests": [],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": false
  }
}
```

---

## Output

### Estructura de Salida (Objeto Combinado)

```json
[
  {
    "history": [
      {
        "role": "user",
        "text": "Hola que tal",
        "ts": "2025-10-31T14:05:13.000Z"
      },
      {
        "role": "assistant",
        "text": "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?",
        "ts": "2025-10-31T14:16:42.000Z"
      },
      {
        "role": "user",
        "text": "Si, claro me llamo Felix",
        "ts": "2025-10-31T18:59:47.000Z"
      }
    ],
    "lead_id": 33,
    "profile": {
      "row_id": 198,
      "full_name": "Felix Figueroa",
      "phone": "+5491133851987",
      "email": null,
      "channel": "whatsapp",
      "country": "Argentina",
      "tz": "-03:00",
      "stage": "explore",
      "priority": "normal",
      "services_seen": 0,
      "prices_asked": 0,
      "deep_interest": 0,
      "proposal_offer_done": false,
      "interests": [],
      "lead_id": 33,
      "chatwoot_id": 186,
      "chatwoot_inbox_id": 186,
      "conversation_id": 190,
      "last_message": "Si, claro me llamo Felix",
      "last_message_id": "2706",
      "last_activity_iso": "2025-10-31T16:39:43.908000Z",
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "state": {
      "lead_id": 33,
      "chatwoot_id": 186,
      "full_name": "Felix Figueroa",
      "business_name": null,
      "email": null,
      "phone_number": "+5491133851987",
      "country": "Argentina",
      "tz": "-03:00",
      "channel": "whatsapp",
      "stage": "explore",
      "interests": [],
      "last_proposal_offer_ts": null,
      "counters": {
        "services_seen": 0,
        "prices_asked": 0,
        "deep_interest": 0
      },
      "cooldowns": {
        "email_ask_ts": null,
        "addressee_ask_ts": null
      },
      "proposal_offer_done": false
    }
  }
]
```

### Campos del Output

| Campo | Origen | Descripción |
|-------|--------|-------------|
| `history` | Input 1 (Node 38) | Array de mensajes limpios (user/assistant) |
| `lead_id` | Input 1 (Node 38) | ID de la oportunidad en Odoo (duplicado en profile) |
| `profile` | Input 2 (Node 39) | Perfil completo del lead (estructura plana Baserow) |
| `state` | Input 2 (Node 39) | Estado derivado (estructura organizada para decisiones) |

---

## Diagrama de Flujo

```
Node 35: ComposeProfile (2 salidas)
         │
         ├─> Salida A (History Flow)
         │   ├─> Node 36: Register incoming message
         │   ├─> Node 37: Get Chat History from Lead
         │   └─> Node 38: Chat History Filter
         │        │
         │        └─> Output: { history, lead_id }
         │
         └─> Salida B (Profile Flow)
             └─> Node 39: LoadProfileAndState (2 salidas)
                  │
                  └─> Salida A
                       │
                       └─> Output: { profile, state }

         ┌──────────────┴──────────────┐
         │                             │
   Input 1 (history)            Input 2 (profile+state)
         │                             │
         └──────────> MERGE <──────────┘
                        │
                        │  Node 40: HydrateForHistory
                        │  Mode: Combine
                        │  Combine By: All Possible Combinations
                        │
                        v
              Output: { history, lead_id, profile, state }
                        │
                        v
              [Próximo nodo: LLM Analista o Agente Master]
```

---

## Casos de Uso

### Caso 1: Lead Responde Bienvenida (Este Caso)

**Input 1 (history):**
- 3 mensajes: saludo → bienvenida → respuesta con nombre

**Input 2 (profile+state):**
- Lead en stage "explore"
- Counters en 0
- Sin email

**Output combinado:**
- LLM Analista tendrá contexto completo: conversación + datos del lead

**Uso:** Agente Master puede decidir:
- Agradecer por dar su nombre
- Preguntar en qué puede ayudar específicamente
- Consultar RAG si pregunta por servicios

### Caso 2: Lead con Historial Largo

**Input 1 (history):**
- 20+ mensajes de conversación

**Input 2 (profile+state):**
- Stage "qualified"
- Counters: services_seen=5, prices_asked=2
- Interests: ["Web Development", "AI Integration"]

**Output combinado:**
- LLM Analista puede generar resumen de intereses
- Agente Master puede ofrecer propuesta específica

### Caso 3: Lead Retorna Después de Días

**Input 1 (history):**
- Historial completo de hace 3 días

**Input 2 (profile+state):**
- Cooldown email_ask_ts expirado (hace 3 días)
- Stage "explore" (no avanzó)

**Output combinado:**
- Agente Master puede:
  - Recontextualizar conversación previa
  - Intentar mover a "qualified"
  - Volver a pedir email (cooldown expirado)

---

## Ventajas del Merge

### 1. Contexto Completo para LLM

Sin merge, el LLM solo tendría:
- **Opción A**: History sin profile → no sabe datos del lead
- **Opción B**: Profile sin history → no sabe qué se habló

Con merge:
- **History + Profile + State** → contexto completo

### 2. Paralelización de Flujos

Merge permite ejecutar en paralelo:
- **Flujo A**: Operaciones pesadas en Odoo (obtener historial)
- **Flujo B**: Operaciones rápidas (normalizar profile)

**Beneficio:** Reduce latencia total (flujos se ejecutan simultáneamente).

### 3. Separación de Responsabilidades

- **Flujo A**: Se encarga de historial conversacional
- **Flujo B**: Se encarga de estado del lead

**Ventaja:** Código más mantenible, cada flujo tiene una responsabilidad clara.

---

## Performance

### Tiempo de Ejecución

| Operación | Tiempo |
|-----------|--------|
| **Merge operation** | <5ms (n8n combina JSONs) |
| **Total latency** | Max(Flujo A, Flujo B) + 5ms |

**Ejemplo:**
- Flujo A (history): 710ms (Node 37 + 38)
- Flujo B (profile): 25ms (Node 39)
- **Total**: 710ms + 5ms = 715ms (no 735ms, porque son paralelos)

**Beneficio:** 25ms ahorrados vs ejecución secuencial.

### Payload Size

- **Input 1**: ~2KB (history con 3 mensajes)
- **Input 2**: ~1KB (profile + state)
- **Output**: ~3KB (suma de ambos)

**Sin overhead:** Merge no duplica datos, solo combina referencias.

---

## Notas Técnicas

### 1. Combine By: All Possible Combinations

```yaml
Combine By: All Possible Combinations
```

**Implicación:** Si Input 1 tiene N items y Input 2 tiene M items, output tendrá N×M items.

**Caso actual:**
- Input 1: 1 item (history)
- Input 2: 1 item (profile+state)
- **Output: 1×1 = 1 item** ✅

**Caso edge:** Si Input 1 tuviera 2 histories y Input 2 tuviera 3 profiles:
- **Output: 2×3 = 6 items** (combinaciones)

**¿Es correcto?** Sí, porque en este flujo siempre hay 1 item por input.

### 2. lead_id Duplicado

```json
{
  "lead_id": 33,           // Desde Input 1
  "profile": {
    "lead_id": 33,         // Desde Input 2
    ...
  },
  "state": {
    "lead_id": 33          // Desde Input 2
  }
}
```

**Implicación:** `lead_id` aparece 3 veces en el output.

**¿Es problema?** No. Es redundancia intencional para facilitar acceso.

**Uso:**
```javascript
const leadId = $json.lead_id;                // Acceso directo
const leadIdFromProfile = $json.profile.lead_id;  // Acceso desde profile
const leadIdFromState = $json.state.lead_id;      // Acceso desde state
```

### 3. Orden de Campos en Output

El orden de campos en el output es:
1. Campos de Input 1 primero (`history`, `lead_id`)
2. Campos de Input 2 después (`profile`, `state`)

**¿Importa?** No. JSON no tiene orden garantizado de campos.

---

## Próximo Nodo Esperado

Después de HydrateForHistory, el flujo probablemente continúa con:

1. **LLM Analista (GPT-4)** - Analizar history + profile para generar insights
2. **Agente Master (GPT-4)** - Generar respuesta usando history + profile + state + RAG
3. **Extract Metadata** - Extraer datos estructurados del análisis

---

## Debugging y Troubleshooting

### Error: "No items to merge"

**Causa:** Uno de los inputs no tiene items.

**Solución:**
1. Verificar que Node 38 (Input 1) devolvió history
2. Verificar que Node 39 (Input 2) devolvió profile+state
3. Revisar conexiones de los inputs en n8n

### Warning: "Multiple items in output"

**Causa:** Uno de los inputs tiene múltiples items (no esperado en este flujo).

**Debug:**
```javascript
// En nodo siguiente
console.log('[After Merge] Item count:', $input.all().length);
$input.all().forEach((item, idx) => {
  console.log(`Item ${idx}:`, {
    has_history: !!item.json.history,
    has_profile: !!item.json.profile,
    has_state: !!item.json.state,
    lead_id: item.json.lead_id
  });
});
```

### Issue: "Missing profile or state"

**Causa:** Input 2 (LoadProfileAndState) no devolvió profile o state.

**Verificación:**
```javascript
// En nodo siguiente
if (!$json.profile || !$json.state) {
  throw new Error('[HydrateForHistory] Incomplete merge: missing profile or state');
}
```

---

## Mejoras Propuestas

### 1. Validación Post-Merge

```javascript
// Agregar nodo Code después del Merge
const required = ['history', 'profile', 'state', 'lead_id'];
const missing = required.filter(field => !$json[field]);

if (missing.length > 0) {
  throw new Error(`[HydrateForHistory] Missing fields: ${missing.join(', ')}`);
}

// Validar consistencia de lead_id
if ($json.lead_id !== $json.profile?.lead_id || $json.lead_id !== $json.state?.lead_id) {
  console.warn('[HydrateForHistory] lead_id mismatch', {
    root: $json.lead_id,
    profile: $json.profile?.lead_id,
    state: $json.state?.lead_id
  });
}

return [$input.item];
```

### 2. Metadata de Merge

```javascript
// Agregar metadata sobre el merge
return [{
  json: {
    ...$json,
    _merge_metadata: {
      merged_at: new Date().toISOString(),
      input1_source: 'Chat History Filter',
      input2_source: 'LoadProfileAndState',
      history_length: $json.history?.length || 0,
      has_profile: !!$json.profile,
      has_state: !!$json.state
    }
  }
}];
```

### 3. Deduplicación de lead_id

```javascript
// Si se quiere evitar la redundancia
const { lead_id: _, ...profileWithoutLeadId } = $json.profile;
const { lead_id: __, ...stateWithoutLeadId } = $json.state;

return [{
  json: {
    lead_id: $json.lead_id,
    history: $json.history,
    profile: profileWithoutLeadId,
    state: stateWithoutLeadId
  }
}];
```

---

## Arquitectura Completa hasta Aquí

```
ETAPA 4: Update Flow

Node 33: UpdatePayload
    ↓
Node 34: UpdateLeadWithRow_Id
    ↓
Node 35: ComposeProfile (2 salidas)
    ├─> Salida A (History Flow)
    │   ├─> Node 36: Register incoming message (guardar en Odoo)
    │   ├─> Node 37: Get Chat History (obtener desde Odoo)
    │   └─> Node 38: Chat History Filter (limpiar)
    │        │
    │        └─> { history, lead_id }
    │
    └─> Salida B (Profile Flow)
        └─> Node 39: LoadProfileAndState (2 salidas)
             ├─> Salida A
             │   └─> { profile, state }
             │        │
             │        └─> MERGE (Node 40: HydrateForHistory)
             │                 ↓
             │            { history, lead_id, profile, state }
             │
             └─> Salida B
                 └─> ??? (por documentar)
```

---

## Referencias

- **Node 35**: [ComposeProfile](./35-compose-profile.md) - Origen de los 2 flujos paralelos
- **Node 38**: [Chat History Filter](./38-chat-history-filter.md) - Input 1 del merge
- **Node 39**: [LoadProfileAndState](./39-load-profile-and-state.md) - Input 2 del merge

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Status**: ✅ Activo en producción
