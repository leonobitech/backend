import { z } from "zod";

export const checkAvailabilitySchema = z.object({
  date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Invalid date format. Use: YYYY-MM-DD"
  ),
  duration_hours: z.number().positive().optional().default(1),
  worker: z.enum(["primary", "secondary"]).optional(),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;

export interface OccupiedSlot {
  start_time: string;
  end_time: string;
  service_type: string;
  client_name: string;
  worker: string;
}

export interface CheckAvailabilityResponse {
  date: string;
  business_hours: {
    open: string;
    close: string;
  };
  occupied_slots: OccupiedSlot[];
  available_slots: string[];
  message: string;
}
