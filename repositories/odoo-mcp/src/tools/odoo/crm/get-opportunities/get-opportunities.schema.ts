import { z } from "zod";

export const getOpportunitiesSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(20),
  stage: z.string().min(1).optional(),
  minAmount: z.number().min(0).optional(),
});

export type GetOpportunitiesInput = z.infer<typeof getOpportunitiesSchema>;

export interface GetOpportunitiesResponse {
  opportunities: any[];
  totalRevenue: number;
}
