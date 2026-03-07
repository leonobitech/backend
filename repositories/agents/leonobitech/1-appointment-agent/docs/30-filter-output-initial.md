# Nodo 30: Filter Output Initial

**Nombre del nodo**: `Filter Output Initial`
**Tipo**: Code (JavaScript)
**Función**: Formatear respuesta del AI Agent para dos destinos (Odoo HTML y WhatsApp texto plano)
**Entrada**: Output del AI Agent Welcome + lead_id
**Modo de operación**: Run Once for All Items

---

## Descripción

Este nodo es un **transformador de formato dual** que recibe la respuesta generada por el AI Agent Welcome y la adapta para dos plataformas diferentes:

1. **Odoo (HTML)**: Formato HTML con etiquetas `<p>`, `<strong>`, `<br>` para el chatter
2. **WhatsApp (texto plano)**: Formato markdown simplificado con emoji, asteriscos y bullets

Además, **reintegra el `lead_id`** desde el nodo UpdateLeadWithLead_Id para mantener la referencia al lead de Odoo.

---

## Configuración

### **Mode**
```
Run Once for All Items
```

### **Language**
```
JavaScript
```

---

## Código

```javascript
const input = $input.first().json;

const output = input.output || '';

const leadId = $('UpdateLeadWithLead_Id').first().json.lead_id || 0;

// HTML para Odoo
const htmlBody = `<p><strong>🤖 Leonobit:</strong><br>${output.replace(/\n/g, '<br>')}</p>`;

// Texto plano para WhatsApp
let plainText = output.replace(/\\n/g, '\n');
plainText = plainText.replace(/\*\*(.*?)\*\*/g, '*$1*');
plainText = plainText.replace(/\n\* /g, '\n• ');
plainText = plainText.trim();
plainText = `Leonobit 🤖:\n${plainText}`;

return [
  {
    json: {
      body_html: htmlBody,
      content_whatsapp: plainText,
      lead_id: leadId
    }
  }
];
```

---

## Análisis del Código

### **1. Captura de Input**
```javascript
const input = $input.first().json;
const output = input.output || '';
```

**Explicación**:
- `$input.first().json`: Obtiene el primer item del input (salida del AI Agent)
- `input.output`: Extrae el campo `output` que contiene la respuesta generada
- `|| ''`: Fallback a string vacío si no existe

**Tipo esperado**: `string`

**Ejemplo**:
```javascript
output = "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
```

---

### **2. Reintegración de lead_id**
```javascript
const leadId = $('UpdateLeadWithLead_Id').first().json.lead_id || 0;
```

**Explicación**:
- `$('UpdateLeadWithLead_Id')`: Accede al nodo anterior (Data Reintegration pattern)
- `.first().json.lead_id`: Extrae el campo `lead_id` del primer item
- `|| 0`: Fallback a 0 si no existe

**Tipo esperado**: `string` (ID numérico pero almacenado como string)

**Ejemplo**:
```javascript
leadId = "33"
```

**Propósito**: Mantener referencia al lead de Odoo para nodos posteriores (ej.: crear mensaje en chatter).

---

### **3. Formato HTML para Odoo**
```javascript
const htmlBody = `<p><strong>🤖 Leonobit:</strong><br>${output.replace(/\n/g, '<br>')}</p>`;
```

**Transformaciones**:
1. **Envuelve en `<p>`**: Párrafo estándar HTML
2. **Agrega prefijo con `<strong>`**: "🤖 Leonobit:" en negrita
3. **Reemplaza `\n` → `<br>`**: Saltos de línea HTML

**Input**:
```
"¡Hola! Bienvenido a Leonobitech.\n¿Me puedes decir tu nombre?"
```

**Output**:
```html
<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech.<br>¿Me puedes decir tu nombre?</p>
```

**Uso**: Este HTML se almacena en Odoo `mail.message.body` (chatter).

---

### **4. Formato Texto Plano para WhatsApp**

