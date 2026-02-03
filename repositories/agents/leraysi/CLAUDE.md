# CLAUDE.md — Agente Leraysi

Agente de ventas por WhatsApp para **Estilos Leraysi**, salon de belleza femenino en Buenos Aires, Argentina.

---

## Overview

Chatbot que atiende clientas por WhatsApp: consulta de servicios, presupuestos (con foto para precios variables), agendamiento de turnos y cobro de sena via Mercado Pago.

**Stack**: n8n + GPT-4o (master agent) + GPT-4.1-mini (welcome + calendario) + Claude Sonnet (vision) + Whisper (audio) + Piper TTS + Chatwoot (WhatsApp) + Baserow (CRM) + Odoo (CRM/calendario) + Qdrant (RAG servicios) + Redis (buffer) + Mercado Pago (pagos)

---

## Workflows n8n

| Workflow | ID | Nodos | Funcion |
|----------|-------|-------|---------|
| Sales_Agent_By_WhatsApp | `7WjUcj8Jms1Rmm1o` | 85 | Agente principal |
| Leraysi - Agente Calendario | `wXyvKF0nCCvAxGFG` | 21 | Sub-workflow turnos |
| Leraysi - Crear Turno | `RSjHu3HHONPnVmPe` | 3 | Crear turno via odoo-mcp |
| Leraysi - Reprogramar Turno | `yti2vAntCLo46aTg` | 3 | Reprogramar turno via odoo-mcp |
| Leraysi - Cancelar Turno | `3OEvpzjVYTzdHytk` | 2 | Cancelar turno via odoo-mcp |
| Leraysi - Webhook Pago Confirmado | `mlVG31koSK-Tdz7Csy0Wq` | 8 | Confirmar pago MP |
| Load Services | `xANuydj39gbbYkpU` | 11 | Baserow -> Qdrant RAG (inactivo) |

---

## Estructura de archivos

```
agents/leraysi/
├── CLAUDE.md                    # Este archivo
└── workflows-backup/            # JSON exports de n8n (2026-02-03)
    ├── Sales_Agent_By_WhatsApp.json       (287K)
    ├── Leraysi_Agente_Calendario.json     (150K)
    ├── Leraysi_Webhook_Pago_Confirmado.json
    ├── Leraysi_Crear_Turno.json
    ├── Leraysi_Reprogramar_Turno.json
    ├── Leraysi_Cancelar_Turno.json
    └── Load_Services.json
```

---

## Flujo principal — Sales_Agent_By_WhatsApp (85 nodos)

