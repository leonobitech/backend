/**
 * Cliente Odoo XML-RPC
 *
 * Proporciona una interfaz TypeScript para interactuar con Odoo 19 usando XML-RPC.
 * Soporta autenticación con API Keys.
 */

import xmlrpc from "xmlrpc";
import { logger } from "@/lib/logger";

// Configuración de Odoo desde variables de entorno
const ODOO_URL = process.env.ODOO_URL || "https://odoo.leonobitech.com";
const ODOO_DB = process.env.ODOO_DB || "leonobitech";
const ODOO_USERNAME = process.env.ODOO_USERNAME || "felix@leonobitech.com";
const ODOO_API_KEY = process.env.ODOO_API_KEY || "";

if (!ODOO_API_KEY) {
  throw new Error("ODOO_API_KEY no está configurada en .env");
}

// Clientes XML-RPC
const commonClient = xmlrpc.createSecureClient({
  url: `${ODOO_URL}/xmlrpc/2/common`,
  rejectUnauthorized: true
});

const objectClient = xmlrpc.createSecureClient({
  url: `${ODOO_URL}/xmlrpc/2/object`,
  rejectUnauthorized: true
});

/**
 * Clase para interactuar con Odoo
 */
export class OdooClient {
  private uid: number | null = null;

  /**
   * Autentica con Odoo usando API Key
   */
  async authenticate(): Promise<number> {
    return new Promise((resolve, reject) => {
      commonClient.methodCall(
        "authenticate",
        [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}],
        (error: Error | null, uid: number) => {
          if (error) {
            logger.error({ error }, "Error authenticating with Odoo");
            reject(new Error(`Odoo authentication failed: ${error.message}`));
            return;
          }

          if (!uid) {
            reject(new Error("Odoo authentication failed: Invalid credentials"));
            return;
          }

          this.uid = uid;
          logger.info({ uid, username: ODOO_USERNAME }, "Authenticated with Odoo");
          resolve(uid);
        }
      );
    });
  }

  /**
   * Ejecuta un método en un modelo de Odoo
   */
  private async execute_kw(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {}
  ): Promise<any> {
    if (!this.uid) {
      await this.authenticate();
    }

    return new Promise((resolve, reject) => {
      objectClient.methodCall(
        "execute_kw",
        [ODOO_DB, this.uid, ODOO_API_KEY, model, method, args, kwargs],
        (error: Error | null, result: any) => {
          if (error) {
            logger.error({ error, model, method }, "Error executing Odoo method");
            reject(new Error(`Odoo ${model}.${method} failed: ${error.message}`));
            return;
          }

          resolve(result);
        }
      );
    });
  }

  /**
   * Buscar registros en un modelo
   */
  async search(
    model: string,
    domain: any[] = [],
    options: {
      fields?: string[];
      limit?: number;
      offset?: number;
      order?: string;
    } = {}
  ): Promise<any[]> {
    return this.execute_kw(model, "search_read", [domain], options);
  }

  /**
   * Crear un registro en un modelo
   */
  async create(model: string, values: Record<string, any>): Promise<number> {
    return this.execute_kw(model, "create", [values]);
  }

  /**
   * Actualizar registros en un modelo
   */
  async write(model: string, ids: number[], values: Record<string, any>): Promise<boolean> {
    return this.execute_kw(model, "write", [ids, values]);
  }

  /**
   * Leer registros de un modelo
   */
  async read(model: string, ids: number[], fields: string[] = []): Promise<any[]> {
    return this.execute_kw(model, "read", [ids], { fields });
  }

  /**
   * Eliminar registros de un modelo
   */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.execute_kw(model, "unlink", [ids]);
  }

  // ==================== CRM - LEADS ====================

  /**
   * Obtener leads del CRM
   */
  async getLeads(options: {
    limit?: number;
    stage?: string;
    type?: "lead" | "opportunity";
  } = {}): Promise<any[]> {
    const domain: any[] = [];

    // Filtrar por tipo (lead vs opportunity)
    if (options.type) {
      domain.push(["type", "=", options.type]);
    }

    // Filtrar por etapa
    if (options.stage) {
      domain.push(["stage_id.name", "ilike", options.stage]);
    }

    return this.search("crm.lead", domain, {
      fields: [
        "id",
        "name",
        "partner_name",
        "contact_name",
        "email_from",
        "phone",
        "expected_revenue",
        "probability",
        "stage_id",
        "user_id",
        "team_id",
        "type",
        "date_deadline",
        "create_date",
        "description"
      ],
      limit: options.limit || 10,
      order: "create_date desc"
    });
  }

  /**
   * Crear un nuevo lead en el CRM
   */
  async createLead(data: {
    name: string;
    partner_name?: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    description?: string;
    expected_revenue?: number;
    type?: "lead" | "opportunity";
  }): Promise<number> {
    const values: Record<string, any> = {
      name: data.name,
      type: data.type || "lead"
    };

    if (data.partner_name) values.partner_name = data.partner_name;
    if (data.contact_name) values.contact_name = data.contact_name;
    if (data.email) values.email_from = data.email;
    if (data.phone) values.phone = data.phone;
    if (data.description) values.description = data.description;
    if (data.expected_revenue) values.expected_revenue = data.expected_revenue;

    return this.create("crm.lead", values);
  }

  /**
   * Obtener oportunidades (leads tipo opportunity)
   */
  async getOpportunities(options: {
    limit?: number;
    stage?: string;
    minAmount?: number;
  } = {}): Promise<any[]> {
    const domain: any[] = [["type", "=", "opportunity"]];

    if (options.stage) {
      domain.push(["stage_id.name", "ilike", options.stage]);
    }

    if (options.minAmount) {
      domain.push(["expected_revenue", ">=", options.minAmount]);
    }

    return this.search("crm.lead", domain, {
      fields: [
        "id",
        "name",
        "partner_name",
        "partner_id",
        "expected_revenue",
        "probability",
        "stage_id",
        "user_id",
        "team_id",
        "date_deadline",
        "date_closed",
        "create_date"
      ],
      limit: options.limit || 20,
      order: "expected_revenue desc"
    });
  }

  /**
   * Actualizar la etapa de una oportunidad
   */
  async updateDealStage(opportunityId: number, stageName: string): Promise<boolean> {
    // Buscar el ID de la etapa por nombre
    const stages = await this.search("crm.stage", [["name", "ilike", stageName]], {
      fields: ["id", "name"],
      limit: 1
    });

    if (stages.length === 0) {
      throw new Error(`No se encontró la etapa "${stageName}"`);
    }

    const stageId = stages[0].id;
    return this.write("crm.lead", [opportunityId], { stage_id: stageId });
  }

  // ==================== CONTACTS ====================

  /**
   * Buscar contactos (clientes, proveedores, empresas)
   */
  async searchContacts(query: string, options: { limit?: number } = {}): Promise<any[]> {
    const domain = [
      "|",
      "|",
      ["name", "ilike", query],
      ["email", "ilike", query],
      ["phone", "ilike", query]
    ];

    return this.search("res.partner", domain, {
      fields: [
        "id",
        "name",
        "email",
        "phone",
        "is_company",
        "street",
        "city",
        "country_id",
        "website",
        "create_date"
      ],
      limit: options.limit || 5,
      order: "create_date desc"
    });
  }

  /**
   * Crear un nuevo contacto
   */
  async createContact(data: {
    name: string;
    email?: string;
    phone?: string;
    isCompany?: boolean;
    street?: string;
    city?: string;
    website?: string;
  }): Promise<number> {
    const values: Record<string, any> = {
      name: data.name,
      is_company: data.isCompany || false
    };

    if (data.email) values.email = data.email;
    if (data.phone) values.phone = data.phone;
    if (data.street) values.street = data.street;
    if (data.city) values.city = data.city;
    if (data.website) values.website = data.website;

    return this.create("res.partner", values);
  }

  // ==================== ACTIVITIES ====================

  /**
   * Crear una actividad (llamada, reunión, tarea, email)
   */
  async createActivity(data: {
    activityType: "call" | "meeting" | "email" | "task";
    summary: string;
    resModel?: string;
    resId?: number;
    dateDeadline?: string;
    note?: string;
  }): Promise<number> {
    // Mapear tipo de actividad a ID (estos son los IDs por defecto en Odoo)
    const activityTypeMap: Record<string, number> = {
      call: 2, // Llamada
      meeting: 3, // Reunión
      email: 4, // Email
      task: 1 // Tarea
    };

    const activityTypeId = activityTypeMap[data.activityType] || 1;

    const values: Record<string, any> = {
      activity_type_id: activityTypeId,
      summary: data.summary,
      res_model: data.resModel || "crm.lead",
      user_id: this.uid // Asignar al usuario actual
    };

    if (data.resId) values.res_id = data.resId;
    if (data.dateDeadline) values.date_deadline = data.dateDeadline;
    if (data.note) values.note = data.note;

    return this.create("mail.activity", values);
  }

  // ==================== REPORTS ====================

  /**
   * Obtener reporte de ventas
   */
  async getSalesReport(period: "today" | "week" | "month" | "quarter" | "year" = "month"): Promise<{
    totalRevenue: number;
    dealsWon: number;
    dealsLost: number;
    avgDealSize: number;
    conversionRate: number;
  }> {
    // Calcular fecha de inicio según período
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "today":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "quarter":
        startDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case "year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
    }

    const dateStr = startDate.toISOString().split("T")[0];

    // Oportunidades ganadas
    const won = await this.search(
      "crm.lead",
      [
        ["type", "=", "opportunity"],
        ["stage_id.is_won", "=", true],
        ["date_closed", ">=", dateStr]
      ],
      { fields: ["expected_revenue"] }
    );

    // Oportunidades perdidas
    const lost = await this.search(
      "crm.lead",
      [
        ["type", "=", "opportunity"],
        ["active", "=", false],
        ["date_closed", ">=", dateStr]
      ],
      { fields: ["id"] }
    );

    const totalRevenue = won.reduce((sum, opp) => sum + (opp.expected_revenue || 0), 0);
    const dealsWon = won.length;
    const dealsLost = lost.length;
    const avgDealSize = dealsWon > 0 ? totalRevenue / dealsWon : 0;
    const totalDeals = dealsWon + dealsLost;
    const conversionRate = totalDeals > 0 ? (dealsWon / totalDeals) * 100 : 0;

    return {
      totalRevenue,
      dealsWon,
      dealsLost,
      avgDealSize,
      conversionRate
    };
  }

  // ==================== STAGES ====================

  /**
   * Obtener todas las etapas del CRM
   */
  async getStages(): Promise<any[]> {
    return this.search("crm.stage", [], {
      fields: ["id", "name", "sequence", "fold"],
      order: "sequence asc"
    });
  }
}

// Instancia singleton del cliente Odoo
let odooClientInstance: OdooClient | null = null;

/**
 * Obtener instancia del cliente Odoo (singleton)
 */
export function getOdooClient(): OdooClient {
  if (!odooClientInstance) {
    odooClientInstance = new OdooClient();
  }
  return odooClientInstance;
}

/**
 * Test de conexión a Odoo
 */
export async function testOdooConnection(): Promise<boolean> {
  try {
    const client = getOdooClient();
    await client.authenticate();
    logger.info("✅ Conexión a Odoo exitosa");
    return true;
  } catch (error) {
    logger.error({ error }, "❌ Error conectando a Odoo");
    return false;
  }
}
