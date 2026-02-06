import {
  crearTurnoSchema,
  type CrearTurnoInput,
  type CrearTurnoResponse,
} from "./crear-turno.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";
import { logger } from "@/lib/logger";

// Mapeo de nombres user-friendly a códigos Odoo
const SERVICIO_MAP: Record<string, string> = {
  // Cortes
  "corte mujer": "corte_mujer",
  "corte de mujer": "corte_mujer",
  "corte": "corte_mujer",
  // Alisados
  "alisado brasileño": "alisado_brasileno",
  "alisado brasileno": "alisado_brasileno",
  "alisado con keratina": "alisado_keratina",
  "alisado keratina": "alisado_keratina",
  "keratina": "alisado_keratina",
  // Mechas y color
  "mechas completas": "mechas_completas",
  "mechas": "mechas_completas",
  "tintura raíz": "tintura_raiz",
  "tintura raiz": "tintura_raiz",
  "tintura completa": "tintura_completa",
  "tintura": "tintura_completa",
  "balayage": "balayage",
  // Manicura/Pedicura
  "manicura simple": "manicura_simple",
  "manicure simple": "manicura_simple",
  "manicura": "manicura_simple",
  "manicura semipermanente": "manicura_semipermanente",
  "manicure semipermanente": "manicura_semipermanente",
  "semipermanente": "manicura_semipermanente",
  "pedicura": "pedicura",
  "pedicure": "pedicura",
  // Depilación cera
  "depilación cera piernas": "depilacion_cera_piernas",
  "depilacion cera piernas": "depilacion_cera_piernas",
  "cera piernas": "depilacion_cera_piernas",
  "depilación cera axilas": "depilacion_cera_axilas",
  "depilacion cera axilas": "depilacion_cera_axilas",
  "cera axilas": "depilacion_cera_axilas",
  "depilación cera bikini": "depilacion_cera_bikini",
  "depilacion cera bikini": "depilacion_cera_bikini",
  "cera bikini": "depilacion_cera_bikini",
  // Depilación láser
  "depilación láser piernas": "depilacion_laser_piernas",
  "depilacion laser piernas": "depilacion_laser_piernas",
  "láser piernas": "depilacion_laser_piernas",
  "laser piernas": "depilacion_laser_piernas",
  "depilación láser axilas": "depilacion_laser_axilas",
  "depilacion laser axilas": "depilacion_laser_axilas",
  "láser axilas": "depilacion_laser_axilas",
  "laser axilas": "depilacion_laser_axilas",
};

export class CrearTurnoLeraysiTool
  implements ITool<CrearTurnoInput, CrearTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CrearTurnoResponse> {
    // Normalizar servicio antes de validar
    const normalizedInput = this.normalizeServicio(input);
    const params = crearTurnoSchema.parse(normalizedInput);

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

    // Convertir hora local Argentina a UTC para Odoo
    // Odoo almacena internamente en UTC, el addon espera recibir UTC
    fechaHora = this.argentinaToUTC(fechaHora);

    // Crear el turno en salon.turno
    const values: Record<string, any> = {
      clienta: params.clienta,
      telefono: params.telefono,
      email: params.email,
      servicio: params.servicio,
      servicio_detalle: params.servicio_detalle,
      fecha_hora: fechaHora,
      precio: params.precio,
      duracion: params.duracion_estimada / 60, // Convertir minutos → horas para Odoo
      complejidad_maxima: params.complejidad_maxima,
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
      duracion_estimada: params.duracion_estimada,
      complejidad_maxima: params.complejidad_maxima,
      sena,
      link_pago: linkPago,
      mp_preference_id: mpPreferenceId,
      estado: "pendiente_pago",
      message: linkPago
        ? `Turno creado para ${params.clienta}. Link de pago generado.`
        : `Turno creado para ${params.clienta}. No se pudo generar link de pago (configurar Mercado Pago).`,
    };
  }

  /**
   * Convierte datetime local Argentina a UTC para Odoo.
   * Argentina es UTC-3, así que sumamos 3 horas.
   * Ej: "2026-02-11 14:00:00" (Argentina) → "2026-02-11 17:00:00" (UTC)
   */
  private argentinaToUTC(localDatetime: string): string {
    const [datePart, timePart] = localDatetime.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = (timePart || "00:00:00").split(":").map(Number);

    // Crear fecha en UTC sumando 3 horas (Argentina UTC-3 → UTC)
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second || 0));

    // Formatear como YYYY-MM-DD HH:MM:SS
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${utcDate.getUTCFullYear()}-${pad(utcDate.getUTCMonth() + 1)}-${pad(utcDate.getUTCDate())} ${pad(utcDate.getUTCHours())}:${pad(utcDate.getUTCMinutes())}:${pad(utcDate.getUTCSeconds())}`;
  }

  /**
   * Normaliza el campo servicio de user-friendly a código Odoo.
   * Ej: "Manicura simple" → "manicura_simple"
   */
  private normalizeServicio(input: unknown): unknown {
    if (!input || typeof input !== "object") return input;

    const obj = input as Record<string, unknown>;
    if (typeof obj.servicio !== "string") return input;

    const servicioLower = obj.servicio.toLowerCase().trim();
    const servicioMapped = SERVICIO_MAP[servicioLower];

    if (servicioMapped) {
      return { ...obj, servicio: servicioMapped };
    }

    // Si ya es un código válido (ej: "manicura_simple"), dejarlo como está
    return input;
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
          duracion_estimada: {
            type: "number",
            description: "Duración estimada en minutos (se convierte a horas internamente para Odoo)",
          },
          complejidad_maxima: {
            type: "string",
            enum: ["simple", "media", "compleja", "muy_compleja"],
            description: "Nivel de complejidad máxima del turno (determina capacidad del salón)",
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
          "duracion_estimada",
          "complejidad_maxima",
          "lead_id",
        ],
      },
    };
  }
}
