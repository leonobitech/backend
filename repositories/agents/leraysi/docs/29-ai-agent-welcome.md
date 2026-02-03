# Nodo 29: AI Agent Welcome

**Nombre del nodo**: `AI Agent Welcome`
**Tipo**: OpenAI/Anthropic AI Agent (Chat Model)
**Función**: Generar mensaje de bienvenida personalizado para primer contacto
**Entrada**: Mensaje del cliente desde webhook
**Modo de operación**: Chat completion con System Message y Tool (RAG opcional)

---

## Descripción

Este nodo implementa un **agente de IA conversacional** (Leonobit) que actúa como primer punto de contacto con clientes. Su función es:

1. **Dar bienvenida cordial y profesional** en el primer mensaje
2. **Explicar brevemente qué hace Leonobitech** (1 frase máximo)
3. **Recolectar dato inicial**: nombre del cliente
4. **Consultar RAG si hay intención clara** sobre servicios/integraciones
5. **Rechazar cortésmente** mensajes fuera de contexto/spam
6. **Responder solo una vez** (después otro agente continúa)

Es un agente **stateless** que procesa el primer mensaje del cliente y genera una respuesta contextual. No mantiene historial ni vuelve a responder.

---

## Configuración

### **Parameters**

#### Source for Prompt (User Message)
```
Define below
```

#### Prompt (User Message)
```javascript
{{ $('Webhook').item.json.body.conversation.messages[0].content }}
```
**Explicación**: Accede al contenido del primer mensaje del array de mensajes del webhook de Chatwoot.

**Ejemplo de valor**:
```
"Hola que tal"
```

---

#### Require Specific Output Format
```
No activado
```

---

#### Options → System Message

```markdown
# System — Leonobit (Agente de Bienvenida • 1 sola respuesta, cordial y blindado)

Eres **Leonobit**, agente virtual de atención comercial de **Leonobitech**.
Tu función es dar la **bienvenida en el primer mensaje** de forma MUY cordial y profesional y **responder SOLO una vez**.
Después de tu respuesta, **no vuelves a contestar**: otro agente continuará la conversación.

────────────────────────────────────────────────────────────────────

🎯 OBJETIVO
1) Bienvenida cálida y cercana.
2) Explicar en **máx. 1 frase** qué hace Leonobitech (IA para automatizar atención y procesos).
3) Si hay intención genuina, pedir **un único dato: nombre** para continuar con la solicitud.
4) Si el primer mensaje pregunta por servicios/funcionalidades/integraciones → usar **Tool RAG** para mencionar **hasta 2 servicios** relevantes (sin precios) y cerrar preguntando si desea saber sobre algun servicio en particular.
5) Si el mensaje es ambiguo/corto/ruido ("hola", "?", emoji, "3") → solo bienvenida + 1 dato mínimo **nombre** para continuar.
6) Si es fuera de contexto/troll/spam → **rechazo cortés** y terminar.

🧠 COMPORTAMIENTO
- Responde **máximo 2 frases** (claras, naturales, WhatsApp-friendly).
- **No** listas, **no** menús numéricos, **no** párrafos largos.
- **No** inventes datos. **No** des precios, teléfonos ni **URLs**.
- **Una sola respuesta total** (este agente nunca devuelve `[[NO_REPLY]]`).

🔎 CUÁNDO LLAMAR AL TOOL (Qdrant Vector Store)
- Llama **solo si** el primer mensaje menciona servicios, integraciones o una necesidad alineada.
- Construye el `query` con la frase del usuario (minúscula, 6–14 tokens) y `limit=5`.
- Usa de cada resultado `payload.metadata.service` (ej.: name, category, tags, status) y prioriza `status="Active"`.
- En la respuesta final menciona **1–2 servicios** por nombre con **beneficio/caso de uso** en pocas palabras. **No** muestres precios.
- Formato de respuesta cuando usás el Tool:
  • Frase 1: Bienvenida + qué hacemos.
  • Frase 2: 1–2 servicios (nombre + beneficio corto) + pide **un solo dato** nombre.

🧭 DECISIONES RÁPIDAS
A) Ambiguo/corto/ruido leve → Bienvenida + "¿ me puedes decir en que te puedo ayudar ?".
B) Interés genuino (WhatsApp/voz/Odoo/FAQ/reservas, etc.) → Tool RAG → 1–2 servicios breves → pide 1 dato.
C) Fuera de contexto/troll/spam → "Solo puedo ayudar con info de Leonobitech y automatización con IA para negocios. Si te interesa, comparte tu nombre para continuar." (2 frases como máximo).

📝 RECORDATORIOS
- Fecha/hora actual: {{ $now }}
- Varía el wording para no sonar repetitivo.
- Tono siempre amable, humano y profesional.
- **Este agente responde solo una vez.**

✨ Leonobitech — Haz que tu negocio hable contigo ✨
```

