/**
 * Tool Registry Initialization
 *
 * Registers all available tools with the ToolRegistry.
 */

import { ToolRegistry } from "./base/ToolRegistry";
// Appointment Tools
import { AppointmentCreateTool } from "./odoo/appointment/crear-turno/crear-turno.tool";
import { AppointmentListByDateTool } from "./odoo/appointment/consultar-turnos-dia/consultar-turnos-dia.tool";
import { AppointmentCheckAvailabilityTool } from "./odoo/appointment/consultar-disponibilidad/consultar-disponibilidad.tool";
import { AppointmentConfirmTool } from "./odoo/appointment/confirmar-turno/confirmar-turno.tool";
import { AppointmentCancelTool } from "./odoo/appointment/cancelar-turno/cancelar-turno.tool";
import { AppointmentRescheduleTool } from "./odoo/appointment/reprogramar-turno/reprogramar-turno.tool";
import { AppointmentConfirmPaymentTool } from "./odoo/appointment/confirmar-pago-completo/confirmar-pago-completo.tool";
import { AppointmentAddServiceTool } from "./odoo/appointment/agregar-servicio-turno/agregar-servicio-turno.tool";
import { AppointmentExpireTool } from "./odoo/appointment/expirar-turno/expirar-turno.tool";
import { createOdooClient, type OdooCredentials } from "@/lib/odoo";
import { logger } from "@/lib/logger";

/**
 * TEMPORARY SOLUTION: Use dummy credentials for tool initialization
 *
 * TODO: Refactor tool architecture to inject credentials per-request instead of at init
 */
const DUMMY_CREDENTIALS: OdooCredentials = {
  url: "https://odoo.example.com",
  db: "dummy",
  username: "dummy@example.com",
  apiKey: "dummy_key"
};

export async function initializeTools(): Promise<ToolRegistry> {
  const registry = ToolRegistry.getInstance();
  logger.info("[ToolRegistry] Initializing tools...");

  const odooClient = createOdooClient(DUMMY_CREDENTIALS);

  // Appointment Tools
  registry.register(new AppointmentCreateTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 2000,
  });

  registry.register(new AppointmentListByDateTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new AppointmentCheckAvailabilityTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new AppointmentConfirmTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new AppointmentCancelTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new AppointmentRescheduleTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write", "odoo:calendar"],
    estimatedTime: 1500,
  });

  registry.register(new AppointmentConfirmPaymentTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write", "odoo:calendar", "odoo:email"],
    estimatedTime: 5000,
  });

  registry.register(new AppointmentAddServiceTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 2000,
  });

  registry.register(new AppointmentExpireTool(odooClient), {
    category: "odoo/appointment",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 2000,
  });

  const stats = registry.getStats();
  logger.info({ totalTools: stats.totalTools, categories: stats.toolsByCategory }, "[ToolRegistry] Tools initialized");

  return registry;
}
