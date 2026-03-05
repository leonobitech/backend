import { z } from "zod";

export const addServiceSchema = z.object({
  // === Required fields ===
  booking_id: z.number().positive("Existing booking ID is required"),
  new_service: z.enum([
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
  new_service_detail: z.string().min(1, "New service detail is required"),
  new_price: z.number().positive("New service price must be greater than 0"),
  estimated_duration: z.number().positive("New service estimated duration must be greater than 0"),
  max_complexity: z.enum(["simple", "medium", "complex", "very_complex"]),
  // === Optional fields ===
  new_time: z.string().optional(), // New booking time (e.g. "09:00") when it changes due to full day
});

export type AddServiceInput = z.infer<typeof addServiceSchema>;

export interface AddServiceResponse {
  bookingId: number;
  client_name: string;
  scheduled_datetime: string;
  // Combined services
  services: string[];
  service_detail: string;
  // Updated totals
  total_price: number;
  total_duration: number;
  estimated_duration: number;
  max_complexity: string;
  deposit_amount: number;
  // New payment link
  payment_link: string;
  mp_preference_id: string;
  state: string;
  message: string;
}
