import { z } from "zod";

export const reprogramarTurnoSchema = z.object({
  // === Campos obligatorios ===
  lead_id: z.number().positive("ID de lead inválido"),
  nueva_fecha_hora: z.string().regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    "Formato de fecha inválido. Use: YYYY-MM-DD HH:MM"
  ),
  motivo: z.string().min(1, "Motivo de reprogramación es requerido"),
});

export type ReprogramarTurnoInput = z.infer<typeof reprogramarTurnoSchema>;

export interface ReprogramarTurnoResponse {
  // Identificadores
  turno_id_anterior: number;
  turno_id_nuevo: number | null; // null si solo se actualizó (confirmado)

  // Datos de la clienta
  clienta: string;
  telefono: string;
  servicio: string;

  // Fechas
  fecha_hora_anterior: string;
  fecha_hora_nueva: string;

  // Estado y acciones realizadas
  estado_anterior: "pendiente_pago" | "confirmado";
  acciones: string[];

  // Solo para pendiente_pago (nuevo turno)
  link_pago?: string;
  sena?: number;

  // Solo para confirmado (calendario actualizado)
  calendar_accept_url?: string | null;

  // Mensaje
  message: string;
}
