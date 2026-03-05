import { z } from "zod";

export const cancelBookingSchema = z.object({
  booking_id: z.number().positive("Invalid booking ID"),
  reason: z.string().optional(),
  notify_client: z.boolean().optional().default(false),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export interface CancelBookingResponse {
  bookingId: number;
  client_name: string;
  phone: string;
  previous_state: string;
  new_state: string;
  scheduled_datetime: string;
  service_type: string;
  deposit_paid: boolean;
  message: string;
}
