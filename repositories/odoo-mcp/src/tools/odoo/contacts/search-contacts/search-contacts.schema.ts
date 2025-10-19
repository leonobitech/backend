import { z } from "zod";

export const searchContactsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(20).optional().default(5),
});

export type SearchContactsInput = z.infer<typeof searchContactsSchema>;

export interface SearchContactsResponse {
  contacts: any[];
}
