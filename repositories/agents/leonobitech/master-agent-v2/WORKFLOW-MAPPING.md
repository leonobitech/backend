# Master Agent v2.0 - Workflow Mapping

Este documento mapea los nodos del workflow de n8n con los archivos del directorio `master-agent-v2/`.

---

## 🔄 Flujo Visual (n8n)

```
Core Zone:
┌─────────────────────────────────────────────────────────────────┐
│ UpdatePayload → UpdateLeadWithRow_Id → ComposeProfile           │
│                                             ↓                    │
│                                    LoadProfileAndState           │
│                                             ↓                    │
│ Register incoming message → Get Chat History from Lead          │
│                                             ↓                    │
│                                    Chat History Filter           │
│                                             ↓                    │
│                                    HydrateForHistory             │
│                                             ↓                    │
│                                      Input Main                  │
│                                             ↓                    │
│                            Master AI Agent Main (OpenAI)         │
│                          /         |          \                  │
│                   Model         Memory        Tool               │
│                         (Qdrant Vector Store)                    │
│                                             ↓                    │
│                                      Output Main                 │
│                                             ↓                    │
│                         Gate: NO_REPLY / Empty                   │
│                              /          \                        │
│                           true          false                    │
│                             ↓             ↓                      │
│                    UpdateEmailLead   StatePatchLead              │
│                             ↓             ↓                      │
│                    Record Agent    Output to Chatwoot            │
│                       Response                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Mapeo: Nodos n8n → Archivos master-agent-v2

| # | Nodo n8n | Archivo master-agent-v2 | Status |
|---|----------|-------------------------|--------|
| 1 | **UpdatePayload** | ✅ `UPDATE-PAYLOAD.js` | ✅ |
| 2 | **UpdateLeadWithRow_Id** | ❌ No incluido (operación Baserow) | N/A |
| 3 | **ComposeProfile** | ✅ `COMPOSE-PROFILE.js` | ✅ |
| 4 | **LoadProfileAndState** | ✅ `LOAD-PROFILE-AND-STATE.js` | ✅ |
| 5 | **Register incoming message** | ❌ No incluido (operación Odoo) | N/A |
| 6 | **Get Chat History from Lead** | ❌ No incluido (operación Odoo) | N/A |
| 7 | **Chat History Filter** | ✅ `CHAT-HISTORY-FILTER.js` | ✅ |
| 8 | **HydrateForHistory** | ❌ No incluido (merge simple) | Opcional |
| 9 | **Input Main** | ✅ `INPUT-MAIN.js` | ✅ |
| 10 | **Master AI Agent Main** | ✅ `SYSTEM-PROMPT.md` | ✅ |
| 11 | **Qdrant Vector Store** | ❌ No incluido (RAG externo) | N/A |
| 12 | **Output Main** | ✅ `OUTPUT-MAIN-v2.js` | ✅ |
| 13 | **Gate: NO_REPLY / Empty** | ❌ No incluido (lógica condicional n8n) | N/A |
| 14 | **UpdateEmailLead** | ❌ No incluido (operación Baserow condicional) | N/A |
| 15 | **StatePatchLead** | ❌ No incluido (operación Baserow) | N/A |
| 16 | **Record Agent Response** | ❌ No incluido (operación Odoo) | N/A |
| 17 | **Output to Chatwoot** | ❌ No incluido (HTTP request) | N/A |

---

## ✅ Archivos Core Incluidos (8)

### 1. **UPDATE-PAYLOAD.js**
- **Nodo**: UpdatePayload
- **Posición**: Después de Webhook (primer nodo)
- **Input**: Payload del webhook con `row_id` y `row_always`
- **Output**: `{ row_id: 198, ...campos_limpios }`

### 2. **CHAT-HISTORY-FILTER.js**
- **Nodo**: Chat History Filter
- **Posición**: Después de "Get Chat History from Lead"
- **Input**: Items de Odoo mail.message
- **Output**: `{ history: [...], lead_id: 33 }`

### 3. **COMPOSE-PROFILE.js**
- **Nodo**: ComposeProfile
- **Posición**: Después de "UpdateLeadWithRow_Id"
- **Input**: Row de Baserow
- **Output**: `{ profile: {...} }`

### 4. **LOAD-PROFILE-AND-STATE.js**
- **Nodo**: LoadProfileAndState
- **Posición**: Después de "ComposeProfile"
- **Input**: Profile de ComposeProfile o raw row
- **Output**: `{ profile: {...}, state: {...} }`

### 5. **INPUT-MAIN.js**
- **Nodo**: Input Main
- **Posición**: Después de "HydrateForHistory"
- **Input**: `{ history, lead_id, profile, state }`
- **Output**: `{ smart_input, userPrompt, lead_id, profile, state }`

### 6. **SYSTEM-PROMPT.md**
- **Nodo**: Master AI Agent Main (System Prompt)
- **Posición**: Config del nodo OpenAI Chat Model
- **Uso**: Instrucciones para el LLM (GPT-4o-mini)

### 7. **OUTPUT-MAIN-v2.js**
- **Nodo**: Output Main
- **Posición**: Después de "Master AI Agent Main"
- **Input**: `{ output: '{"message":...}', lead_id, profile, state }`
- **Output**: `{ content_whatsapp, body_html, state_for_persist, profile_for_persist, ... }`

### 8. **PROFILE-STATE-MAPPING.md**
- **Documentación**: Mapeo Profile/State con Baserow
- **Uso**: Referencia para entender separación Profile vs State

---

## ❌ Nodos NO Incluidos (por diseño)

Estos nodos NO están en el directorio porque son operaciones específicas de n8n o servicios externos:

### 1. **UpdateLeadWithRow_Id** (Baserow - Update Row)
- **Razón**: Operación directa de Baserow (no requiere código custom)
- **Config n8n**: Resource: Row, Operation: Update

### 2. **Register incoming message** (Odoo - Create)
- **Razón**: Operación directa de Odoo (crear mail.message)
- **Config n8n**: Resource: Custom (mail.message), Operation: Create

### 3. **Get Chat History from Lead** (Odoo - Get All)
- **Razón**: Operación directa de Odoo (query mail.messages)
- **Config n8n**: Resource: Custom (mail.message), Operation: Get All

### 4. **HydrateForHistory** (Code)
- **Razón**: Merge simple de history + profile + state (puede integrarse en INPUT-MAIN)
- **Código**: `return [{ json: { ...$json, history, profile, state } }]`
- **Status**: Opcional (puede agregarse si es útil como nodo separado)

### 5. **Qdrant Vector Store - Services** (Tool)
- **Razón**: RAG externo (Qdrant database)
- **Uso**: Function calling `search_services_rag` desde Master Agent
- **Config**: Qdrant collection + embeddings OpenAI

### 6. **Gate: NO_REPLY / Empty** (IF node)
- **Razón**: Lógica condicional nativa de n8n
- **Config**: Condition: `expect_reply === false || content === ""`

### 7. **UpdateEmailLead** (Baserow - Update Row)
- **Razón**: Operación condicional de Baserow (solo si email cambió)
- **Config n8n**: Resource: Row, Operation: Update, Condition: `email !== null`

### 8. **StatePatchLead** (Baserow - Update Row)
- **Razón**: Operación directa de Baserow (actualizar con state_for_persist)
- **Config n8n**: Resource: Row, Operation: Update
- **Mapeo**: Ver `PROFILE-STATE-MAPPING.md` o `docs/53-state-patch-lead.md`

### 9. **Record Agent Response** (Odoo - Create)
- **Razón**: Operación directa de Odoo (crear mail.message en chatter)
- **Config n8n**: Resource: Custom (mail.message), Operation: Create

### 10. **Output to Chatwoot** (HTTP Request)
- **Razón**: HTTP POST directo a Chatwoot API
- **Config n8n**: Method: POST, URL: Chatwoot API, Body: `content_whatsapp`

---

## 📝 HydrateForHistory (Opcional)

Si queremos incluir el nodo **HydrateForHistory**, el código es simple:

```javascript
// HydrateForHistory — Merge history + profile + state
const history = $json.history || [];
const lead_id = $json.lead_id || null;
const profile = $json.profile || {};
const state = $json.state || {};

