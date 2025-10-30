/**
 * Tool: odoo_get_leads
 *
 * Obtiene leads del CRM de Odoo con filtros opcionales.
 *
 * @module tools/odoo/crm/get-leads
 */

import { getLeadsSchema, type GetLeadsInput, type GetLeadsResponse } from "./get-leads.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

/**
 * Handler para la tool odoo_get_leads
 */
export class GetLeadsTool implements ITool<GetLeadsInput, GetLeadsResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  /**
   * Ejecuta la tool con los parámetros validados
   */
  async execute(input: unknown): Promise<GetLeadsResponse> {
    // 1. Validar input con Zod
    const params = getLeadsSchema.parse(input);

    // 2. Ejecutar lógica de negocio
    const leads = await this.getLeads(params);

    // 3. Retornar respuesta formateada
    return { leads };
  }

  /**
   * Lógica de negocio: obtener leads de Odoo
   */
  private async getLeads(params: GetLeadsInput) {
    // Construir dominio de búsqueda Odoo
    const domain: any[] = [];

    // Filtrar por tipo (lead vs opportunity)
    if (params.type) {
      domain.push(["type", "=", params.type]);
    }

    // Filtrar por etapa
    if (params.stage) {
      domain.push(["stage_id.name", "ilike", params.stage]);
    }

    // Ejecutar búsqueda en Odoo
    const results = await this.odooClient.search("crm.lead", domain, {
      fields: [
        "id",
        "name",
        "partner_id",
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
      limit: params.limit,
      order: "create_date desc"
    });

    return results;
  }

  /**
   * Definición de la tool para el registro MCP
   */
  definition(): ToolDefinition {
    return {
      name: "odoo_get_leads",
      description: "Obtiene leads del CRM de Odoo con filtros opcionales por etapa, tipo y límite",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Número máximo de leads a retornar (1-100)",
            minimum: 1,
            maximum: 100,
            default: 10
          },
          stage: {
            type: "string",
            description: "Filtrar por nombre de etapa (ej: 'New', 'Qualified', 'Proposition')"
          },
          type: {
            type: "string",
            enum: ["lead", "opportunity"],
            description: "Tipo: 'lead' para prospectos, 'opportunity' para oportunidades"
          }
        }
      }
    };
  }
}
