import { z } from "zod";

export const consultarDisponibilidadSchema = z.object({
  fecha: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Formato de fecha inválido. Use: YYYY-MM-DD"
  ),
  duracion: z.number().positive().optional().default(1),
});

export type ConsultarDisponibilidadInput = z.infer<typeof consultarDisponibilidadSchema>;

export interface TurnoOcupado {
  hora_inicio: string;
  hora_fin: string;
  servicio: string;
  clienta: string;
}

export interface ConsultarDisponibilidadResponse {
  fecha: string;
  horario_atencion: {
    apertura: string;
    cierre: string;
  };
  turnos_ocupados: TurnoOcupado[];
  horarios_disponibles: string[];
  mensaje: string;
}