```
WhatsApp -> Chatwoot webhook -> n8n

STAGE 1: FILTER (5 nodos)
  Webhook -> checkIfMessageCreated -> checkIfClientMessage -> If_Estado_!=_OFF -> MessageType

STAGE 2: ROUTING por tipo de mensaje
  MessageType [text]  -> Normalize_Inbound -> Buffer
  MessageType [audio] -> DownloadAudio -> TranscribeAudio (Whisper) -> NormalizeTranscription -> Normalize_Inbound
  MessageType [image] -> Baserow List Rows -> IF_WaitingImage
    [true]  -> GetImageFromChatwoot -> ExtractBase64 -> VisionAnalyzeHair (Claude Sonnet) -> ParseVisionResponse -> Image History Path
    [false] -> (dropped)

STAGE 3: BUFFER (Redis, ventana 8s)
  Normalize_Inbound -> PushBufferEvent (Redis) -> Buf_FetchAll -> Ctrl_WindowDecision
    [Nothing]  -> Util_NoOp (end - mensaje duplicado/stale)
    [Wait]     -> Ctrl_WaitSilence (8s) -> Buf_FetchAll (loop)
    [Continue] -> Buf_Flush -> Buf_SplitItems -> Buf_ParseJSON -> Buf_NormalizeParts -> Buf_SortByTs -> Buf_ConcatTexts -> Buf_FinalizePayload

STAGE 4: REGISTER LEAD
  Build Lead Row -> FindByChatwootId (Baserow) -> PickLeadRow -> MergeForUpdate -> checkIfLeadAlreadyRegistered
    [nuevo]    -> CreatePayload -> createLeadBaserow -> CreatePayloadOdoo -> CreateLeadOdoo -> UpdateLeadWithLead_Id -> WELCOME AGENT
    [existente] -> UpdatePayload -> UpdateLeadWithRow_Id -> ComposeProfile -> PROFILE & HISTORY

STAGE 5: WELCOME AGENT (leads nuevos, GPT-4.1-mini)
  Create an item (log Odoo) -> AI Agent Welcome -> Filter Output Initial -> Create an item1 (log Odoo) -> ResponseType
    [audio] -> GenerateAudio (Piper TTS) -> ResponseChatwootAudio
    [text]  -> ResponseChatwootText

STAGE 6: PROFILE & HISTORY (leads existentes)
  ComposeProfile -> UpdateDescription (Odoo) -> Register incoming message (Odoo) -> Get Chat History -> Chat History Filter -> HydrateForHistory
  [image path]: Get Chat History1 -> Chat History Filter1 -> HydrateForHistory_2 -> LoadProfileAndStateImage

STAGE 7: MASTER AGENT (GPT-4o, temp=0.2)
  Input Main -> Master AI Agent-Main -> Output Main -> Gate: NO_REPLY/Empty
    [valid] -> StatePatchLead (Baserow 16 campos) -> UpdateEmailLead (Odoo) -> Record Agent Response (Odoo) -> ResponseType1
      [audio] -> GenerateAudio1 (Piper TTS) -> ResponseChatwootAudio1
      [text]  -> Output to Chatwoot
    [empty] -> (dropped)
```

---

## Inventario de nodos (85)

### Filter (5)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Webhook | webhook | POST endpoint Chatwoot |
| checkIfMessageCreated | if | Filtra solo `message_created` |
| checkIfClientMessage | if | Filtra solo `incoming` |
| If_Estado_!=_OFF | if | Verifica sender no OFF |
| MessageType | switch | Rutea: image/audio/text |

### Audio (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| DownloadAudio | httpRequest | Descarga audio de Chatwoot |
| TranscribeAudio | openAi | Whisper transcripcion |
| NormalizeTranscription | set | Reemplaza body.content con texto |

### Image (7)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Baserow List Rows | baserow | Busca lead por sender.id |
| IF_WaitingImage | if | Verifica flag waiting_image |
| GetImageFromChatwoot | httpRequest | Descarga imagen |
| ExtractBase64 | code | Convierte binario a base64 |
| VisionAnalyzeHair | httpRequest | Claude Sonnet analiza cabello |
| ParseVisionResponse | code | Extrae JSON del analisis |
| LoadProfileAndStateImage | code | Construye perfil con image_analysis |

### Buffer Redis (9)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Normalize_Inbound | code | Normaliza payload: pais, tz, canal |
| PushBufferEvent | redis | Push a lista Redis por telefono |
| Buf_FetchAll | redis | Get all mensajes buffereados |
| Ctrl_WindowDecision | switch | 3-way: Nothing/Continue/Wait |
| Util_NoOp | noOp | Sink para mensajes stale |
| Ctrl_WaitSilence | wait | Espera 8s |
| Buf_Flush | redis | Delete buffer key |
| Buf_SplitItems | splitOut | Divide lista en items |
| Buf_ParseJSON | set | Parsea JSON de cada item |

### Buffer Normalization (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Buf_NormalizeParts | set | Extrae message_text y timestamp |
| Buf_SortByTs | sort | Ordena por timestamp |
| Buf_ConcatTexts | aggregate | Concatena textos en array |

### Payload (1)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Buf_FinalizePayload | set | Reensambla profile_base + event |

