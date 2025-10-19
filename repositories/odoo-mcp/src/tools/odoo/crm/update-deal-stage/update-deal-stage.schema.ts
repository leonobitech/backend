import { z } from "zod";

export const updateDealStageSchema = z.object({
  opportunityId: z.number().int().positive(),
  stageName: z.string().min(1),
});

export type UpdateDealStageInput = z.infer<typeof updateDealStageSchema>;

export interface UpdateDealStageResponse {
  success: boolean;
  opportunityId: number;
  newStage: string;
}
