/**
 * Tool Registry Initialization - Leraysi MCP
 *
 * Registers only Leraysi salon tools with the ToolRegistry.
 */

import { ToolRegistry } from "./base/ToolRegistry";
// Leraysi Salon Tools
import { CrearTurnoLeraysiTool } from "./odoo/leraysi/crear-turno/crear-turno.tool";
import { ConsultarTurnosDiaTool } from "./odoo/leraysi/consultar-turnos-dia/consultar-turnos-dia.tool";
import { ConsultarDisponibilidadTool } from "./odoo/leraysi/consultar-disponibilidad/consultar-disponibilidad.tool";
import { ConfirmarTurnoTool } from "./odoo/leraysi/confirmar-turno/confirmar-turno.tool";
import { CancelarTurnoTool } from "./odoo/leraysi/cancelar-turno/cancelar-turno.tool";
import { ExpirarTurnoTool } from "./odoo/leraysi/expirar-turno/expirar-turno.tool";
import { ReprogramarTurnoTool } from "./odoo/leraysi/reprogramar-turno/reprogramar-turno.tool";
import { ConfirmarPagoCompletoTool } from "./odoo/leraysi/confirmar-pago-completo/confirmar-pago-completo.tool";
import { AgregarServicioTurnoLeraysiTool } from "./odoo/leraysi/agregar-servicio-turno/agregar-servicio-turno.tool";
import { createOdooClient, type OdooCredentials } from "@/lib/odoo";
import { logger } from "@/lib/logger";

/**
 * TEMPORARY SOLUTION: Use dummy credentials for tool initialization
 *
 * TODO: Refactor tool architecture to inject credentials per-request instead of at init
 *
 * Current flow:
 * 1. Tools are initialized once at startup with dummy client
 * 2. When a tool is called, we need to:
 *    - Get userId from OAuth token
 *    - Load user's Odoo credentials from DB
 *    - Create new OdooClient with user's credentials
 *    - Execute the tool with user-specific client
 */
const DUMMY_CREDENTIALS: OdooCredentials = {
  url: "https://odoo.example.com",
  db: "dummy",
  username: "dummy@example.com",
  apiKey: "dummy_key"
};

export async function initializeTools(): Promise<ToolRegistry> {
  const registry = ToolRegistry.getInstance();
  logger.info("[ToolRegistry] Initializing Leraysi tools...");

  // IMPORTANT: This is a dummy client just for initialization
  // Each tool execution should create a new client with user-specific credentials
  const odooClient = createOdooClient(DUMMY_CREDENTIALS);

  // Leraysi Salon Tools (Estilos Leraysi - Beauty Salon)
  registry.register(new CrearTurnoLeraysiTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 2000,
  });

  registry.register(new ConsultarTurnosDiaTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new ConsultarDisponibilidadTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:read"],
    estimatedTime: 1000,
  });

  registry.register(new ConfirmarTurnoTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new CancelarTurnoTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 800,
  });

  registry.register(new ExpirarTurnoTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 1500,
  });

  registry.register(new ReprogramarTurnoTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write", "odoo:calendar"],
    estimatedTime: 1500,
  });

  registry.register(new ConfirmarPagoCompletoTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write", "odoo:calendar", "odoo:email"],
    estimatedTime: 5000,
  });

  registry.register(new AgregarServicioTurnoLeraysiTool(odooClient), {
    category: "leraysi",
    version: "1.0.0",
    requiredScopes: ["odoo:write"],
    estimatedTime: 2000,
  });

  const stats = registry.getStats();
  logger.info({ totalTools: stats.totalTools, categories: stats.toolsByCategory }, "[ToolRegistry] Leraysi tools initialized");

  return registry;
}