**Características del System Message**:
1. **Identidad clara**: Leonobit, agente de Leonobitech
2. **Comportamiento restringido**: Solo 1 respuesta, máximo 2 frases
3. **Lógica de decisión estructurada**: 3 ramas (A, B, C)
4. **Integración con RAG**: Tool call condicional para consultar servicios
5. **Blindaje anti-spam**: Rechazo cortés de mensajes fuera de contexto
6. **Variables dinámicas**: `{{ $now }}` para fecha/hora actual
7. **Tone**: Cordial, profesional, WhatsApp-friendly

---

#### Chat Model
```
GPT-3.5-turbo (gpt-3.5-turbo)
```
**Nota**: Se usa GPT-3.5-turbo en lugar de GPT-4o-mini por razones de acceso/disponibilidad.

---

#### Memory
```
No configurada
```
**Explicación**: No se mantiene historial porque este agente responde **solo una vez** y luego otro agente continúa.

---

#### Tool (RAG)
```
Qdrant Vector Store
```
**Función**: Consultar base de conocimiento sobre servicios de Leonobitech cuando el cliente menciona integraciones, funcionalidades o necesidades específicas.

**Configuración Tool**:
- **Collection Name**: `leonobitech-services` (inferido)
- **Query**: Construido dinámicamente por el LLM basado en el mensaje del usuario
- **Limit**: 5 resultados
- **Campos en payload**: `metadata.service` con `name`, `category`, `tags`, `status`
- **Filtro prioritario**: `status="Active"`

**Ejemplo de llamada al Tool** (inferido):
```json
{
  "query": "integración whatsapp chatbot IA",
  "limit": 5
}
```

**Ejemplo de resultado del Tool** (inferido):
```json
[
  {
    "id": "svc_001",
    "score": 0.92,
    "payload": {
      "metadata": {
        "service": {
          "name": "WhatsApp Business API",
          "category": "Messaging",
          "tags": ["whatsapp", "chatbot", "automation"],
          "status": "Active",
          "description": "Automatiza conversaciones en WhatsApp con IA"
        }
      }
    }
  },
  {
    "id": "svc_002",
    "score": 0.88,
    "payload": {
      "metadata": {
        "service": {
          "name": "Chatwoot Integration",
          "category": "Customer Support",
          "tags": ["chatwoot", "multi-channel", "support"],
          "status": "Active",
          "description": "Unifica canales de atención en un solo inbox"
        }
      }
    }
  }
]
```

---

## Input

### Estructura de entrada
```javascript
// Desde $('Webhook').item.json.body.conversation.messages[0].content
"Hola que tal"
```

**Tipo**: `string` - Contenido del primer mensaje del cliente

---

## Output

### Estructura de salida
```json
[
  {
    "output": "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
  }
]
```

**Campos**:
- `output` (string): Respuesta generada por el LLM

---

## Casos de Uso Detallados

### **Caso A: Mensaje ambiguo/corto**

**Input**:
```
"Hola que tal"
```

