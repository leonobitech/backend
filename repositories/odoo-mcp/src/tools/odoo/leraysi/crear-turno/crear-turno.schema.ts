import { z } from "zod";

export const crearTurnoSchema = z.object({
  // === Campos obligatorios ===
  clienta: z.string().min(1, "Nombre de la clienta es requerido"),
  telefono: z.string().min(1, "Teléfono es requerido"),
  email: z.string().email("Email inválido").min(1, "Email es requerido para enviar confirmación"),
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
  servicio_detalle: z.string().min(1, "Detalle del servicio es requerido"),
  fecha_hora: z.string().regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    "Formato de fecha inválido. Use: YYYY-MM-DD HH:MM o YYYY-MM-DDTHH:MM:SS"
  ),
  precio: z.number().positive("El precio debe ser mayor a 0"),
  duracion: z.number().positive("La duración debe ser mayor a 0"),
  lead_id: z.number().positive("ID del Lead es requerido para vincular el turno"),

  // === Campos opcionales ===
  notas: z.string().optional(),
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
