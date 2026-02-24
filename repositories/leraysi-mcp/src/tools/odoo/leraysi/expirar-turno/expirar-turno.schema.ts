import { z } from "zod";

export const expirarTurnoSchema = z.object({
  turno_id: z.number().positive("ID de turno inválido"),
});

export type ExpirarTurnoInput = z.infer<typeof expirarTurnoSchema>;

export interface ExpirarTurnoResponse {
  turnoId: number;
  clienta: string;
  estado_anterior: string;
  estado_nuevo: string;
  lead_reverted: boolean;
  lead_id: number | null;
  message: string;
}