### Lead Registration (10)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Build Lead Row | code | Mapea datos a estructura Baserow |
| FindByChatwootId | baserow | Busca en LeadsLeraysi por chatwoot_id |
| PickLeadRow | code | Selecciona primer row valido |
| MergeForUpdate | merge | Combina PickLeadRow + Build Lead Row |
| checkIfLeadAlreadyRegistered | if | Rutea create vs update |
| CreatePayload | code | Valida selects/interests para Baserow |
| createLeadBaserow | baserow | Crea fila en tabla 851 |
| CreatePayloadOdoo | code | Construye crm.lead payload |
| CreateLeadOdoo | odoo | Crea lead en Odoo CRM |
| UpdateLeadWithLead_Id | baserow | Actualiza con lead_id de Odoo |

### Welcome Agent (5)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Create an item | odoo | Log mensaje cliente en Odoo |
| AI Agent Welcome | agent | GPT-4.1-mini, saludo inicial |
| Filter Output Initial | code | Formatea para WhatsApp + Odoo HTML |
| Create an item1 | odoo | Log respuesta agente en Odoo |
| ResponseType | if | Rutea: audio o texto |

### Welcome Output (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| ResponseChatwootText | httpRequest | Envia texto via Chatwoot |
| GenerateAudio | httpRequest | TTS via Piper |
| ResponseChatwootAudio | httpRequest | Envia audio via Chatwoot |

### Update Lead Path (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| UpdatePayload | code | Extrae row_id + campos para update |
| UpdateLeadWithRow_Id | baserow | Actualiza lead existente |
| ComposeProfile | code | Transforma row en perfil estructurado |

### Profile & History (5)
| Nodo | Tipo | Funcion |
|------|------|---------|
| UpdateDescription | odoo | Actualiza descripcion en Odoo |
| Register incoming message | odoo | Log mail.message en Odoo |
| Get Chat History from Lead | odoo | Fetch todos los mail.message |
| Chat History Filter | code | Limpia, deduplica, infiere roles |
| HydrateForHistory | merge | Merge historial + perfil |

### Image History Path (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Get Chat History from Lead1 | odoo | Fetch historial (path imagen) |
| Chat History Filter1 | code | Mismo filtro (path imagen) |
| HydrateForHistory_2 | merge | Merge historial + perfil imagen |

### Master Agent (5)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Input Main | code | Construye userPrompt con historial, state, imagen |
| Master AI Agent-Main | agent | GPT-4o, temp=0.2, maxTokens=4000 |
| OpenAI Chat Model1 | lmChatOpenAi | Config modelo GPT-4o |
| Qdrant Vector Store - Services | vectorStoreQdrant | RAG servicios_leraysi (top 5) |
| Embeddings OpenAI | embeddingsOpenAi | Embeddings para Qdrant |

### Output Processing (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| Output Main | code | Parsea JSON LLM, aplica state_patch, monotonic counters |
| Gate: NO_REPLY / Empty | if | Filtra respuestas vacias/NO_REPLY |
| StatePatchLead | baserow | Update 16 campos en Baserow |

### Final Output (6)
| Nodo | Tipo | Funcion |
|------|------|---------|
| UpdateEmailLead | odoo | Actualiza email en Odoo |
| Record Agent Response | odoo | Log respuesta en Odoo |
| ResponseType1 | if | Rutea: audio o texto |
| Output to Chatwoot | httpRequest | Envia texto final via Chatwoot |
| GenerateAudio1 | httpRequest | TTS final via Piper |
| ResponseChatwootAudio1 | httpRequest | Envia audio final via Chatwoot |

### AI Sub-components Welcome (4)
| Nodo | Tipo | Funcion |
|------|------|---------|
| OpenAI Chat Model2 | lmChatOpenAi | GPT-4.1-mini (temp=0.4, maxTokens=150) |
| Simple Memory | memoryBufferWindow | 10 mensajes contexto |
| Qdrant Vector Store1 | vectorStoreQdrant | RAG servicios para welcome |
| Embeddings OpenAI1 | embeddingsOpenAi | Embeddings para welcome |

