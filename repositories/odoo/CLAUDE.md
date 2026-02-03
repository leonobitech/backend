# CLAUDE.md — Odoo

ERP y CRM. Gestiona contactos, calendario, deals y pagos.

---

## Overview

**Status**: En produccion
**Stack**: Odoo 17 (Docker) + PostgreSQL
**URL**: https://odoo.leonobitech.com

---

## Modulos/Addons

- **Mercado Pago**: Addon custom para generar links de pago (senas para turnos Leraysi)
- **CRM**: Leads, oportunidades, pipeline de ventas
- **Calendario**: Turnos/meetings agendados por los agentes
- **Contactos**: Sincronizados con Baserow leads

---

## Integracion con agentes

- Agentes llaman a Odoo via `odoo-mcp` (puerto 8100)
- Leraysi: crear turnos, generar link MP, confirmar pagos
- Leonobitech: enviar emails, agendar meetings

---

## TODO

- [ ] Documentar addon Mercado Pago (como genera links, webhook de confirmacion)
- [ ] Documentar modelos/tablas Odoo relevantes
- [ ] Documentar configuracion Docker y env vars
- [ ] Desacoplar configuracion especifica de Leraysi vs generica
- [ ] Documentar flujo completo: agente -> odoo-mcp -> Odoo -> Mercado Pago -> webhook
