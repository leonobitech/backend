import assert from "node:assert";
import HttpException from "@utils/http/HttpException";
import { HttpCode } from "@constants/httpCode";
import { ErrorCode, ERROR_CODE } from "@constants/errorCode";

interface ValidationDetail {
  field: string;
  message: string;
}

type AppAssert = (
  condition: boolean | unknown,
  httpCode: HttpCode,
  message: string,
  errorCode?: ErrorCode,
  details?: ValidationDetail[]
) => asserts condition;

/**
 * Asserts a condition and throws an HttpException if the condition is falsy.
 */
const appAssert: AppAssert = (
  condition,
  httpCode,
  message,
  errorCode = ERROR_CODE.INTERNAL_SERVER_ERROR,
  details?: ValidationDetail[]
) => {
  assert(
    condition,
    new HttpException(httpCode, message, errorCode, details ?? null)
  );
};

export default appAssert;
