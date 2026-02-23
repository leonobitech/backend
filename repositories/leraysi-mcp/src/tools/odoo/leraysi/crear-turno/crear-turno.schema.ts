import { z } from "zod";

export const crearTurnoSchema = z.object({
  // === Campos obligatorios ===
  clienta: z.string().min(1, "Nombre de la clienta es requerido"),
  telefono: z.string().min(1).optional(),
  email: z.string().email("Email inválido").min(1, "Email es requerido para enviar confirmación"),
  servicio: z.enum([
    "corte_mujer",
    "alisado_brasileno",
    "alisado_keratina",
    "mechas_completas",
    "tintura_raiz",
    "tintura_completa",
    "balayage",
    "manicura_simple",
    "manicura_semipermanente",
    "pedicura",
    "depilacion_cera_piernas",
    "depilacion_cera_axilas",
    "depilacion_cera_bikini",
    "depilacion_laser_piernas",
    "depilacion_laser_axilas",
  ]),
  servicio_detalle: z.string().min(1, "Detalle del servicio es requerido"),
  fecha_hora: z.string().regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    "Formato de fecha inválido. Use: YYYY-MM-DD HH:MM o YYYY-MM-DDTHH:MM:SS"
  ),
  precio: z.number().positive("El precio debe ser mayor a 0"),
  duracion_estimada: z.number().positive("La duración estimada debe ser mayor a 0"),
  complejidad_maxima: z.enum(["simple", "media", "compleja", "muy_compleja"]),
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
  duracion_estimada: number;
  complejidad_maxima: string;
  sena: number;
  link_pago: string;
  mp_preference_id: string;
  estado: string;
  message: string;
}
