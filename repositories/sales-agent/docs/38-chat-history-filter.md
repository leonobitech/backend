# Nodo 38: Chat History Filter

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | Chat History Filter |
| **Tipo** | Code (JavaScript) |
| **Función** | Limpiar, deduplicar y formatear historial de Odoo para LLM |
| **Entrada** | Array de mail.message desde Node 37 |
| **Modo** | Run Once for All Items |

---

## Descripción

**Chat History Filter** es un nodo crítico de transformación que convierte el output crudo de Odoo (Node 37) en un historial limpio y estructurado listo para consumo por LLMs (GPT-4). Este nodo realiza múltiples operaciones de limpieza, normalización y deduplicación.

Su función principal es:
1. **Filtrar mensajes del sistema** (notifications) que no aportan al contexto conversacional
2. **Limpiar HTML** preservando solo formato importante (`<strong>`)
3. **Inferir roles** (user/assistant/system) basándose en patterns del mensaje
4. **Eliminar prefijos redundantes** ("Cliente:", "🤖 Leonobit:")
5. **Deduplicar mensajes** por ID o por hash (role+text+minuto)
6. **Ordenar cronológicamente** (más antiguo primero)
7. **Limitar cantidad** (últimos 200 mensajes)
8. **Deducir lead_id** robusto (frecuencia de res_id)

**¿Por qué es necesario este nodo?**

El output de Odoo incluye:
- HTML complejo con tags innecesarios
- Mensajes del sistema sin valor conversacional
- Prefijos redundantes en cada mensaje
- Posibles duplicados
- Orden inverso (más reciente primero)
- 60+ campos por mensaje (solo necesitamos 3)

---

## Configuración

### Settings

```yaml
Mode: Run Once for All Items
Language: JavaScript
```

---

## Input

El nodo recibe el array de mensajes desde **Node 37: Get Chat History from Lead**:

```json
[
  {
    "id": 1043,
    "date": "2025-10-31 16:57:17",
    "body": "<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>",
    "preview": "Cliente: Si, claro me llamo Felix",
    "message_type": "comment",
    "author_id": false,
    "res_id": 33,
    "model": "crm.lead",
    "is_internal": false
  },
  {
    "id": 1042,
    "date": "2025-10-31 14:16:42",
    "body": "<p><strong>🤖 Leonobit:</strong><br>¡Hola! Bienvenido a Leonobitech...</p>",
    "preview": "🤖 Leonobit: ¡Hola! Bienvenido...",
    "message_type": "comment",
    "author_id": [6, "Felix Figueroa"],
    "res_id": 33,
    "model": "crm.lead",
    "is_internal": false
  },
  {
    "id": 1041,
    "date": "2025-10-31 14:05:13",
    "body": "<p><strong>Cliente: </strong>Hola que tal</p>",
    "preview": "Cliente: Hola que tal",
    "message_type": "comment",
    "author_id": false,
    "res_id": 33,
    "model": "crm.lead",
    "is_internal": false
  },
  {
    "id": 1040,
    "date": "2025-10-31 13:58:18",
    "body": "<div summary=\"o_mail_notification\"><p>Hay un nuevo lead...</p></div>",
    "preview": "Hay un nuevo lead para el equipo...",
    "message_type": "notification",
    "author_id": [6, "Felix Figueroa"],
    "res_id": 33,
    "model": "crm.lead",
    "is_internal": false
  }
]
```

---

## Código

