# ETAPA 3: Register Leads (Baserow/Odoo)

**Rango de nodos**: 18-32 (15 nodos)
**Estado**: ✅ Completada y documentada
**Función**: Registrar nuevos leads en Baserow y Odoo, generar respuesta de bienvenida con IA, y enviar a WhatsApp

---

## Descripción General

La **ETAPA 3** es el núcleo del sistema de gestión de leads. Su función es:

1. **Buscar o crear leads** en Baserow (estado/perfil del lead)
2. **Crear oportunidades** en Odoo CRM (historial de conversación)
3. **Generar respuesta de bienvenida** usando IA (GPT-3.5-turbo + RAG)
4. **Registrar conversación** en Odoo chatter (cliente + bot)
5. **Enviar respuesta** al cliente vía WhatsApp

**Entrada**: Mensaje normalizado del cliente (desde ETAPA 2: Buffer Messages)
**Salida**: Lead registrado, mensaje enviado a WhatsApp, historial almacenado

---

## Arquitectura de la Etapa

### Flujo Principal (Create Flow)

```
┌──────────────────────────────────────────────────────────────────┐
│                  ETAPA 3: REGISTER LEADS                         │
│                                                                  │
│  ┌────────────────────┐                                         │
│  │ 18. Build Lead Row │ ← Construir estructura upsert-safe      │
│  └────────┬───────────┘                                         │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────┐                                        │
│  │ 19. FindByChatwoot  │ ← Buscar lead existente en Baserow    │
│  └────────┬────────────┘                                        │
│           │                                                      │
│           ▼                                                      │
│  ┌────────────────────┐                                         │
│  │ 20. PickLeadRow    │ ← Normalizar respuesta Baserow         │
│  └────────┬───────────┘                                         │
│           │                                                      │
│           ▼                                                      │
│  ┌────────────────────┐                                         │
│  │ 21. MergeForUpdate │ ← Combinar datos (Build + Pick)        │
│  └────────┬───────────┘                                         │
│           │                                                      │
│           ▼                                                      │
│  ┌────────────────────────────────┐                             │
│  │ 22. checkIfLeadAlreadyReg      │ ← Bifurcación              │
│  └─────┬──────────────────────┬───┘                             │
│        │                      │                                 │
│  exists=false          exists=true                              │
│  (CREATE FLOW)         (UPDATE FLOW - pendiente doc)            │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────────────┐                                         │
│  │ 23. CreatePayload  │ ← Sanitizar datos                      │
│  └────────┬───────────┘                                         │
│           │                                                      │
│           ▼                                                      │
│  ┌───────────────────────┐                                      │
│  │ 24. createLeadBaserow │ ← Insertar en Baserow               │
│  └────────┬──────────────┘                                      │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────┐                                   │
│  │ 25. CreatePayloadOdoo    │ ← Adaptar schema para Odoo       │
│  └────────┬─────────────────┘                                   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────┐                                       │
│  │ 26. CreateLeadOdoo   │ ← Crear oportunidad en Odoo CRM      │
│  └────────┬─────────────┘                                       │
│           │                                                      │
│           ▼                                                      │
│  ┌───────────────────────────┐                                  │
│  │ 27. UpdateLeadWithLead_Id │ ← Enlace Baserow ↔ Odoo         │
│  └────────┬──────────────────┘                                  │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────┐                                       │
│  │ 28. Create an Item   │ ← Mensaje del cliente en chatter     │
│  └────────┬─────────────┘                                       │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────┐                                    │
│  │ 29. AI Agent Welcome    │ ← Generar respuesta con LLM + RAG │
│  │     (GPT-3.5-turbo)     │                                    │
│  └────────┬────────────────┘                                    │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────┐                                   │
│  │ 30. Filter Output Initial│ ← Formatear dual (HTML/WhatsApp) │
│  └────────┬─────────────────┘                                   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────┐                                       │
│  │ 31. Create an item1  │ ← Mensaje del bot en chatter         │
│  └────────┬─────────────┘                                       │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────┐                                       │
│  │ 32. HTTP Request     │ ← Enviar a WhatsApp vía Chatwoot API │
│  └──────────────────────┘                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Nodos Documentados

### **Fase 1: Construcción y Búsqueda**

#### [18. Build Lead Row](./18-build-lead-row.md)
- **Tipo**: Code
- **Función**: Construir 4 estructuras de datos (keys, row_on_create, row_always, row_upsert)
- **Patrón**: Upsert-safe architecture
- **Output**: Estructura preparada para crear/actualizar lead
- **Campos generados**: chatwoot_id, phone_number, full_name, email, country, timezone, stage, services_seen, prices_asked, etc.

#### [19. FindByChatwootId](./19-find-by-chatwoot-id.md)
- **Tipo**: Baserow Get Many
- **Función**: Buscar lead existente por chatwoot_id
- **Filter**: `chatwoot_id = {{ $json.keys.chatwoot_id }}`
- **Output**: Array de resultados (vacío si no existe)

#### [20. PickLeadRow](./20-pick-lead-row.md)
- **Tipo**: Code
- **Función**: Normalizar respuesta de Baserow y determinar si el lead existe
- **Output**: `{ exists: boolean, row_id: number|null, row: object|null, count: number }`
- **Patrón**: Field projection + existence check

---

### **Fase 2: Decisión y Preparación**

#### [21. MergeForUpdate](./21-merge-for-update.md)
- **Tipo**: Merge
- **Función**: Combinar datos de PickLeadRow (existencia) y Build Lead Row (datos nuevos)
- **Mode**: Combine All Possible Combinations
- **Output**: Un item con ambos datasets combinados

#### [22. checkIfLeadAlreadyRegistered](./22-check-if-lead-already-registered.md)
- **Tipo**: Switch (IF)
- **Función**: Bifurcar flujo según si el lead existe
- **Condición**: `{{ $json.exists }}` is true
- **Rutas**:
  - **true**: Update Flow (leads existentes) - *pendiente documentar*
  - **false (Fallback)**: Create Flow (nuevos leads) - *documentado*

---

### **Fase 3: Registro en Baserow**

#### [23. CreatePayload](./23-create-payload.md)
- **Tipo**: Code
- **Función**: Sanitizar y validar datos antes de insertar en Baserow
- **Validaciones**:
  - Eliminar campos undefined/null
  - Validar Single Select (stage)
  - Normalizar Multi Select (interests)
  - Limpiar emails vacíos
  - Remover lead_id=0
- **Output**: Payload limpio y validado

#### [24. createLeadBaserow](./24-create-lead-baserow.md)
- **Tipo**: Baserow Create
- **Función**: Insertar nuevo lead en tabla Leads de Baserow
- **Database**: Leonobitech
- **Table**: Leads
- **Output**: Lead completo con ID asignado (ej.: ID 198)

---

### **Fase 4: Registro en Odoo CRM**

#### [25. CreatePayloadOdoo](./25-create-payload-odoo.md)
- **Tipo**: Code
- **Función**: Adaptar schema de Baserow a Odoo
- **Transformaciones clave**:
  - Single Select objects → string values
  - Phone E.164 format
  - Deducción de ubicación por área code (ej.: 11 → Buenos Aires, CABA)
  - Mapeo de country_id y state_id a IDs de Odoo
  - Tag_ids en formato Many2many `[[6, 0, [1]]]`
- **Output**: Payload compatible con Odoo API

#### [26. CreateLeadOdoo](./26-create-lead-odoo.md)
- **Tipo**: Odoo Create Lead
- **Función**: Crear oportunidad (lead) en Odoo CRM
- **Resource**: Custom Resource - Lead (crm.lead)
- **Campos**: name, contact_name, phone, email, country_id, state_id, city, tag_ids, etc.
- **Output**: Lead de Odoo con ID asignado (ej.: ID 33)

#### [27. UpdateLeadWithLead_Id](./27-update-lead-with-lead-id.md)
- **Tipo**: Baserow Update
- **Función**: Enlazar Baserow con Odoo (actualizar campo lead_id)
- **Row ID**: Desde CreatePayloadOdoo
- **Field**: lead_id = ID de Odoo
- **Output**: Lead de Baserow actualizado con enlace bidireccional
- **Patrón**: Bidirectional linking (Baserow ↔ Odoo)

---

### **Fase 5: Registro de Mensaje del Cliente**

#### [28. Create an Item](./28-create-an-item.md)
- **Tipo**: Odoo Create Message
- **Función**: Registrar mensaje inicial del cliente en chatter de Odoo
- **Model**: mail.message
- **Campos**:
  - `model`: 'crm.lead'
  - `res_id`: ID del lead (33)
  - `body`: `<p><strong>Cliente: </strong>{{ mensaje }}</p>`
  - `message_type`: 'comment'
  - `subtype_id`: 1 (Discussions)
- **Output**: Message ID (ej.: 1041)

---

### **Fase 6: Generación de Respuesta con IA**

#### [29. AI Agent Welcome](./29-ai-agent-welcome.md)
- **Tipo**: OpenAI AI Agent
- **Modelo**: GPT-3.5-turbo
- **Función**: Generar respuesta de bienvenida personalizada
- **System Message**:
  - Rol: "Leonobit", agente de Leonobitech
  - Objetivo: Bienvenida + solicitar nombre
  - Restricciones: Max 2 frases, no listas, no inventar datos
  - Decisiones: A) Ambiguo → bienvenida, B) Servicios → RAG, C) Spam → rechazo
- **Tool**: Qdrant Vector Store (RAG condicional para servicios)
- **Input**: `{{ $('Webhook').item.json.body.conversation.messages[0].content }}`
- **Output**: `{ "output": "¡Hola! Bienvenido a Leonobitech..." }`

**Ejemplo de output**:
```
¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?
```

---

### **Fase 7: Formateo Dual de Respuesta**

#### [30. Filter Output Initial](./30-filter-output-initial.md)
- **Tipo**: Code
- **Función**: Transformar respuesta del AI Agent a dos formatos (HTML y WhatsApp)
- **Transformaciones**:
  1. **HTML para Odoo**:
     - Envolver en `<p>` con prefijo `<strong>🤖 Leonobit:</strong>`
     - Convertir `\n` → `<br>`
  2. **Texto para WhatsApp**:
     - Normalizar saltos de línea
     - Convertir `**bold**` → `*bold*`
     - Convertir `\n* ` → `\n• `
     - Agregar prefijo "Leonobit 🤖:\n"
- **Data Reintegration**: `lead_id` desde UpdateLeadWithLead_Id
- **Output**: `{ body_html, content_whatsapp, lead_id }`

---

### **Fase 8: Almacenamiento y Envío**

#### [31. Create an item1](./31-create-an-item1.md)
- **Tipo**: Odoo Create Message
- **Función**: Registrar respuesta del bot en chatter de Odoo
- **Model**: mail.message
- **Campos**:
  - `model`: 'crm.lead'
  - `res_id`: {{ $json.lead_id }}
  - `body`: {{ $json.body_html }}
  - `message_type`: 'comment'
  - `subtype_id`: 1
- **Output**: Message ID (ej.: 1042)
- **Diferencia con nodo 28**: Nodo 28 registra mensaje del **cliente**, este registra mensaje del **bot**

#### [32. HTTP Request](./32-http-request-chatwoot.md)
- **Tipo**: HTTP Request
- **Función**: Enviar respuesta del bot a WhatsApp vía Chatwoot API
- **Method**: POST
- **URL**: `http://chatwoot:3000/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`
- **Auth**: Header Auth (api_access_token)
- **Body**: `{ "content": "{{ content_whatsapp }}" }`
- **Output**:
  ```json
  {
    "id": 2705,
    "status": "sent",
    "sender": { "name": "Leonobit" }
  }
  ```
