# CLAUDE.md — Agente Leraysi

Agente de ventas por WhatsApp para **Estilos Leraysi**, salon de belleza femenino en Buenos Aires, Argentina.

---

## Overview

Chatbot que atiende clientas por WhatsApp: consulta de servicios, presupuestos (con foto para precios variables), agendamiento de turnos y cobro de seña via Mercado Pago.

**Stack**: n8n (orquestacion) + GPT-4o-mini (master agent) + GPT-3.5-turbo (analyst) + Chatwoot (WhatsApp) + Baserow (CRM) + Odoo (calendario/ERP) + Qdrant (RAG servicios) + Mercado Pago (pagos)

**Workflow principal**: `Sales_Agent_By_WhatsApp` (85 nodos, tag: `leonobitech`)

---

## Estructura de archivos

```
agents/leraysi/
├── 1-sales-agent-leraysi/          # Workflow principal
│   ├── nodes-code-leraysi/         # Nodos core: ComposeProfile, Input Main, Output Main
│   ├── system-prompt-leraysi/      # System prompt del Master Agent (personalidad Leraysi)
│   ├── sub-workflow-agente-calendario/  # Sub-workflow de turnos
│   │   ├── nodes-code/             # 13 nodos: disponibilidad, preparar turno, formatear respuesta
│   │   ├── system-prompt/          # Prompt del Agente Calendario
│   │   └── tools-mcp/             # 4 tools MCP: crear/reprogramar/consultar/confirmar turno
│   └── sub-workflow-webhook-pago-confirmado/  # Webhook Mercado Pago
├── baserow-schema/                 # Schema completo de tablas Baserow
├── docs/                           # 75+ docs: nodos individuales, arquitectura, testing
├── master-agent-v2/                # v2.0 simplificado (30 nodos) + prompts v5-v8
├── prompts/                        # System prompts: master-agent + llm-analyst
├── qdrant-rag-backup/              # Config RAG + workflow de vectorizacion
├── nodes-code-original/            # Backup nodos v1.0
├── n8n-mcp-workflows/              # Config HTTP nodes para MCP
└── src/                            # Servicios auxiliares
```

---

## Flujo del agente

```
WhatsApp → Chatwoot webhook → n8n
  1. FILTER (5 checks: message_created, client, not offline, text, normalize)
  2. BUFFER (ventana 30s, agrega mensajes rapidos)
  3. REGISTER LEAD (crear/actualizar en Baserow + Odoo)
  4. ANALYSIS (fork-join):
     - LLM Analyst (GPT-3.5) → intent + flags
     - Snapshot state baseline (para diff/patch)
  5. MASTER AGENT (GPT-4o-mini):
     - Input: historial, perfil, state, tools, reglas
     - Output: JSON {content_whatsapp, state_patch}
     - Tools: qdrant_servicios_leraysi, agendar_turno_leraysi
  6. OUTPUT → WhatsApp (Chatwoot) + Baserow (state) + Odoo (CRM)
```

**Latencia**: 7.7-8.8s end-to-end | **Costo**: ~$0.08-0.10/mensaje

---

## Tablas Baserow

### LeadsLeraysi (ID: 851)

Campos principales:
- **Identificacion**: lead_id, chatwoot_id, conversation_id, full_name, phone_number, email
- **Stage**: `explore` → `consulta` → `presupuesto` → `turno_pendiente` → `turno_confirmado`
- **Intereses**: Corte, Alisado, Color, Unas, Depilacion (valores canonicos exactos)
- **Contadores** (monotonicos, nunca bajan): services_seen, prices_asked, deep_interest
- **Flags**: waiting_image, foto_recibida, presupuesto_dado, turno_agendado, sena_pagada
- **Imagen**: image_analysis (JSON: length, texture, complexity)
- **Cooldowns**: email_ask_ts, fullname_ask_ts (anti-spam, no re-preguntar)

### ServiciosLeraysi (ID: 850)

