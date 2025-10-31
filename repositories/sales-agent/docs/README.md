# Sales Agent Workflow - Documentación Técnica

## Descripción General

Agente de ventas automatizado por WhatsApp que gestiona leads, mantiene historial de conversación en Odoo, y utiliza LLMs para análisis y respuestas contextuales.

## Arquitectura del Sistema

### Componentes Principales

1. **Receptor de WhatsApp** - Punto de entrada de mensajes
2. **Gestión de Estado (Baserow)** - Perfil y flags del lead
3. **Sistema de Historial (Odoo)** - Almacenamiento en chatter de oportunidades
4. **LLM Analista** - Análisis y resumen de conversación
5. **Agente Master** - Toma de decisiones y respuestas
6. **RAG con Qdrant** - Base de conocimiento de servicios

---

## Etapas del Workflow

El workflow está dividido en etapas lógicas bien definidas:

### ✅ ETAPA 1: Filter Process (Filtrado y Validación)
**Estado**: Completada y documentada
**Nodos**: 5 nodos de validación secuencial
**Función**: Filtrar webhooks de Chatwoot para procesar solo mensajes válidos

[📖 Ver documentación completa de ETAPA 1](./00-ETAPA-1-FILTER-PROCESS.md)

**Nodos incluidos**:
1. [webhook](./01-webhook-entrada.md) - Receptor de webhooks de Chatwoot
2. [checkIfMessageCreated](./02-check-if-message-created.md) - Filtro de evento
3. [checkIfClientMessage](./03-check-if-client-message.md) - Filtro de dirección
4. [If_Estado_!=_OFF](./04-if-estado-not-off.md) - Filtro de estado del lead
5. [isTexto?](./05-is-texto.md) - Filtro de tipo de contenido

---

### ✅ ETAPA 2: Buffer Messages (Redis)
**Estado**: Completada y documentada
**Nodos**: 12 nodos con loop de ventana temporal
**Función**: Agrupar mensajes consecutivos usando Redis y ventana temporal de 8 segundos

[📖 Ver documentación completa de ETAPA 2](./00-ETAPA-2-BUFFER-MESSAGES.md)

**Nodos incluidos**:
6. [Normalize_Inbound](./06-normalize-inbound.md) - Transformación de payload Chatwoot
7. [PushBufferEvent](./07-push-buffer-event.md) - Redis RPUSH al buffer
8. [Buf_FetchAll](./08-buf-fetch-all.md) - Redis GET del buffer
9. [Ctrl_WindowDecision](./09-ctrl-window-decision.md) - Switch de ventana temporal
10. [Ctrl_WaitSilence](./10-ctrl-wait-silence.md) - Wait 8s (loop back)
11. [Buf_Flush](./11-buf-flush.md) - Redis DELETE del buffer
12. [Buf_SplitItems](./12-buf-split-items.md) - Split array a items individuales
13. [Buf_ParseJSON](./13-buf-parse-json.md) - Parse JSON strings
14. [Buf_NormalizeParts](./14-buf-normalize-parts.md) - Proyección de campos
15. [Buf_SortByTs](./15-buf-sort-by-ts.md) - Sort cronológico
16. [Buf_ConcatTexts](./16-buf-concat-texts.md) - Aggregate a array
17. [Buf_FinalizePayload](./17-buf-finalize-payload.md) - Reintegración de datos

---

### ✅ ETAPA 3: Register Leads (Baserow/Odoo)
**Estado**: Completada y documentada
**Nodos**: 15 nodos (Create Flow completo)
**Función**: Registrar leads en Baserow/Odoo, generar respuesta de bienvenida con IA, y enviar a WhatsApp

[📖 Ver documentación completa de ETAPA 3](./00-ETAPA-3-REGISTER-LEADS.md)

**Nodos incluidos**:
18. [Build Lead Row](./18-build-lead-row.md) - Construcción de estructura upsert-safe
19. [FindByChatwootId](./19-find-by-chatwoot-id.md) - Búsqueda de lead existente
20. [PickLeadRow](./20-pick-lead-row.md) - Normalización de respuesta Baserow
21. [MergeForUpdate](./21-merge-for-update.md) - Combinación de datos
22. [checkIfLeadAlreadyRegistered](./22-check-if-lead-already-registered.md) - Bifurcación Create/Update
23. [CreatePayload](./23-create-payload.md) - Sanitización de datos
24. [createLeadBaserow](./24-create-lead-baserow.md) - Inserción en Baserow
25. [CreatePayloadOdoo](./25-create-payload-odoo.md) - Adaptación de schema Odoo
26. [CreateLeadOdoo](./26-create-lead-odoo.md) - Creación de oportunidad en Odoo
27. [UpdateLeadWithLead_Id](./27-update-lead-with-lead-id.md) - Enlace bidireccional Baserow↔Odoo
28. [Create an Item](./28-create-an-item.md) - Primer mensaje en chatter Odoo (cliente)
29. [AI Agent Welcome](./29-ai-agent-welcome.md) - Generación de bienvenida con LLM + RAG
30. [Filter Output Initial](./30-filter-output-initial.md) - Formateo dual (HTML Odoo + Texto WhatsApp)
31. [Create an item1](./31-create-an-item1.md) - Segundo mensaje en chatter (respuesta bot)
32. [HTTP Request](./32-http-request-chatwoot.md) - Envío a WhatsApp vía Chatwoot API

