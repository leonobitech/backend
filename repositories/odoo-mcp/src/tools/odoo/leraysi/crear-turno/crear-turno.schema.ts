import { z } from "zod";

export const crearTurnoSchema = z.object({
  clienta: z.string().min(1, "Nombre de la clienta es requerido"),
  telefono: z.string().min(1, "Teléfono es requerido"),
  servicio: z.enum([
    "corte",
    "tintura",
    "mechas",
    "brushing",
    "peinado",
    "tratamiento",
    "manicura",
    "pedicura",
    "depilacion",
    "maquillaje",
    "otro",
  ]),
  fecha_hora: z.string().regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    "Formato de fecha inválido. Use: YYYY-MM-DD HH:MM o YYYY-MM-DDTHH:MM:SS"
  ),
  precio: z.number().positive("El precio debe ser mayor a 0"),
  duracion: z.number().positive().optional().default(1),
  email: z.string().email().optional(),
  notas: z.string().optional(),
  servicio_detalle: z.string().optional(),
});

export type CrearTurnoInput = z.infer<typeof crearTurnoSchema>;

export interface CrearTurnoResponse {
  turnoId: number;
  clienta: string;
  fecha_hora: string;
  servicio: string;
  precio: number;
  sena: number;
  link_pago: string;
  mp_preference_id: string;
  estado: string;
  message: string;
}
