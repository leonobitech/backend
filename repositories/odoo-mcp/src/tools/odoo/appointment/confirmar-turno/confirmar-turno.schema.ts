import { z } from "zod";

export const confirmBookingSchema = z.object({
  booking_id: z.number().positive("Invalid booking ID"),
  mp_payment_id: z.string().optional(),
  notes: z.string().optional(),
});

export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

export interface ConfirmBookingResponse {
  bookingId: number;
  client_name: string;
  previous_state: string;
  new_state: string;
  scheduled_datetime: string;
  service_type: string;
  message: string;
}
