import HttpException from "@utils/http/HttpException";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { loggerEvent } from "@utils/logging/loggerEvent";

export const handleStartupError = (service: string, error: unknown): never => {
  const err = error as Error;

  loggerEvent(`${service}.connection.failure`, {
    message: err.message,
    stack: err.stack,
  });

  throw new HttpException(
    HTTP_CODE.INTERNAL_SERVER_ERROR,
    `${service} is unavailable`,
    ERROR_CODE.SERVICE_UNAVAILABLE,
    { service, originalError: err.message }
  );
};
