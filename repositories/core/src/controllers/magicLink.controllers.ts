import { Request, Response } from "express";
import catchErrors from "@utils/http/catchErrors";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import {
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  onboardingSchema,
} from "@schemas/accountSchemas";
import HttpException from "@utils/http/HttpException";
import {
  requestMagicLinkService,
  verifyMagicLinkService,
  completeOnboardingService,
} from "@services/magicLink.service";
import { verifyPendingToken } from "@utils/auth/pendingToken";
import logger from "@utils/logging/logger";
import { sanitizeInput } from "@utils/validation/sanitizeInput";
import { loggerEvent } from "@utils/logging/loggerEvent";

/**
 * POST /auth/magic-link
 * Solicita un magic link para login/registro.
 */
export const requestMagicLinkController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;

    const parsed = magicLinkRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      logger.warn("🚫 Validation error in magic link request", {
        ...meta,
        input: sanitizeInput(req.body),
        errors: validationErrors,
        event: "auth.magic_link.failed.validation",
        source: "requestMagicLinkController",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const result = await requestMagicLinkService(parsed.data.email);

    loggerEvent(
      "auth.magic_link.sent",
      { email: result.data.email },
      req,
      "requestMagicLinkController"
    );

    return void res.status(HTTP_CODE.OK).json({
      status: result.status,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * POST /auth/verify-magic-link
 * Verifica el token del magic link.
 */
export const verifyMagicLinkController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;

    const parsed = magicLinkVerifySchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      logger.warn("🚫 Validation error in magic link verify", {
        ...meta,
        errors: validationErrors,
        event: "auth.magic_link.verify.failed.validation",
        source: "verifyMagicLinkController",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const { token, requestId } = parsed.data;
    const result = await verifyMagicLinkService(token, requestId);

    loggerEvent(
      "auth.magic_link.verified",
      { status: result.status, userId: result.data.userId },
      req,
      "verifyMagicLinkController"
    );

    return void res.status(HTTP_CODE.OK).json({
      status: result.status,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * POST /auth/onboarding
 * Completa el onboarding de un usuario nuevo (nombre).
 * Requiere pendingToken en header Authorization.
 */
export const completeOnboardingController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;

    // Validar body
    const parsed = onboardingSchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    // Extraer y verificar pendingToken
    const pendingToken = req.body.pendingToken;

    if (!pendingToken || typeof pendingToken !== "string") {
      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        "Pending token is required.",
        ERROR_CODE.INVALID_PENDING_TOKEN
      );
    }

    const tokenData = await verifyPendingToken(pendingToken);

    const result = await completeOnboardingService(
      tokenData.userId,
      tokenData.email,
      parsed.data.name
    );

    loggerEvent(
      "auth.onboarding.completed",
      { userId: tokenData.userId },
      req,
      "completeOnboardingController"
    );

    return void res.status(HTTP_CODE.OK).json({
      status: result.status,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
);