Catalogo de servicios con precio_base, tiempo_estimado, requiere_foto, contenido_rag (para embeddings).

### TurnosLeraysi (ID: 852)

Turnos con 23 campos: fecha, hora, servicio, duracion, precio, sena_monto, estado (pendiente_pago/confirmado/completado/cancelado/expirado), mp_link, mp_payment_id, odoo_event_id.

**Config dinamica**: RESERVA_EXPIRACION=120min, SENA_PORCENTAJE=30%, duraciones por complejidad (60/90/120/180 min).

---

## Personalidad del agente

- **Estilo**: Venezolana, carismatica, WhatsApp-friendly
- **Prefijo**: Siempre `⋆˚🧚‍♀️` al inicio del mensaje
- **Expresiones**: "mi amor", "bella", "reina", "mi vida"
- **Emojis**: 💅 💇‍♀️ 💋 ✨ 🌸 💖
- **Idioma**: Solo espanol (latam)

---

## Servicios y precios

| Categoria | Tipo precio | Requiere foto |
|-----------|-------------|---------------|
| Corte | Variable | Si |
| Alisado | Variable | Si |
| Color (mechas, tintura, balayage) | Variable | Si |
| Unas (manicura $15k, pedicura $18k) | Fijo | No |
| Depilacion | Fijo | No |

**Regla critica**: SIEMPRE consultar `qdrant_servicios_leraysi` antes de dar precios. Nunca inventar precios.

---

## Tools MCP del agente

### Master Agent
- `qdrant_servicios_leraysi` — RAG: busca servicios por similitud semantica (top 3-5)
- `agendar_turno_leraysi` — Trigger sub-workflow de calendario

### Agente Calendario (sub-workflow)
- `leraysi_crear_turno` — Crear turno + generar link Mercado Pago
- `leraysi_reprogramar_turno` — Reprogramar turno existente
- `leraysi_consultar_turnos_dia` — Ver turnos de un dia
- `leraysi_confirmar_turno_pago` — Confirmar turno post-pago

### Odoo Tools (11 tools via odoo_mcp:8100)
- `odoo_send_email`, `odoo_schedule_meeting`, `odoo_update_deal_stage`
- `odoo_get_leads`, `odoo_create_lead`, `odoo_get_opportunities`
- `odoo_search_contacts`, `odoo_create_contact`
- `odoo_get_sales_report`, `odoo_create_activity`, `odoo_get_deal_details`

---

## Patrones arquitectonicos

| Patron | Descripcion |
|--------|-------------|
| **Fork-Join** | Analyst + snapshot en paralelo, merge para flags |
| **Buffer-Window** | 30s para agregar mensajes rapidos, evita explosion |
| **Snapshot-Diff-Patch** | state_base → LLM → state_llm → diff monotonic → patch |
| **3-Tier Fallback** | ComposeProfile → raw Baserow row → current $json |

---

## Workflows n8n relacionados

| Workflow | Nodos | Funcion |
|----------|-------|---------|
| Sales_Agent_By_WhatsApp | 85 | Agente principal |
| Leraysi - Agente Calendario | 21 | Sub-workflow turnos |
| Leraysi - Webhook Pago Confirmado | 8 | Confirmar pago MP |
| Leraysi - Crear Turno | 3 | Crear turno en Odoo |
| Leraysi - Reprogramar Turno | 3 | Reprogramar turno |
| Leraysi - Cancelar Turno | 2 | Cancelar turno |

---

## Archivos clave para empezar

1. `baserow-schema/README.md` — Modelo de datos completo
2. `1-sales-agent-leraysi/system-prompt-leraysi/Master AI Agent-Main.md` — Personalidad + reglas
3. `qdrant-rag-backup/README.md` — Sistema RAG
4. `docs/WORKFLOW-COMPLETO-RESUMEN.md` — Overview 56 nodos
5. `docs/ARCHITECTURE-FLOW.md` — Fork-join patterns
6. `1-sales-agent-leraysi/sub-workflow-agente-calendario/` — Sistema de turnos completo