#### Paso 1: Normalizar saltos de línea
```javascript
let plainText = output.replace(/\\n/g, '\n');
```

**Explicación**: Convierte literales `\\n` (doble backslash) a saltos de línea reales `\n`.

**Caso de uso**: Si el LLM devuelve literales escapados en lugar de saltos reales.

---

#### Paso 2: Convertir markdown bold
```javascript
plainText = plainText.replace(/\*\*(.*?)\*\*/g, '*$1*');
```

**Explicación**: Convierte markdown bold (`**texto**`) a WhatsApp bold (`*texto*`).

**Regex breakdown**:
- `\*\*`: Coincide con dos asteriscos literales
- `(.*?)`: Captura grupo 1 (contenido), non-greedy
- `\*\*`: Coincide con dos asteriscos de cierre
- `*$1*`: Reemplaza con un asterisco + grupo 1 + un asterisco

**Ejemplo**:
```
Input:  "Ofrecemos **WhatsApp API** y **Odoo CRM**"
Output: "Ofrecemos *WhatsApp API* y *Odoo CRM*"
```

---

#### Paso 3: Convertir bullets de markdown
```javascript
plainText = plainText.replace(/\n\* /g, '\n• ');
```

**Explicación**: Convierte listas markdown (`\n* item`) a bullets Unicode (`\n• item`).

**Ejemplo**:
```
Input:  "\n* Servicio 1\n* Servicio 2"
Output: "\n• Servicio 1\n• Servicio 2"
```

**Nota**: Aunque el System Message del AI Agent indica "**No** listas", esta transformación es una **salvaguarda** por si el LLM las genera.

---

#### Paso 4: Trim y agregar prefijo
```javascript
plainText = plainText.trim();
plainText = `Leonobit 🤖:\n${plainText}`;
```

**Explicación**:
1. `trim()`: Elimina espacios/saltos de línea al inicio y final
2. Agrega prefijo: "Leonobit 🤖:" seguido de salto de línea

**Resultado final**:
```
Leonobit 🤖:
¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?
```

---

### **5. Return Structure**
```javascript
return [
  {
    json: {
      body_html: htmlBody,
      content_whatsapp: plainText,
      lead_id: leadId
    }
  }
];
```

**Estructura de salida**:
- `body_html` (string): HTML para Odoo chatter
- `content_whatsapp` (string): Texto plano para WhatsApp
- `lead_id` (string): ID del lead en Odoo

---

## Input

### Estructura de entrada

#### Desde AI Agent Welcome:
```json
{
  "output": "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
}
```

#### Desde UpdateLeadWithLead_Id (reintegración):
```json
{
  "lead_id": "33"
}
```

---

## Output

### Estructura de salida
```json
[
  {
    "body_html": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?</p>",
    "content_whatsapp": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?",
    "lead_id": "33"
  }
]
```

**Campos**:
- `body_html` (string): 215 caracteres (HTML completo)
- `content_whatsapp` (string): 176 caracteres (texto plano con prefijo)
- `lead_id` (string): "33"

---

## Casos de Uso Detallados

### **Caso 1: Respuesta simple (actual)**

**Input**:
```json
{
  "output": "¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?"
}
```

