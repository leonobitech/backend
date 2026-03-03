import { z } from "zod";

export const consultarTurnosDiaSchema = z.object({
  fecha: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Formato de fecha inválido. Use: YYYY-MM-DD"
  ),
  estado: z.enum([
    "pendiente_pago",
    "confirmado",
    "completado",
    "cancelado",
    "todos",
  ]).optional().default("todos"),
  trabajadora: z.enum(["leraysi", "companera"]).optional(),
});

export type ConsultarTurnosDiaInput = z.infer<typeof consultarTurnosDiaSchema>;

export interface TurnoResumen {
  id: number;
  clienta: string;
  telefono: string;
  servicio: string;
  hora: string;
  duracion: number;
  precio: number;
  sena_pagada: boolean;
  trabajadora: string;
  estado: string;
}

export interface ConsultarTurnosDiaResponse {
  fecha: string;
  total_turnos: number;
  turnos: TurnoResumen[];
  resumen: {
    pendientes_pago: number;
    confirmados: number;
    completados: number;
    cancelados: number;
    ingresos_esperados: number;
  };
}