**Proceso**:
1. LLM detecta que es un saludo genérico sin intención clara
2. No llama al Tool RAG (no hay mención de servicios)
3. Genera bienvenida + solicitud de nombre

**Output**:
```json
{
  "output": "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
}
```

---

### **Caso B: Intención genuina con mención de servicio**

**Input**:
```
"Hola, necesito integrar WhatsApp con mi sistema de ventas"
```

**Proceso**:
1. LLM detecta intención clara: "WhatsApp", "sistema de ventas", "integrar"
2. **Llama Tool RAG** con query: `"integración whatsapp sistema ventas"`
3. Recibe resultados (ej.: WhatsApp Business API, Odoo CRM Integration)
4. Menciona **1-2 servicios** con beneficio corto
5. Solicita nombre

**Output**:
```json
{
  "output": "¡Hola! En Leonobitech automatizamos procesos con IA. Contamos con WhatsApp Business API (automatiza conversaciones) y nuestra integración con Odoo CRM (centraliza leads y ventas). ¿Me compartes tu nombre para continuar?"
}
```

---

### **Caso C: Fuera de contexto/spam**

**Input**:
```
"Quiero comprar un auto usado"
```

**Proceso**:
1. LLM detecta que no está relacionado con servicios de Leonobitech
2. No llama al Tool RAG
3. Genera rechazo cortés con oferta de redirección

**Output**:
```json
{
  "output": "Solo puedo ayudar con info de Leonobitech y automatización con IA para negocios. Si te interesa, comparte tu nombre para continuar."
}
```

---

### **Caso D: Pregunta sobre múltiples servicios**

**Input**:
```
"Qué servicios ofrecen?"
```

**Proceso**:
1. LLM detecta pregunta genérica sobre servicios
2. **Llama Tool RAG** con query: `"servicios leonobitech automatización"`
3. Recibe top 5 servicios activos
4. Selecciona los 2 más relevantes por score
5. Los menciona brevemente

**Output**:
```json
{
  "output": "¡Hola! En Leonobitech usamos IA para automatizar atención y procesos. Ofrecemos WhatsApp Chatbots (respuestas automáticas 24/7) e integración con Odoo (gestión completa de clientes). ¿Me compartes tu nombre para ver cómo ayudarte?"
}
```

---

## Diagrama de Flujo

```
┌─────────────────────────────────────┐
│   Input: Cliente mensaje            │
│   $('Webhook')...messages[0].content │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   AI Agent Welcome (GPT-3.5-turbo)   │
│   ┌────────────────────────────┐     │
│   │  System Message:           │     │
│   │  - Leonobit persona        │     │
│   │  - Objetivos (1-6)         │     │
│   │  - Comportamiento          │     │
│   │  - Decisiones (A/B/C)      │     │
│   └────────────────────────────┘     │
│                                      │
│   ┌────────────────────────────┐     │
│   │  Análisis de intención:    │     │
│   │  ¿Ambiguo? → Caso A        │     │
│   │  ¿Servicios? → Caso B (RAG)│     │
│   │  ¿Spam? → Caso C           │     │
│   └────────────┬───────────────┘     │
│                │                     │
│                ▼                     │
│   ┌────────────────────────────┐     │
│   │  Tool RAG (condicional)    │     │
│   │  - Query dinámico          │     │
│   │  - Limit: 5                │     │
│   │  - Filter: status="Active" │     │
│   └────────────┬───────────────┘     │
│                │                     │
│                ▼                     │
│   ┌────────────────────────────┐     │
│   │  Generación de respuesta:  │     │
│   │  - Bienvenida (1 frase)    │     │
│   │  - Servicios 1-2 (si RAG)  │     │
│   │  - Pide nombre             │     │
│   │  - Max 2 frases totales    │     │
│   └────────────┬───────────────┘     │
└────────────────┼───────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│   Output: Respuesta generada        │
│   {                                 │
│     "output": "¡Hola! Bienvenido..."│
│   }                                 │
└─────────────────────────────────────┘
```