### Tools Sub-workflows (3)
| Nodo | Tipo | Funcion |
|------|------|---------|
| agendar_turno_leraysi | toolWorkflow | Trigger Agente Calendario |
| odoo_schedule_meeting | toolWorkflow | (DISABLED) |
| odoo_send_email | toolWorkflow | (DISABLED) |

### Sticky Notes (7)
Filter Process, Register Leads, Buffer Messages, Profile and State Zone, Master Agent area, Audio and Image Zone, Backup Tools Leonobitech

---

## Agente Calendario — Sub-workflow (21 nodos)

```
When Executed by Another Workflow
  -> ParseInput (valida, calcula duracion por servicio/complejidad)
  -> GetTurnosSemana (Baserow 852, proximos 7 dias)
  -> AnalizarDisponibilidad (capacidad: max 6/dia, max 2 pesados, max 1 muy_pesado)
  -> BuildAgentPrompt (instrucciones deterministicas pre-calculadas)
  -> Agente Calendario (GPT-4.1-mini, temp=0.2 — EJECUTOR, no toma decisiones)
  -> ParseAgentResponse (extrae JSON, mapea estado -> accion)
  -> SwitchAccion:
      [turno_creado]        -> PrepararTurnoBaserow -> CrearTurnoBaserow -> FormatearRespuestaExito
      [turno_reprogramado]  -> Get many rows -> PrepararReprogramadoBaserow -> ActualizarTurnoBaserow -> FormatearRespuestaReprogramado
      [sin_disponibilidad]  -> FormatearRespuestaSinDisponibilidad
      [error]               -> FormatearRespuestaError.js
```

### Configuracion de duraciones (ParseInput)

| Servicio | Base (min) |
|----------|-----------|
| Peinados | 45 |
| Corte | 60 |
| Color | 90 |
| Mechas | 120 |
| Tintura | 75 |
| Alisado | 120 |
| Balayage | 150 |
| Manicura | 45 |
| Pedicura | 60 |
| Depilacion | 30 |
| Tratamiento | 90 |

Multiplicadores: largo cabello (0.8-1.5x), complejidad (0.9-1.4x). Redondeado a 15 min.

### Capacidad diaria
- Max 6 turnos/dia
- Max 2 pesados/dia (>90 min)
- Max 1 muy_pesado/dia (>150 min)
- Jornada: 480 min (8h)
- Domingo: cerrado

### Config turnos
- Sena: 30% del precio
- Expiracion reserva: 120 min
- Estado inicial: `pendiente_pago`

---

## Webhook Pago Confirmado (8 nodos)

```
WebhookPagoConfirmado (POST, auth: MP-Webhook-Secret)
  -> BuscarTurnoPorMP (Baserow 852, filtro por mp_preference_id)
  -> ActualizarTurnoPagado (Baserow update: sena_pagada, estado, mp_payment_id, confirmado_at)
  -> ObtenerLead (Baserow 851, por clienta_id)
  -> TurnoLeadConfirmado (Code: construye mensaje confirmacion + baserow_update + state)
  -> UpdateLead (Baserow 851: turno_agendado, turno_fecha, sena_pagada, notes)
  -> UpdateChatterLead (Odoo: mail.message en crm.lead)
  -> Output to Chatwoot (mensaje WhatsApp de confirmacion)
```

---

## Sub-workflows Turno (via odoo-mcp:8100)

Todos siguen el patron: `Trigger -> TransformForMCP (Code) -> HTTP Request (odoo_mcp:8100/internal/mcp/call-tool)`

### Crear Turno (3 nodos)
- Tool: `leraysi_crear_turno`
- Params requeridos: clienta, telefono, servicio, fecha_hora, precio
- Params opcionales: email, duracion, servicio_detalle, lead_id

### Reprogramar Turno (3 nodos)
- Tool: `leraysi_reprogramar_turno`
- Params: lead_id, nueva_fecha_hora, motivo

### Cancelar Turno (2 nodos)
- Tool: `leraysi_cancelar_turno`
- Passthrough (sin transformacion)

---

## Load Services — RAG Pipeline (11 nodos, inactivo)