**Output**:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?</p>",
  "content_whatsapp": "Leonobit 🤖:\n¡Hola! Bienvenido a Leonobitech, donde usamos IA para automatizar la atención y procesos de tu negocio. ¿Me puedes decir tu nombre para ayudarte mejor?",
  "lead_id": "33"
}
```

---

### **Caso 2: Respuesta con saltos de línea**

**Input**:
```json
{
  "output": "¡Hola!\nBienvenido a Leonobitech.\n¿Me puedes decir tu nombre?"
}
```

**HTML Output**:
```html
<p><strong>🤖 Leonobit:</strong><br>¡Hola!<br>Bienvenido a Leonobitech.<br>¿Me puedes decir tu nombre?</p>
```

**WhatsApp Output**:
```
Leonobit 🤖:
¡Hola!
Bienvenido a Leonobitech.
¿Me puedes decir tu nombre?
```

---

### **Caso 3: Respuesta con markdown bold**

**Input**:
```json
{
  "output": "¡Hola! Ofrecemos **WhatsApp API** y **Odoo CRM**. ¿Tu nombre?"
}
```

**HTML Output**:
```html
<p><strong>🤖 Leonobit:</strong><br>¡Hola! Ofrecemos **WhatsApp API** y **Odoo CRM**. ¿Tu nombre?</p>
```
**Nota**: El HTML no procesa `**` (se mantiene literal, Odoo no renderiza markdown).

**WhatsApp Output**:
```
Leonobit 🤖:
¡Hola! Ofrecemos *WhatsApp API* y *Odoo CRM*. ¿Tu nombre?
```
**Nota**: WhatsApp renderiza `*texto*` como negrita.

---

### **Caso 4: Respuesta con listas (salvaguarda)**

**Input**:
```json
{
  "output": "Ofrecemos:\n* WhatsApp Chatbots\n* Odoo Integration\n¿Tu nombre?"
}
```

**HTML Output**:
```html
<p><strong>🤖 Leonobit:</strong><br>Ofrecemos:<br>* WhatsApp Chatbots<br>* Odoo Integration<br>¿Tu nombre?</p>
```

**WhatsApp Output**:
```
Leonobit 🤖:
Ofrecemos:
• WhatsApp Chatbots
• Odoo Integration
¿Tu nombre?
```

---

### **Caso 5: Output vacío (edge case)**

**Input**:
```json
{
  "output": ""
}
```

**Output**:
```json
{
  "body_html": "<p><strong>🤖 Leonobit:</strong><br></p>",
  "content_whatsapp": "Leonobit 🤖:\n",
  "lead_id": "33"
}
```

**Implicación**: Se enviaría un mensaje con solo el prefijo. Debería agregarse validación.

---

## Diagrama de Flujo

```
┌──────────────────────────────────────┐
│  Input: AI Agent Welcome output      │
│  {                                   │
│    "output": "¡Hola! Bienvenido..."  │
│  }                                   │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Data Reintegration:                 │
│  leadId = $('UpdateLeadWithLead_Id') │
│           .first().json.lead_id      │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Transformación HTML (Odoo):         │
│  ┌────────────────────────────────┐  │
│  │ 1. Envolver en <p>             │  │
│  │ 2. Prefijo <strong>Leonobit    │  │
│  │ 3. Replace \n → <br>           │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Transformación Texto (WhatsApp):    │
│  ┌────────────────────────────────┐  │
│  │ 1. Normalizar \n               │  │
│  │ 2. Convert **bold** → *bold*   │  │
│  │ 3. Convert * list → • list     │  │
│  │ 4. Trim                        │  │
│  │ 5. Prefijo "Leonobit 🤖:\n"    │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Output: Dual Format + lead_id       │
│  {                                   │
│    "body_html": "<p><strong>...",    │
│    "content_whatsapp": "Leonobit...",│
│    "lead_id": "33"                   │
│  }                                   │
└──────────────────────────────────────┘
```

---

## Detalles Técnicos

### **1. Patrón: Dual Format Transformer**

Este nodo implementa el patrón **Dual Format Transformer**, que adapta un mensaje a múltiples formatos de salida simultáneamente.

**Ventajas**:
- **Single Source of Truth**: La respuesta del LLM es única, las transformaciones son determinísticas
- **Consistencia**: Ambos formatos contienen el mismo mensaje semántico
- **Separación de responsabilidades**: El LLM genera contenido, este nodo formatea

**Comparación con alternativas**:

| **Aspecto**               | **Dual Transformer (actual)** | **Doble LLM Call**          | **Post-processing separado** |
|---------------------------|-------------------------------|-----------------------------|------------------------------|
| **Consistencia**          | Alta (mismo source)           | Media (2 outputs distintos) | Alta (mismo source)          |
| **Costo**                 | Bajo (1 LLM call)             | Alto (2 LLM calls)          | Bajo (1 LLM call)            |
| **Latencia**              | Baja (<10ms)                  | Alta (~2-6 segundos)        | Media (2 nodos secuenciales) |
| **Mantenibilidad**        | Media (1 nodo con 2 formatos) | Baja (2 prompts a mantener) | Alta (1 formato por nodo)    |
| **Complejidad de código** | Baja (regex simples)          | Nula (todo en prompts)      | Baja (regex simples)         |

**Conclusión**: El enfoque actual es óptimo para este caso de uso.

---

### **2. Regex para Markdown → WhatsApp**

#### Bold Conversion: `\*\*(.*?)\*\* → *$1*`

**Detalles del regex**:
- `\*\*`: Escapa asteriscos literales (markdown bold)
- `(.*?)`: Non-greedy capture (evita capturar múltiples bolds en una línea)
- `g` flag: Global (todas las ocurrencias)

**Ejemplo de non-greedy**:
```javascript
// Input
"Ofrecemos **WhatsApp** y **Odoo** integration"

