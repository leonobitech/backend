import { z } from "zod";

export const cancelarTurnoSchema = z.object({
  turno_id: z.number().positive("ID de turno inválido"),
  motivo: z.string().optional(),
  notificar_clienta: z.boolean().optional().default(false),
});

export type CancelarTurnoInput = z.infer<typeof cancelarTurnoSchema>;

export interface CancelarTurnoResponse {
  turnoId: number;
  clienta: string;
  telefono: string;
  estado_anterior: string;
  estado_nuevo: string;
  fecha_hora: string;
  servicio: string;
  sena_pagada: boolean;
  message: string;
}
