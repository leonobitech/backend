# CLAUDE.md — Chatwoot

Plataforma de mensajeria omnicanal. Conecta WhatsApp con los agentes via webhooks a n8n.

---

## Overview

**Status**: En produccion
**Stack**: Chatwoot (Docker) + WhatsApp Business API
**URL**: https://chat.leonobitech.com (estimado)

---

## Arquitectura

```
WhatsApp -> Chatwoot -> Webhook -> n8n (Sales_Agent_By_WhatsApp)
                                    -> Respuesta -> Chatwoot -> WhatsApp
```

- Un solo WhatsApp conectado
- Se cambia la URL del webhook para switchear entre agente Leraysi y Leonobitech
- Webhooks: `message_created` events filtrados por tipo (client, not offline, text)

---

## TODO

- [ ] Documentar configuracion de inbox/WhatsApp
- [ ] Documentar webhook URL actual y como switchear agentes
- [ ] Documentar API de Chatwoot usada por n8n (enviar mensajes)
- [ ] Documentar workers y sus mem_limits en docker-compose
