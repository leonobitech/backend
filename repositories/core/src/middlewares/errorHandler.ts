import { Request, Response, ErrorRequestHandler, NextFunction } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import HttpException from "@utils/http/HttpException";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import { logHttpError } from "@utils/logging/logHttpError";
import { logUnexpectedError } from "@utils/logging/logUnexpectedError";

const { INTERNAL_SERVER_ERROR } = HTTP_CODE;

// ✅ Función para estructurar respuestas de error conocidas
const getHttpError = (
  res: Response,
  error: HttpException,
  lang: SupportedLang
): void => {
  res.status(error.statusCode).json({
    message: error.message || getErrorMessage("INTERNAL_SERVER_ERROR", lang),
    errorCode: error.errorCode || ERROR_CODE.INTERNAL_SERVER_ERROR,
    details: error.details ?? null,
    errorId: error.errorId,
    timestamp: error.timestamp,
  });
};

// ✅ Middleware global de manejo de errores
const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const lang = (req.headers["accept-language"]?.split(",")[0] ||
    "en") as SupportedLang;

  // 🔹 HttpException lanzada desde un service o controller
  if (err instanceof HttpException) {
    logHttpError(err, req);
    return getHttpError(res, err, lang);
  }

  // 🔥 Error inesperado (no HttpException)
  const { errorId, timestamp } = logUnexpectedError(err, req);

  res.status(INTERNAL_SERVER_ERROR).json({
    message: getErrorMessage("INTERNAL_SERVER_ERROR", lang),
    errorCode: ERROR_CODE.INTERNAL_SERVER_ERROR,
    errorId,
    timestamp,
  });
};

export default errorHandler;