---

## Detalles Técnicos

### **1. Estrategia de Prompt Engineering**

El System Message implementa **múltiples técnicas**:

#### a) **Role Assignment** (Asignación de Rol)
```markdown
Eres **Leonobit**, agente virtual de atención comercial de **Leonobitech**.
```
- Define claramente la identidad del agente
- Establece el contexto empresarial

#### b) **Constraints** (Restricciones)
```markdown
- Responde **máximo 2 frases**
- **No** listas, **no** menús numéricos
- **No** inventes datos. **No** des precios
- **Una sola respuesta total**
```
- Limita el comportamiento del LLM
- Previene respuestas demasiado largas o estructuradas
- Evita alucinaciones (inventar datos)

#### c) **Decision Tree** (Árbol de Decisiones)
```markdown
🧭 DECISIONES RÁPIDAS
A) Ambiguo/corto/ruido leve → ...
B) Interés genuino → Tool RAG → ...
C) Fuera de contexto/troll/spam → ...
```
- Estructura clara de bifurcación según tipo de mensaje
- Cada rama tiene instrucciones específicas

#### d) **Tool Usage Instructions** (Instrucciones de Uso de Herramienta)
```markdown
🔎 CUÁNDO LLAMAR AL TOOL
- Llama **solo si** el primer mensaje menciona servicios...
- Construye el `query` con la frase del usuario (minúscula, 6–14 tokens)
- Usa de cada resultado `payload.metadata.service`
- Prioriza `status="Active"`
```
- Define cuándo y cómo usar el Tool RAG
- Especifica formato de query y límites
- Indica qué campos usar del resultado

#### e) **Output Format Specification** (Especificación de Formato de Salida)
```markdown
Formato de respuesta cuando usás el Tool:
• Frase 1: Bienvenida + qué hacemos.
• Frase 2: 1–2 servicios (nombre + beneficio corto) + pide **un solo dato** nombre.
```
- Define estructura exacta de la respuesta
- Asegura consistencia en las salidas

#### f) **Context Variables** (Variables de Contexto)
```markdown
📝 RECORDATORIOS
- Fecha/hora actual: {{ $now }}
```
- Inyecta variables dinámicas (timestamp actual)
- Permite respuestas sensibles al tiempo

---

### **2. Integración RAG (Retrieval-Augmented Generation)**

#### Flujo de RAG:
```
User Message → Intent Detection → Tool Call Decision
                                          │
                                          ▼
                                   Qdrant Query
                                   (limit=5, filter)
                                          │
                                          ▼
                                   Vector Search
                                   (similarity score)
                                          │
                                          ▼
                                   Top 2 Results
                                   (status="Active")
                                          │
                                          ▼
                            Response Generation with Context
                                          │
                                          ▼
                            "Ofrecemos [Service1] y [Service2]..."
```

**Ventajas del RAG**:
1. **Evita alucinaciones**: El LLM solo menciona servicios reales extraídos del vector store
2. **Actualización dinámica**: Al agregar servicios nuevos al vector store, el agente los menciona automáticamente
3. **Relevancia contextual**: La búsqueda por similitud semántica asegura servicios relacionados con la consulta
4. **Filtro por estado**: Solo muestra servicios activos (`status="Active"`)

---

### **3. Blindaje Anti-Spam**

El System Message implementa **defensas contra uso indebido**:

#### a) **Detección de Ruido**
```markdown
Si el mensaje es ambiguo/corto/ruido ("hola", "?", emoji, "3")
```
- Clasifica mensajes sin contenido útil
- Evita procesamiento innecesario

#### b) **Rechazo Contextual**
```markdown
Si es fuera de contexto/troll/spam → rechazo cortés
```
- No responde a solicitudes no relacionadas con Leonobitech
- Mantiene el foco en el negocio