- **Flujo**: n8n → Chatwoot API → WhatsApp Business API → Cliente

---

## Estado del Sistema después de ETAPA 3

### **Baserow: Tabla Leads**
```
ID  | chatwoot_id | phone_number     | full_name | lead_id | stage   | last_message
----+-------------+------------------+-----------+---------+---------+-------------
198 | 123         | +5491112345678   | (null)    | 33      | explore | Hola que tal
```

### **Odoo CRM: crm.lead**
```
ID | name                    | contact_name | phone          | stage_id
---+-------------------------+--------------+----------------+---------
33 | Lead - whatsapp:+549... | (null)       | +5491112345678 | 1 (New)
```

### **Odoo Chatter: mail.message**
```
ID   | model     | res_id | body                                    | message_type
-----+-----------+--------+-----------------------------------------+-------------
1041 | crm.lead  | 33     | <p><strong>Cliente:</strong>Hola...</p> | comment
1042 | crm.lead  | 33     | <p><strong>🤖 Leonobit:</strong>...</p> | comment
```

### **Chatwoot: messages**
```
ID   | conversation_id | content                          | message_type | status
-----+-----------------+----------------------------------+--------------+-------
2704 | 190             | Hola que tal                     | 0 (incoming) | read
2705 | 190             | Leonobit 🤖:\n¡Hola! Bienvenido...| 1 (outgoing) | sent
```

