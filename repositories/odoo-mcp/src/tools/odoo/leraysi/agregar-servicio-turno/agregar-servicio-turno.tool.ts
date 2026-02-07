import {
  agregarServicioTurnoSchema,
  type AgregarServicioTurnoInput,
  type AgregarServicioTurnoResponse,
} from "./agregar-servicio-turno.schema";
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

// Nombres amigables para mostrar
const SERVICIO_DISPLAY: Record<string, string> = {
  corte_mujer: "Corte mujer",
  alisado_brasileno: "Alisado brasileño",
  alisado_keratina: "Alisado con keratina",
  mechas_completas: "Mechas completas",
  tintura_raiz: "Tintura raíz",
  tintura_completa: "Tintura completa",
  balayage: "Balayage",
  manicura_simple: "Manicura simple",
  manicura_semipermanente: "Manicura semipermanente",
  pedicura: "Pedicura",
  depilacion_cera_piernas: "Depilación cera piernas",
  depilacion_cera_axilas: "Depilación cera axilas",
  depilacion_cera_bikini: "Depilación cera bikini",
  depilacion_laser_piernas: "Depilación láser piernas",
  depilacion_laser_axilas: "Depilación láser axilas",
};

export class AgregarServicioTurnoLeraysiTool
  implements ITool<AgregarServicioTurnoInput, AgregarServicioTurnoResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<AgregarServicioTurnoResponse> {
    // Normalizar servicio antes de validar
    const normalizedInput = this.normalizeServicio(input);
    const params = agregarServicioTurnoSchema.parse(normalizedInput);

    logger.info(
      { turnoId: params.turno_id, nuevoServicio: params.nuevo_servicio },
      "[AgregarServicioTurno] Adding service to existing appointment"
    );

    // 1. Leer el turno existente (incluyendo total_pagado para calcular diferencia de seña)
    const turnos = await this.odooClient.read("salon.turno", [params.turno_id], [
      "clienta",
      "telefono",
      "email",
      "servicio",
      "servicio_detalle",
      "fecha_hora",
      "precio",
      "duracion",
      "estado",
      "sena",
      "total_pagado",
      "lead_id",
      "mp_preference_id",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno ${params.turno_id} no encontrado`);
    }

    const turnoExistente = turnos[0];
    const estadoAnterior = turnoExistente.estado as string;
    // Usar total_pagado (computed desde pago_ids) en vez de sena (computed = precio*0.30)
    const totalPagado = (turnoExistente.total_pagado as number) || 0;
    const mpPreferenceAnterior = (turnoExistente.mp_preference_id as string) || "";

    logger.info(
      { turnoExistente, estadoAnterior, totalPagado, mpPreferenceAnterior },
      "[AgregarServicioTurno] Found existing appointment"
    );

    // 2. Combinar servicios
    const servicioExistente = turnoExistente.servicio as string;
    const serviciosArray = [servicioExistente, params.nuevo_servicio];

    // Combinar detalles de servicio
    const detalleExistente = (turnoExistente.servicio_detalle as string) ||
      SERVICIO_DISPLAY[servicioExistente] || servicioExistente;
    const nuevoDetalle = params.nuevo_servicio_detalle ||
      SERVICIO_DISPLAY[params.nuevo_servicio] || params.nuevo_servicio;
    const servicioDetalleCombinado = `${detalleExistente} + ${nuevoDetalle}`;

    // 3. Sumar precios. Duración viene ya como total de ParseInput (todos los servicios sumados)
    const precioExistente = (turnoExistente.precio as number) || 0;
    const precioTotal = precioExistente + params.nuevo_precio;
    // ParseInput.js calcularDuracion() ya suma TODOS los servicios (existente + nuevo)
    // No sumar la duración existente del turno para evitar double-counting
    const duracionTotal = params.duracion_estimada / 60; // Convertir minutos → horas (ya es el total)

    // 4. Calcular monto a pagar: seña del nuevo total menos lo ya pagado
    const senaTotalNueva = Math.round(precioTotal * 0.3);
    let montoAPagar: number;

    if (totalPagado > 0) {
      // Ya pagó algo, solo cobrar la diferencia
      montoAPagar = Math.max(0, senaTotalNueva - totalPagado);
      logger.info(
        { totalPagado, senaTotalNueva, montoAPagar },
        "[AgregarServicioTurno] Calculating difference (already paid)"
      );
    } else {
      // No ha pagado, cobrar la seña total nueva
      montoAPagar = senaTotalNueva;
      logger.info(
        { montoAPagar },
        "[AgregarServicioTurno] Full new deposit (not paid yet)"
      );
    }

    // 5. Actualizar el turno en Odoo
    // NOTA: `sena` es computed (precio*0.30), no se puede escribir.
    // Usamos `monto_pago_pendiente` para que action_generar_link_pago genere el link correcto.
    await this.odooClient.write("salon.turno", [params.turno_id], {
      servicio_detalle: servicioDetalleCombinado,
      precio: precioTotal,
      duracion: duracionTotal,
      complejidad_maxima: params.complejidad_maxima,
      monto_pago_pendiente: montoAPagar, // Monto real a cobrar (diferencia o total)
      estado: "pendiente_pago",
    });

    logger.info(
      { turnoId: params.turno_id, precioTotal, duracionTotal, montoAPagar },
      "[AgregarServicioTurno] Appointment updated"
    );

    // 6. Regenerar link de pago (usará monto_pago_pendiente que acabamos de setear)
    let linkPago = "";
    let mpPreferenceId = "";
    try {
      if (mpPreferenceAnterior) {
        logger.info(
          { mpPreferenceAnterior, turnoId: params.turno_id },
          "[AgregarServicioTurno] Previous MP preference will be replaced"
        );
      }

      await this.odooClient.execute(
        "salon.turno",
        "action_generar_link_pago",
        [[params.turno_id]]
      );

      // Leer el nuevo link generado
      const turnoActualizado = await this.odooClient.read(
        "salon.turno",
        [params.turno_id],
        ["link_pago", "mp_preference_id"]
      );
      if (turnoActualizado.length > 0) {
        linkPago = turnoActualizado[0].link_pago || "";
        mpPreferenceId = turnoActualizado[0].mp_preference_id || "";
      }
    } catch (error) {
      logger.warn(
        { error, turnoId: params.turno_id },
        "[AgregarServicioTurno] Could not regenerate payment link"
      );
    }

    return {
      turnoId: params.turno_id,
      clienta: turnoExistente.clienta as string,
      fecha_hora: turnoExistente.fecha_hora as string,
      servicios: serviciosArray,
      servicio_detalle: servicioDetalleCombinado,
      precio_total: precioTotal,
      duracion_total: duracionTotal,
      duracion_estimada: params.duracion_estimada,
      complejidad_maxima: params.complejidad_maxima,
      sena: montoAPagar, // Lo que tiene que pagar ahora
      link_pago: linkPago,
      mp_preference_id: mpPreferenceId,
      estado: "pendiente_pago",
      message: `Servicio agregado al turno. Nuevo total: $${precioTotal.toLocaleString("es-AR")}. ${
        linkPago
          ? "Link de pago actualizado."
          : "No se pudo generar link de pago."
      }`,
    };
  }

  /**
   * Normaliza el campo nuevo_servicio de user-friendly a código Odoo.
   */
  private normalizeServicio(input: unknown): unknown {
    if (!input || typeof input !== "object") return input;

    const obj = input as Record<string, unknown>;
    if (typeof obj.nuevo_servicio !== "string") return input;

    const servicioLower = obj.nuevo_servicio.toLowerCase().trim();
    const servicioMapped = SERVICIO_MAP[servicioLower];

    if (servicioMapped) {
      return { ...obj, nuevo_servicio: servicioMapped };
    }

    return input;
  }

  definition(): ToolDefinition {
    return {
      name: "leraysi_agregar_servicio_turno",
      description:
        "Agrega un servicio adicional a un turno existente en Estilos Leraysi. " +
        "Combina los servicios, suma precios y duraciones, y regenera el link de pago. " +
        "Usar cuando la clienta quiere agregar otro servicio a su cita ya agendada.",
      inputSchema: {
        type: "object",
        properties: {
          turno_id: {
            type: "number",
            description: "ID del turno existente en Odoo",
          },
          nuevo_servicio: {
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
            description: "Código del nuevo servicio a agregar",
          },
          nuevo_servicio_detalle: {
            type: "string",
            description:
              "Descripción del nuevo servicio (ej: 'Corte mujer, puntas')",
          },
          nuevo_precio: {
            type: "number",
            description: "Precio del nuevo servicio en ARS",
          },
          duracion_estimada: {
            type: "number",
            description: "Duración estimada del nuevo servicio en minutos (se convierte a horas internamente para Odoo)",
          },
          complejidad_maxima: {
            type: "string",
            enum: ["simple", "media", "compleja", "muy_compleja"],
            description: "Nivel de complejidad máxima del turno combinado (determina capacidad del salón)",
          },
        },
        required: [
          "turno_id",
          "nuevo_servicio",
          "nuevo_servicio_detalle",
          "nuevo_precio",
          "duracion_estimada",
          "complejidad_maxima",
        ],
      },
    };
  }
}
