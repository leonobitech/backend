# CLAUDE.md — n8n

Servicio de automatizacion de workflows.

---

## Overview

**Status**: En produccion
**Stack**: n8n (Docker) + webhook queue
**URL**: https://n8n.leonobitech.com
**Acceso MCP**: n8n-mcp (API key auth)

---

## Workflows activos (11)

### Leraysi (7)
| Workflow | Nodos | Funcion |
|----------|-------|---------|
| Sales_Agent_By_WhatsApp | 85 | Agente principal Leraysi |
| Leraysi - Agente Calendario | 21 | Sub-workflow turnos |
| Leraysi - Crear Turno | 3 | Crear turno en Odoo |
| Leraysi - Reprogramar Turno | 3 | Reprogramar turno |
| Leraysi - Cancelar Turno | 2 | Cancelar turno |
| Leraysi - Webhook Pago Confirmado | 8 | Confirmar pago MP |
| Load Services | 11 | Baserow -> Qdrant RAG (inactivo) |

### Leonobitech (2)
| Workflow | Nodos | Funcion |
|----------|-------|---------|
| Odoo_Send_Email | 2 | Tool via odoo-mcp |
| Odoo_Schedule_Meeting | 2 | Tool via odoo-mcp |

### Frontend (2)
| Workflow | Nodos | Funcion |
|----------|-------|---------|
| Upload Avatar to Baserow | 14 | Subir avatars |
| Upload Podcast to Baserow | 7 | Subir podcasts |

---

## TODO

- [ ] Documentar configuracion Docker (env vars, volumes)
- [ ] Documentar webhook queue setup
- [ ] Documentar credenciales configuradas en n8n
- [ ] Documentar tags y organizacion de workflows
