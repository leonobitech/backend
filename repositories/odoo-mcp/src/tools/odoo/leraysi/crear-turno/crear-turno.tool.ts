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

// Ranking de complejidad por servicio (mayor = más complejo)
const COMPLEJIDAD_SERVICIO: Record<string, number> = {
  // muy_compleja = 4
  alisado_brasileno: 4,
  alisado_keratina: 4,
  mechas_completas: 4,
  tintura_completa: 4,
  balayage: 4,
  // compleja = 3
  tintura_raiz: 3,
  manicura_semipermanente: 3,
  // media = 2
  corte_mujer: 2,
  manicura_simple: 2,
  pedicura: 2,
  depilacion_cera_piernas: 2,
  depilacion_laser_piernas: 2,
  // simple = 1
  depilacion_cera_axilas: 1,
  depilacion_cera_bikini: 1,
  depilacion_laser_axilas: 1,
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

    // Guardar hora local Argentina para devolver en la respuesta
    const fechaHoraLocal = fechaHora;

    // Convertir hora local Argentina a UTC para Odoo
    // Odoo almacena internamente en UTC, el addon espera recibir UTC
    fechaHora = this.argentinaToUTC(fechaHora);

    // Floor de complejidad por cantidad de servicios (misma lógica que ParseInput.js)
    // Si servicio_detalle tiene "Servicio A + Servicio B", contar por "+"
    const totalServicios = params.servicio_detalle.includes("+")
      ? params.servicio_detalle.split("+").length
      : 1;
    const COMP_ORDER: Record<string, number> = { simple: 1, media: 2, compleja: 3, muy_compleja: 4 };
    const ORDER_TO_COMP: Record<number, string> = { 1: "simple", 2: "media", 3: "compleja", 4: "muy_compleja" };

    let floorPorCantidad = "simple";
    if (totalServicios >= 3) floorPorCantidad = "muy_compleja";
    else if (totalServicios >= 2) floorPorCantidad = "compleja";

    const complejidadFinal = ORDER_TO_COMP[
      Math.max(COMP_ORDER[params.complejidad_maxima] || 2, COMP_ORDER[floorPorCantidad] || 1)
    ] || params.complejidad_maxima;

    // Crear el turno en salon.turno
    const senaInicial = Math.round(params.precio * 0.3);
    const values: Record<string, any> = {
      clienta: params.clienta,
      telefono: params.telefono,
      email: params.email,
      servicio: params.servicio,
      servicio_detalle: params.servicio_detalle,
      fecha_hora: fechaHora,
      precio: params.precio,
      duracion: params.duracion_estimada / 60, // Convertir minutos → horas para Odoo
      complejidad_maxima: complejidadFinal,
      monto_pago_pendiente: senaInicial, // Monto real a cobrar (usado por action_generar_link_pago)
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

    // Avanzar lead de Calificado → Propuesta + setear expected_revenue y tags
    // SKIP si: (1) es_turno_adicional flag, O (2) lead ya está en stage posterior a Proposition
    // Esto protege contra downgrade del lead cuando el LLM no pasa el flag
    let skipLeadUpdate = !!params.es_turno_adicional;

    if (!skipLeadUpdate) {
      try {
        // Leer stage actual del lead para evitar downgrade
        const leads = await this.odooClient.read("crm.lead", [params.lead_id], ["stage_id"]);
        if (leads.length > 0) {
          const currentStage = leads[0].stage_id;
          const stageName = Array.isArray(currentStage) ? currentStage[1] : String(currentStage);
          // Stages que NO deben retroceder a Proposition
          const protectedStages = ["Won", "Ganado", "turno_confirmado", "Turno Confirmado"];
          if (protectedStages.some(s => stageName.toLowerCase().includes(s.toLowerCase()))) {
            skipLeadUpdate = true;
            logger.info(
              { lead_id: params.lead_id, currentStage: stageName },
              "[CrearTurnoLeraysi] Lead already in advanced stage, skipping update to avoid downgrade"
            );
          }
        }
      } catch (e) {
        logger.warn({ error: e, lead_id: params.lead_id }, "[CrearTurnoLeraysi] Could not read lead stage");
      }
    }

    if (!skipLeadUpdate) {
      try {
        await this.odooClient.updateDealStage(params.lead_id, "Proposition");

        // Resolver tags CRM: categoría del servicio + complejidad
        const tagIds = await this.resolveLeadTags(
          params.servicio,
          complejidadFinal,
          params.servicio_detalle
        );
        const tagCommands = [[6, 0, tagIds]]; // replace all tags

        await this.odooClient.write("crm.lead", [params.lead_id], {
          expected_revenue: params.precio,
          tag_ids: tagCommands,
        });
      } catch (e) {
        logger.warn({ error: e, lead_id: params.lead_id }, "[CrearTurnoLeraysi] Could not advance lead to Proposition");
      }
    } else {
      logger.info(
        { lead_id: params.lead_id },
        "[CrearTurnoLeraysi] Skipping lead update (turno adicional or advanced stage)"
      );
    }

    // Calcular seña (30%)
    const sena = params.precio * 0.3;

    return {
      turnoId,
      clienta: params.clienta,
      fecha_hora: fechaHoraLocal,
      servicio: params.servicio,
      precio: params.precio,
      duracion_estimada: params.duracion_estimada,
      complejidad_maxima: complejidadFinal,
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
   * Soporta un solo servicio ("Manicura simple" → "manicura_simple")
   * y múltiples comma-separated ("Manicura simple,Pedicura,Alisado keratina"
   * → "alisado_keratina", el más complejo como principal).
   */
  private normalizeServicio(input: unknown): unknown {
    if (!input || typeof input !== "object") return input;

    const obj = input as Record<string, unknown>;
    if (typeof obj.servicio !== "string") return input;

    // Múltiples servicios comma-separated
    if (obj.servicio.includes(",")) {
      const codigos = obj.servicio.split(",").map(s => {
        const lower = s.toLowerCase().trim();
        return SERVICIO_MAP[lower] || lower;
      });
      // Elegir el más complejo como servicio principal
      const principal = codigos.reduce((best, cur) =>
        (COMPLEJIDAD_SERVICIO[cur] ?? 0) > (COMPLEJIDAD_SERVICIO[best] ?? 0) ? cur : best
      , codigos[0]);
      return { ...obj, servicio: principal };
    }

    // Servicio único
    const servicioLower = obj.servicio.toLowerCase().trim();
    const servicioMapped = SERVICIO_MAP[servicioLower];

    if (servicioMapped) {
      return { ...obj, servicio: servicioMapped };
    }

    // Si ya es un código válido (ej: "manicura_simple"), dejarlo como está
    if (Object.keys(COMPLEJIDAD_SERVICIO).includes(servicioLower)) {
      return input;
    }

    // Fallback: resolver desde servicio_detalle (más confiable, tiene el nombre completo)
    if (typeof obj.servicio_detalle === "string") {
      const detalleLower = obj.servicio_detalle.toLowerCase().trim();
      for (const [key, code] of Object.entries(SERVICIO_MAP)) {
        if (detalleLower.includes(key)) {
          return { ...obj, servicio: code };
        }
      }
    }

    return input;
  }

  /**
   * Busca o crea tags en crm.tag y devuelve sus IDs.
   * Tags: categoría de servicio + complejidad máxima.
   */
  private async resolveLeadTags(
    servicio: string,
    complejidad: string | null,
    _servicioDetalle?: string
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
        logger.info({ tagName: name, tagId: newId }, "[CrearTurnoLeraysi] Created new CRM tag");
      }
    }

    return tagIds;
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
          es_turno_adicional: {
            type: "boolean",
            description: "True si es un turno adicional (otra trabajadora). Evita modificar el lead/CRM (se actualiza al confirmar pago).",
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