### **WhatsApp (Cliente)**
```
┌─────────────────────────────────────┐
│ Leonobit 🤖:                        │
│ ¡Hola! Bienvenido a Leonobitech,   │
│ donde usamos IA para automatizar    │
│ la atención y procesos de tu        │
│ negocio. ¿Me puedes decir tu nombre │
│ para ayudarte mejor?                │
└─────────────────────────────────────┘
```

---

## Patrones Técnicos Identificados

### **1. Upsert-Safe Architecture**
**Nodo**: 18 (Build Lead Row)

Separa campos en tres categorías:
- `row_on_create`: Solo se usan al crear (ej.: first_interaction)
- `row_always`: Siempre se actualizan (ej.: last_message)
- `row_upsert`: Combinación de ambos

**Beneficio**: Evita sobrescribir datos históricos en updates.

---

### **2. Data Reintegration Pattern**
**Nodos**: 30, 32

Acceso a datos de nodos previos usando `$('NodeName')`:
```javascript
const leadId = $('UpdateLeadWithLead_Id').first().json.lead_id;
const accountId = $('Webhook').item.json.body.account_id;
```

**Beneficio**: Reduce necesidad de nodos Merge, simplifica flujo.

---

### **3. Bidirectional Linking**
**Nodos**: 24, 26, 27

