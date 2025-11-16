/**
 * Cliente Odoo XML-RPC
 *
 * Proporciona una interfaz TypeScript para interactuar con Odoo 19 usando XML-RPC.
 * Soporta autenticación con API Keys.
 *
 * MULTI-TENANT: Cada usuario proporciona sus propias credenciales durante la creación del cliente.
 */

import * as xmlrpc from "xmlrpc";
import { logger } from "@/lib/logger";

/**
 * Credenciales de Odoo proporcionadas por el usuario
 */
export interface OdooCredentials {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

/**
 * Resultado del envío de email
 */
export interface SendEmailResult {
  mailId: number;
  recipientEmail: string;
  queueProcessed: boolean;
}

/**
 * Clase para interactuar con Odoo
 */
export class OdooClient {
  private uid: number | null = null;
  private credentials: OdooCredentials;
  private commonClient: xmlrpc.Client;
  private objectClient: xmlrpc.Client;

  /**
   * Constructor - crea un cliente Odoo con credenciales específicas del usuario
   */
  constructor(credentials: OdooCredentials) {
    this.credentials = credentials;

    const urlObj = new URL(credentials.url);
    const isHttps = urlObj.protocol === "https:";

    // Crear cliente XML-RPC para common endpoint (autenticación)
    this.commonClient = isHttps
      ? xmlrpc.createSecureClient({
          url: `${credentials.url}/xmlrpc/2/common`,
          rejectUnauthorized: true
        } as any)
      : xmlrpc.createClient({
          url: `${credentials.url}/xmlrpc/2/common`,
        });

    // Crear cliente XML-RPC para object endpoint (operaciones CRUD)
    this.objectClient = isHttps
      ? xmlrpc.createSecureClient({
          url: `${credentials.url}/xmlrpc/2/object`,
          rejectUnauthorized: true
        } as any)
      : xmlrpc.createClient({
          url: `${credentials.url}/xmlrpc/2/object`,
        });
  }

