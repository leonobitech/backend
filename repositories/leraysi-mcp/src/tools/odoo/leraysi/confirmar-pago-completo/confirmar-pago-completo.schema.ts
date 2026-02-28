import { z } from "zod";

/**
 * Schema para confirmar pago completo de turno en Estilos Leraysi
 *
 * Esta tool consolida todo el proceso post-pago:
 * - Confirmar turno en Odoo
 * - Crear/vincular contacto
 * - Mover Lead en CRM
 * - Crear evento calendario
 * - Generar PDF recibo
 * - Enviar email confirmación
 */
export const confirmarPagoCompletoSchema = z.object({
  // ID del turno en Odoo (salon.turno)
  turno_id: z.number().positive("ID de turno inválido"),

  // ID del pago de MercadoPago
  mp_payment_id: z.string().min(1, "ID de pago requerido"),

  // ID del Lead en CRM (crm.lead)
  lead_id: z.number().positive("ID de lead inválido"),

  // Conversation ID de Chatwoot (para enviar WhatsApp)
  conversation_id: z.number().positive().optional(),

  // Email destino (si es diferente al del turno)
  email_override: z.string().email().optional(),

  // Notas adicionales
  notas: z.string().optional(),
});

export type ConfirmarPagoCompletoInput = z.infer<typeof confirmarPagoCompletoSchema>;

export interface ConfirmarPagoCompletoResponse {
  success: boolean;

  // Datos del turno confirmado
  turno: {
    id: number;
    clienta: string;
    telefono: string;
    email: string | null;
    servicio: string;
    servicio_detalle: string | null;
    fecha_hora: string;
    precio: number;
    duracion: number;
    sena: number;
    estado: string;
  };

  // Datos acumulados de pago
  pagos: {
    total_pagado: number;
    cantidad_pagos: number;
    pendiente_restante: number;
    detalle: Array<{
      mp_payment_id: string;
      monto: number;
      tipo: string;
      descripcion: string;
    }>;
  };

  // URL de confirmación de asistencia del calendario
  calendar_accept_url: string | null;

  // IDs creados/actualizados
  partner_id: number;
  event_id: number | null;
  activity_id: number | null;
  invoice_id: number | null;
  invoice_name: string | null;

  // PDF de factura en base64 (usando reporte nativo de Odoo)
  invoice_pdf_base64: string | null;

  // Mensaje formateado para WhatsApp
  mensaje_whatsapp: string;

  // Mensaje de resultado
  message: string;
}