Crear registros en dos sistemas y enlazarlos:
1. Crear en Baserow → ID 198
2. Crear en Odoo → ID 33
3. Actualizar Baserow con lead_id = 33

**Beneficio**: Navegación bidireccional, sincronización de datos.

---

### **4. Dual Format Transformer**
**Nodo**: 30 (Filter Output Initial)

Transforma un mensaje a múltiples formatos:
- HTML para Odoo chatter
- Texto plano para WhatsApp

**Beneficio**: Single Source of Truth, consistencia semántica.

---

### **5. Schema Adaptation**
**Nodo**: 25 (CreatePayloadOdoo)

Convierte estructuras entre sistemas:
- Baserow Single Select (object con {id, value, color}) → Odoo (string value)
- Baserow Multi Select (array de strings) → Odoo (array de IDs)

**Beneficio**: Interoperabilidad entre sistemas heterogéneos.

---

### **6. Location Deduction**
**Nodo**: 25 (CreatePayloadOdoo)

Deduce ubicación del cliente desde phone number:
```javascript
const area = phoneDigits.slice(0, 2);  // "11"
if (ODOO.Argentina.state_id_by_area[area]) {
  state_id = ODOO.Argentina.state_id_by_area[area];  // 1 (CABA)
  city = 'Buenos Aires';
}
```

**Beneficio**: Enriquecimiento automático de datos sin solicitar al cliente.

---

### **7. AI-Powered Response Generation**
**Nodo**: 29 (AI Agent Welcome)

Usa LLM para generar respuestas contextuales:
- Detección de intención (ambiguo/servicios/spam)
- Consulta RAG condicional (Qdrant Vector Store)
- Restricciones de formato (max 2 frases)
- Blindaje anti-spam

**Beneficio**: Respuestas naturales y personalizadas sin templates fijos.

