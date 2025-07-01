import { Request } from "express";
import logger from "@utils/logging/logger";
import { getLogContext } from "@utils/request/getLogContext";
import { resolveSource } from "@utils/request/resolveSource";

/**
 * 📡 Log estructurado de eventos importantes (alta, login, cambio, etc.)
 */
export const loggerEvent = (
  eventName: string,
  data: Record<string, any>,
  req?: Request,
  source?: string // opcional: para saber qué controlador o módulo lo disparó
) => {
  const context = req ? getLogContext(req) : {};
  const resolvedSource = source || (req ? resolveSource(req) : "unknown");

  logger.info(`📡 Evento: ${eventName}`, {
    ...context,
    ...data,
    event: eventName,
    source: resolvedSource,
    timestamp: new Date().toISOString(),
  });
};