```
Manual Trigger -> Get many rows (Baserow 850, ServiciosLeraysi)
  -> FilterJsonCleanLeraysi (Code: extrae contenido_rag, payload con metadata)
  -> Qdrant Vector Store (insert, coleccion: servicios_leraysi)
     <- Embeddings OpenAI (batch 200)
     <- Default Data Loader <- Token Splitter (chunk 200, overlap 20)
```

Nota: tiene nodo `FilterJsonCleanLeonobitech` DISABLED (residuo del agente original).

---

## Tools del Master Agent

| Tool | Tipo | Descripcion |
|------|------|-------------|
| `qdrant_servicios_leraysi` | Qdrant Vector Store (RAG) | Busca servicios por similitud semantica (top 5). Coleccion: servicios_leraysi |
| `agendar_turno_leraysi` | Sub-workflow | Trigger Agente Calendario. Pasa `llm_output` + `state` |
| `odoo_schedule_meeting` | Sub-workflow | (DISABLED) Agendar meeting Odoo |
| `odoo_send_email` | Sub-workflow | (DISABLED) Enviar email Odoo |

---

## Servicios externos

| Servicio | Conexion | Uso |
|----------|----------|-----|
| Chatwoot | `http://chatwoot:3000` (API + webhook) | Enviar/recibir mensajes WhatsApp |
| Anthropic Claude | `https://api.anthropic.com/v1/messages` (Sonnet) | Analisis de fotos de cabello |
| Piper TTS | `http://piper_tts:5000/tts` | Text-to-speech para respuestas audio |
| OpenAI | LangChain nodes | GPT-4o (master), GPT-4.1-mini (welcome/calendario), Whisper (audio), Embeddings |
| Qdrant | LangChain nodes | Vector search servicios |
| Baserow | n8n native | CRM leads (851), turnos (852), servicios (850) |
| Odoo | n8n native + odoo-mcp:8100 | CRM lead + mail.message + calendario |
| Redis | n8n native | Buffer mensajes (push/get/delete por telefono) |
| Mercado Pago | Via Odoo addon | Links de pago para senas |

---

## Credenciales n8n

| Credential | ID | Uso |
|------------|-------|-----|
| Baserow account | `Uy274LWj78wGDPVF` | Todas las operaciones Baserow |
| odoo-mcp | `O6mz2TMAB8RUn2lr` | HTTP auth para odoo_mcp:8100 |
| Odoo-Felix | `DHBH1iLumuDr9deF` | n8n Odoo native node |
| MP-Webhook-Secret | `1Bn50mFkuOxYg59P` | Auth webhook Mercado Pago |
| Chatwoot Auth account | `4CCgRLgHR96JW4Ue` | API Chatwoot |
| OpenAi account | `xez5pcf77ZJRSNdl` | GPT + Whisper + Embeddings |
| QdrantApi account | `Jhuxh7GVQvmEPnwp` | Vector store |

---

## Tablas Baserow

### LeadsLeraysi (ID: 851)

**Identificacion**: lead_id, chatwoot_id, chatwoot_inbox_id, conversation_id, full_name, nick_name, phone_number, email
**Stage**: `explore` -> `consulta` -> `presupuesto` -> `turno_pendiente` -> `turno_confirmado`
**Metadata**: channel, country, tz, priority (normal/high/low)
**Intereses**: servicio_interes (string), interests (multi-select: Corte, Alisado, Color, Unas, Depilacion)
**Contadores** (monotonicos, Math.max): services_seen, prices_asked, deep_interest
**Flags**: waiting_image, foto_recibida, presupuesto_dado, turno_agendado, sena_pagada
**Imagen**: image_analysis (JSON: is_hair_photo, length, condition, current_color, has_roots, is_dyed, texture, complexity, notes)
**Cooldowns**: email_ask_ts, fullname_ask_ts (timestamps anti-spam)
**Tracking**: last_message, last_message_id, last_activity_iso, description, notes

### ServiciosLeraysi (ID: 850)