---

### ⏳ ETAPA 4: Análisis de Historial (LLM Analista)
**Estado**: Por documentar
**Función**: Analizar y resumir conversación previa

---

### ⏳ ETAPA 5: Agente Master y RAG
**Estado**: Por documentar
**Función**: Generar respuesta contextual con acceso a RAG (Qdrant)

---

### ⏳ ETAPA 6: Almacenamiento y Respuesta
**Estado**: Por documentar
**Función**: Guardar en Odoo/Baserow y enviar respuesta a WhatsApp

---

## Índice de Documentación

### Documentos de Etapas
- [ETAPA 1: Filter Process](./00-ETAPA-1-FILTER-PROCESS.md) ✅
- [ETAPA 2: Buffer Messages](./00-ETAPA-2-BUFFER-MESSAGES.md) ✅
- [ETAPA 3: Register Leads](./00-ETAPA-3-REGISTER-LEADS.md) ✅

### Nodos Documentados

#### ETAPA 1: Filter Process (5 nodos)
1. [Webhook](./01-webhook-entrada.md) - Entrada de mensajes de Chatwoot
2. [checkIfMessageCreated](./02-check-if-message-created.md) - Validación de evento
3. [checkIfClientMessage](./03-check-if-client-message.md) - Validación de mensaje entrante
4. [If_Estado_!=_OFF](./04-if-estado-not-off.md) - Validación de estado activo
5. [isTexto?](./05-is-texto.md) - Validación de contenido texto

#### ETAPA 2: Buffer Messages - Redis (12 nodos)
6. [Normalize_Inbound](./06-normalize-inbound.md) - Transformación y normalización
7. [PushBufferEvent](./07-push-buffer-event.md) - Redis RPUSH
8. [Buf_FetchAll](./08-buf-fetch-all.md) - Redis GET
9. [Ctrl_WindowDecision](./09-ctrl-window-decision.md) - Switch ventana temporal
10. [Ctrl_WaitSilence](./10-ctrl-wait-silence.md) - Wait 8s
11. [Buf_Flush](./11-buf-flush.md) - Redis DELETE
12. [Buf_SplitItems](./12-buf-split-items.md) - Split array
13. [Buf_ParseJSON](./13-buf-parse-json.md) - Parse JSON
14. [Buf_NormalizeParts](./14-buf-normalize-parts.md) - Proyección campos
15. [Buf_SortByTs](./15-buf-sort-by-ts.md) - Sort cronológico
16. [Buf_ConcatTexts](./16-buf-concat-texts.md) - Aggregate array
17. [Buf_FinalizePayload](./17-buf-finalize-payload.md) - Reintegración datos

#### ETAPA 3: Register Leads - Baserow/Odoo (15 nodos)
18. [Build Lead Row](./18-build-lead-row.md) - Construcción estructura upsert
19. [FindByChatwootId](./19-find-by-chatwoot-id.md) - Búsqueda lead existente
20. [PickLeadRow](./20-pick-lead-row.md) - Normalización respuesta
21. [MergeForUpdate](./21-merge-for-update.md) - Combinación datos
22. [checkIfLeadAlreadyRegistered](./22-check-if-lead-already-registered.md) - Bifurcación Create/Update
23. [CreatePayload](./23-create-payload.md) - Sanitización datos
24. [createLeadBaserow](./24-create-lead-baserow.md) - Inserción Baserow
25. [CreatePayloadOdoo](./25-create-payload-odoo.md) - Adaptación schema
26. [CreateLeadOdoo](./26-create-lead-odoo.md) - Creación oportunidad Odoo
27. [UpdateLeadWithLead_Id](./27-update-lead-with-lead-id.md) - Enlace bidireccional
28. [Create an Item](./28-create-an-item.md) - Mensaje chatter Odoo (cliente)
29. [AI Agent Welcome](./29-ai-agent-welcome.md) - LLM bienvenida + RAG
30. [Filter Output Initial](./30-filter-output-initial.md) - Formateo dual HTML/WhatsApp
31. [Create an item1](./31-create-an-item1.md) - Mensaje chatter Odoo (bot)
32. [HTTP Request](./32-http-request-chatwoot.md) - Envío WhatsApp vía Chatwoot

---

## Mejoras Propuestas

### Futuro: Integración MCP con Odoo
- Reemplazar nodos nativos de n8n-Odoo por conector MCP
- Mayor flexibilidad en acciones disponibles
- Mejor control sobre la API de Odoo

---

## Notas de Refactorización

_Este documento se actualizará continuamente durante el proceso de refactor_