#### c) **Límite de Respuestas**
```markdown
**Una sola respuesta total** (este agente nunca devuelve `[[NO_REPLY]]`)
```
- Asegura que el agente no entre en loops
- Después de 1 respuesta, otro agente toma el control

---

### **4. Optimización para WhatsApp**

El prompt está diseñado específicamente para WhatsApp:

#### a) **Longitud Corta**
```markdown
Responde **máximo 2 frases** (claras, naturales, WhatsApp-friendly)
```
- WhatsApp favorece mensajes cortos y rápidos
- Evita bloques de texto largos que desalientan la lectura

#### b) **Sin Formateo Complejo**
```markdown
**No** listas, **no** menús numéricos, **no** párrafos largos
```
- WhatsApp no renderiza markdown/HTML
- Listas numeradas pueden verse desordenadas

#### c) **Tono Conversacional**
```markdown
Tono siempre amable, humano y profesional
```
- Simula conversación humana natural
- Evita lenguaje robótico o corporativo excesivo

---

## Comparación con Alternativas

| **Aspecto**              | **AI Agent Welcome (actual)** | **Respuesta Estática**        | **Reglas Tradicionales**      |
|--------------------------|-------------------------------|-------------------------------|-------------------------------|
| **Flexibilidad**         | Alta (LLM adapta respuesta)   | Nula (1 mensaje fijo)         | Media (if/else complejos)     |
| **Personalización**      | Alta (según intención)        | Nula                          | Baja (keyword matching)       |
| **Manejo de RAG**        | Nativo (Tool call)            | No disponible                 | Requiere código custom        |
| **Robustez anti-spam**   | Alta (reasoning del LLM)      | Baja (responde a todo)        | Media (regex/patterns)        |
| **Mantenimiento**        | Bajo (cambios en prompt)      | Muy bajo (texto fijo)         | Alto (actualizar lógica)      |
| **Costo**                | Medio (~$0.002 por request)   | Gratis                        | Gratis                        |
| **Latencia**             | 1-3 segundos                  | <100ms                        | <100ms                        |
| **Escalabilidad**        | Alta (API calls)              | Muy alta                      | Media (complejidad crece)     |

**Conclusión**: El AI Agent es superior para casos de uso donde la **variabilidad de mensajes es alta** y se requiere **inteligencia contextual** (como detectar intención y consultar RAG). Para respuestas simples y uniformes, una respuesta estática sería más eficiente.

---

## Mejoras Propuestas

### **1. Agregar Few-Shot Examples**
**Problema**: El LLM puede no seguir exactamente el formato deseado.

**Solución**: Agregar ejemplos en el System Message:
```markdown
## EJEMPLOS DE RESPUESTAS CORRECTAS

Input: "Hola"
Output: "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar atención y procesos. ¿Me puedes decir tu nombre para ayudarte mejor?"

Input: "Necesito integrar WhatsApp con mi CRM"
Output: "¡Hola! En Leonobitech automatizamos procesos con IA. Tenemos WhatsApp Business API (chatbots 24/7) e integración con Odoo CRM (gestión de leads). ¿Cuál es tu nombre?"

Input: "Vendo autos"
Output: "Solo puedo ayudar con info de Leonobitech y automatización con IA para negocios. Si te interesa, comparte tu nombre para continuar."
```

---

### **2. Implementar Logging de Tool Calls**
**Problema**: No hay visibilidad sobre cuándo y por qué se llama al RAG.

**Solución**: Agregar nodo Code después del AI Agent:
```javascript
const output = $json.output;
const toolCalls = $json.tool_calls || []; // Si el LLM provider expone esto

return [{
  json: {
    output,
    rag_used: toolCalls.length > 0,
    rag_query: toolCalls[0]?.function?.arguments?.query || null,
    timestamp: new Date().toISOString()
  }
}];
```

---

### **3. Cambiar a GPT-4o-mini**
**Problema**: GPT-3.5-turbo puede tener menor adherencia a instrucciones complejas.