Catalogo: servicio, categoria, precio_base, requiere_foto, tiempo_estimado, notas, contenido_rag (formula para embeddings).

### TurnosLeraysi (ID: 852)

23 campos: fecha, hora, clienta_id (link a 851), nombre_clienta, servicio (multi-select), servicio_detalle, duracion, precio, sena_monto, sena_pagada, estado (pendiente_pago/confirmado/completado/cancelado/expirado), mp_link, mp_preference_id, mp_payment_id, odoo_turno_id, confirmado_at, expira_at, notas, conversation_id, updated_at.

---

## Personalidad del agente

### Master Agent (Leraysi v3)
- **Identidad**: Estilista venezolana asistente de Estilos Leraysi
- **Prefijo**: Siempre `⋆˚🧚‍♀️` al inicio
- **Expresiones**: "mi amor", "bella", "reina", "mi vida"
- **Emojis**: Max 2-3 por mensaje. 💅 💇‍♀️ 💋 ✨ 🌸 💖
- **Idioma**: Solo espanol (LATAM)
- **Regla critica**: SIEMPRE consultar `qdrant_servicios_leraysi` antes de dar precios. NUNCA inventar.

### Welcome Agent (LERA)
- **Identidad**: "Lera", saludo calido de primer contacto
- **Reglas**: Max 2 oraciones, WhatsApp-friendly, sin precios, sin horarios, sin listas, no pedir nombre
- **Modelo**: GPT-4.1-mini, temp=0.4, maxTokens=150

### Formato respuesta Master Agent
```json
{
  "content_whatsapp": "texto del mensaje",
  "state_patch": {
    "stage": "consulta",
    "servicio_interes": "Alisado",
    "interests": ["Alisado"],
    "services_seen": 1,
    "prices_asked": 0,
    "deep_interest": 0,
    "waiting_image": false,
    "foto_recibida": false,
    "presupuesto_dado": false,
    "full_name": null,
    "email": null
  }
}
```

---

## Code nodes clave

### Normalize_Inbound
Detecta pais por prefijo telefonico (15+ codigos), resuelve timezone, normaliza canal, limpia HTML, extrae identidad del sender.

### Build Lead Row
Mapea datos normalizados a estructura Baserow: `row_on_create` (defaults), `row_always` (updates seguros), `keys` (lookup).

### ComposeProfile
3-tier row detection. Normaliza selects Baserow via `pickVal()`. Parsea `image_analysis`. Construye perfil 30+ campos.

### Chat History Filter
`inferRole()` detecta user/assistant/system por patrones HTML/emojis/message_type. Deduplica por ID o hash (role+text+minuto). Cap 200 mensajes.

### Input Main
Construye userPrompt con: ultimos 10 mensajes, state actual (stage, service, flags, counters), seccion image_analysis si hay foto, ultimo mensaje a responder.

### Output Main (v3.0)
3 intentos de JSON parsing. Protected fields (row_id, lead_id, chatwoot_id). Contadores monotonicos (`Math.max`). Merge interests (set union). Timestamps automaticos. Notas dinamicas por stage. Sanitiza max 3500 chars.

---

## Patrones arquitectonicos

| Patron | Descripcion |
|--------|-------------|
| **Buffer-Window** | Redis 8s para agregar mensajes rapidos, evita explosion de procesamiento |
| **Two-tier AI** | Welcome (GPT-4.1-mini, simple) para nuevos + Master (GPT-4o, completo) para existentes |
| **Deterministic Calendar** | AnalizarDisponibilidad calcula TODO antes del LLM; el agente solo ejecuta tool calls |
| **Snapshot-Diff-Patch** | state_base -> LLM -> state_patch -> monotonic merge -> Baserow update |
| **3-Tier Fallback** | ComposeProfile: results[0] -> direct object -> row property |
| **Multi-modal I/O** | Audio (Whisper in, Piper out) + Image (Claude Sonnet vision) + Text |
| **Parallel CRM** | Baserow (state rapido) + Odoo (CRM formal) sincronizados en cada paso |
