import { z } from "zod";

export const rescheduleBookingSchema = z.object({
  // === Required fields ===
  lead_id: z.number().positive("Invalid lead ID"),
  new_datetime: z.string().regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
    "Invalid date format. Use: YYYY-MM-DD HH:MM"
  ),
  reason: z.string().min(1, "Reschedule reason is required"),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export interface RescheduleBookingResponse {
  // Identifiers
  previous_booking_id: number;
  new_booking_id: number | null; // null if only updated (confirmed)

  // Client data
  client_name: string;
  phone: string;
  service_type: string;

  // Dates
  previous_datetime: string;
  new_datetime: string;

  // State and actions performed
  previous_state: "pending_payment" | "confirmed";
  actions: string[];

  // Only for pending_payment (new booking)
  payment_link?: string;
  deposit_amount?: number;

  // Message
  message: string;
}