```javascript
// Function — Get Chat History from Lead (Odoo → limpio, sin mensajes "system", con lead_id)
// Entrada: items con registros de mail.message de Odoo (cada uno tiene model/res_id/body/preview/...)
// Salida: [{ json: { history:[{role,text,ts}], lead_id:Number|null, ...(event?) } }]

const items = $input.all();

// 1) Intenta recuperar {event} si ya venía mergeado
let event = null;
for (const it of items) {
  if (it.json && it.json.event) { event = it.json.event; break; }
}

// Helpers
function cleanHtmlKeepStrong(s){
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?!strong\b)\w+[^>]*>/g, "") // deja <strong>, quita el resto
    .replace(/\s+/g, " ")
    .trim();
}
function stripPrefixes(text, role){
  let t = String(text || "").trim();
  if (role === "user") {
    t = t.replace(/^<strong>\s*cliente:\s*<\/strong>\s*/i, "")
         .replace(/^cliente:\s*/i, "");
  } else if (role === "assistant") {
    t = t.replace(/^<strong>\s*🤖?\s*leonobit:?\s*<\/strong>\s*/i, "")
         .replace(/^🤖?\s*leonobit:?\s*/i, "");
  }
  return t.trim();
}
function inferRole(mm){
  const messageType = String(mm.message_type || "").toLowerCase();
  const isInternal  = Boolean(mm.is_internal);
  const preview = String(mm.preview || "");
  const body = String(mm.body || "");
  if (messageType === "notification" || isInternal) return "system";
  if (/^<\s*strong>\s*cliente\s*:\s*<\/\s*strong>/i.test(body) || /^cliente\s*:/i.test(preview)) return "user";
  if (/leonobit/i.test(body+preview) || /🤖/.test(body+preview)) return "assistant";
  if (messageType === "comment") return "assistant";
  return "assistant";
}
function toIso(d){
  try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); }
}
function minuteBucket(iso){
  const d = new Date(iso);
  return isNaN(d) ? "0" : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
}

// 2) Mapear Odoo → history crudo (con id para dedupe) y recolectar posibles lead_ids (res_id)
//    Filtra AQUÍ los 'system' para que no entren al historial.
const candidateLeadIds = [];
let raw = items.map(it => {
  const mm = it.json || {};
  if (mm && mm.model === 'crm.lead' && mm.res_id != null) {
    const n = Number(mm.res_id);
    if (Number.isFinite(n)) candidateLeadIds.push(n);
  }
  const role = inferRole(mm);
  const textHtml = cleanHtmlKeepStrong(mm.body || mm.preview || "");
  const text = stripPrefixes(textHtml, role);
  const ts = toIso(mm.date || mm.create_date || new Date().toISOString());
  return { role, text, ts, _id: mm.id || null };
})
.filter(h => h.text && h.role !== "system"); // <— elimina system aquí

// 3) Deducción robusta de lead_id
let lead_id = null;
if (candidateLeadIds.length) {
  const freq = new Map();
  for (const id of candidateLeadIds) freq.set(id, (freq.get(id) || 0) + 1);
  lead_id = [...freq.entries()].sort((a,b) => b[1]-a[1])[0][0];
} else if (event && event.lead_id != null) {
  const ev = Number(event.lead_id);
  lead_id = Number.isFinite(ev) ? ev : null;
}

// 4) Si no hay nada, usa el mensaje actual del evento (si existe)
if (raw.length === 0 && event) {
  const lastText = event?.message?.clean_text || event?.message?.text || "";
  if (lastText.trim()) {
    raw.push({ role: "user", text: lastText.trim(), ts: event.ts_utc || new Date().toISOString() });
  }
}

// 5) Deduplicar (prioridad por id; si no hay id, usa hash por (role+text+minuto))
const seen = new Set();
const out = [];
for (const h of raw) {
  const key = h._id ? `id:${h._id}` : `h:${h.role}:${h.text}:${minuteBucket(h.ts)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(h);
}

// 6) Ordenar, filtrar system (doble seguro) y recortar
const onlyHuman = out.filter(h => h.role !== "system");
onlyHuman.sort((a,b) => Date.parse(a.ts) - Date.parse(b.ts));
const history = onlyHuman.slice(-200).map(h => ({ role: h.role, text: h.text, ts: h.ts }));

// 7) Salida: history + lead_id (+ event si venía)
const payload = event ? { event, history, lead_id } : { history, lead_id };
return [{ json: payload }];
```

### Breakdown del Código

#### 1. Recuperación de Event (Reintegración de Datos)

```javascript
const items = $input.all();