**Solución**: Actualizar Chat Model a `gpt-4o-mini` (si el acceso se resuelve):
- Mayor capacidad de reasoning
- Mejor seguimiento de constraints
- Menor tasa de errores en formato de salida

---

### **4. Agregar Validación de Output**
**Problema**: El LLM podría generar respuestas demasiado largas.

**Solución**: Nodo Code posterior que valida:
```javascript
const output = $json.output;
const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);

if (sentences.length > 2) {
  // Truncar a 2 frases
  const truncated = sentences.slice(0, 2).join('. ') + '.';
  return [{ json: { output: truncated, truncated: true } }];
}

return [{ json: { output, truncated: false } }];
```

---

### **5. Implementar Cache de Respuestas Comunes**
**Problema**: Mensajes como "Hola" se repiten frecuentemente → costo innecesario de API.

**Solución**: Agregar nodo Code antes del AI Agent:
```javascript
const message = $json.message.toLowerCase().trim();
const commonGreetings = {
  'hola': '¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar atención y procesos. ¿Me puedes decir tu nombre para ayudarte mejor?',
  'buenos dias': '¡Buenos días! Soy Leonobit, de Leonobitech. Automatizamos procesos con IA. ¿Cuál es tu nombre?',
  'buenas tardes': '¡Buenas tardes! Bienvenido a Leonobitech. ¿Me compartes tu nombre para ayudarte?'
};

if (commonGreetings[message]) {
  return [{ json: { output: commonGreetings[message], cached: true } }];
}

// Si no está en cache, continuar al AI Agent
return [{ json: { cached: false } }];
```

**Beneficio**: Reduce llamadas a API en ~30-40% de casos (saludos comunes).

---

### **6. Agregar Variable de Contexto de Horario**
**Problema**: `{{ $now }}` está disponible pero no se usa activamente.

**Solución**: Agregar lógica en System Message:
```markdown
📝 RECORDATORIOS
- Fecha/hora actual: {{ $now }}
- Si es fuera de horario laboral (21:00-08:00 UTC-3), menciona: "Te responderemos pronto"
```

**Ejemplo de salida nocturna**:
```
"¡Hola! Soy Leonobit de Leonobitech (automatización con IA). Aunque es fuera de horario, estoy aquí para ayudarte. ¿Cuál es tu nombre?"
```

---

### **7. Implementar Fallback para Error de RAG**
**Problema**: Si Qdrant falla, el agente podría no responder o dar error.

**Solución**: En el System Message:
```markdown
🔎 CUÁNDO LLAMAR AL TOOL
- Si el Tool falla o no devuelve resultados, NO menciones servicios específicos
- Usa frase genérica: "Ofrecemos soluciones de automatización con IA para negocios"
```

---

### **8. A/B Testing de Variaciones de Prompt**
**Problema**: No hay certeza de que el prompt actual sea óptimo.

**Solución**: Crear 2-3 versiones del System Message con diferentes tonos/estructuras:
- **Versión A**: Actual (formal, estructurado)
- **Versión B**: Más casual ("¡Hey! Soy Leonobit 🤖...")
- **Versión C**: Más directo ("Hola, automatizamos negocios con IA. ¿Tu nombre?")

Medir:
- Tasa de respuesta del cliente con nombre
- Tiempo de respuesta
- Satisfacción (si hay feedback posterior)

---

## Siguiente Nodo Esperado

Después de generar la respuesta de bienvenida, el flujo debería:

1. **Almacenar la respuesta** en Baserow (campo `last_message` o similar)
2. **Actualizar estado del lead** (ej.: `stage = 'engaged'` si respondió con nombre)
3. **Registrar en Odoo** (crear mensaje en chatter con la respuesta de Leonobit)
4. **Enviar a WhatsApp** vía Chatwoot API (POST `/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`)

