# CLAUDE.md — Baserow

Base de datos relacional con interfaz web, usada como CRM y backend de datos para los agentes.

---

## Overview

**Status**: En produccion
**Stack**: Baserow (Docker) + MCP connector
**URL**: https://br.leonobitech.com
**Acceso MCP**: baserow-mcp (SSE via mcp-remote)

---

## Tablas

| ID | Tabla | Uso |
|----|-------|-----|
| 851 | LeadsLeraysi | Leads del salon Leraysi |
| 852 | TurnosLeraysi | Turnos/citas agendadas |
| 850 | ServiciosLeraysi | Catalogo de servicios Leraysi |
| 19 | Leads | Leads generales Leonobitech |
| 22 | Odoo info | Informacion de Odoo |
| 720 | Services | Servicios generales |
| 848 | Avatars | Avatars del frontend |
| 849 | Podcasts | Episodios de podcast |

---

## TODO

- [ ] Documentar schema completo de cada tabla (campos, tipos, relaciones)
- [ ] Documentar flujo de datos: agente -> Baserow -> Odoo
- [ ] Documentar reglas de negocio (stages, contadores monotonicos, flags)
- [ ] Documentar configuracion Docker