let event = null;
for (const it of items) {
  if (it.json && it.json.event) { event = it.json.event; break; }
}
```

**Propósito:** Si el flujo tiene datos del evento original (desde ETAPA 2), los preserva.

**Patrón:** Data reintegration (acceso a datos de nodos anteriores sin Merge).

#### 2. Helper Functions

##### cleanHtmlKeepStrong()

```javascript
function cleanHtmlKeepStrong(s){
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")                      // <br> → \n
    .replace(/<\/?(?!strong\b)\w+[^>]*>/g, "")          // Quita todos los tags excepto <strong>
    .replace(/\s+/g, " ")                                // Múltiples espacios → uno solo
    .trim();
}
```

**Input:**
```html
<p><strong>Cliente: </strong>Hola que tal</p>
```

**Output:**
```
<strong>Cliente: </strong>Hola que tal
```

**¿Por qué preservar `<strong>`?** Se usa después para detectar patterns de roles.

##### stripPrefixes()

```javascript
function stripPrefixes(text, role){
  let t = String(text || "").trim();
  if (role === "user") {
    t = t.replace(/^<strong>\s*cliente:\s*<\/strong>\s*/i, "")
         .replace(/^cliente:\s*/i, "");
  } else if (role === "assistant") {
    t = t.replace(/^<strong>\s*🤖?\s*leonobit:?\s*<\/strong>\s*/i, "")
         .replace(/^🤖?\s*leonobit:?\s*/i, "");
  }
  return t.trim();
}
```

**Input (user):**
```
<strong>Cliente: </strong>Hola que tal
```

**Output:**
```
Hola que tal
```

**Input (assistant):**
```
<strong>🤖 Leonobit:</strong> ¡Hola! Bienvenido...
```

**Output:**
```
¡Hola! Bienvenido...
```

##### inferRole()

```javascript
function inferRole(mm){
  const messageType = String(mm.message_type || "").toLowerCase();
  const isInternal  = Boolean(mm.is_internal);
  const preview = String(mm.preview || "");
  const body = String(mm.body || "");

  if (messageType === "notification" || isInternal) return "system";
  if (/^<\s*strong>\s*cliente\s*:\s*<\/\s*strong>/i.test(body) || /^cliente\s*:/i.test(preview)) return "user";
  if (/leonobit/i.test(body+preview) || /🤖/.test(body+preview)) return "assistant";
  if (messageType === "comment") return "assistant";
  return "assistant";
}
```

**Lógica de inferencia:**
1. **system**: `message_type="notification"` O `is_internal=true`
2. **user**: Body o preview empieza con "Cliente:"
3. **assistant**: Contiene "leonobit" o emoji 🤖
4. **default**: Si es "comment", asume "assistant"

##### minuteBucket()

```javascript
function minuteBucket(iso){
  const d = new Date(iso);
  return isNaN(d) ? "0" : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
}
```

**Propósito:** Generar hash temporal con precisión de minuto para deduplicación.

**Input:** `"2025-10-31T16:57:17.000Z"`
**Output:** `"2025-9-31-16-57"`

#### 3. Mapeo y Filtrado Inicial

```javascript
const candidateLeadIds = [];
let raw = items.map(it => {
  const mm = it.json || {};
  if (mm && mm.model === 'crm.lead' && mm.res_id != null) {
    const n = Number(mm.res_id);
    if (Number.isFinite(n)) candidateLeadIds.push(n);
  }
  const role = inferRole(mm);
  const textHtml = cleanHtmlKeepStrong(mm.body || mm.preview || "");
  const text = stripPrefixes(textHtml, role);
  const ts = toIso(mm.date || mm.create_date || new Date().toISOString());
  return { role, text, ts, _id: mm.id || null };
})
.filter(h => h.text && h.role !== "system");
```

**Operaciones:**
1. Recolectar `res_id` (lead_id candidatos) para deducción posterior
2. Inferir role de cada mensaje
3. Limpiar HTML y eliminar prefijos
4. Convertir date a ISO string
5. **Filtrar mensajes del sistema y vacíos**

**Reducción:** 4 mensajes → 3 mensajes (elimina ID 1040: notification)

#### 4. Deducción Robusta de lead_id

```javascript
let lead_id = null;
if (candidateLeadIds.length) {
  const freq = new Map();
  for (const id of candidateLeadIds) freq.set(id, (freq.get(id) || 0) + 1);
  lead_id = [...freq.entries()].sort((a,b) => b[1]-a[1])[0][0];
} else if (event && event.lead_id != null) {
  const ev = Number(event.lead_id);
  lead_id = Number.isFinite(ev) ? ev : null;
}
```

**Lógica:**
1. Contar frecuencia de cada `res_id` en mensajes
2. Elegir el más frecuente (asume todos los mensajes son del mismo lead)
3. Si no hay candidatos, usar `event.lead_id` (fallback)

**Caso actual:**
- `candidateLeadIds = [33, 33, 33, 33]`
- Frecuencia: `{33: 4}`
- `lead_id = 33` ✅

#### 5. Fallback: Mensaje Actual del Evento

```javascript
if (raw.length === 0 && event) {
  const lastText = event?.message?.clean_text || event?.message?.text || "";
  if (lastText.trim()) {
    raw.push({ role: "user", text: lastText.trim(), ts: event.ts_utc || new Date().toISOString() });
  }
}
```

**Propósito:** Si Odoo no tiene mensajes aún (caso edge), usar mensaje del webhook actual.

#### 6. Deduplicación

```javascript
const seen = new Set();
const out = [];
for (const h of raw) {
  const key = h._id ? `id:${h._id}` : `h:${h.role}:${h.text}:${minuteBucket(h.ts)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(h);
}
```

**Estrategia de deduplicación:**
1. **Si tiene ID** (de Odoo): Usar `id:1043` como key
2. **Si no tiene ID**: Usar hash de `role:text:minuto`

**¿Por qué minuteBucket?** Evita duplicados de mensajes idénticos enviados en el mismo minuto.

#### 7. Ordenamiento, Filtrado Final y Limitación

```javascript
const onlyHuman = out.filter(h => h.role !== "system");
onlyHuman.sort((a,b) => Date.parse(a.ts) - Date.parse(b.ts));
const history = onlyHuman.slice(-200).map(h => ({ role: h.role, text: h.text, ts: h.ts }));
```

**Operaciones:**
1. **Doble filtrado de system** (paranoia check)
2. **Sort ascendente** por timestamp (más antiguo primero)
3. **Limitar a últimos 200** mensajes
4. **Proyectar solo campos necesarios** (role, text, ts)

---

## Output

### Estructura de Salida

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
        "ts": "2025-10-31T16:57:17.000Z"
      }
    ],
    "lead_id": 33
  }
]
```

### Transformación Aplicada

**Antes (Node 37 output):**
```json
{
  "id": 1043,
  "date": "2025-10-31 16:57:17",
  "body": "<p><strong>Cliente: </strong>Si, claro me llamo Felix</p>",
  "message_type": "comment",
  "author_id": false,
  "res_id": 33,
  ... // 50+ campos más
}
```

**Después (Node 38 output):**
```json
{
  "role": "user",
  "text": "Si, claro me llamo Felix",
  "ts": "2025-10-31T16:57:17.000Z"
}
```

**Reducción:**
- **Campos**: 60+ → 3 (95% menos)
- **Size por mensaje**: ~2KB → ~100 bytes (95% menos)
- **Total (3 mensajes)**: ~6KB → ~300 bytes

---

## Diagrama de Flujo

```
Node 37: Get Chat History
         │
         │  [4 mensajes con HTML, 60+ campos cada uno]
         │
         v
   Node 38: Chat History Filter
         │
         ├─> 1. Recuperar event (si existe)
         ├─> 2. Mapear mensajes:
         │     - Limpiar HTML (keep <strong>)
         │     - Inferir role (user/assistant/system)
         │     - Eliminar prefijos ("Cliente:", "🤖 Leonobit:")
         │     - Convertir date a ISO
         ├─> 3. Filtrar system (notifications)
         ├─> 4. Deducir lead_id (frecuencia de res_id)
         ├─> 5. Deduplicar (por ID o por hash)
         ├─> 6. Ordenar cronológicamente (ASC)
         ├─> 7. Limitar a últimos 200
         ├─> 8. Proyectar solo role, text, ts
         │
         v
   Output: { history: [3 mensajes], lead_id: 33 }
         │
         v
   [Próximo nodo: LLM Analista]
