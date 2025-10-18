import { z } from "zod";

/**
 * Schema Zod para validación de parámetros de odoo_get_leads
 */
export const getLeadsSchema = z.object({
  limit: z.number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe("Número máximo de leads a retornar (1-100)"),

  stage: z.string()
    .min(1)
    .optional()
    .describe("Filtrar por nombre de etapa (ej: 'New', 'Qualified', 'Proposition')"),

  type: z.enum(["lead", "opportunity"])
    .optional()
    .describe("Tipo: 'lead' para prospectos, 'opportunity' para oportunidades")
});

export type GetLeadsInput = z.infer<typeof getLeadsSchema>;

/**
 * Schema de respuesta (para documentación)
 */
export const getLeadsResponseSchema = z.object({
  leads: z.array(z.object({
    id: z.number(),
    name: z.string(),
    partner_name: z.string().nullable(),
    contact_name: z.string().nullable(),
    email_from: z.string().nullable(),
    phone: z.string().nullable(),
    expected_revenue: z.number(),
    probability: z.number(),
    stage_id: z.tuple([z.number(), z.string()]),
    user_id: z.tuple([z.number(), z.string()]).nullable(),
    team_id: z.tuple([z.number(), z.string()]).nullable(),
    type: z.enum(["lead", "opportunity"]),
    date_deadline: z.string().nullable(),
    create_date: z.string(),
    description: z.string().nullable()
  }))
});

export type GetLeadsResponse = z.infer<typeof getLeadsResponseSchema>;
