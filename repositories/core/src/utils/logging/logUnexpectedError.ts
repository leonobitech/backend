import { Request } from "express";
import crypto from "crypto";
import logger from "@utils/logging/logger";
import { getLogContext } from "@utils/request/getLogContext";

export const logUnexpectedError = (err: unknown, req: Request) => {
  const errorId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  logger.error("🔥 Error inesperado no controlado", {
    ...getLogContext(req),
    error: err,
    errorId,
    timestamp,
  });

  return { errorId, timestamp };
};
