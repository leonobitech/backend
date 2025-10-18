import { z } from "zod";

/**
 * Schema Zod para validación de parámetros de odoo_create_lead
 */
export const createLeadSchema = z.object({
  name: z.string()
    .min(1, "Lead name is required")
    .max(255, "Lead name too long")
    .describe("Título del lead (obligatorio)"),

  partner_name: z.string()
    .min(1)
    .max(255)
    .optional()
    .describe("Nombre de la empresa (opcional)"),

  contact_name: z.string()
    .min(1)
    .max(255)
    .optional()
    .describe("Nombre del contacto individual (opcional)"),

  email: z.string()
    .email("Invalid email format")
    .optional()
    .describe("Email del contacto (opcional)"),

  phone: z.string()
    .min(1)
    .max(50)
    .optional()
    .describe("Teléfono del contacto (opcional)"),

  description: z.string()
    .max(5000, "Description too long")
    .optional()
    .describe("Descripción o notas del lead (opcional)"),

  expected_revenue: z.number()
    .positive("Expected revenue must be positive")
    .optional()
    .describe("Ingreso esperado del lead (opcional)"),

  type: z.enum(["lead", "opportunity"])
    .optional()
    .default("lead")
    .describe("Tipo: 'lead' para prospecto, 'opportunity' para oportunidad")
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/**
 * Schema de respuesta
 */
export const createLeadResponseSchema = z.object({
  leadId: z.number()
    .describe("ID del lead creado en Odoo"),

  partnerId: z.number()
    .optional()
    .describe("ID del partner creado/encontrado (si aplica)"),

  message: z.string()
    .describe("Mensaje de confirmación")
});

export type CreateLeadResponse = z.infer<typeof createLeadResponseSchema>;