// Con .*? (non-greedy) - CORRECTO
"Ofrecemos *WhatsApp* y *Odoo* integration"

// Con .* (greedy) - INCORRECTO
"Ofrecemos *WhatsApp** y **Odoo* integration"
```

---

#### Bullet Conversion: `\n\* → \n•`

**Por qué solo `\n\*` y no `^\*`**:
- Markdown lists requieren salto de línea previo (`\n* item`)
- Items al inicio de string son raros (el LLM genera bienvenida primero)
- No matchea `*` dentro de texto (ej.: "5*3=15")

**Limitación**: No convierte bullets al inicio del string (sin `\n` previo).

**Solución mejorada** (si se requiere):
```javascript
plainText = plainText.replace(/(^|\n)\* /g, '$1• ');
```
- `(^|\n)`: Captura inicio de string O salto de línea
- `$1`: Reinserta el capturado (mantiene salto de línea)

---

### **3. HTML Sanitization**

**Pregunta de seguridad**: ¿El output del LLM podría contener HTML malicioso?

**Escenarios de riesgo**:
1. **XSS**: Usuario escribe `<script>alert('xss')</script>` → LLM lo incluye en respuesta
2. **HTML Injection**: Usuario escribe `<img src=x onerror=alert(1)>`

**Protección actual**: NINGUNA. El código hace:
```javascript
const htmlBody = `<p><strong>🤖 Leonobit:</strong><br>${output.replace(/\n/g, '<br>')}</p>`;
```

**Vulnerabilidad**: Si `output` contiene `<script>`, se inyecta directamente.

**Mitigación**:

#### Opción 1: HTML Escape (recomendado)
```javascript
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const safeOutput = escapeHtml(output);
const htmlBody = `<p><strong>🤖 Leonobit:</strong><br>${safeOutput.replace(/\n/g, '<br>')}</p>`;
```

**Resultado**: `<script>` → `&lt;script&gt;` (se muestra como texto, no se ejecuta)

---

#### Opción 2: Confiar en el LLM (actual)

**Argumento**: El System Message del AI Agent indica:
```markdown
**No** inventes datos. **No** des precios, teléfonos ni **URLs**.
```

Si el LLM sigue instrucciones, no debería generar HTML.

**Riesgo**: El LLM podría "citar" el mensaje del usuario:
```
User: "<script>alert(1)</script>"
LLM: "Hola, entiendo que mencionaste <script>alert(1)</script>, pero..."
```

**Conclusión**: **Debería agregarse HTML escape** por defensa en profundidad.

---

### **4. WhatsApp Formatting Limitations**

WhatsApp soporta un **subconjunto limitado de markdown**:

| **Formato**     | **Markdown**       | **WhatsApp** | **Soportado** |
|-----------------|--------------------|--------------|--------------:|
| **Bold**        | `**text**`         | `*text*`     | ✅             |
| **Italic**      | `*text*`           | `_text_`     | ✅             |
| **Strikethrough**| `~~text~~`        | `~text~`     | ✅             |
| **Monospace**   | `` `text` ``       | ``` ```text``` ``` | ✅       |
| **Bullets**     | `* item`           | `• item`     | ⚠️ (manual)    |
| **Links**       | `[text](url)`      | No soportado | ❌             |
| **Headings**    | `# Heading`        | No soportado | ❌             |