---

## Métricas de la Etapa

### **Procesamiento**
- **Nodos totales**: 15
- **Operaciones de DB**: 5 (2 Baserow + 3 Odoo)
- **Llamadas a APIs externas**: 1 (Chatwoot)
- **Llamadas a LLM**: 1 (GPT-3.5-turbo)
- **Transformaciones de datos**: 4 (Code nodes)

### **Latencia Estimada** (primer contacto)
```
Build Lead Row:           ~10ms
FindByChatwootId:         ~50ms (Baserow API)
PickLeadRow:              ~5ms
MergeForUpdate:           ~5ms
checkIfLeadAlreadyReg:    ~5ms
CreatePayload:            ~10ms
createLeadBaserow:        ~100ms (Baserow CREATE)
CreatePayloadOdoo:        ~15ms
CreateLeadOdoo:           ~150ms (Odoo XML-RPC)
UpdateLeadWithLead_Id:    ~80ms (Baserow UPDATE)
Create an Item:           ~120ms (Odoo CREATE message)
AI Agent Welcome:         ~1500ms (GPT-3.5-turbo)
Filter Output Initial:    ~10ms
Create an item1:          ~120ms (Odoo CREATE message)
HTTP Request:             ~200ms (Chatwoot → WhatsApp)
────────────────────────────────────
TOTAL:                    ~2380ms (~2.4 segundos)
```

### **Costo por Ejecución** (estimado)
```
Baserow API calls:        Gratis (self-hosted)
Odoo API calls:           Gratis (self-hosted)
Chatwoot API call:        Gratis (self-hosted)
GPT-3.5-turbo:            ~$0.002 (45 tokens in + 30 tokens out)
WhatsApp message:         $0.005 (costo de WhatsApp Business API)
────────────────────────────────────
TOTAL:                    ~$0.007 por mensaje
```

---

## Mejoras Prioritarias

### **1. Implementar Update Flow**
**Problema**: Solo está documentado el Create Flow (nuevos leads). Falta el Update Flow (leads existentes).

**Solución**: Documentar rama `true` del nodo 22 (checkIfLeadAlreadyRegistered).

**Beneficio**: Cobertura completa del flujo de leads.

---

### **2. Agregar Validación de Conversación**
**Problema**: Si la conversación está cerrada en Chatwoot, el mensaje podría ser rechazado.

**Solución**: Agregar nodo HTTP Request previo:
```http
GET /api/v1/accounts/1/conversations/190
```
Verificar `status: "open"` antes de continuar.

---

### **3. Implementar Retry Automático**
**Problema**: Fallos transitorios en Baserow/Odoo/Chatwoot no tienen recovery.

**Solución**: Configurar retry en nodos críticos:
```yaml
Retry On Fail: true
Max Tries: 3
Wait Between Tries: 5000ms
```

---

### **4. Agregar HTML Sanitization**
**Problema**: Output del LLM podría contener HTML malicioso (XSS).

