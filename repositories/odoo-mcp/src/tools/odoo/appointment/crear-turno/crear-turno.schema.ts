import { z } from "zod";

export const createBookingSchema = z.object({
  // === Required fields ===
  client_name: z.string().min(1, "Client name is required"),
  phone: z.string().min(1).optional(),
  email: z.string().email("Invalid email").min(1, "Email is required to send confirmation"),
  service_type: z.enum([
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
  service_detail: z.string().min(1, "Service detail is required"),
  scheduled_datetime: z.string().regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    "Invalid date format. Use: YYYY-MM-DD HH:MM or YYYY-MM-DDTHH:MM:SS"
  ),
  total_price: z.number().positive("Price must be greater than 0"),
  estimated_duration: z.number().positive("Estimated duration must be greater than 0"),
  max_complexity: z.enum(["simple", "medium", "complex", "very_complex"]),
  lead_id: z.number().positive("Lead ID is required to link the booking"),

  // === Optional fields ===
  worker: z.enum(["primary", "secondary"]).optional().default("primary"),
  notes: z.string().optional(),
  is_additional_booking: z.boolean().optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export interface CreateBookingResponse {
  bookingId: number;
  client_name: string;
  scheduled_datetime: string;
  service_type: string;
  total_price: number;
  estimated_duration: number;
  max_complexity: string;
  deposit_amount: number;
  payment_link: string;
  mp_preference_id: string;
  worker: string;
  state: string;
  message: string;
}
