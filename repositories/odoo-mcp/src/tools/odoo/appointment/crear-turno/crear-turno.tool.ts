import {
  createBookingSchema,
  type CreateBookingInput,
  type CreateBookingResponse,
} from "./crear-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

// Mapeo de nombres user-friendly a códigos Odoo
const SERVICIO_MAP: Record<string, string> = {
  // Cortes
  "corte mujer": "corte_mujer",
  "corte de mujer": "corte_mujer",
  "corte": "corte_mujer",
  // Alisados
  "alisado brasileño": "alisado_brasileno",
  "alisado brasileno": "alisado_brasileno",
  "alisado con keratina": "alisado_keratina",
  "alisado keratina": "alisado_keratina",
  "keratina": "alisado_keratina",
  // Mechas y color
  "mechas completas": "mechas_completas",
  "mechas": "mechas_completas",
  "tintura raíz": "tintura_raiz",
  "tintura raiz": "tintura_raiz",
  "tintura completa": "tintura_completa",
  "tintura": "tintura_completa",
  "balayage": "balayage",
  // Manicura/Pedicura
  "manicura simple": "manicura_simple",
  "manicure simple": "manicura_simple",
  "manicura": "manicura_simple",
  "manicura semipermanente": "manicura_semipermanente",
  "manicure semipermanente": "manicura_semipermanente",
  "semipermanente": "manicura_semipermanente",
  "pedicura": "pedicura",
  "pedicure": "pedicura",
  // Depilación cera
  "depilación cera piernas": "depilacion_cera_piernas",
  "depilacion cera piernas": "depilacion_cera_piernas",
  "cera piernas": "depilacion_cera_piernas",
  "depilación cera axilas": "depilacion_cera_axilas",
  "depilacion cera axilas": "depilacion_cera_axilas",
  "cera axilas": "depilacion_cera_axilas",
  "depilación cera bikini": "depilacion_cera_bikini",
  "depilacion cera bikini": "depilacion_cera_bikini",
  "cera bikini": "depilacion_cera_bikini",
  // Depilación láser
  "depilación láser piernas": "depilacion_laser_piernas",
  "depilacion laser piernas": "depilacion_laser_piernas",
  "láser piernas": "depilacion_laser_piernas",
  "laser piernas": "depilacion_laser_piernas",
  "depilación láser axilas": "depilacion_laser_axilas",
  "depilacion laser axilas": "depilacion_laser_axilas",
  "láser axilas": "depilacion_laser_axilas",
  "laser axilas": "depilacion_laser_axilas",
};

// Ranking de complejidad por servicio (mayor = más complejo)
const COMPLEJIDAD_SERVICIO: Record<string, number> = {
  // very_complex = 4
  alisado_brasileno: 4,
  alisado_keratina: 4,
  mechas_completas: 4,
  tintura_completa: 4,
  balayage: 4,
  // complex = 3
  tintura_raiz: 3,
  manicura_semipermanente: 3,
  // medium = 2
  corte_mujer: 2,
  manicura_simple: 2,
  pedicura: 2,
  depilacion_cera_piernas: 2,
  depilacion_laser_piernas: 2,
  // simple = 1
  depilacion_cera_axilas: 1,
  depilacion_cera_bikini: 1,
  depilacion_laser_axilas: 1,
};