**Solución**: En nodo 30, agregar escape de HTML:
```javascript
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

---

### **5. Crear Usuario Virtual "Leonobit Bot"**
**Problema**: Mensajes en Odoo aparecen con el usuario del credential, no con "Leonobit Bot".

**Solución**:
1. Crear partner en Odoo: `res.partner` con nombre "Leonobit Bot"
2. Agregar field `author_id` en nodos 28 y 31
3. Asignar ID del partner

**Beneficio**: Mensajes del bot claramente identificados.

---

### **6. Implementar Rate Limiting**
**Problema**: WhatsApp Business API tiene límites de mensajes por segundo.

**Solución**: Agregar nodo Wait antes de HTTP Request:
```yaml
Amount: 200ms
```

---

### **7. Agregar Monitoring de Fallos**
**Problema**: No hay alertas cuando el workflow falla.

**Solución**: Agregar nodo HTTP Request a servicio de monitoreo (Sentry/Datadog) en caso de error.

---

### **8. Implementar Cache de Respuestas Comunes**
**Problema**: Saludos genéricos ("Hola") se procesan con LLM innecesariamente.

**Solución**: Agregar nodo Code antes de AI Agent con cache:
```javascript
const commonGreetings = {
  'hola': '¡Hola! Bienvenido a Leonobitech...',
  'buenos dias': '¡Buenos días! Soy Leonobit...'
};
if (commonGreetings[message.toLowerCase()]) {
  return [{ json: { output: commonGreetings[message.toLowerCase()], cached: true } }];
}
```

**Beneficio**: Reducir costos de API en ~30-40% de casos.

---

## Casos de Uso

### **Caso 1: Nuevo Lead (actual)**
**Escenario**: Cliente escribe "Hola que tal" por primera vez.

**Flujo**:
1. Build Lead Row → Estructura completa
2. FindByChatwootId → No encontrado
3. PickLeadRow → `exists: false`
4. Bifurcación → Create Flow (fallback)
5. createLeadBaserow → ID 198
6. CreateLeadOdoo → ID 33
7. UpdateLeadWithLead_Id → Enlace (lead_id: 33)
8. Create an Item → Mensaje cliente (ID 1041)
9. AI Agent → "¡Hola! Bienvenido a Leonobitech..."
10. Create an item1 → Mensaje bot (ID 1042)
11. HTTP Request → Envío a WhatsApp

**Resultado**:
- Lead creado en Baserow (ID 198)
- Oportunidad creada en Odoo (ID 33)
- 2 mensajes en chatter (cliente + bot)
- Mensaje enviado a WhatsApp

---

### **Caso 2: Lead Existente (Update Flow - pendiente)**
**Escenario**: Cliente que ya interactuó previamente vuelve a escribir.

**Flujo**:
1. Build Lead Row → Estructura completa
2. FindByChatwootId → Encontrado (ID 198)
3. PickLeadRow → `exists: true, row_id: 198`
4. Bifurcación → Update Flow (true)
5. *[Pendiente documentar]*

**Resultado esperado**:
- Actualizar last_message, last_activity_iso en Baserow
- Crear nuevo mensaje en chatter de Odoo
- Enviar respuesta contextual (no bienvenida)

---

### **Caso 3: Cliente Menciona Servicios**
**Escenario**: Cliente escribe "Necesito integrar WhatsApp con mi CRM".

**Flujo**:
1-8. Igual que Caso 1
9. AI Agent → Detecta intención → **Llama Tool RAG** (Qdrant)
   - Query: "integración whatsapp crm"
   - Resultados: WhatsApp Business API, Odoo CRM Integration
   - Output: "¡Hola! En Leonobitech automatizamos procesos con IA. Contamos con WhatsApp Business API (automatiza conversaciones) y nuestra integración con Odoo CRM (centraliza leads y ventas). ¿Me compartes tu nombre?"
10-11. Igual que Caso 1

**Resultado**:
- Respuesta menciona servicios específicos
- Historial en Odoo muestra qué servicios se mencionaron

---

## Conclusión

La **ETAPA 3: Register Leads** implementa el **ciclo completo de gestión de leads** desde la primera interacción:

### **Logros**:
✅ **Registro dual**: Baserow (estado) + Odoo (historial)
✅ **Enlace bidireccional**: Sincronización automática entre sistemas
✅ **IA generativa**: Respuestas personalizadas con GPT-3.5-turbo
✅ **RAG condicional**: Mención de servicios solo cuando es relevante
✅ **Historial completo**: Cliente + bot en Odoo chatter
✅ **Entrega multicanal**: HTML (Odoo) + Texto (WhatsApp)

### **Números**:
- **15 nodos** documentados
- **5 operaciones de DB** (Baserow + Odoo)
- **1 llamada a LLM** (GPT-3.5-turbo)
- **2.4 segundos** de latencia total
- **$0.007** de costo por mensaje

### **Próximos Pasos**:
1. Documentar **Update Flow** (rama true del nodo 22)
2. Documentar **ETAPA 4: Análisis de Historial** (LLM Analista)
3. Implementar mejoras prioritarias (retry, validation, monitoring)

---

**Estado**: ✅ ETAPA COMPLETADA Y DOCUMENTADA
