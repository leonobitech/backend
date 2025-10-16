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
   * Automáticamente crea un partner (contacto) si se proporciona email o partner_name
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

    // Si se proporciona partner_name o email, crear un partner (contacto)
    if (data.partner_name || data.email) {
      // Buscar si ya existe un partner con ese email
      let partnerId: number | null = null;

      if (data.email) {
        const existingPartners = await this.search("res.partner", [["email", "=", data.email]], {
          fields: ["id"],
          limit: 1
        });

        if (existingPartners.length > 0) {
          partnerId = existingPartners[0].id;
        }
      }

      // Si no existe, crear el partner
      if (!partnerId) {
        const partnerData: Record<string, any> = {
          name: data.partner_name || data.contact_name || "Unknown Contact",
          is_company: !!data.partner_name // Si hay partner_name, es empresa
        };

        if (data.email) partnerData.email = data.email;
        if (data.phone) partnerData.phone = data.phone;

        partnerId = await this.create("res.partner", partnerData);
      }

      // Vincular el partner al lead
      values.partner_id = partnerId;
    }

    // Mantener email_from para referencia
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

  /**
   * Convertir un lead a oportunidad
   * En Odoo 19, los leads ya no existen como fase separada, todo es opportunity
   */
  async convertLeadToOpportunity(leadId: number): Promise<boolean> {
    return this.write("crm.lead", [leadId], { type: "opportunity" });
  }

  /**
   * Convertir múltiples leads a oportunidades
   */
  async convertLeadsToOpportunities(leadIds: number[]): Promise<boolean> {
    return this.write("crm.lead", leadIds, { type: "opportunity" });
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

  /**
   * Verificar disponibilidad en el calendario para un rango de tiempo
   */
  async checkCalendarAvailability(data: {
    start: string;
    duration: number;
    partnerIds: number[];
  }): Promise<{
    available: boolean;
    conflicts: Array<{
      id: number;
      name: string;
      start: string;
      stop: string;
      partner_ids: any;
    }>;
  }> {
    const endTime = this.calculateEndTime(data.start, data.duration);

    // Buscar eventos que se superpongan con el rango solicitado
    // Un evento se superpone si: (start1 < end2) AND (end1 > start2)
    const domain: any[] = [
      "|",
      "&",
      ["start", "<=", data.start],
      ["stop", ">", data.start],
      "&",
      ["start", "<", endTime],
      ["stop", ">=", endTime],
      "|",
      "&",
      ["start", ">=", data.start],
      ["start", "<", endTime],
      "&",
      ["stop", ">", data.start],
      ["stop", "<=", endTime]
    ];

    // Agregar filtro de partners si se proporcionan
    if (data.partnerIds.length > 0) {
      domain.unshift(["partner_ids", "in", data.partnerIds]);
    }

    const conflicts = await this.search("calendar.event", domain, {
      fields: ["id", "name", "start", "stop", "partner_ids"],
      limit: 10
    });

    return {
      available: conflicts.length === 0,
      conflicts
    };
  }

  /**
   * Encontrar slots disponibles en el calendario
   */
  async findAvailableSlots(data: {
    preferredStart: string;
    duration: number;
    partnerIds: number[];
    maxSuggestions?: number;
  }): Promise<Array<{ start: string; end: string }>> {
    const suggestions: Array<{ start: string; end: string }> = [];
    const maxSuggestions = data.maxSuggestions || 5;
    const durationMs = data.duration * 60 * 60 * 1000; // Convertir horas a ms

    // Parsear la hora preferida
    let currentSlot = new Date(data.preferredStart);
    const searchDays = 7; // Buscar dentro de los próximos 7 días
    const endSearchDate = new Date(currentSlot);
    endSearchDate.setDate(endSearchDate.getDate() + searchDays);

    // Obtener todos los eventos en el rango de búsqueda
    const searchEndStr = endSearchDate.toISOString().replace("T", " ").substring(0, 19);
    const domain: any[] = [["start", ">=", data.preferredStart], ["start", "<=", searchEndStr]];

    if (data.partnerIds.length > 0) {
      domain.unshift(["partner_ids", "in", data.partnerIds]);
    }

    const allEvents = await this.search("calendar.event", domain, {
      fields: ["start", "stop"],
      order: "start asc"
    });

    // Función para verificar si un slot está libre
    const isSlotFree = (slotStart: Date, slotEnd: Date): boolean => {
      for (const event of allEvents) {
        const eventStart = new Date(event.start);
        const eventStop = new Date(event.stop);

        // Verificar superposición
        if (slotStart < eventStop && slotEnd > eventStart) {
          return false;
        }
      }
      return true;
    };

    // Buscar slots disponibles
    while (suggestions.length < maxSuggestions && currentSlot < endSearchDate) {
      const slotEnd = new Date(currentSlot.getTime() + durationMs);

      // Solo considerar horario laboral (9am - 6pm)
      const hour = currentSlot.getHours();
      if (hour >= 9 && hour < 18) {
        if (isSlotFree(currentSlot, slotEnd)) {
          suggestions.push({
            start: currentSlot.toISOString().replace("T", " ").substring(0, 19),
            end: slotEnd.toISOString().replace("T", " ").substring(0, 19)
          });
        }
      }

      // Avanzar 30 minutos
      currentSlot = new Date(currentSlot.getTime() + 30 * 60 * 1000);

      // Si pasamos las 6pm, saltar al siguiente día a las 9am
      if (currentSlot.getHours() >= 18) {
        currentSlot.setDate(currentSlot.getDate() + 1);
        currentSlot.setHours(9, 0, 0, 0);
      }
    }

    return suggestions;
  }

  /**
   * Publicar un mensaje en el chatter de un registro
   */
  async postMessageToChatter(data: {
    model: string; // e.g., 'crm.lead', 'res.partner'
    resId: number; // ID del registro
    body: string; // Contenido HTML del mensaje
    messageType?: "notification" | "comment"; // Tipo de mensaje (default: comment)
    subtypeXmlId?: string; // e.g., 'mail.mt_note' para nota interna
  }): Promise<number> {
    const values: Record<string, any> = {
      model: data.model,
      res_id: data.resId,
      body: data.body,
      message_type: data.messageType || "comment"
    };

    // Si se especifica un subtipo (para notas internas vs comentarios públicos)
    if (data.subtypeXmlId) {
      // Buscar el ID del subtipo
      const subtypes = await this.search("mail.message.subtype", [["name", "=", data.subtypeXmlId]], {
        fields: ["id"],
        limit: 1
      });
      if (subtypes.length > 0) {
        values.subtype_id = subtypes[0].id;
      }
    }

    return this.create("mail.message", values);
  }

  /**
   * Agendar una reunión en el calendario de Odoo vinculada a una oportunidad
   * Ahora con validación de disponibilidad y registro en el chatter
   */
  async scheduleMeeting(data: {
    name: string;
    opportunityId: number;
    start: string; // ISO datetime string (YYYY-MM-DD HH:MM:SS)
    duration?: number; // Duración en horas (default: 1)
    description?: string;
    location?: string;
    forceSchedule?: boolean; // Forzar agendamiento incluso con conflictos
  }): Promise<{
    eventId?: number;
    conflict?: {
      available: boolean;
      conflicts: any[];
      availableSlots: Array<{ start: string; end: string }>;
    };
  }> {
    // Obtener información de la oportunidad para vincular partner
    const opportunities = await this.read("crm.lead", [data.opportunityId], ["partner_id", "user_id"]);

    if (opportunities.length === 0) {
      throw new Error(`Opportunity #${data.opportunityId} not found`);
    }

    const opp = opportunities[0];
    const partnerIds: number[] = [];

    // Agregar el partner de la oportunidad como asistente
    if (opp.partner_id && Array.isArray(opp.partner_id) && opp.partner_id[0]) {
      partnerIds.push(opp.partner_id[0]);
    }

    // Agregar el usuario responsable como asistente
    if (opp.user_id && Array.isArray(opp.user_id) && opp.user_id[0]) {
      // Buscar el partner_id del usuario
      const users = await this.read("res.users", [opp.user_id[0]], ["partner_id"]);
      if (users.length > 0 && users[0].partner_id && Array.isArray(users[0].partner_id)) {
        partnerIds.push(users[0].partner_id[0]);
      }
    }

    // Verificar disponibilidad ANTES de crear el evento
    const duration = data.duration || 1;
    const availabilityCheck = await this.checkCalendarAvailability({
      start: data.start,
      duration,
      partnerIds
    });

    // Si hay conflictos y no se fuerza el agendamiento, retornar los conflictos y sugerencias
    if (!availabilityCheck.available && !data.forceSchedule) {
      const availableSlots = await this.findAvailableSlots({
        preferredStart: data.start,
        duration,
        partnerIds,
        maxSuggestions: 5
      });

      return {
        conflict: {
          available: false,
          conflicts: availabilityCheck.conflicts,
          availableSlots
        }
      };
    }

    // Si está disponible o se fuerza el agendamiento, crear el evento
    const values: Record<string, any> = {
      name: data.name,
      start: data.start,
      stop: this.calculateEndTime(data.start, duration),
      duration,
      res_model: "crm.lead",
      res_id: data.opportunityId,
      partner_ids: [[6, 0, partnerIds]] // Odoo many2many format
    };

    if (data.description) values.description = data.description;
    if (data.location) values.location = data.location;

    const eventId = await this.create("calendar.event", values);

    // Publicar mensaje en el chatter de la oportunidad
    const startDate = new Date(data.start);
    const formattedDate = startDate.toLocaleString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const chatterMessage = `
      <p>📅 <strong>Reunión agendada</strong></p>
      <ul>
        <li><strong>Título:</strong> ${data.name}</li>
        <li><strong>Fecha:</strong> ${formattedDate}</li>
        <li><strong>Duración:</strong> ${duration} hora(s)</li>
        ${data.location ? `<li><strong>Ubicación:</strong> ${data.location}</li>` : ""}
        ${data.description ? `<li><strong>Descripción:</strong> ${data.description}</li>` : ""}
      </ul>
      <p><em>Reunión creada automáticamente vía Claude MCP</em></p>
    `;

    try {
      await this.postMessageToChatter({
        model: "crm.lead",
        resId: data.opportunityId,
        body: chatterMessage,
        messageType: "comment"
      });
      logger.info({ opportunityId: data.opportunityId, eventId }, "Meeting logged to opportunity chatter");
    } catch (error) {
      logger.warn({ error, opportunityId: data.opportunityId }, "Failed to post meeting to chatter, but event was created");
    }

    return { eventId };
  }

  /**
   * Calcular hora de fin basado en hora de inicio y duración
   */
  private calculateEndTime(start: string, durationHours: number): string {
    const startDate = new Date(start);
    startDate.setHours(startDate.getHours() + durationHours);
    return startDate.toISOString().replace("T", " ").substring(0, 19);
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

  // ==================== EMAIL ====================

  /**
   * Enviar un correo electrónico relacionado con una oportunidad
   */
  async sendEmailToOpportunity(data: {
    opportunityId: number;
    subject: string;
    body: string;
    emailTo?: string; // Si no se proporciona, usa el email del partner de la oportunidad
  }): Promise<number> {
    // Obtener información de la oportunidad para extraer el email si no se proporciona
    let recipientEmail = data.emailTo;

    if (!recipientEmail) {
      const opportunities = await this.read("crm.lead", [data.opportunityId], [
        "email_from",
        "partner_id"
      ]);

      if (opportunities.length === 0) {
        throw new Error(`Opportunity #${data.opportunityId} not found`);
      }

      const opp = opportunities[0];

      // Intentar obtener email de diferentes fuentes
      // 1. Desde email_from del lead/opportunity
      if (opp.email_from && typeof opp.email_from === "string" && opp.email_from.trim()) {
        recipientEmail = opp.email_from.trim();
      }

      // 2. Si no hay email_from, intentar desde el partner asociado
      if (!recipientEmail && opp.partner_id && Array.isArray(opp.partner_id) && opp.partner_id[0]) {
        const partnerEmail = await this.getPartnerEmail(opp.partner_id[0]);
        if (partnerEmail) {
          recipientEmail = partnerEmail;
        }
      }

      if (!recipientEmail) {
        throw new Error(
          `No email found for opportunity #${data.opportunityId}. The opportunity has no email_from field and no associated partner with email. Please provide an email_to parameter.`
        );
      }
    }

    // Enviar el correo usando mail.mail para que realmente se envíe por SMTP
    const mailId = await this.create("mail.mail", {
      subject: data.subject,
      body_html: data.body,
      email_to: recipientEmail,
      auto_delete: false,
      model: "crm.lead",
      res_id: data.opportunityId,
      state: "outgoing" // Marca como saliente para que Odoo lo envíe
    });

    // Forzar el procesamiento inmediato de la cola de emails
    // En lugar de esperar al cron job (que puede tardar hasta 1 hora)
    try {
      // Procesar la cola de emails inmediatamente usando el modelo ir.cron
      // Buscar el cron job de mail queue
      await this.execute_kw(
        "mail.mail",
        "process_email_queue",
        [],
        {}
      );
      logger.info({ mailId }, "Email queue processed immediately");
    } catch (error) {
      // Si falla, no importa - el cron job lo enviará eventualmente
      logger.warn({ error, mailId }, "Could not force immediate email send, will be sent by cron");
    }

    // Registrar el email en el chatter de forma legible y bien formateada
    const chatterMessage = `
      <div style="margin: 10px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
        <p style="margin: 0 0 10px 0;">
          <strong style="font-size: 14px;">📧 Email enviado</strong>
        </p>
        <table style="width: 100%; margin-bottom: 10px;">
          <tr>
            <td style="padding: 4px 0; color: #666; width: 80px;"><strong>Para:</strong></td>
            <td style="padding: 4px 0;">${recipientEmail}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Asunto:</strong></td>
            <td style="padding: 4px 0;">${data.subject}</td>
          </tr>
        </table>
        <div style="margin-top: 15px; padding: 15px; background-color: white; border: 1px solid #dee2e6; border-radius: 4px;">
          ${data.body}
        </div>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #999; font-style: italic;">
          Email enviado automáticamente vía Claude MCP
        </p>
      </div>
    `;

    try {
      await this.postMessageToChatter({
        model: "crm.lead",
        resId: data.opportunityId,
        body: chatterMessage,
        messageType: "comment"
      });
      logger.info({ opportunityId: data.opportunityId, mailId, recipientEmail }, "Email logged to opportunity chatter");
    } catch (error) {
      logger.warn({ error, opportunityId: data.opportunityId }, "Failed to post email to chatter, but email was sent");
    }

    return mailId;
  }

  /**
   * Obtener el email de un partner por ID
   */
  private async getPartnerEmail(partnerId: number): Promise<string | null> {
    const partners = await this.read("res.partner", [partnerId], ["email"]);
    return partners.length > 0 ? partners[0].email : null;
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
