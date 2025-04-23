import { HttpCode } from "@constants/httpCode";
import { ErrorCode } from "@constants/errorCode";
import crypto from "crypto";

export default class HttpException extends Error {
  statusCode: HttpCode;
  errorCode: ErrorCode;
  details?: any;
  errorId: string;
  timestamp: string;

  constructor(
    statusCode: HttpCode,
    message: string,
    errorCode: ErrorCode,
    details?: any
  ) {
    super(message);

    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;

    this.errorId = crypto.randomUUID(); // 🔍 Trazabilidad única por error
    this.timestamp = new Date().toISOString(); // 🕓 Precisión para logs y debugging

    // Opcional: conservar stack trace solo en desarrollo
    if (process.env.NODE_ENV === "production") {
      this.stack = undefined;
    }
  }
}