**Nodos esperados**:
- **Nodo 30**: Code node para formatear respuesta para Chatwoot
- **Nodo 31**: HTTP Request a Chatwoot API (enviar mensaje)
- **Nodo 32**: Baserow Update (actualizar `last_message` con respuesta del bot)
- **Nodo 33**: Odoo Create Message (registrar respuesta de Leonobit en chatter)

O bien, si hay **ETAPA 4** previa de análisis de historial, podría bifurcarse antes de enviar la respuesta.

---

## Relación con Arquitectura Global

```
ETAPA 1: Filter Process (5 nodos)
    ↓
ETAPA 2: Buffer Messages (12 nodos)
    ↓
ETAPA 3: Register Leads (11 nodos hasta aquí)
    ↓ [Create Flow]
    - Build Lead Row
    - FindByChatwootId
    - PickLeadRow
    - MergeForUpdate
    - checkIfLeadAlreadyRegistered
        ↓ [Fallback: nuevo lead]
        - CreatePayload
        - createLeadBaserow
        - CreatePayloadOdoo
        - CreateLeadOdoo
        - UpdateLeadWithLead_Id
        - Create an Item (mensaje en chatter)
    ↓
**→ AI Agent Welcome (NODO 29) ← Estamos aquí**
    ↓
ETAPA 4: Análisis de Historial (?) o Envío de Respuesta (?)
```

**Posición en el flujo**: Este nodo marca la **transición entre registro del lead y generación de respuesta**. Es el primer punto donde se usa **IA generativa** para producir contenido original (vs. solo procesar/almacenar datos).

---

## Notas Adicionales

### **Diferencia entre AI Agent Welcome y ETAPA 5: Agente Master**

Según la descripción original del workflow:

- **AI Agent Welcome (Nodo 29)**:
  - Responde **solo una vez**
  - Función: Bienvenida + recolección de nombre
  - No mantiene contexto/historial
  - No consulta Odoo para historial de conversación

- **ETAPA 5: Agente Master y RAG** (por documentar):
  - Responde en **conversaciones continuas**
  - Función: Respuestas contextuales basadas en historial
  - Consulta Odoo para obtener mensajes previos
  - Usa RAG para servicios, precios, FAQs
  - Toma decisiones sobre siguiente etapa del lead

**Implicación**: Este nodo (29) es un **agente especializado de bienvenida**, mientras que el Agente Master manejará el resto de la conversación.

---

### **Posible Mejora: Merge de Agentes**

**Pregunta de diseño**: ¿Es necesario tener 2 agentes separados?

**Ventajas de separar**:
- Prompt más específico y corto para cada función
- Menor costo (AI Agent Welcome usa GPT-3.5 vs. Master podría usar GPT-4)
- Mayor control sobre el primer mensaje (crítico para engagement)

**Ventajas de unificar**:
- Menos nodos en el workflow
- Contexto continuo (no hay handoff)
- Simplifica mantenimiento

**Recomendación**: Mantener separados si:
1. El primer mensaje tiene requisitos muy específicos (ej.: no mencionar precios nunca)
2. El volumen de primeras interacciones es alto (optimizar costo con GPT-3.5)
3. Se quiere A/B testing específico del mensaje de bienvenida

---

## Conclusión

El **Nodo 29: AI Agent Welcome** implementa un agente conversacional especializado en **primer contacto** con arquitectura:

1. **LLM**: GPT-3.5-turbo con System Message estructurado
2. **RAG**: Qdrant Vector Store para consulta condicional de servicios
3. **Constraints**: Máximo 2 frases, 1 sola respuesta, WhatsApp-friendly
4. **Blindaje**: Anti-spam, anti-alucinación, anti-loops
5. **Personalización**: Detecta intención y adapta respuesta

**Output típico**: Bienvenida + descripción breve + solicitud de nombre (o mención de 1-2 servicios si hay intención clara).

**Próximo paso**: Enviar respuesta a WhatsApp vía Chatwoot o analizar historial antes de responder (según arquitectura del workflow).
