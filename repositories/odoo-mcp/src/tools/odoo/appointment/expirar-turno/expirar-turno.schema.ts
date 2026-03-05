import { z } from "zod";

export const expireBookingSchema = z.object({
  booking_id: z.number().positive("Invalid booking ID"),
});

export type ExpireBookingInput = z.infer<typeof expireBookingSchema>;

export interface ExpireBookingResponse {
  bookingId: number;
  client_name: string;
  previous_state: string;
  new_state: string;
  lead_reverted: boolean;
  lead_id: number | null;
  message: string;
}
