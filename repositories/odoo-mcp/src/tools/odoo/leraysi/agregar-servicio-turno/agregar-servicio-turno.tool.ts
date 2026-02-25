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
    // Usar SERVICIO_DISPLAY para nombres amigables (evitar códigos Odoo como "manicura_simple")
    const servicioExistenteCodigo = turnoExistente.servicio as string;
    const servicioExistenteDisplay = SERVICIO_DISPLAY[servicioExistenteCodigo] || servicioExistenteCodigo;
    const nuevoServicioDisplay = SERVICIO_DISPLAY[params.nuevo_servicio] || params.nuevo_servicio;
    const serviciosArray = [servicioExistenteDisplay, nuevoServicioDisplay];

    // Combinar detalles de servicio
    const detalleExistente = (turnoExistente.servicio_detalle as string) ||
      SERVICIO_DISPLAY[servicioExistenteCodigo] || servicioExistenteCodigo;
    const nuevoDetalle = params.nuevo_servicio_detalle ||
      SERVICIO_DISPLAY[params.nuevo_servicio] || params.nuevo_servicio;
    const servicioDetalleCombinado = `${detalleExistente} + ${nuevoDetalle}`;

    // 2b. Floor de complejidad por cantidad de servicios (misma lógica que ParseInput.js)
    // 2 servicios → mín compleja, 3+ → mín muy_compleja
    const totalServicios = servicioDetalleCombinado.split("+").length;
    const COMP_ORDER: Record<string, number> = { simple: 1, media: 2, compleja: 3, muy_compleja: 4 };
    const ORDER_TO_COMP: Record<number, string> = { 1: "simple", 2: "media", 3: "compleja", 4: "muy_compleja" };

    let floorPorCantidad = "simple";
    if (totalServicios >= 3) floorPorCantidad = "muy_compleja";
    else if (totalServicios >= 2) floorPorCantidad = "compleja";

    const complejidadFinal = ORDER_TO_COMP[
      Math.max(COMP_ORDER[params.complejidad_maxima] || 2, COMP_ORDER[floorPorCantidad] || 1)
    ] || params.complejidad_maxima;

    // 3. Sumar precios y calcular duración
    const precioExistente = (turnoExistente.precio as number) || 0;
    const precioTotal = precioExistente + params.nuevo_precio;
    // Duración: si muy_compleja → jornada completa (10h), sino usar lo que viene de BuildAgentPrompt
    // BuildAgentPrompt ya calcula la duración combinada correcta (incluyendo overlap de proceso)
    const duracionTotal = complejidadFinal === "muy_compleja"
      ? 10  // Jornada completa en horas (Odoo usa horas)
      : params.duracion_estimada / 60;

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
    const updateData: Record<string, unknown> = {
      servicio_detalle: servicioDetalleCombinado,
      precio: precioTotal,
      duracion: duracionTotal,
      complejidad_maxima: complejidadFinal,
      monto_pago_pendiente: montoAPagar, // Monto real a cobrar (diferencia o total)
      estado: "pendiente_pago",
    };

    // Actualizar fecha_hora si se proporcionó nueva_hora (ej: jornada completa cambia 15:00 → 09:00)
    if (params.nueva_hora) {
      const fechaExistente = turnoExistente.fecha_hora as string;
      // Extraer solo la parte de fecha y reemplazar la hora
      const soloFecha = fechaExistente.split(" ")[0];
      updateData.fecha_hora = `${soloFecha} ${params.nueva_hora}:00`;
    }

    await this.odooClient.write("salon.turno", [params.turno_id], updateData);

    logger.info(
      { turnoId: params.turno_id, precioTotal, duracionTotal, montoAPagar },
      "[AgregarServicioTurno] Appointment updated"
    );

    // 6. Agregar tags CRM del nuevo servicio al lead (reemplazando complejidad vieja)
    const leadId = turnoExistente.lead_id;
    if (leadId) {
      try {
        const tagIds = await this.resolveLeadTags(
          params.nuevo_servicio,
          complejidadFinal
        );
        if (tagIds.length > 0) {
          let tagCommands: any[] = tagIds.map((id: number) => [4, id]); // link new tags

          // Remover tag de complejidad anterior para que solo quede UNO
          const complexityNames = ["Simple", "Media", "Compleja", "Muy Compleja"];
          try {
            const leadData = await this.odooClient.read("crm.lead", [leadId as number], ["tag_ids"]);
            if (leadData.length > 0 && leadData[0].tag_ids?.length > 0) {
              const existingComplexityTags = await this.odooClient.search(
                "crm.tag",
                [["id", "in", leadData[0].tag_ids], ["name", "in", complexityNames]],
                { fields: ["id"] }
              );
              const unlinkCommands = existingComplexityTags.map((t: any) => [3, t.id]);
              tagCommands = [...unlinkCommands, ...tagCommands];
            }
          } catch (err) {
            logger.warn({ error: err }, "[AgregarServicioTurno] Could not read existing lead tags");
          }

          await this.odooClient.write("crm.lead", [leadId as number], {
            expected_revenue: precioTotal,
            tag_ids: tagCommands,
          });
          logger.info(
            { leadId, tagIds },
            "[AgregarServicioTurno] CRM tags updated for new service"
          );
        }
      } catch (e) {
        logger.warn(
          { error: e, leadId },
          "[AgregarServicioTurno] Could not update CRM tags"
        );
      }
    }

    // 7. Regenerar link de pago (usará monto_pago_pendiente que acabamos de setear)
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
      fecha_hora: params.nueva_hora
        ? `${(turnoExistente.fecha_hora as string).split(" ")[0]} ${params.nueva_hora}:00`
        : turnoExistente.fecha_hora as string,
      servicios: serviciosArray,
      servicio_detalle: servicioDetalleCombinado,
      precio_total: precioTotal,
      duracion_total: duracionTotal,
      duracion_estimada: Math.round(duracionTotal * 60),
      complejidad_maxima: complejidadFinal,
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

  /**
   * Busca o crea tags en crm.tag y devuelve sus IDs.
   * Tags: categoría de servicio + nombre específico + complejidad.
   */
  private async resolveLeadTags(
    servicio: string,
    complejidad: string | null
  ): Promise<number[]> {
    const CATEGORY_MAP: Record<string, string> = {
      corte_mujer: "Corte",
      alisado_brasileno: "Alisado",
      alisado_keratina: "Alisado",
      mechas_completas: "Color",
      tintura_raiz: "Color",
      tintura_completa: "Color",
      balayage: "Color",
      manicura_simple: "Uñas",
      manicura_semipermanente: "Uñas",
      pedicura: "Uñas",
      depilacion_cera_piernas: "Depilación",
      depilacion_cera_axilas: "Depilación",
      depilacion_cera_bikini: "Depilación",
      depilacion_laser_piernas: "Depilación",
      depilacion_laser_axilas: "Depilación",
    };

    const SERVICE_NAME_MAP: Record<string, string> = {
      corte_mujer: "Corte mujer",
      alisado_brasileno: "Alisado brasileño",
      alisado_keratina: "Alisado keratina",
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

    const COMPLEJIDAD_LABELS: Record<string, string> = {
      simple: "Simple",
      media: "Media",
      compleja: "Compleja",
      muy_compleja: "Muy Compleja",
    };

    const tagNames: string[] = [];

    const category = CATEGORY_MAP[servicio];
    if (category) tagNames.push(category);

    const serviceName = SERVICE_NAME_MAP[servicio];
    if (serviceName) tagNames.push(serviceName);

    if (complejidad) {
      const label = COMPLEJIDAD_LABELS[complejidad];
      if (label) tagNames.push(label);
    }

    if (tagNames.length === 0) return [];

    const tagIds: number[] = [];
    for (const name of tagNames) {
      const existing = await this.odooClient.search(
        "crm.tag",
        [["name", "=", name]],
        { fields: ["id"], limit: 1 }
      );

      if (existing.length > 0) {
        tagIds.push(existing[0].id);
      } else {
        const newId = await this.odooClient.create("crm.tag", { name });
        tagIds.push(newId);
        logger.info({ tagName: name, tagId: newId }, "[AgregarServicioTurno] Created new CRM tag");
      }
    }

    return tagIds;
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
          nueva_hora: {
            type: "string",
            description: "Nueva hora del turno (ej: '09:00') cuando cambia por jornada completa. Opcional.",
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