export class AppointmentCreateTool
  implements ITool<CreateBookingInput, CreateBookingResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CreateBookingResponse> {
    // Normalizar servicio antes de validar
    const normalizedInput = this.normalizeServicio(input);
    const params = createBookingSchema.parse(normalizedInput);

    logger.info(
      { client_name: params.client_name, service_type: params.service_type },
      "[AppointmentCreate] Creating appointment"
    );

    // Normalize scheduled_datetime to Odoo format (YYYY-MM-DD HH:MM:SS)
    let scheduledDatetime = params.scheduled_datetime;
    if (scheduledDatetime.includes("T")) {
      scheduledDatetime = scheduledDatetime.replace("T", " ");
    }
    if (scheduledDatetime.length === 16) {
      scheduledDatetime += ":00";
    }

    // Keep local Argentina time for response
    const scheduledDatetimeLocal = scheduledDatetime;

    // Convert local Argentina time to UTC for Odoo
    // Odoo stores internally in UTC, the addon expects UTC
    scheduledDatetime = this.argentinaToUTC(scheduledDatetime);

    // Floor complexity by number of services (same logic as ParseInput.js)
    // If service_detail has "Service A + Service B", count by "+"
    const totalServicios = params.service_detail.includes("+")
      ? params.service_detail.split("+").length
      : 1;
    const COMP_ORDER: Record<string, number> = { simple: 1, medium: 2, complex: 3, very_complex: 4 };
    const ORDER_TO_COMP: Record<number, string> = { 1: "simple", 2: "medium", 3: "complex", 4: "very_complex" };

    let floorPorCantidad = "simple";
    if (totalServicios >= 3) floorPorCantidad = "very_complex";
    else if (totalServicios >= 2) floorPorCantidad = "complex";

    const complejidadFinal = ORDER_TO_COMP[
      Math.max(COMP_ORDER[params.max_complexity] || 2, COMP_ORDER[floorPorCantidad] || 1)
    ] || params.max_complexity;

    // Create the appointment in appointment.booking
    const depositInicial = Math.round(params.total_price * 0.3);
    const values: Record<string, any> = {
      client_name: params.client_name,
      phone: params.phone,
      email: params.email,
      service_type: params.service_type,
      service_detail: params.service_detail,
      scheduled_datetime: scheduledDatetime,
      total_price: params.total_price,
      duration_hours: params.estimated_duration / 60, // Convert minutes -> hours for Odoo
      max_complexity: complejidadFinal,
      pending_payment_amount: depositInicial, // Actual amount to charge (used by action_generate_payment_link)
      lead_id: params.lead_id,
      worker: params.worker || "primary",
      state: "pending_payment",
    };

    // Optional field
    if (params.notes) values.notes = params.notes;

    const bookingId = await this.odooClient.create("appointment.booking", values);

    logger.info({ bookingId }, "[AppointmentCreate] Appointment created");

    // Try to generate payment link
    let paymentLink = "";
    let mpPreferenceId = "";
    try {
      // Call the model method to generate the link
      await this.odooClient.execute(
        "appointment.booking",
        "action_generate_payment_link",
        [[bookingId]]
      );

      // Read the generated link and preference_id
      const bookings = await this.odooClient.read("appointment.booking", [bookingId], [
        "payment_link",
        "mp_preference_id",
      ]);
      if (bookings.length > 0) {
        paymentLink = bookings[0].payment_link || "";
        mpPreferenceId = bookings[0].mp_preference_id || "";
      }
    } catch (error) {
      logger.warn(
        { error, bookingId },
        "[AppointmentCreate] Could not generate payment link"
      );
    }

    // Advance lead from Qualified -> Proposition + set expected_revenue and tags
    // SKIP if: (1) is_additional_booking flag, OR (2) lead is already in a stage past Proposition
    // This protects against downgrading the lead when the LLM doesn't pass the flag
    let skipLeadUpdate = !!params.is_additional_booking;

    if (!skipLeadUpdate) {
      try {
        // Read current lead stage to avoid downgrade
        const leads = await this.odooClient.read("crm.lead", [params.lead_id], ["stage_id"]);
        if (leads.length > 0) {
          const currentStage = leads[0].stage_id;
          const stageName = Array.isArray(currentStage) ? currentStage[1] : String(currentStage);
          // Stages that should NOT be moved back to Proposition
          const protectedStages = ["Won", "Ganado", "turno_confirmado", "Turno Confirmado"];
          if (protectedStages.some(s => stageName.toLowerCase().includes(s.toLowerCase()))) {
            skipLeadUpdate = true;
            logger.info(
              { lead_id: params.lead_id, currentStage: stageName },
              "[AppointmentCreate] Lead already in advanced stage, skipping update to avoid downgrade"
            );
          }
        }
      } catch (e) {
        logger.warn({ error: e, lead_id: params.lead_id }, "[AppointmentCreate] Could not read lead stage");
      }
    }

    if (!skipLeadUpdate) {
      try {
        await this.odooClient.updateDealStage(params.lead_id, "Proposition");

        // Resolve CRM tags: service category + complexity
        const tagIds = await this.resolveLeadTags(
          params.service_type,
          complejidadFinal,
          params.service_detail
        );

        // REPLACE only business tags, PRESERVE existing tags (channel: telegram, whatsapp, etc.)
        let tagCommands: any[];
        try {
          const leadData = await this.odooClient.read("crm.lead", [params.lead_id], ["tag_ids"]);
          if (leadData.length > 0 && leadData[0].tag_ids?.length > 0) {
            // Identify existing business tags (service + complexity) to replace them
            const businessTagNames = ["Simple", "Media", "Compleja", "Muy Compleja"];
            const existingBusinessTags = await this.odooClient.search(
              "crm.tag",
              [["id", "in", leadData[0].tag_ids], ["name", "in", businessTagNames]],
              { fields: ["id"] }
            );
            const businessTagIds = new Set(existingBusinessTags.map((t: any) => t.id));
            // Preserve tags that are NOT business tags (channel, etc.)
            const preservedTagIds = leadData[0].tag_ids.filter((id: number) => !businessTagIds.has(id));
            const allTagIds = [...new Set([...preservedTagIds, ...tagIds])];
            tagCommands = [[6, 0, allTagIds]];
          } else {
            tagCommands = [[6, 0, tagIds]];
          }
        } catch (readError) {
          logger.warn({ error: readError }, "[AppointmentCreate] Could not read existing lead tags, replacing all");
          tagCommands = [[6, 0, tagIds]];
        }

        await this.odooClient.write("crm.lead", [params.lead_id], {
          expected_revenue: params.total_price,
          tag_ids: tagCommands,
        });
      } catch (e) {
        logger.warn({ error: e, lead_id: params.lead_id }, "[AppointmentCreate] Could not advance lead to Proposition");
      }
    } else {
      logger.info(
        { lead_id: params.lead_id },
        "[AppointmentCreate] Skipping lead update (additional booking or advanced stage)"
      );
    }

    // Calculate deposit (30%)
    const deposit = params.total_price * 0.3;

    return {
      bookingId,
      client_name: params.client_name,
      scheduled_datetime: scheduledDatetimeLocal,
      service_type: params.service_type,
      total_price: params.total_price,
      estimated_duration: params.estimated_duration,
      max_complexity: complejidadFinal,
      worker: params.worker || "primary",
      deposit_amount: deposit,
      payment_link: paymentLink,
      mp_preference_id: mpPreferenceId,
      state: "pending_payment",
      message: paymentLink
        ? `Appointment created for ${params.client_name}. Payment link generated.`
        : `Appointment created for ${params.client_name}. Could not generate payment link (configure Mercado Pago).`,
    };
  }

  /**
   * Converts local Argentina datetime to UTC for Odoo.
   * Argentina is UTC-3, so we add 3 hours.
   * E.g.: "2026-02-11 14:00:00" (Argentina) -> "2026-02-11 17:00:00" (UTC)
   */
  private argentinaToUTC(localDatetime: string): string {
    const [datePart, timePart] = localDatetime.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = (timePart || "00:00:00").split(":").map(Number);

    // Create UTC date by adding 3 hours (Argentina UTC-3 -> UTC)
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second || 0));

    // Format as YYYY-MM-DD HH:MM:SS
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${utcDate.getUTCFullYear()}-${pad(utcDate.getUTCMonth() + 1)}-${pad(utcDate.getUTCDate())} ${pad(utcDate.getUTCHours())}:${pad(utcDate.getUTCMinutes())}:${pad(utcDate.getUTCSeconds())}`;
  }

  /**
   * Normalizes the service_type field from user-friendly to Odoo code.
   * Supports a single service ("Manicura simple" -> "manicura_simple")
   * and multiple comma-separated ("Manicura simple,Pedicura,Alisado keratina"
   * -> "alisado_keratina", the most complex as primary).
   */
  private normalizeServicio(input: unknown): unknown {
    if (!input || typeof input !== "object") return input;

    const obj = input as Record<string, unknown>;
    if (typeof obj.service_type !== "string") return input;

    // Multiple comma-separated services
    if (obj.service_type.includes(",")) {
      const codigos = obj.service_type.split(",").map(s => {
        const lower = s.toLowerCase().trim();
        return SERVICIO_MAP[lower] || lower;
      });
      // Pick the most complex as primary service
      const principal = codigos.reduce((best, cur) =>
        (COMPLEJIDAD_SERVICIO[cur] ?? 0) > (COMPLEJIDAD_SERVICIO[best] ?? 0) ? cur : best
      , codigos[0]);
      return { ...obj, service_type: principal };
    }

    // Single service
    const servicioLower = obj.service_type.toLowerCase().trim();
    const servicioMapped = SERVICIO_MAP[servicioLower];

    if (servicioMapped) {
      return { ...obj, service_type: servicioMapped };
    }

    // If already a valid code (e.g.: "manicura_simple"), leave as-is
    if (Object.keys(COMPLEJIDAD_SERVICIO).includes(servicioLower)) {
      return input;
    }

    // Fallback: resolve from service_detail (more reliable, has the full name)
    if (typeof obj.service_detail === "string") {
      const detalleLower = obj.service_detail.toLowerCase().trim();
      for (const [key, code] of Object.entries(SERVICIO_MAP)) {
        if (detalleLower.includes(key)) {
          return { ...obj, service_type: code };
        }
      }
    }

    return input;
  }

  /**
   * Searches or creates tags in crm.tag and returns their IDs.
   * Tags: service category + max complexity.
   */
  private async resolveLeadTags(
    servicio: string,
    complejidad: string | null,
    _servicioDetalle?: string
  ): Promise<number[]> {
    const CATEGORY_MAP: Record<string, string> = {
      corte_mujer: "Corte",
      alisado_brasileno: "Alisado",
      alisado_keratina: "Alisado",
      mechas_completas: "Color",
      tintura_raiz: "Color",
      tintura_completa: "Color",
      balayage: "Color",
      manicura_simple: "Uñas",
      manicura_semipermanente: "Uñas",
      pedicura: "Uñas",
      depilacion_cera_piernas: "Depilación",
      depilacion_cera_axilas: "Depilación",
      depilacion_cera_bikini: "Depilación",
      depilacion_laser_piernas: "Depilación",
      depilacion_laser_axilas: "Depilación",
    };

    const SERVICE_NAME_MAP: Record<string, string> = {
      corte_mujer: "Corte mujer",
      alisado_brasileno: "Alisado brasileño",
      alisado_keratina: "Alisado keratina",
      mechas_completas: "Mechas completas",
      tintura_raiz: "Tintura raíz",
      tintura_completa: "Tintura completa",
      balayage: "Balayage",
      manicura_simple: "Manicura simple",
      manicura_semipermanente: "Manicura semipermanente",
      pedicura: "Pedicura",
      depilacion_cera_piernas: "Depilación cera piernas",
      depilacion_cera_axilas: "Depilación cera axilas",
      depilacion_cera_bikini: "Depilación cera bikini",
      depilacion_laser_piernas: "Depilación láser piernas",
      depilacion_laser_axilas: "Depilación láser axilas",
    };

    const COMPLEJIDAD_LABELS: Record<string, string> = {
      simple: "Simple",
      medium: "Media",
      complex: "Compleja",
      very_complex: "Muy Compleja",
    };

    const tagNames: string[] = [];

    const category = CATEGORY_MAP[servicio];
    if (category) tagNames.push(category);

    const serviceName = SERVICE_NAME_MAP[servicio];
    if (serviceName) tagNames.push(serviceName);

    if (complejidad) {
      const label = COMPLEJIDAD_LABELS[complejidad];
      if (label) tagNames.push(label);
    }

    if (tagNames.length === 0) return [];

    const tagIds: number[] = [];
    for (const name of tagNames) {
      const existing = await this.odooClient.search(
        "crm.tag",
        [["name", "=", name]],
        { fields: ["id"], limit: 1 }
      );

      if (existing.length > 0) {
        tagIds.push(existing[0].id);
      } else {
        const newId = await this.odooClient.create("crm.tag", { name });
        tagIds.push(newId);
        logger.info({ tagName: name, tagId: newId }, "[AppointmentCreate] Created new CRM tag");
      }
    }

    return tagIds;
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_create",
      description:
        "Creates an appointment booking and generates a MercadoPago payment link (30% deposit). " +
        "Requires all client and service data. " +
        "The booking stays in 'pending_payment' state until payment is confirmed.",
      inputSchema: {
        type: "object",
        properties: {
          client_name: {
            type: "string",
            description: "Full name of the client",
          },
          phone: {
            type: "string",
            description: "Phone number with country code (e.g.: +5491112345678)",
          },
          email: {
            type: "string",
            description: "Client email (for sending confirmation and invoice)",
          },
          service_type: {
            type: "string",
            enum: [
              "corte_mujer",
              "alisado_brasileno",
              "alisado_keratina",
              "mechas_completas",
              "tintura_raiz",
              "tintura_completa",
              "balayage",
              "manicura_simple",
              "manicura_semipermanente",
              "pedicura",
              "depilacion_cera_piernas",
              "depilacion_cera_axilas",
              "depilacion_cera_bikini",
              "depilacion_laser_piernas",
              "depilacion_laser_axilas",
            ],
            description: "Odoo service code (e.g.: corte_mujer, alisado_brasileno)",
          },
          service_detail: {
            type: "string",
            description: "Full service description (e.g.: 'Alisado brasileño, cabello largo')",
          },
          scheduled_datetime: {
            type: "string",
            description: "Date and time in YYYY-MM-DD HH:MM format (e.g.: 2025-01-29 10:00)",
          },
          total_price: {
            type: "number",
            description: "Total service price in ARS",
          },
          estimated_duration: {
            type: "number",
            description: "Estimated duration in minutes (converted to hours internally for Odoo)",
          },
          max_complexity: {
            type: "string",
            enum: ["simple", "medium", "complex", "very_complex"],
            description: "Maximum complexity level of the booking (determines salon capacity)",
          },
          lead_id: {
            type: "number",
            description: "CRM Lead ID (critical for post-payment flow)",
          },
          worker: {
            type: "string",
            enum: ["primary", "secondary"],
            description: "Worker assigned to the booking (default: primary)",
          },
          notes: {
            type: "string",
            description: "Additional notes about the booking (optional)",
          },
          is_additional_booking: {
            type: "boolean",
            description: "True if this is an additional booking (another worker). Prevents modifying the lead/CRM (updated on payment confirmation).",
          },
        },
        required: [
          "client_name",
          "phone",
          "email",
          "service_type",
          "service_detail",
          "scheduled_datetime",
          "total_price",
          "estimated_duration",
          "max_complexity",
          "lead_id",
        ],
      },
    };
  }
}
