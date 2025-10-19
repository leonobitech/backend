import { z } from "zod";

export const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  isCompany: z.boolean().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  website: z.string().url().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export interface CreateContactResponse {
  contactId: number;
  message: string;
}
