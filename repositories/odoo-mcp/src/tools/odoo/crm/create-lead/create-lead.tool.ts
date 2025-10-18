/**
 * Tool: odoo_create_lead
 *
 * Crea un nuevo lead en el CRM con auto-creación de contacto.
 *
 * @module tools/odoo/crm/create-lead
 */

import { createLeadSchema, type CreateLeadInput, type CreateLeadResponse } from "./create-lead.schema";
import type { OdooClient } from "@/adapters/out/external/odoo/OdooClient";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

/**
 * Handler para la tool odoo_create_lead
 */
export class CreateLeadTool implements ITool<CreateLeadInput, CreateLeadResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  /**
   * Ejecuta la tool con los parámetros validados
   */
  async execute(input: unknown): Promise<CreateLeadResponse> {
    // 1. Validar input
    const params = createLeadSchema.parse(input);

    // 2. Ejecutar lógica de negocio
    const result = await this.createLead(params);

    // 3. Retornar respuesta
    return result;
  }

  /**
   * Lógica de negocio: crear lead con auto-creación de partner
   */
  private async createLead(params: CreateLeadInput): Promise<CreateLeadResponse> {
    let partnerId: number | undefined;

    // Auto-creación de partner si hay datos de contacto
    if (params.partner_name || params.email) {
      partnerId = await this.findOrCreatePartner(params);
    }

    // Preparar valores del lead
    const leadValues: Record<string, any> = {
      name: params.name,
      type: params.type || "lead"
    };

    // Vincular partner si existe
    if (partnerId) {
      leadValues.partner_id = partnerId;
    }

    // Campos opcionales
    if (params.partner_name) leadValues.partner_name = params.partner_name;
    if (params.contact_name) leadValues.contact_name = params.contact_name;
    if (params.email) leadValues.email_from = params.email;
    if (params.phone) leadValues.phone = params.phone;
    if (params.description) leadValues.description = params.description;
    if (params.expected_revenue) leadValues.expected_revenue = params.expected_revenue;

    // Crear lead en Odoo
    const leadId = await this.odooClient.create("crm.lead", leadValues);

    // Mensaje de confirmación
    const message = partnerId
      ? `Lead "${params.name}" created successfully with partner linked`
      : `Lead "${params.name}" created successfully`;

    return {
      leadId,
      partnerId,
      message
    };
  }

  /**
   * Busca partner existente o crea uno nuevo
   */
  private async findOrCreatePartner(params: CreateLeadInput): Promise<number> {
    // Si hay email, buscar partner existente
    if (params.email) {
      const existingPartners = await this.odooClient.search(
        "res.partner",
        [["email", "=", params.email]],
        {
          fields: ["id"],
          limit: 1
        }
      );

      if (existingPartners.length > 0) {
        return existingPartners[0].id;
      }
    }

    // No existe, crear nuevo partner
    const partnerData: Record<string, any> = {
      name: params.partner_name || params.contact_name || "Unknown Contact",
      is_company: !!params.partner_name // Si hay partner_name, es empresa
    };

    if (params.email) partnerData.email = params.email;
    if (params.phone) partnerData.phone = params.phone;

    const partnerId = await this.odooClient.create("res.partner", partnerData);

    return partnerId;
  }

  /**
   * Definición de la tool para el registro MCP
   */
  definition(): ToolDefinition {
    return {
      name: "odoo_create_lead",
      description: "Crea un nuevo lead en el CRM de Odoo con creación automática de contacto si se proporciona email o nombre de empresa",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Título del lead (obligatorio)",
            minLength: 1,
            maxLength: 255
          },
          partner_name: {
            type: "string",
            description: "Nombre de la empresa (opcional)"
          },
          contact_name: {
            type: "string",
            description: "Nombre del contacto individual (opcional)"
          },
          email: {
            type: "string",
            description: "Email del contacto (opcional)",
            format: "email"
          },
          phone: {
            type: "string",
            description: "Teléfono del contacto (opcional)"
          },
          description: {
            type: "string",
            description: "Descripción o notas del lead (opcional)"
          },
          expected_revenue: {
            type: "number",
            description: "Ingreso esperado del lead (opcional)",
            minimum: 0
          },
          type: {
            type: "string",
            enum: ["lead", "opportunity"],
            description: "Tipo: 'lead' para prospecto, 'opportunity' para oportunidad",
            default: "lead"
          }
        },
        required: ["name"]
      }
    };
  }
}
