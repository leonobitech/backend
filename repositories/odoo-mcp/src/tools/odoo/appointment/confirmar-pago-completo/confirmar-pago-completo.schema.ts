import { z } from "zod";

/**
 * Schema for confirming full payment of a booking
 *
 * This tool consolidates the entire post-payment process:
 * - Confirm booking in Odoo
 * - Create/link contact
 * - Move Lead in CRM
 * - Create calendar event
 * - Generate PDF receipt
 * - Send confirmation email
 */
export const confirmPaymentSchema = z.object({
  // Booking ID in Odoo (salon.booking)
  booking_id: z.number().positive("Invalid booking ID"),

  // MercadoPago payment ID
  mp_payment_id: z.string().min(1, "Payment ID is required"),

  // CRM Lead ID (crm.lead)
  lead_id: z.number().positive("Invalid lead ID"),

  // Chatwoot conversation ID (to send WhatsApp)
  conversation_id: z.number().positive().optional(),

  // Destination email (if different from booking's)
  email_override: z.string().email().optional(),

  // Additional notes
  notes: z.string().optional(),
});

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

export interface ConfirmPaymentResponse {
  success: boolean;

  // Confirmed booking data
  booking: {
    id: number;
    client_name: string;
    phone: string;
    email: string | null;
    service_type: string;
    service_detail: string | null;
    scheduled_datetime: string;
    total_price: number;
    duration_hours: number;
    deposit_amount: number;
    state: string;
  };

  // Accumulated payment data
  payments: {
    total_paid: number;
    payment_count: number;
    remaining_balance: number;
    details: Array<{
      mp_payment_id: string;
      amount: number;
      payment_type: string;
      description: string;
    }>;
  };

  // Calendar attendance confirmation URL
  calendar_accept_url: string | null;

  // Created/updated IDs
  partner_id: number;
  event_id: number | null;
  activity_id: number | null;
  invoice_id: number | null;
  invoice_name: string | null;

  // Invoice PDF in base64 (using native Odoo report)
  invoice_pdf_base64: string | null;

  // Formatted message for WhatsApp
  whatsapp_message: string;

  // Result message
  message: string;
}