```

---

## Casos de Uso

### Caso 1: Conversación Corta (Este Caso)

**Input:** 4 mensajes de Odoo (1 notification + 3 comments)

**Procesamiento:**
- Filtrar 1 notification → 3 mensajes
- Inferir roles → 2 user, 1 assistant
- Limpiar HTML y prefijos
- Ordenar ASC

**Output:** 3 mensajes listos para LLM

### Caso 2: Conversación Larga (20+ Mensajes)

**Input:** 25 mensajes de Odoo

**Procesamiento:**
- Filtrar 5 notifications → 20 mensajes
- Deduplicar 2 duplicados → 18 mensajes
- Ordenar y limitar a últimos 200 (no aplica, 18 < 200)

**Output:** 18 mensajes listos para LLM

### Caso 3: Historial Muy Largo (300+ Mensajes)

**Input:** 350 mensajes de Odoo

**Procesamiento:**
- Filtrar 50 notifications → 300 mensajes
- Deduplicar 10 duplicados → 290 mensajes
- **Limitar a últimos 200** → 200 mensajes

**Output:** 200 mensajes (ventana temporal de ~últimas 2-3 semanas)

---

## Performance y Optimización

### Tiempo de Ejecución

| Operación | Complejidad | Tiempo (100 msgs) |
|-----------|-------------|-------------------|
| **Mapeo** | O(n) | ~10ms |
| **Filtrado system** | O(n) | ~2ms |
| **Deduplicación** | O(n) | ~5ms |
| **Ordenamiento** | O(n log n) | ~8ms |
| **Limitación** | O(1) | <1ms |
| **Total** | **O(n log n)** | **~25ms** |

### Memory Usage

- **Input (100 msgs)**: ~200KB (con 60 campos cada uno)
- **Raw array**: ~10KB (solo 4 campos)
- **After dedup**: ~9KB
- **Final output**: ~10KB (proyección de 3 campos)

**Peak memory:** ~220KB (input + raw)

---

## Ventajas de Esta Implementación

### 1. Robustez en Deducción de lead_id

```javascript
const freq = new Map();
for (const id of candidateLeadIds) freq.set(id, (freq.get(id) || 0) + 1);
lead_id = [...freq.entries()].sort((a,b) => b[1]-a[1])[0][0];
```

**Escenario:** ¿Qué pasa si por error hay mensajes de 2 leads mezclados?

**Respuesta:** Elige el lead_id más frecuente.

**Ejemplo:**
- `candidateLeadIds = [33, 33, 33, 45]`
- Frecuencia: `{33: 3, 45: 1}`
- `lead_id = 33` (correcto, 75% de los mensajes)

### 2. Deduplicación Híbrida

```javascript
const key = h._id ? `id:${h._id}` : `h:${h.role}:${h.text}:${minuteBucket(h.ts)}`;
```

**Ventaja:** Funciona incluso si:
- Odoo no devuelve IDs (usa hash)
- Hay mensajes duplicados del buffer (Redis)
- Hay mensajes creados manualmente en Odoo

### 3. Doble Filtrado de System

```javascript
.filter(h => h.text && h.role !== "system");  // Primera vez