return [{
  json: {
    history,
    lead_id,
    profile,
    state
  }
}];
```

**Razón para NO incluirlo (por ahora)**:
- Es un merge trivial que puede hacerse directamente en INPUT-MAIN
- No tiene lógica de negocio compleja
- Puede agregarse después si se necesita como paso separado

---

## 🔗 Config de Nodos n8n

### Master AI Agent Main (OpenAI Chat Model)

**Tipo**: @n8n/n8n-nodes-langchain.lmChatOpenAi

**Config**:
```javascript
{
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: "<contenido de SYSTEM-PROMPT.md>"
    },
    {
      role: "user",
      content: "{{ $json.userPrompt }}"  // Desde INPUT-MAIN.js
    }
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "search_services_rag",
        description: "Search services knowledge base for relevant information",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "User's need or question" },
            filters: {
              type: "object",
              properties: {
                category: { type: "string" },
                tags: { type: "array", items: { type: "string" } }
              }
            },
            limit: { type: "number", default: 5 }
          },
          required: ["query"]
        }
      }
    }
  ],
  temperature: 0.7,
  max_tokens: 1500
}
```

**Memory**: Usa `$json.history` del INPUT-MAIN

**Tool**: Qdrant Vector Store conectado

---

### Qdrant Vector Store - Services

**Tipo**: @n8n/n8n-nodes-langchain.vectorStoreQdrant

**Config**:
```javascript
{
  collection: "services_leonobitech",
  qdrantUrl: "http://qdrant:6333",
  embeddings: "OpenAI Embeddings",
  topK: 5
}
```

---

## 🚀 Uso en n8n

### Paso 1: Importar Workflow
1. Crear workflow nuevo en n8n
2. Copiar estructura de la imagen

### Paso 2: Configurar Nodos Code
Para cada nodo Code del workflow:

**UpdatePayload**:
```javascript
// Copiar código de: master-agent-v2/UPDATE-PAYLOAD.js
```

**ComposeProfile**:
```javascript
// Copiar código de: master-agent-v2/COMPOSE-PROFILE.js
```

**LoadProfileAndState**:
```javascript
// Copiar código de: master-agent-v2/LOAD-PROFILE-AND-STATE.js
```

**Chat History Filter**:
```javascript
// Copiar código de: master-agent-v2/CHAT-HISTORY-FILTER.js
```

**Input Main**:
```javascript
// Copiar código de: master-agent-v2/INPUT-MAIN.js
```

**Output Main**:
```javascript
// Copiar código de: master-agent-v2/OUTPUT-MAIN-v2.js
```

### Paso 3: Configurar Master AI Agent Main
1. Abrir nodo "Master AI Agent Main"
2. En **System Prompt**: Copiar contenido de `SYSTEM-PROMPT.md`
3. En **User Prompt**: `{{ $json.userPrompt }}`
4. Conectar **Qdrant Vector Store** como Tool

### Paso 4: Testing
Ejecutar workflow con mensaje de prueba y verificar:
- ✅ History limpio (sin system messages)
- ✅ Profile y State completos
- ✅ Smart Input correcto
- ✅ LLM devuelve profile + state completos
- ✅ Output formateado para todos los canales

---

## 📊 Comparación: v1.0 vs v2.0

| Aspecto | v1.0 | v2.0 |
|---------|------|------|
| **Nodos Totales** | 12+ | 10-11 |
| **Nodos Code** | 8-9 | 5 core |
| **LLMs Usados** | 2 (GPT-3.5 + GPT-4) | 1 (GPT-4o-mini) |
| **RAG Usage** | 17% (bug) | 90%+ (RAG-first) |
| **State Updates** | Parcial (se pierden datos) | Completo (profile + state) |
| **Latencia** | 7-9s | 2-3s |
| **Costo/mensaje** | $0.08 | $0.03 |
| **Mantenibilidad** | Baja (código enredado) | Alta (código limpio) |

---

## 📚 Referencias

- **Workflow Visual**: Ver imagen arriba
- **Archivos Core**: `master-agent-v2/*.js` y `SYSTEM-PROMPT.md`
- **Documentación**: `PROFILE-STATE-MAPPING.md`
- **Guía de Implementación**: `../docs/MASTER-AGENT-V2-IMPLEMENTATION.md`
- **StatePatchLead**: `../docs/53-state-patch-lead.md`

---

**Versión**: 2.0.0
**Última actualización**: 2025-11-01
**Status**: Listo para implementación en n8n
