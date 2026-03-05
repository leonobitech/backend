import { z } from "zod";

export const listByDateSchema = z.object({
  date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Invalid date format. Use: YYYY-MM-DD"
  ),
  state: z.enum([
    "pending_payment",
    "confirmed",
    "completed",
    "cancelled",
    "all",
  ]).optional().default("all"),
  worker: z.enum(["primary", "secondary"]).optional(),
});

export type ListByDateInput = z.infer<typeof listByDateSchema>;

export interface BookingSummary {
  id: number;
  client_name: string;
  phone: string;
  service_type: string;
  time: string;
  duration_hours: number;
  total_price: number;
  deposit_paid: boolean;
  worker: string;
  state: string;
}

export interface ListByDateResponse {
  date: string;
  total_bookings: number;
  bookings: BookingSummary[];
  summary: {
    pending_payment: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    expected_revenue: number;
  };
}