const onlyHuman = out.filter(h => h.role !== "system");  // Segunda vez
```

**¿Por qué 2 veces?** Paranoia check: asegura que NO hay notifications en output final.

### 4. Fallback a Evento Actual

```javascript
if (raw.length === 0 && event) {
  raw.push({ role: "user", text: lastText.trim(), ts: event.ts_utc });
}
```

**Escenario:** Lead nuevo sin mensajes en Odoo aún.

**Resultado:** Historial tiene al menos el mensaje actual del webhook.

---

## Mejoras Propuestas

### 1. Configuración de Límite

```javascript
// Hacer configurable el límite de mensajes
const MAX_MESSAGES = parseInt(process.env.CHAT_HISTORY_LIMIT || "200");
const history = onlyHuman.slice(-MAX_MESSAGES).map(h => ({ role: h.role, text: h.text, ts: h.ts }));
```

### 2. Sanitización HTML Más Estricta

```javascript
function cleanHtml(s){
  return String(s || "")
    .replace(/<script.*?<\/script>/gi, '')  // Eliminar scripts
    .replace(/<style.*?<\/style>/gi, '')    // Eliminar estilos
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")                // Todos los tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, " ")
    .trim();
}
```

### 3. Logging de Transformaciones

```javascript
console.log('[Chat History Filter] Processing', {
  input_count: items.length,
  after_system_filter: raw.length,
  after_dedup: out.length,
  final_count: history.length,
  lead_id,
  size_reduction: `${((1 - (JSON.stringify(history).length / JSON.stringify(items).length)) * 100).toFixed(1)}%`
});
```

### 4. Validación de Output

```javascript
// Verificar que history tiene sentido
if (history.length === 0) {
  console.warn('[Chat History Filter] Empty history, lead_id:', lead_id);
}

