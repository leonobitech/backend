import {
  addServiceSchema,
  type AddServiceInput,
  type AddServiceResponse,
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

export class AppointmentAddServiceTool
  implements ITool<AddServiceInput, AddServiceResponse>
{
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<AddServiceResponse> {
    // Normalizar servicio antes de validar
    const normalizedInput = this.normalizeServicio(input);
    const params = addServiceSchema.parse(normalizedInput);

    logger.info(
      { turnoId: params.booking_id, nuevoServicio: params.new_service },
      "[AgregarServicioTurno] Adding service to existing appointment"
    );

    // 1. Leer el turno existente (incluyendo total_paid para calcular diferencia de seña)
    const turnos = await this.odooClient.read("appointment.booking", [params.booking_id], [
      "client_name",
      "phone",
      "email",
      "service_type",
      "service_detail",
      "scheduled_datetime",
      "total_price",
      "duration_hours",
      "state",
      "deposit_amount",
      "total_paid",
      "lead_id",
      "payment_link",
      "mp_preference_id",
      "max_complexity",
    ]);

    if (turnos.length === 0) {
      throw new Error(`Turno ${params.booking_id} no encontrado`);
    }

    const turnoExistente = turnos[0];
    const estadoAnterior = turnoExistente.state as string;
    // Usar total_paid (computed desde pago_ids) en vez de deposit_amount (computed = total_price*0.30)
    const totalPagado = (turnoExistente.total_paid as number) || 0;
    const linkPagoAnterior = (turnoExistente.payment_link as string) || "";
    const mpPreferenceAnterior = (turnoExistente.mp_preference_id as string) || "";

    logger.info(
      { turnoExistente, estadoAnterior, totalPagado, mpPreferenceAnterior },
      "[AgregarServicioTurno] Found existing appointment"
    );

    // 2. Combinar servicios
    // Usar SERVICIO_DISPLAY para nombres amigables (evitar códigos Odoo como "manicura_simple")
    const servicioExistenteCodigo = turnoExistente.service_type as string;
    const servicioExistenteDisplay = SERVICIO_DISPLAY[servicioExistenteCodigo] || servicioExistenteCodigo;
    const nuevoServicioDisplay = SERVICIO_DISPLAY[params.new_service] || params.new_service;
    const serviciosArray = [servicioExistenteDisplay, nuevoServicioDisplay];

    // Combinar detalles de servicio
    const detalleExistente = (turnoExistente.service_detail as string) ||
      SERVICIO_DISPLAY[servicioExistenteCodigo] || servicioExistenteCodigo;
    const nuevoDetalle = params.new_service_detail ||
      SERVICIO_DISPLAY[params.new_service] || params.new_service;
    const servicioDetalleCombinado = `${detalleExistente} + ${nuevoDetalle}`;

    // 2b. Floor de complejidad por cantidad de servicios (misma lógica que ParseInput.js)
    // 2 servicios → mín complex, 3+ → mín very_complex
    const totalServicios = servicioDetalleCombinado.split("+").length;
    const COMP_ORDER: Record<string, number> = { simple: 1, medium: 2, complex: 3, very_complex: 4 };
    const ORDER_TO_COMP: Record<number, string> = { 1: "simple", 2: "medium", 3: "complex", 4: "very_complex" };

    let floorPorCantidad = "simple";
    if (totalServicios >= 3) floorPorCantidad = "very_complex";
    else if (totalServicios >= 2) floorPorCantidad = "complex";

    // Incluir complejidad del turno existente (clave para JC: si existente es very_complex, mantenerla)
    const complejidadExistente = (turnoExistente.max_complexity as string) || "medium";
    const complejidadFinal = ORDER_TO_COMP[
      Math.max(
        COMP_ORDER[complejidadExistente] || 2,
        COMP_ORDER[params.max_complexity] || 2,
        COMP_ORDER[floorPorCantidad] || 1
      )
    ] || params.max_complexity;

    // 3. Sumar precios y calcular duración
    const precioExistente = (turnoExistente.total_price as number) || 0;
    const precioTotal = precioExistente + params.new_price;
    // Duración: si very_complex → jornada completa (10h), sino usar lo que viene de BuildAgentPrompt
    // BuildAgentPrompt ya calcula la duración combinada correcta (incluyendo overlap de proceso)
    const duracionTotal = complejidadFinal === "very_complex"
      ? 10  // Jornada completa en horas (Odoo usa horas)
      : params.estimated_duration / 60;

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

    // 5. Actualizar el turno en Odoo (SEPARACIÓN DE RESPONSABILIDADES)
    // Solo escribir campos de PAGO + staging. Los campos definitivos (service_type,
    // total_price, duration_hours, max_complexity) se guardan en pending_changes y se aplican
    // post-pago en mercadopago_webhook.py → action_aplicar_pending_changes().
    // Si el pago expira, pending_changes se limpia y el turno queda intacto.

    // 5a. Construir pending_changes (campos definitivos para post-pago)
    const pendingChanges: Record<string, unknown> = {
      service_type: params.new_service,
      service_detail: servicioDetalleCombinado,
      total_price: precioTotal,
      duration_hours: duracionTotal,
      max_complexity: complejidadFinal,
      // Guardar originales para restaurar si el pago expira (revert exacto)
      _original_link_pago: linkPagoAnterior,
      _original_mp_preference_id: mpPreferenceAnterior,
    };

    // Incluir nueva scheduled_datetime si cambió (ej: jornada completa cambia 15:00 → 09:00)
    // nueva_hora viene en Argentina (ART), Odoo almacena en UTC → sumar 3h
    if (params.new_time) {
      const fechaExistente = turnoExistente.scheduled_datetime as string;
      const soloFecha = fechaExistente.split(" ")[0]; // "2026-02-26"
      const [year, month, day] = soloFecha.split("-").map(Number);
      const [hh, mm] = params.new_time.split(":").map(Number);
      // Usar Date.UTC para manejar overflow correctamente (misma lógica que crear-turno)
      const utcDate = new Date(Date.UTC(year, month - 1, day, hh + 3, mm, 0));
      const pad = (n: number) => n.toString().padStart(2, "0");
      pendingChanges.scheduled_datetime = `${utcDate.getUTCFullYear()}-${pad(utcDate.getUTCMonth() + 1)}-${pad(utcDate.getUTCDate())} ${pad(utcDate.getUTCHours())}:${pad(utcDate.getUTCMinutes())}:00`;
    }

    // 5b. Escribir solo campos de pago + staging al turno
    const updateData: Record<string, unknown> = {
      pending_payment_amount: montoAPagar,
      state: "pending_payment",
      pending_changes: JSON.stringify(pendingChanges),
    };

    await this.odooClient.write("appointment.booking", [params.booking_id], updateData);

    logger.info(
      { turnoId: params.booking_id, precioTotal, duracionTotal, montoAPagar },
      "[AgregarServicioTurno] Payment fields + staging saved (definitive fields deferred)"
    );

    // 5c. Registrar en chatter qué servicio se está agregando
    // Usar api_post_message (Python Markup()) para evitar doble-escape HTML via XML-RPC
    await this.odooClient.execute(
      "appointment.booking",
      "api_post_message",
      [params.booking_id,
        `<strong>Servicio agregado (pendiente de pago)</strong><br/>` +
        `Nuevo servicio: ${nuevoServicioDisplay}<br/>` +
        `Combinación: ${servicioDetalleCombinado}<br/>` +
        `Precio total: $${precioTotal.toLocaleString("es-AR")}<br/>` +
        `Seña a pagar: $${montoAPagar.toLocaleString("es-AR")}`
      ]
    );

    // 6. CRM tags: DIFERIDO al post-pago
    // No actualizar tags ahora porque si el pago expira, los tags quedarían
    // incorrectos. Se actualizarán en confirmar_pago_completo post-pago.

    // 7. Regenerar link de pago (usará pending_payment_amount que acabamos de setear)
    let linkPago = "";
    let mpPreferenceId = "";
    try {
      if (mpPreferenceAnterior) {
        logger.info(
          { mpPreferenceAnterior, turnoId: params.booking_id },
          "[AgregarServicioTurno] Previous MP preference will be replaced"
        );
      }

      await this.odooClient.execute(
        "appointment.booking",
        "action_generate_payment_link",
        [[params.booking_id]]
      );

      // Leer el nuevo link generado
      const turnoActualizado = await this.odooClient.read(
        "appointment.booking",
        [params.booking_id],
        ["payment_link", "mp_preference_id"]
      );
      if (turnoActualizado.length > 0) {
        linkPago = turnoActualizado[0].payment_link || "";
        mpPreferenceId = turnoActualizado[0].mp_preference_id || "";
      }
    } catch (error) {
      logger.warn(
        { error, turnoId: params.booking_id },
        "[AgregarServicioTurno] Could not regenerate payment link"
      );
    }

    return {
      bookingId: params.booking_id,
      client_name: turnoExistente.client_name as string,
      scheduled_datetime: params.new_time
        ? pendingChanges.scheduled_datetime as string
        : turnoExistente.scheduled_datetime as string,
      services: serviciosArray,
      service_detail: servicioDetalleCombinado,
      total_price: precioTotal,
      total_duration: duracionTotal,
      estimated_duration: Math.round(duracionTotal * 60),
      max_complexity: complejidadFinal,
      deposit_amount: montoAPagar, // Lo que tiene que pagar ahora
      payment_link: linkPago,
      mp_preference_id: mpPreferenceId,
      state: "pending_payment",
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
    if (typeof obj.new_service !== "string") return input;

    const servicioLower = obj.new_service.toLowerCase().trim();
    const servicioMapped = SERVICIO_MAP[servicioLower];

    if (servicioMapped) {
      return { ...obj, new_service: servicioMapped };
    }

    return input;
  }

  definition(): ToolDefinition {
    return {
      name: "appointment_add_service",
      description:
        "Adds an additional service to an existing appointment booking. " +
        "Combines services, sums prices and durations, and regenerates the payment link. " +
        "Use when the client wants to add another service to their already scheduled appointment.",
      inputSchema: {
        type: "object",
        properties: {
          booking_id: {
            type: "number",
            description: "ID of the existing appointment booking in Odoo",
          },
          new_service: {
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
            description: "Service type code to add",
          },
          new_service_detail: {
            type: "string",
            description:
              "Description of the new service (e.g., 'Corte mujer, puntas')",
          },
          new_price: {
            type: "number",
            description: "Price of the new service in ARS",
          },
          estimated_duration: {
            type: "number",
            description: "Estimated duration of the new service in minutes (converted to hours internally for Odoo)",
          },
          max_complexity: {
            type: "string",
            enum: ["simple", "medium", "complex", "very_complex"],
            description: "Maximum complexity level of the combined appointment (determines salon capacity)",
          },
          new_time: {
            type: "string",
            description: "New appointment time (e.g., '09:00') when it changes due to full-day booking. Optional.",
          },
        },
        required: [
          "booking_id",
          "new_service",
          "new_service_detail",
          "new_price",
          "estimated_duration",
          "max_complexity",
        ],
      },
    };
  }
}