  /**
   * Autentica con Odoo usando API Key
   */
  async authenticate(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Timeout de 30 segundos para evitar requests colgados
      const timeout = setTimeout(() => {
        reject(new Error(`Odoo authentication timed out after 30 seconds`));
      }, 30000);

      this.commonClient.methodCall(
        "authenticate",
        [this.credentials.db, this.credentials.username, this.credentials.apiKey, {}],
        (error: any, uid: number) => {
          clearTimeout(timeout);

          if (error) {
            logger.error({ error }, "Error authenticating with Odoo");
            reject(new Error(`Odoo authentication failed: ${error.message || error}`));
            return;
          }

          if (!uid) {
            reject(new Error("Odoo authentication failed: Invalid credentials"));
            return;
          }

          this.uid = uid;
          logger.info({ uid, username: this.credentials.username }, "Authenticated with Odoo");
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
      // Timeout de 30 segundos para evitar requests colgados
      const timeout = setTimeout(() => {
        reject(new Error(`Odoo ${model}.${method} timed out after 30 seconds`));
      }, 30000);

      this.objectClient.methodCall(
        "execute_kw",
        [this.credentials.db, this.uid, this.credentials.apiKey, model, method, args, kwargs],
        (error: any, result: any) => {
          clearTimeout(timeout);

          if (error) {
            logger.error({ error, model, method }, "Error executing Odoo method");
            reject(new Error(`Odoo ${model}.${method} failed: ${error.message || error}`));
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
   * Ejecuta un método arbitrario de Odoo, útil para acciones manuales
   */
  async execute(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {}
  ): Promise<any> {
    return this.execute_kw(model, method, args, kwargs);
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

  /**
   * Obtener el nombre de la etapa actual de una oportunidad
   */
  async getOpportunityStage(opportunityId: number): Promise<string | null> {
    const opportunities = await this.read("crm.lead", [opportunityId], ["stage_id"]);

    if (opportunities.length === 0 || !opportunities[0].stage_id) {
      return null;
    }

    const stageData = opportunities[0].stage_id;
    // stage_id viene como [id, "nombre"]
    if (Array.isArray(stageData) && stageData.length > 1) {
      return stageData[1] as string;
    }

    return null;
  }

  /**
   * Progresión automática de etapa basada en acciones
   * Solo mueve hacia adelante, nunca hacia atrás
   */
  async autoProgressStage(data: {
    opportunityId: number;
    action: "email_sent" | "meeting_scheduled" | "proposal_sent" | "formal_proposal_sent";
    currentStage?: string;
  }): Promise<{ moved: boolean; fromStage?: string; toStage?: string; reason?: string }> {
    // Obtener stage actual si no se proporcionó
    const currentStage = data.currentStage || (await this.getOpportunityStage(data.opportunityId));

    if (!currentStage) {
      return { moved: false, reason: "No se pudo determinar la etapa actual" };
    }

    const currentStageLower = currentStage.toLowerCase();

    /**
     * Reglas de progresión automática de stages:
     *
     * NEW → QUALIFIED:
     *   - email_sent: Primer email enviado
     *   - meeting_scheduled: Demo agendada
     *   - proposal_sent: Propuesta por email con template HTML
     *
     * QUALIFIED → PROPOSITION:
     *   - formal_proposal_sent: Propuesta formal en PDF (funcionalidad futura)
     *
     * NOTA: PROPOSITION se reserva para propuestas formales/contractuales,
     *       no para emails de propuesta con template HTML
     */
    let targetStage: string | null = null;
    let reason = "";

    switch (data.action) {
      case "email_sent":
      case "meeting_scheduled":
        // NEW → QUALIFIED (primer contacto significativo)
        if (currentStageLower.includes("new")) {
          targetStage = "Qualified";
          reason = data.action === "meeting_scheduled"
            ? "Primera reunión agendada - Lead calificado"
            : "Primer contacto establecido - Lead calificado";
        }
        break;

      case "proposal_sent":
        // NEW → QUALIFIED (propuesta por email con template HTML)
        // NOTA: PROPOSITION se reserva para propuestas formales en PDF (funcionalidad futura)
        if (currentStageLower.includes("new")) {
          targetStage = "Qualified";
          reason = "Propuesta comercial enviada por email - Lead calificado";
        }
        break;

      case "formal_proposal_sent":
        // QUALIFIED → PROPOSITION (propuesta formal en PDF)
        if (currentStageLower.includes("qualified")) {
          targetStage = "Proposition";
          reason = "Propuesta formal en PDF enviada - Cliente en etapa de propuesta";
        }
        break;
    }

    // Si no hay stage objetivo, no hacer nada
    if (!targetStage) {
      return { moved: false, reason: "La oportunidad ya está en una etapa avanzada" };
    }

    // Mover la oportunidad
    try {
      await this.updateDealStage(data.opportunityId, targetStage);

      // Registrar en el chatter
      await this.postMessageToChatter({
        model: "crm.lead",
        resId: data.opportunityId,
        body: `
          <p>🔄 <strong>Progresión automática de etapa</strong></p>
          <ul>
            <li><strong>De:</strong> ${currentStage}</li>
            <li><strong>A:</strong> ${targetStage}</li>
            <li><strong>Razón:</strong> ${reason}</li>
          </ul>
          <p><em>Sistema automatizado Leonobitech</em></p>
        `,
        messageType: "comment"
      });

      logger.info(
        { opportunityId: data.opportunityId, fromStage: currentStage, toStage: targetStage, action: data.action },
        "Opportunity stage auto-progressed"
      );

      return { moved: true, fromStage: currentStage, toStage: targetStage, reason };
    } catch (error) {
      logger.warn({ error, opportunityId: data.opportunityId }, "Failed to auto-progress stage");
      return { moved: false, reason: "Error al mover la etapa" };
    }
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
    calendarEventId?: number; // Vincular a evento de calendario
    userId?: number; // Usuario al que se asigna la actividad (vendedor)
  }): Promise<number> {
    // Mapear tipo de actividad a ID (estos son los IDs por defecto en Odoo)
    const activityTypeMap: Record<string, number> = {
      call: 2, // Llamada
      meeting: 3, // Reunión
      email: 4, // Email
      task: 1 // Tarea
    };

    const activityTypeId = activityTypeMap[data.activityType] || 1;

    // Validar res_id PRIMERO
    if (!data.resId || data.resId <= 0) {
      throw new Error(`Invalid res_id for mail.activity: ${data.resId}. Must be a positive integer.`);
    }

    // CRITICAL: Obtener res_model_id (el ID del modelo ir.model)
    // Odoo requiere esto para vincular correctamente la actividad
    let resModelId: number | undefined;
    try {
      const models = await this.search("ir.model", [["model", "=", data.resModel || "crm.lead"]], {
        fields: ["id"],
        limit: 1
      });
      if (models.length > 0) {
        resModelId = models[0].id;
        logger.info({ resModel: data.resModel, resModelId }, "Found res_model_id for activity");
      }
    } catch (error) {
      logger.warn({ error }, "Could not fetch res_model_id");
    }

    // Construir values con TODOS los campos necesarios
    const values: Record<string, any> = {
      res_model: data.resModel || "crm.lead",
      res_id: data.resId,
      activity_type_id: activityTypeId,
      summary: data.summary,
      user_id: data.userId || this.uid
    };

    // Agregar res_model_id si lo encontramos
    if (resModelId) {
      values.res_model_id = resModelId;
    }

    // Campos opcionales
    if (data.dateDeadline) values.date_deadline = data.dateDeadline;
    if (data.note) values.note = data.note;
    if (data.calendarEventId) values.calendar_event_id = data.calendarEventId;

    // Log para debugging
    logger.info({
      activityValues: {
        activity_type_id: values.activity_type_id,
        summary: values.summary,
        res_model: values.res_model,
        res_id: values.res_id,
        user_id: values.user_id
      }
    }, "Creating mail.activity with these values");

    return this.create("mail.activity", values);
  }

  /**
   * Completar/cerrar una actividad (marcarla como hecha)
   */
  async completeActivity(activityId: number, feedback?: string): Promise<void> {
    try {
      // Odoo usa el método action_done para completar actividades
      await this.execute_kw("mail.activity", "action_done", [[activityId]], {
        feedback: feedback || ""
      });
      logger.info({ activityId, feedback }, "Activity marked as done");
    } catch (error) {
      logger.error({ activityId, error }, "Failed to complete activity");
      throw error;
    }
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
    // Convertir datetime a formato Odoo (sin timezone)
    const odooStart = this.convertToOdooDatetime(data.start);
    const endTime = this.calculateEndTime(data.start, data.duration);

    // Buscar eventos que se superpongan con el rango solicitado
    // Un evento se superpone si: (start1 < end2) AND (end1 > start2)
    const domain: any[] = [
      "|",
      "&",
      ["start", "<=", odooStart],
      ["stop", ">", odooStart],
      "&",
      ["start", "<", endTime],
      ["stop", ">=", endTime],
      "|",
      "&",
      ["start", ">=", odooStart],
      ["start", "<", endTime],
      "&",
      ["stop", ">", odooStart],
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

    // Convertir datetimes a formato Odoo (sin timezone)
    const odooPreferredStart = this.convertToOdooDatetime(data.preferredStart);
    const searchEndStr = this.convertToOdooDatetime(endSearchDate.toISOString());

    // Obtener todos los eventos en el rango de búsqueda
    const domain: any[] = [["start", ">=", odooPreferredStart], ["start", "<=", searchEndStr]];

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
    start: string; // ISO 8601 datetime con timezone (e.g., "2025-11-17T15:00:00-03:00") o formato Odoo (YYYY-MM-DD HH:MM:SS)
    duration?: number; // Duración en horas (default: 1)
    description?: string;
    location?: string;
    forceSchedule?: boolean; // Forzar agendamiento incluso con conflictos
  }): Promise<{
    eventId?: number;
    activityId?: number;
    conflict?: {
      available: boolean;
      conflicts: any[];
      availableSlots: Array<{ start: string; end: string }>;
    };
  }> {
    // PASO 1: Obtener información de la oportunidad para vincular partner
    const opportunities = await this.read("crm.lead", [data.opportunityId], ["partner_id", "partner_name", "user_id"]);

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

    // FLUJO DEFINITIVO: Buscar evento existente → Actualizar o Crear
    // Si existe un evento para esta oportunidad, actualizarlo (reprogramar)
    // Si no existe, crear nuevo evento + actividad + vincularlos

    const vendorUserId = opp.user_id && Array.isArray(opp.user_id) ? opp.user_id[0] : undefined;
    const deadlineDate = new Date(data.start).toISOString().split('T')[0];

    // Convertir datetime de ISO 8601 con timezone a formato Odoo (sin timezone)
    const odooStart = this.convertToOdooDatetime(data.start);

    // Valores base (para create y update)
    const baseEventValues: Record<string, any> = {
      name: data.name,
      start: odooStart, // Fecha + hora en formato Odoo (YYYY-MM-DD HH:MM:SS)
      stop: this.calculateEndTime(data.start, duration),
      duration
    };

    if (data.description) baseEventValues.description = data.description;
    if (data.location) baseEventValues.location = data.location;

    // Valores adicionales solo para CREATE (no para UPDATE/reschedule)
    const createOnlyValues: Record<string, any> = {
      opportunity_id: data.opportunityId, // Vincula al CRM
      partner_ids: [[6, 0, partnerIds]], // Participantes
      user_id: vendorUserId
    };

    // PASO 0: Buscar si ya existe un evento para esta oportunidad
    const existingEvents = await this.search("calendar.event", [
      ["opportunity_id", "=", data.opportunityId]
    ]);

    let eventId: number;
    let activityId: number;
    let isReschedule = false;

    if (existingEvents.length > 0) {
      // FLUJO DE REPROGRAMACIÓN: Actualizar evento existente
      eventId = existingEvents[0].id;  // ✅ Extraer ID del objeto (search_read retorna objetos, no IDs)
      isReschedule = true;

      logger.info({
        eventId,
        opportunityId: data.opportunityId,
        oldEvent: existingEvents
      }, "Rescheduling: Updating existing calendar event");

      // Actualizar el evento existente (solo campos seguros, sin partner_ids)
      await this.write("calendar.event", [eventId], baseEventValues);

      logger.info({ eventId, opportunityId: data.opportunityId }, "Rescheduling completed: Calendar event updated");

      // Buscar y actualizar la actividad asociada
      const existingActivities = await this.search("mail.activity", [
        ["res_model", "=", "crm.lead"],
        ["res_id", "=", data.opportunityId],
        ["activity_type_id.name", "=", "Meeting"],
        ["calendar_event_id", "=", eventId]
      ]);

      if (existingActivities.length > 0) {
        activityId = existingActivities[0].id;  // ✅ Extraer ID del objeto
        await this.write("mail.activity", [activityId], {
          summary: data.name,
          date_deadline: deadlineDate,
          note: data.description || `Reunión: ${data.name}`
        });
        logger.info({ activityId, eventId }, "Rescheduling: Activity updated");
      } else {
        // Si no existe actividad, crear una nueva
        activityId = await this.createActivity({
          activityType: "meeting",
          summary: data.name,
          resModel: "crm.lead",
          resId: data.opportunityId,
          dateDeadline: deadlineDate,
          userId: vendorUserId,
          note: data.description || `Reunión: ${data.name}`
        });

        await this.write("mail.activity", [activityId], {
          calendar_event_id: eventId
        });
        logger.info({ activityId, eventId }, "Rescheduling: New activity created and linked");
      }
    } else {
      // FLUJO DE CREACIÓN: Crear nuevo evento
      logger.info({
        opportunityId: data.opportunityId,
        vendorUserId,
        start: data.start,
        duration
      }, "Step 1: Creating calendar event with full details");

      // Merge base values con create-only values (partner_ids, opportunity_id)
      const eventValues = { ...baseEventValues, ...createOnlyValues };
      eventId = await this.create("calendar.event", eventValues);

      logger.info({ eventId, opportunityId: data.opportunityId }, "Step 1 completed: Calendar event created");

      // PASO 2: Crear actividad de reunión para que aparezca en "Actividades planeadas"
      logger.info({
        eventId,
        opportunityId: data.opportunityId,
        deadlineDate
      }, "Step 2: Creating meeting activity");

      activityId = await this.createActivity({
        activityType: "meeting",
        summary: data.name,
        resModel: "crm.lead",
        resId: data.opportunityId,
        dateDeadline: deadlineDate,
        userId: vendorUserId,
        note: data.description || `Reunión: ${data.name}`
      });

      logger.info({ activityId, eventId }, "Step 2 completed: Activity created");

      // PASO 3: Vincular la actividad con el evento de calendario
      try {
        await this.write("mail.activity", [activityId], {
          calendar_event_id: eventId
        });
        logger.info({ activityId, eventId }, "Step 3 completed: Activity linked to calendar event");
      } catch (error) {
        logger.warn({ error, activityId, eventId }, "Could not link activity to event");
      }
    }

    // Odoo automáticamente:
    // - Envía invitaciones por email al contacto (externo)
    // - Registra el evento en el chatter
    // - Muestra en todos los calendarios

    // PASO 4: Enviar notificación por email al vendedor (usuarios internos no reciben invitaciones nativas)
    // Odoo solo envía invitaciones automáticas a contactos externos, no a usuarios internos
    if (opp.user_id && Array.isArray(opp.user_id) && opp.user_id[0]) {
      try {
        const userId = opp.user_id[0];
        const users = await this.read("res.users", [userId], ["name", "email"]);

        if (users.length > 0 && users[0].email) {
          const vendorName = users[0].name || "Usuario";
          const vendorEmail = users[0].email;

          const startDate = new Date(data.start);
          const formattedDate = startDate.toLocaleString("es-ES", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });

          const emailTitle = isReschedule ? "🔄 Reunión Reprogramada" : "📅 Reunión Programada";
          const emailAction = isReschedule ? "reprogramado" : "programado";

          const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
              <h2 style="color: #875A7B;">${emailTitle}</h2>
              <p>Hola <strong>${vendorName}</strong>,</p>
              <p>Se ha ${emailAction} la siguiente reunión en tu calendario:</p>

              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #875A7B;">
                <h3 style="margin: 0 0 15px 0; color: #875A7B;">${data.name}</h3>
                <p style="margin: 5px 0;"><strong>📅 Fecha:</strong> ${formattedDate}</p>
                <p style="margin: 5px 0;"><strong>⏱️ Duración:</strong> ${duration} hora(s)</p>
                ${data.location ? `<p style="margin: 5px 0;"><strong>📍 Ubicación:</strong> ${data.location}</p>` : ''}
                ${data.description ? `<p style="margin: 5px 0;"><strong>📝 Descripción:</strong> ${data.description}</p>` : ''}
                ${opp.partner_name ? `<p style="margin: 5px 0;"><strong>👤 Con:</strong> ${opp.partner_name}</p>` : ''}
              </div>

              <p style="color: #666; font-size: 14px;">Este evento está disponible en tu calendario de Odoo.</p>
              <p style="color: #999; font-size: 12px; margin-top: 20px;"><em>Sistema automatizado Leonobitech</em></p>
            </div>
          `;

          const mailId = await this.create("mail.mail", {
            subject: `${emailTitle}: ${data.name}`,
            body_html: emailBody,
            email_to: vendorEmail,
            auto_delete: false,
            state: "outgoing"
          });

          // Forzar procesamiento inmediato de la cola de emails
          try {
            await this.execute_kw("mail.mail", "process_email_queue", [], {});
            logger.info({ mailId, vendorEmail }, "Email queue processed - vendor notification sent immediately");
          } catch (sendError) {
            logger.warn({ sendError, mailId }, "Could not force email queue processing, will be sent by cron");
          }
        }
      } catch (error) {
        logger.warn({ error, opportunityId: data.opportunityId }, "Failed to send notification to vendor");
      }
    }

    // PASO 5: Progresión automática de etapa (New → Qualified)
    // Solo progresar si es un nuevo agendamiento, no si es reprogramación
    if (!isReschedule) {
      try {
        await this.autoProgressStage({
          opportunityId: data.opportunityId,
          action: "meeting_scheduled"
        });
      } catch (error) {
        logger.warn({ error, opportunityId: data.opportunityId }, "Failed to auto-progress stage after meeting scheduling");
      }
    } else {
      logger.info({ opportunityId: data.opportunityId }, "Skipping stage progression for rescheduled meeting");
    }

    return { eventId, activityId };
  }

  /**
   * Convertir datetime ISO 8601 con timezone a formato Odoo UTC (sin timezone)
   *
   * Odoo XML-RPC espera datetimes en UTC sin timezone offset.
   * Luego Odoo los muestra según la timezone configurada en el perfil del usuario.
   *
   * IMPORTANTE: Convierte a UTC, no preserva hora local.
   *
   * Ejemplos:
   * Input:  "2025-11-18T09:30:00-03:00" (9:30 AM Argentina UTC-3)
   * Process: 09:30 + 03:00 = 12:30 UTC
   * Output: "2025-11-18 12:30:00" (UTC sin timezone)
   * Odoo muestra: 12:30 - 03:00 = 09:30 (hora Argentina) ✅
   */
  private convertToOdooDatetime(isoDatetime: string): string {
    // Si el string ya está en formato Odoo (YYYY-MM-DD HH:MM:SS), asumir que ya es UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(isoDatetime)) {
      return isoDatetime;
    }

    // Parsear el datetime (Date automáticamente convierte a UTC internamente)
    const date = new Date(isoDatetime);

    // Verificar que el parseo fue exitoso
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid datetime format: ${isoDatetime}`);
    }

    // Extraer componentes en UTC
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Calcular hora de fin basado en hora de inicio y duración
   */
  private calculateEndTime(start: string, durationHours: number): string {
    const startDate = new Date(start);
    startDate.setHours(startDate.getHours() + durationHours);

    // Convertir a formato Odoo (sin timezone)
    return this.convertToOdooDatetime(startDate.toISOString());
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

  /**
   * Asegurar que la oportunidad tenga un contacto (partner) vinculado
   * Si no tiene, lo crea basándose en los datos del lead
   *
   * @returns partnerId del contacto vinculado (existente o recién creado)
   */
  async ensureOpportunityHasPartner(opportunityId: number): Promise<number> {
    // Obtener datos de la oportunidad
    const opportunities = await this.read("crm.lead", [opportunityId], [
      "partner_id",
      "partner_name",
      "contact_name",
      "email_from",
      "phone",
      "name"
    ]);

    if (opportunities.length === 0) {
      throw new Error(`Opportunity #${opportunityId} not found`);
    }

    const opp = opportunities[0];

    // Si ya tiene partner_id, retornarlo
    if (opp.partner_id && Array.isArray(opp.partner_id) && opp.partner_id[0]) {
      logger.info({ opportunityId, partnerId: opp.partner_id[0] }, "Opportunity already has partner linked");
      return opp.partner_id[0];
    }

    // No tiene partner, necesitamos crear uno
    logger.info({ opportunityId }, "Opportunity has no partner, creating one automatically");

    // Determinar nombre del contacto
    const contactName = opp.partner_name || opp.contact_name || opp.name || "Cliente";

    // Verificar si ya existe un partner con el mismo email
    let partnerId: number | null = null;

    if (opp.email_from && typeof opp.email_from === "string") {
      const existingPartners = await this.search("res.partner", [["email", "=", opp.email_from.trim()]], {
        fields: ["id"],
        limit: 1
      });

      if (existingPartners.length > 0) {
        partnerId = existingPartners[0].id;
        logger.info({ opportunityId, partnerId, email: opp.email_from }, "Found existing partner with same email");
      }
    }

    // Si no existe, crear nuevo partner
    if (!partnerId) {
      const partnerData: Record<string, any> = {
        name: contactName,
        is_company: !!opp.partner_name // Si hay partner_name, asumimos que es empresa
      };

      if (opp.email_from) partnerData.email = opp.email_from;
      if (opp.phone) partnerData.phone = opp.phone;

      partnerId = await this.create("res.partner", partnerData);
      logger.info({ opportunityId, partnerId, name: contactName }, "Created new partner for opportunity");
    }

    // Vincular el partner a la oportunidad
    await this.write("crm.lead", [opportunityId], { partner_id: partnerId });

    // Registrar en el chatter
    await this.postMessageToChatter({
      model: "crm.lead",
      resId: opportunityId,
      body: `
        <p>👤 <strong>Contacto vinculado automáticamente</strong></p>
        <p>Se ha creado y vinculado el contacto <strong>${contactName}</strong> a esta oportunidad.</p>
        <p><em>Sistema automatizado Leonobitech</em></p>
      `,
      messageType: "comment"
    });

    logger.info({ opportunityId, partnerId }, "Partner linked to opportunity successfully");

    return partnerId;
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
    templateType?: string; // Tipo de template para determinar progresión de stage
  }): Promise<SendEmailResult> {
    // PASO 1: Obtener información de la oportunidad para extraer el email si no se proporciona
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
    let queueProcessed = false;
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
      queueProcessed = true;
    } catch (error) {
      // Si falla, no importa - el cron job lo enviará eventualmente
      logger.warn({ error, mailId }, "Could not force immediate email send, will be sent by cron");
    }

    // Registrar el email en el chatter de forma resumida (sin HTML completo del body)
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
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #999; font-style: italic;">
          Sistema automatizado Leonobitech
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

    // Progresión automática de etapa
    // - proposal/demo: New → Qualified (propuestas por email con template HTML)
    // - otros emails: New → Qualified
    // NOTA: Proposition se reserva para propuestas formales en PDF (funcionalidad futura)
    try {
      const isProposalOrDemo = data.templateType === 'proposal' || data.templateType === 'demo';
      await this.autoProgressStage({
        opportunityId: data.opportunityId,
        action: isProposalOrDemo ? "proposal_sent" : "email_sent"
      });
    } catch (error) {
      logger.warn({ error, opportunityId: data.opportunityId }, "Failed to auto-progress stage after email sending");
    }

    return {
      mailId,
      recipientEmail,
      queueProcessed
    };
  }

  /**
   * Enviar propuesta comercial con template profesional
   */
  async sendProposal(data: {
    opportunityId: number;
    clientName: string;
    proposalTitle: string;
    introduction: string;
    solution: string;
    deliverables: string[];
    timeline: string;
    investment: number;
    paymentTerms?: string;
    nextSteps?: string;
    demoUrl?: string;
    validityPeriod?: string;
    emailTo?: string;
  }): Promise<number> {
    // Generar HTML profesional con template
    const proposalHtml = this.generateProposalTemplate({
      clientName: data.clientName,
      proposalTitle: data.proposalTitle,
      introduction: data.introduction,
      solution: data.solution,
      deliverables: data.deliverables,
      timeline: data.timeline,
      investment: data.investment,
      paymentTerms: data.paymentTerms,
      nextSteps: data.nextSteps,
      demoUrl: data.demoUrl,
      validityPeriod: data.validityPeriod || "30 días"
    });

    // Enviar email con template
    const subject = `Propuesta Comercial: ${data.proposalTitle}`;
    const { mailId } = await this.sendEmailToOpportunity({
      opportunityId: data.opportunityId,
      subject,
      body: proposalHtml,
      emailTo: data.emailTo
    });

    // Progresión automática a Proposition (New/Qualified → Proposition)
    try {
      const progressResult = await this.autoProgressStage({
        opportunityId: data.opportunityId,
        action: "proposal_sent"
      });

      // Si se movió la etapa, agregar nota adicional al chatter
      if (progressResult.moved) {
        await this.postMessageToChatter({
          model: "crm.lead",
          resId: data.opportunityId,
          body: `
            <p>📄 <strong>Propuesta comercial enviada</strong></p>
            <p><strong>Título:</strong> ${data.proposalTitle}</p>
            <p><strong>Monto:</strong> $${data.investment.toLocaleString()}</p>
            <p>La oportunidad ha avanzado automáticamente a etapa de Propuesta.</p>
            <p><em>Sistema automatizado Leonobitech</em></p>
          `,
          messageType: "comment"
        });
      }
    } catch (error) {
      logger.warn({ error, opportunityId: data.opportunityId }, "Failed to handle proposal stage progression");
    }

    return mailId;
  }

  /**
   * Generar template HTML profesional para propuestas
   */
  private generateProposalTemplate(data: {
    clientName: string;
    proposalTitle: string;
    introduction: string;
    solution: string;
    deliverables: string[];
    timeline: string;
    investment: number;
    paymentTerms?: string;
    nextSteps?: string;
    demoUrl?: string;
    validityPeriod: string;
  }): string {
    const deliverablesHtml = data.deliverables.map(d => `<li style="margin: 8px 0; line-height: 1.6;">${d}</li>`).join("");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Leonobitech</h1>
                    <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Soluciones Tecnológicas Innovadoras</p>
                  </td>
                </tr>

                <!-- Saludo -->
                <tr>
                  <td style="padding: 30px 30px 20px 30px;">
                    <h2 style="color: #333333; margin: 0 0 10px 0; font-size: 24px;">Estimado/a ${data.clientName},</h2>
                    <p style="color: #666666; margin: 0; font-size: 16px; line-height: 1.6;">${data.introduction}</p>
                  </td>
                </tr>

                <!-- Título de Propuesta -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; border-radius: 4px;">
                      <h3 style="color: #667eea; margin: 0 0 10px 0; font-size: 20px;">📋 ${data.proposalTitle}</h3>
                      <p style="color: #666666; margin: 0; font-size: 14px;">Propuesta válida por ${data.validityPeriod}</p>
                    </div>
                  </td>
                </tr>

                <!-- Solución Propuesta -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">💡 Solución Propuesta</h3>
                    <p style="color: #666666; margin: 0; font-size: 15px; line-height: 1.6;">${data.solution}</p>
                  </td>
                </tr>

                <!-- Entregables -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">✅ Entregables</h3>
                    <ul style="color: #666666; margin: 0; padding-left: 20px; font-size: 15px;">
                      ${deliverablesHtml}
                    </ul>
                  </td>
                </tr>

                <!-- Timeline -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">⏱️ Cronograma</h3>
                    <p style="color: #666666; margin: 0; font-size: 15px; line-height: 1.6;">${data.timeline}</p>
                  </td>
                </tr>

                <!-- Inversión -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 8px; text-align: center;">
                      <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 16px; opacity: 0.9;">Inversión Total</p>
                      <h2 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700;">$${data.investment.toLocaleString()}</h2>
                      ${data.paymentTerms ? `<p style="color: #ffffff; margin: 15px 0 0 0; font-size: 14px; opacity: 0.9;">${data.paymentTerms}</p>` : ""}
                    </div>
                  </td>
                </tr>

                ${data.demoUrl ? `
                <!-- Demo/Recursos -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <div style="background-color: #e3f2fd; border: 2px solid #2196f3; padding: 20px; border-radius: 8px; text-align: center;">
                      <p style="color: #1976d2; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">🎥 Recursos Adicionales</p>
                      <a href="${data.demoUrl}" style="display: inline-block; background-color: #2196f3; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">Ver Demo / Documentación</a>
                    </div>
                  </td>
                </tr>
                ` : ""}

                <!-- Próximos Pasos -->
                ${data.nextSteps ? `
                <tr>
                  <td style="padding: 20px 30px;">
                    <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">🚀 Próximos Pasos</h3>
                    <p style="color: #666666; margin: 0; font-size: 15px; line-height: 1.6;">${data.nextSteps}</p>
                  </td>
                </tr>
                ` : ""}

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                    <p style="color: #666666; margin: 0 0 10px 0; font-size: 14px;">Quedamos atentos a sus comentarios y consultas.</p>
                    <p style="color: #666666; margin: 0; font-size: 14px; font-weight: 600;">Equipo Leonobitech</p>
                    <p style="color: #999999; margin: 15px 0 0 0; font-size: 12px; font-style: italic;">Sistema automatizado Leonobitech</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Marcar una oportunidad como ganada
   */
  async markAsWon(data: {
    opportunityId: number;
    finalAmount?: number;
    closingNotes?: string;
  }): Promise<boolean> {
    // Mover a etapa Won
    await this.updateDealStage(data.opportunityId, "Won");

    // Actualizar monto final si se proporciona
    if (data.finalAmount) {
      await this.write("crm.lead", [data.opportunityId], {
        expected_revenue: data.finalAmount
      });
    }

    // Registrar en chatter
    const chatterMessage = `
      <div style="margin: 10px 0; padding: 15px; background-color: #d4edda; border-left: 4px solid #28a745; border-radius: 4px;">
        <p style="margin: 0 0 10px 0;">
          <strong style="font-size: 14px; color: #155724;">🎉 Oportunidad ganada</strong>
        </p>
        ${data.finalAmount ? `<p><strong>Monto final:</strong> $${data.finalAmount.toLocaleString()}</p>` : ""}
        ${data.closingNotes ? `<p><strong>Notas de cierre:</strong> ${data.closingNotes}</p>` : ""}
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #155724; font-style: italic;">
          Sistema automatizado Leonobitech
        </p>
      </div>
    `;

    await this.postMessageToChatter({
      model: "crm.lead",
      resId: data.opportunityId,
      body: chatterMessage,
      messageType: "comment"
    });

    logger.info({ opportunityId: data.opportunityId, finalAmount: data.finalAmount }, "Opportunity marked as won");

    return true;
  }

  /**
   * Obtener el email de un partner por ID
   */
  private async getPartnerEmail(partnerId: number): Promise<string | null> {
    const partners = await this.read("res.partner", [partnerId], ["email"]);
    return partners.length > 0 ? partners[0].email : null;
  }
}

/**
 * Factory function para crear un cliente Odoo con credenciales específicas del usuario
 *
 * IMPORTANTE: Esta función NO es singleton - cada usuario debe tener su propia instancia
 * de OdooClient con sus credenciales específicas.
 *
 * Uso típico en MCP tools:
 * 1. Obtener userId del token de autenticación
 * 2. Buscar credenciales encriptadas del usuario en DB
 * 3. Desencriptar credenciales con decrypt()
 * 4. Crear cliente con createOdooClient(credentials)
 * 5. Ejecutar operaciones del tool
 */
export function createOdooClient(credentials: OdooCredentials): OdooClient {
  return new OdooClient(credentials);
}

/**
 * Test de conexión a Odoo con credenciales específicas
 */
export async function testOdooConnection(credentials: OdooCredentials): Promise<boolean> {
  try {
    const client = createOdooClient(credentials);
    await client.authenticate();
    logger.info({ username: credentials.username, db: credentials.db }, "✅ Conexión a Odoo exitosa");
    return true;
  } catch (error) {
    logger.error({ error, username: credentials.username }, "❌ Error conectando a Odoo");
    return false;
  }
}
