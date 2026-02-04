import {
  crearTurnoSchema,
  type CrearTurnoInput,
  type CrearTurnoResponse,
} from "./crear-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

export class CrearTurnoLeraysiTool
  implements ITool<CrearTurnoInput, CrearTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CrearTurnoResponse> {
    const params = crearTurnoSchema.parse(input);

    logger.info(
      { clienta: params.clienta, servicio: params.servicio },
      "[CrearTurnoLeraysi] Creating appointment"
    );

    // Normalizar fecha_hora a formato Odoo (YYYY-MM-DD HH:MM:SS)
    let fechaHora = params.fecha_hora;
    if (fechaHora.includes("T")) {
      fechaHora = fechaHora.replace("T", " ");
    }
    if (fechaHora.length === 16) {
      fechaHora += ":00";
    }

    // Crear el turno en salon.turno
    const values: Record<string, any> = {
      clienta: params.clienta,
      telefono: params.telefono,
      email: params.email,
      servicio: params.servicio,
      servicio_detalle: params.servicio_detalle,
      fecha_hora: fechaHora,
      precio: params.precio,
      duracion: params.duracion,
      lead_id: params.lead_id,
      estado: "pendiente_pago",
    };

    // Campo opcional
    if (params.notas) values.notas = params.notas;

    const turnoId = await this.odooClient.create("salon.turno", values);

    logger.info({ turnoId }, "[CrearTurnoLeraysi] Appointment created");

    // Intentar generar link de pago
    let linkPago = "";
    let mpPreferenceId = "";
    try {
      // Llamar al método del modelo para generar el link
      await this.odooClient.execute(
        "salon.turno",
        "action_generar_link_pago",
        [[turnoId]]
      );

      // Leer el link generado y el preference_id
      const turnos = await this.odooClient.read("salon.turno", [turnoId], [
        "link_pago",
        "mp_preference_id",
      ]);
      if (turnos.length > 0) {
        linkPago = turnos[0].link_pago || "";
        mpPreferenceId = turnos[0].mp_preference_id || "";
      }
    } catch (error) {
      logger.warn(
        { error, turnoId },
        "[CrearTurnoLeraysi] Could not generate payment link"
      );
    }

    // Calcular seña (30%)
    const sena = params.precio * 0.3;

    return {
      turnoId,
      clienta: params.clienta,
      fecha_hora: fechaHora,
      servicio: params.servicio,
      precio: params.precio,
      sena,
      link_pago: linkPago,
      mp_preference_id: mpPreferenceId,
      estado: "pendiente_pago",
      message: linkPago
        ? `Turno creado para ${params.clienta}. Link de pago generado.`
        : `Turno creado para ${params.clienta}. No se pudo generar link de pago (configurar Mercado Pago).`,
    };
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_crear_turno",
      description:
        "Crea un turno en Estilos Leraysi y genera link de pago MercadoPago (seña 30%). " +
        "Requiere todos los datos de la clienta y del servicio. " +
        "El turno queda en 'pendiente_pago' hasta confirmar el pago.",
      inputSchema: {
        type: "object",
        properties: {
          clienta: {
            type: "string",
            description: "Nombre completo de la clienta",
          },
          telefono: {
            type: "string",
            description: "Teléfono con código de país (ej: +5491112345678)",
          },
          email: {
            type: "string",
            description: "Email de la clienta (para enviar confirmación y factura)",
          },
          servicio: {
            type: "string",
            enum: [
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
            ],
            description: "Código del servicio Odoo (ej: corte_mujer, alisado_brasileno)",
          },
          servicio_detalle: {
            type: "string",
            description: "Descripción completa del servicio (ej: 'Alisado brasileño, cabello largo')",
          },
          fecha_hora: {
            type: "string",
            description: "Fecha y hora en formato YYYY-MM-DD HH:MM (ej: 2025-01-29 10:00)",
          },
          precio: {
            type: "number",
            description: "Precio total del servicio en ARS",
          },
          duracion: {
            type: "number",
            description: "Duración en horas (para bloquear calendario correctamente)",
          },
          lead_id: {
            type: "number",
            description: "ID del Lead en CRM (crítico para flujo post-pago)",
          },
          notas: {
            type: "string",
            description: "Notas adicionales sobre el turno (opcional)",
          },
        },
        required: [
          "clienta",
          "telefono",
          "email",
          "servicio",
          "servicio_detalle",
          "fecha_hora",
          "precio",
          "duracion",
          "lead_id",
        ],
      },
    };
  }
}
