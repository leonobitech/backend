import { Request } from "express";
import HttpException from "@utils/http/HttpException";
import logger from "@utils/logging/logger";
import { getLogContext } from "@utils/request/getLogContext";

export const logHttpError = (err: HttpException, req: Request) => {
  logger.warn("⚠️ HttpException capturada", {
    ...getLogContext(req),
    errorId: err.errorId,
    timestamp: err.timestamp,
    statusCode: err.statusCode,
    errorCode: err.errorCode,
    message: err.message,
    details: err.details ?? null,
  });
};
