# Legacy Scripts

Scripts de la infraestructura original que incluía n8n, Baserow, Piper TTS, Qdrant y WA Signature Proxy.

Estos servicios fueron dados de baja el **2026-03-20** como parte del pivot hacia el producto de voice agent con IA conectado a Odoo.

## deploy.sh

Script de CI/CD que se ejecutaba en el VPS (`/home/len/scripts/deploy.sh`) al hacer `git push` a `main`. Manejaba:

- **n8n** (main + webhook + 2 workers): Workflows de automatización (WhatsApp agent, appointment agent, calendar agent)
- **Baserow** (backend + celery x3 + frontend + media server): Base de datos para leads, turnos, servicios
- **Qdrant**: Vector DB (no se llegó a usar en producción)
- **Piper TTS**: Text-to-speech local (reemplazado por ElevenLabs cloud)
- **WA Signature Proxy**: HMAC proxy para webhooks de WhatsApp/Meta
- **Odoo + Odoo MCP**: ERP + conector MCP (estos siguen activos)
- **Core**: Auth microservice (sigue activo)

### Servicios que siguen activos

| Servicio | Propósito |
|----------|-----------|
| `core` | Auth microservice (Express + Prisma) |
| `odoo` | ERP |
| `odoo_mcp` | MCP connector para Odoo |
| `voice_agent` | Voice AI agent (LiveKit + Deepgram + ElevenLabs + Claude) |
| `traefik` | Reverse proxy + SSL |
| `postgres_odoo` | DB de Odoo |
| `redis_core` | Cache de tokens auth |

### Servicios dados de baja

| Servicio | Razón |
|----------|-------|
| `n8n_main`, `n8n_webhook_1`, `n8n_worker_1`, `n8n_worker_2`, `postgres_n8n`, `redis_n8n` | Demasiado lento para voice real-time. Funcionalidad migra al voice agent directo |
| `baserow`, `baserow_backend`, `baserow_celery`, `baserow_celery_beat`, `baserow_celery_export_worker`, `baserow_media_server`, `postgres_baserow`, `redis_baserow` | Estado de conversación se manejará en memoria del agent + Odoo CRM |
| `piper_tts` | Reemplazado por ElevenLabs Flash cloud |
| `qdrant` | No se usaba en producción |
| `wa_signature_proxy` | WhatsApp agent pausado, se retoma después |
