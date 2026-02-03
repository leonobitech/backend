# CLAUDE.md — Odoo MCP Connector

Servidor MCP que expone herramientas de Odoo para los agentes n8n.

---

## Overview

**Status**: En produccion
**Stack**: Python/Node + MCP protocol
**Puerto**: 8100 (odoo_mcp:8100)

---

## Tools disponibles (11)

| Tool | Descripcion |
|------|-------------|
| `odoo_send_email` | Enviar email desde Odoo |
| `odoo_schedule_meeting` | Agendar reunion en calendario |
| `odoo_update_deal_stage` | Actualizar etapa de deal/oportunidad |
| `odoo_get_leads` | Obtener leads del CRM |
| `odoo_create_lead` | Crear nuevo lead |
| `odoo_get_opportunities` | Obtener oportunidades |
| `odoo_search_contacts` | Buscar contactos |
| `odoo_create_contact` | Crear contacto |
| `odoo_get_sales_report` | Reporte de ventas |
| `odoo_create_activity` | Crear actividad/tarea |
| `odoo_get_deal_details` | Detalles de un deal |

---

## Workflows n8n que lo usan

- `Odoo_Send_Email` — Tool del agente Leonobitech
- `Odoo_Schedule_Meeting` — Tool del agente Leonobitech

---

## TODO

- [ ] Documentar parametros de cada tool
- [ ] Documentar configuracion y env vars
- [ ] Documentar conexion con Odoo (XML-RPC/JSON-RPC)
- [ ] Documentar como los agentes llaman a las tools