const userMessages = history.filter(h => h.role === 'user').length;
const assistantMessages = history.filter(h => h.role === 'assistant').length;

if (userMessages === 0) {
  console.warn('[Chat History Filter] No user messages found');
}
```

---

## Debugging y Troubleshooting

### Error: "Empty history"

**Causa:** Todos los mensajes fueron filtrados como "system".

**Solución:**
1. Verificar que `inferRole()` está clasificando correctamente
2. Revisar que body/preview tienen contenido
3. Verificar que no todos los mensajes son notifications

### Warning: "lead_id is null"

**Causa:** No se pudo deducir lead_id de res_id ni de event.

**Solución:**
1. Verificar que Node 37 trae res_id en mensajes
2. Verificar que event tiene lead_id (si viene de merge)
3. Agregar fallback a Baserow row_id

### Issue: "Duplicated messages"

**Causa:** Deduplicación no está funcionando correctamente.

**Debug:**
```javascript
// Agregar logging en deduplicación
for (const h of raw) {
  const key = h._id ? `id:${h._id}` : `h:${h.role}:${h.text}:${minuteBucket(h.ts)}`;
  console.log('[Dedup] Key:', key, 'Seen:', seen.has(key));
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(h);
}
```

### Issue: "Order is incorrect"

**Causa:** Sort no está funcionando.

**Verificación:**
```javascript
console.log('[Sort] Timestamps:', onlyHuman.map(h => h.ts));

onlyHuman.sort((a,b) => {
  const diff = Date.parse(a.ts) - Date.parse(b.ts);
  console.log('[Sort] Comparing', a.ts, b.ts, 'diff:', diff);
  return diff;
});
```

---

## Próximo Nodo Esperado

Después de limpiar el historial, el flujo probablemente continúa con:

1. **LLM Analista (GPT-4)** - Analizar historial completo y generar insights
2. **Extract Metadata** - Extraer datos estructurados (nombre, email, servicios mencionados)
3. **Build Context** - Combinar profile + history + análisis para Agente Master

---

## Referencias

- **Node 37**: [Get Chat History from Lead](./37-get-chat-history-from-lead.md) - Input de mensajes crudos
- **Node 35**: [ComposeProfile](./35-compose-profile.md) - Origen de lead_id

---

## Versión

- **Documentado**: 2025-10-31
- **n8n Version**: Compatible con n8n 1.x
- **Status**: ✅ Activo en producción
