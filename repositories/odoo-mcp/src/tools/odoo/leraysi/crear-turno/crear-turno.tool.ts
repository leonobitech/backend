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
      servicio: params.servicio,
      fecha_hora: fechaHora,
      precio: params.precio,
      duracion: params.duracion || 1,
      estado: "pendiente_pago",
    };

    if (params.email) values.email = params.email;
    if (params.notas) values.notas = params.notas;
    if (params.servicio_detalle) values.servicio_detalle = params.servicio_detalle;

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
        "Crear un nuevo turno en el salón de belleza Estilos Leraysi. " +
        "Genera automáticamente un link de pago de Mercado Pago para la seña (30% del precio). " +
        "El turno queda en estado 'pendiente_pago' hasta que se confirme el pago.",
      inputSchema: {
        type: "object",
        properties: {
          clienta: {
            type: "string",
            description: "Nombre completo de la clienta",
          },
          telefono: {
            type: "string",
            description: "Número de teléfono de la clienta (ej: +5491112345678)",
          },
          servicio: {
            type: "string",
            enum: [
              "corte",
              "tintura",
              "mechas",
              "brushing",
              "peinado",
              "tratamiento",
              "manicura",
              "pedicura",
              "depilacion",
              "maquillaje",
              "otro",
            ],
            description: "Tipo de servicio solicitado",
          },
          fecha_hora: {
            type: "string",
            description:
              "Fecha y hora del turno en formato YYYY-MM-DD HH:MM (ej: 2025-01-15 10:00)",
          },
          precio: {
            type: "number",
            description: "Precio total del servicio en pesos argentinos",
          },
          duracion: {
            type: "number",
            description: "Duración estimada en horas (default: 1)",
          },
          email: {
            type: "string",
            description: "Email de la clienta (opcional)",
          },
          notas: {
            type: "string",
            description: "Notas adicionales sobre el turno",
          },
          servicio_detalle: {
            type: "string",
            description: "Descripción detallada del servicio si es necesario",
          },
        },
        required: ["clienta", "telefono", "servicio", "fecha_hora", "precio"],
      },
    };
  }
}