**Implicación**: El código actual convierte bold y bullets correctamente, pero NO maneja:
- Italic (`*texto*` en markdown → `_texto_` en WhatsApp)
- Strikethrough (`~~texto~~` → `~texto~`)
- Monospace (`` `código` `` → ``` ```código``` ```)

**Mejora propuesta**:
```javascript
// Italic (debe ir ANTES de bold para evitar conflictos)
plainText = plainText.replace(/\*(.*?)\*/g, '_$1_');

// Bold
plainText = plainText.replace(/\*\*(.*?)\*\*/g, '*$1*');

// Strikethrough
plainText = plainText.replace(/~~(.*?)~~/g, '~$1~');

// Monospace
plainText = plainText.replace(/`(.*?)`/g, '```$1```');
```

**Nota**: Debe mantenerse el orden (italic antes de bold) para evitar conflictos con asteriscos.

---

### **5. Data Reintegration Pattern**

Este nodo implementa el **Data Reintegration Pattern** (patrón visto en múltiples nodos previos):

```javascript
const leadId = $('UpdateLeadWithLead_Id').first().json.lead_id || 0;
```

**Ventajas**:
- Accede a datos de nodos previos sin necesidad de Merge
- Permite flujos paralelos (AI Agent y UpdateLeadWithLead_Id pueden ejecutarse en paralelo)
- Reduce complejidad del workflow (menos nodos Merge)

**Riesgo**:
- Si `UpdateLeadWithLead_Id` falla, este nodo obtiene `leadId = 0` (fallback silencioso)
- No hay validación de que `UpdateLeadWithLead_Id` se ejecutó exitosamente

**Mejora propuesta**:
```javascript
const leadId = $('UpdateLeadWithLead_Id').first().json.lead_id;

if (!leadId || leadId === 0 || leadId === '0') {
  throw new Error('lead_id no disponible en UpdateLeadWithLead_Id');
}
```

**Beneficio**: Detección temprana de errores en el flujo.

---

## Comparación con Alternativas

### **Alternativa 1: Doble nodo (uno para HTML, otro para WhatsApp)**

**Estructura**:
```
AI Agent → Code (HTML) → ...
        → Code (WhatsApp) → ...
```

**Ventajas**:
- Separación de responsabilidades (1 formato por nodo)
- Más fácil de testear individualmente
- Permite evolución independiente (ej.: cambiar formato HTML sin tocar WhatsApp)

**Desventajas**:
- Duplicación de lógica de captura de input
- Más nodos en el workflow (visual clutter)
- Dos puntos de fallo vs. uno

---

### **Alternativa 2: Template Nodes (Set/Edit Fields)**

**Estructura**:
```
AI Agent → Edit Fields (set body_html, content_whatsapp) → ...
```

**Ventajas**:
- No-code (configuración visual)
- Más rápido para cambios simples

**Desventajas**:
- **No permite regex**: No puede convertir `**` → `*`
- **No permite funciones**: No puede hacer `escapeHtml()`
- **Limitado a operaciones simples**: Solo set, append, no transformations complejas

**Conclusión**: Code node es superior para este caso de uso.

---

### **Alternativa 3: Función JavaScript Reutilizable**

Si hubiera múltiples nodos haciendo transformaciones similares, se podría extraer a una función global:

**Estructura**:
```javascript
// En un nodo Code inicial (ejecutar una vez al inicio del workflow)
global.formatForOdoo = (text) => {
  return `<p><strong>🤖 Leonobit:</strong><br>${text.replace(/\n/g, '<br>')}</p>`;
};

global.formatForWhatsApp = (text) => {
  let plain = text.replace(/\\n/g, '\n');
  plain = plain.replace(/\*\*(.*?)\*\*/g, '*$1*');
  plain = plain.replace(/\n\* /g, '\n• ');
  return `Leonobit 🤖:\n${plain.trim()}`;
};

// En este nodo
const output = $input.first().json.output || '';
return [{
  json: {
    body_html: global.formatForOdoo(output),
    content_whatsapp: global.formatForWhatsApp(output),
    lead_id: $('UpdateLeadWithLead_Id').first().json.lead_id || 0
  }
}];
```

**Ventajas**:
- DRY (Don't Repeat Yourself) si se usa en múltiples nodos
- Más fácil de testear (funciones puras)
- Cambios centralizados

**Desventajas**:
- Requiere nodo inicial para definir funciones globales
- Acoplamiento entre nodos (si se elimina el nodo inicial, este falla)
- Debugging más complejo (stack traces menos claros)

**Recomendación**: Solo si hay 3+ nodos haciendo transformaciones similares.

---

## Mejoras Propuestas

### **1. Agregar HTML Escape**
**Problema**: Output del LLM podría contener HTML malicioso.

**Solución**:
```javascript
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const safeOutput = escapeHtml(output);
const htmlBody = `<p><strong>🤖 Leonobit:</strong><br>${safeOutput.replace(/\n/g, '<br>')}</p>`;
```

---

### **2. Validar lead_id**
**Problema**: Si `UpdateLeadWithLead_Id` falla, `leadId` es 0 silenciosamente.

**Solución**:
```javascript
const leadId = $('UpdateLeadWithLead_Id').first().json.lead_id;

if (!leadId || leadId === 0 || leadId === '0') {
  throw new Error('lead_id no disponible. Verificar nodo UpdateLeadWithLead_Id');
}
```

---

### **3. Soportar más formatos de markdown**
**Problema**: Solo convierte bold y bullets.

**Solución**:
```javascript
// Orden importante: italic ANTES de bold
plainText = plainText.replace(/\*(.*?)\*/g, '_$1_');        // italic
plainText = plainText.replace(/\*\*(.*?)\*\*/g, '*$1*');    // bold
plainText = plainText.replace(/~~(.*?)~~/g, '~$1~');        // strikethrough
plainText = plainText.replace(/`(.*?)`/g, '```$1```');      // monospace
```

---

### **4. Agregar validación de output vacío**
**Problema**: Si `output` está vacío, se envía mensaje solo con prefijo.

**Solución**:
```javascript
const output = input.output || '';

if (output.trim().length === 0) {
  throw new Error('AI Agent no generó respuesta. Output vacío.');
}
```

---

### **5. Truncar respuestas muy largas**
**Problema**: WhatsApp tiene límite de ~4096 caracteres por mensaje.

**Solución**:
```javascript
const MAX_WHATSAPP_LENGTH = 4000; // Margen de seguridad

if (plainText.length > MAX_WHATSAPP_LENGTH) {
  plainText = plainText.slice(0, MAX_WHATSAPP_LENGTH - 20) + '\n\n[Mensaje truncado]';
}
```

---

### **6. Logging de transformaciones**
**Problema**: No hay visibilidad sobre qué transformaciones se aplicaron.

**Solución**:
```javascript
const transformations = {
  had_newlines: output.includes('\n'),
  had_bold: /\*\*(.*?)\*\*/.test(output),
  had_bullets: /\n\* /.test(output),
  html_length: htmlBody.length,
  whatsapp_length: plainText.length
};

return [{
  json: {
    body_html: htmlBody,
    content_whatsapp: plainText,
    lead_id: leadId,
    _meta: transformations  // Campo interno para debugging
  }
}];
```

---

### **7. Soporte para emojis problemáticos**
**Problema**: Algunos emojis complejos (ej.: variantes con skin tone) pueden causar problemas en conteo de caracteres.

**Solución**:
```javascript
// Normalizar emojis a variantes base (sin skin tone)
plainText = plainText.normalize('NFC');

// Contar caracteres correctamente (usando grapheme clusters)
const actualLength = [...plainText].length; // Vs. plainText.length
```

---

### **8. Agregar timestamp a HTML**
**Problema**: En Odoo chatter, útil saber cuándo se generó el mensaje.

**Solución**:
```javascript
const timestamp = new Date().toISOString();
const htmlBody = `<p><strong>🤖 Leonobit:</strong> <em>${timestamp}</em><br>${safeOutput.replace(/\n/g, '<br>')}</p>`;
```

**Resultado**:
```html
<p><strong>🤖 Leonobit:</strong> <em>2025-01-31T15:30:00Z</em><br>¡Hola! Bienvenido...</p>
```

---

## Siguiente Nodo Esperado

Después de formatear la respuesta, el flujo debería:

1. **Enviar a WhatsApp** vía Chatwoot API usando `content_whatsapp`
2. **Registrar en Odoo chatter** usando `body_html` y `lead_id`
3. **Actualizar Baserow** con el mensaje enviado (campo `last_message`)

**Nodos esperados**:
- **Nodo 31**: HTTP Request a Chatwoot API (POST mensaje a conversación)
- **Nodo 32**: Odoo Create Message (registro en chatter con `body_html`)
- **Nodo 33**: Baserow Update (actualizar `last_message` del lead)

O bien, si hay bifurcación, podrían ejecutarse en paralelo:
```
Filter Output Initial (30)
    ├─→ HTTP Request (Chatwoot) (31)
    ├─→ Odoo Create Message (32)
    └─→ Baserow Update (33)
```

---

## Relación con Arquitectura Global

```
ETAPA 1: Filter Process (5 nodos)
    ↓
ETAPA 2: Buffer Messages (12 nodos)
    ↓
ETAPA 3: Register Leads (12 nodos hasta aquí)
    ↓ [Create Flow]
    - Build Lead Row → FindByChatwootId → PickLeadRow
    - MergeForUpdate → checkIfLeadAlreadyRegistered
        ↓ [Fallback: nuevo lead]
        - CreatePayload → createLeadBaserow
        - CreatePayloadOdoo → CreateLeadOdoo
        - UpdateLeadWithLead_Id → Create an Item
    ↓
    - AI Agent Welcome (29) - Generación de respuesta
    ↓
**→ Filter Output Initial (30) ← Estamos aquí**
    ↓
ETAPA 6: Almacenamiento y Respuesta (?)
    - Envío a WhatsApp
    - Registro en Odoo
    - Actualización Baserow
```

**Posición en el flujo**: Este nodo marca la **transición entre generación de contenido (LLM) y distribución multicanal**. Es el último paso antes de enviar la respuesta al cliente.

---

## Conclusión

El **Nodo 30: Filter Output Initial** es un **transformador dual** que adapta la respuesta del AI Agent a dos formatos:

1. **HTML** para Odoo chatter (con `<p>`, `<strong>`, `<br>`)
2. **Texto plano** para WhatsApp (con markdown simplificado: `*bold*`, `• bullets`)

**Funciones clave**:
- Escapar/convertir caracteres especiales
- Agregar prefijos con branding ("🤖 Leonobit:")
- Reintegrar `lead_id` para nodos posteriores
- Mantener consistencia semántica entre formatos

**Mejoras prioritarias**:
1. Agregar HTML escape (seguridad)
2. Validar `lead_id` y `output` no vacíos (robustez)
3. Soportar más formatos de markdown (italic, strikethrough, monospace)

**Próximo paso**: Enviar `content_whatsapp` a Chatwoot y `body_html` a Odoo.
