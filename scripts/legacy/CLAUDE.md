# CLAUDE.md — Legacy Infrastructure

## Contexto

El 2026-03-20 se dieron de baja 17 containers del VPS para liberar recursos para el voice agent. Los containers NO fueron eliminados, solo detenidos con `docker stop`. Los datos persisten en los volúmenes Docker.

## Cómo reactivar n8n

```bash
# SSH al VPS
ssh lnbt

# Levantar n8n con sus dependencias
sudo -u len bash -c 'cd /home/len/backend && docker compose --env-file .env up -d n8n_main n8n_webhook_1 n8n_worker_1 n8n_worker_2 postgres_n8n redis_n8n'

# Verificar que arrancó
sudo docker logs n8n_main --tail 10
```

**URL**: https://n8n.leonobitech.com (Traefik sigue activo, la ruta funciona)

**Workflows importantes que estaban activos**:
- `Appointment Agent` (ID: `0Hj5gpSltdjjzPT0`) — 108 nodos, agente de citas dual-channel (WhatsApp + Telegram)
- `Sales_Agent_By_WhatsApp` (ID: `7WjUcj8Jms1Rmm1o`) — 103 nodos, agente de ventas WhatsApp

**Workflow problemático** (ya desactivado):
- ID: `hnmlPLIiklscTgQj` — Se ejecutaba cada 5 min, generó 19,447 ejecuciones innecesarias. Error: `deleteBefore.toISOString is not a function`. NO reactivar.

## Cómo reactivar Baserow

```bash
sudo -u len bash -c 'cd /home/len/backend && docker compose --env-file .env up -d baserow baserow_backend baserow_celery baserow_celery_beat baserow_celery_export_worker baserow_media_server postgres_baserow redis_baserow'
```

**URL**: https://br.leonobitech.com

**Tablas importantes**:
| ID | Tabla | Uso |
|----|-------|-----|
| 854 | LeadsLeraysi | Leads del salón de belleza |
| 855 | TurnosLeraysi | Turnos/citas |
| 856 | ServiciosLeraysi | Catálogo de servicios |
| 868 | Avatars | Avatares de usuarios |
| 869 | Podcasts | Episodios de podcast |

## Cómo reactivar otros servicios

```bash
# Piper TTS (solo si necesitas TTS local gratis)
sudo docker start piper_tts

# Qdrant (vector DB, no se usaba en producción)
sudo docker start qdrant

# WA Signature Proxy (para webhooks WhatsApp/Meta)
sudo docker start wa_signature_proxy
```

## Estado actual del VPS (post-limpieza)

Solo 7 containers activos:
- `voice_agent` — Voice AI agent (LiveKit + Deepgram + ElevenLabs + Claude)
- `core` — Auth microservice
- `odoo` — ERP
- `odoo_mcp` — MCP connector
- `traefik` — Reverse proxy + SSL
- `postgres_odoo` — DB Odoo
- `redis_core` — Cache auth

**Recursos liberados**: ~2.8 GB RAM, ~25% CPU idle adicional.

## Deploy script

El `deploy.sh` original (`/home/len/scripts/deploy.sh` en el VPS) rebuildeaba TODOS los servicios incluyendo los que se dieron de baja. Si se reactiva n8n o Baserow, hay que actualizar el deploy script para incluirlos de nuevo.

El CI/CD (GitHub Actions → SSH → deploy.sh) sigue funcionando pero ahora solo rebuildeará los servicios que están en el docker-compose y corriendo.
