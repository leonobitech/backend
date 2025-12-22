import { z } from "zod";

export const confirmarTurnoSchema = z.object({
  turno_id: z.number().positive("ID de turno inválido"),
  mp_payment_id: z.string().optional(),
  notas: z.string().optional(),
});

export type ConfirmarTurnoInput = z.infer<typeof confirmarTurnoSchema>;

export interface ConfirmarTurnoResponse {
  turnoId: number;
  clienta: string;
  estado_anterior: string;
  estado_nuevo: string;
  fecha_hora: string;
  servicio: string;
  message: string;
}
