import { z } from "zod";

export const agregarServicioTurnoSchema = z.object({
  // === Campos obligatorios ===
  turno_id: z.number().positive("ID del turno existente es requerido"),
  nuevo_servicio: z.enum([
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
  nuevo_servicio_detalle: z.string().min(1, "Detalle del nuevo servicio es requerido"),
  nuevo_precio: z.number().positive("El precio del nuevo servicio debe ser mayor a 0"),
  duracion_estimada: z.number().positive("La duración estimada del nuevo servicio debe ser mayor a 0"),
  complejidad_maxima: z.enum(["simple", "media", "compleja", "muy_compleja"]),
});

export type AgregarServicioTurnoInput = z.infer<typeof agregarServicioTurnoSchema>;

export interface AgregarServicioTurnoResponse {
  turnoId: number;
  clienta: string;
  fecha_hora: string;
  // Servicios combinados
  servicios: string[];
  servicio_detalle: string;
  // Totales actualizados
  precio_total: number;
  duracion_total: number;
  duracion_estimada: number;
  complejidad_maxima: string;
  sena: number;
  // Nuevo link de pago
  link_pago: string;
  mp_preference_id: string;
  estado: string;
  message: string;
}
