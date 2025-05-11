import { Request, Response } from "express";
import catchErrors from "@utils/http/catchErrors";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import {
  emailSchema,
  loginSchema,
  registerSchema,
  verifyEmailSchema,
  resetPasswordSchema,
} from "@schemas/accountSchemas";
import HttpException from "@utils/http/HttpException";
import {
  createAccountService,
  loginService,
  logoutAllOtherSessionsService,
  logoutService,
  refreshAccessTokenService,
  requestPasswordResetService,
  resetPasswordService,
  verifyDeviceService,
  verifyEmailService,
} from "@services/account.service";
import { clearAuthCookies, setAuthCookies } from "@utils/auth/cookies";
import logger from "@utils/logging/logger";
import { sanitizeInput } from "@utils/validation/sanitizeInput";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { API_STATUS } from "@constants/apiStatus";
import { getClientKey } from "@utils/auth/getAccessKeysFromRequest";

export const registerController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    // 🏷️ Idioma del cliente
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    // ✅ Metadatos inyectados por middleware
    const meta = req.meta!;

    // 📝 Validar input con Zod
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      logger.warn("🚫 Error de validación en registro", {
        ...meta,
        input: sanitizeInput(req.body),
        errors: validationErrors,
        event: "auth.register.failed.validation",
        source: "registerController",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const { email: userEmail, password } = parsed.data;

    // 🛠 Crear usuario
    const result = await createAccountService({
      email: userEmail,
      password,
      meta,
    });

    logger.info("✅ Usuario registrado exitosamente", {
      ...meta,
      email: result.data.email,
      userId: result.data.userId,
      event: "user.account.created",
      source: "registerController",
    });

    loggerEvent(
      "user.account.created",
      {
        email: result.data.email,
        userId: result.data.userId,
      },
      req,
      "registerController"
    );

    // 🔐 Sanitizar antes de responder al cliente
    const { requestId, expiresIn, email } = result.data;

    return void res.status(HTTP_CODE.CREATED).json({
      status: result.status,
      message: result.message,
      data: {
        email,
        requestId,
        expiresIn,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

export const verifyEmailController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    // 🏷️ Idioma del cliente
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    // 🧠 Metadatos del request inyectados por middleware
    const meta = req.meta!;

    // 📝 Validar body con Zod
    const parsed = verifyEmailSchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      const fallbackEmail =
        typeof req.body.email === "string" ? req.body.email : "unknown";

      logger.warn("🚫 Invalid input on email verification", {
        ...meta,
        email: fallbackEmail,
        input: sanitizeInput(req.body),
        errors: validationErrors,
        event: "auth.email.verification.failed",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const { email, code, requestId } = parsed.data;

    // 🔑 Ejecutar lógica de verificación
    const result = await verifyEmailService({
      email,
      code,
      requestId,
      meta,
    });

    // 🔁 Código expirado: se reenvió uno nuevo
    if (result.status === API_STATUS.RESEND) {
      logger.warn("🔁 Verification code expired, new code sent", {
        ...meta,
        email,
        event: "user.email.verification.code_resent",
        source: "verifyEmailController",
      });

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        resend: true,
        requestId: result.requestId,
        expiresIn: result.expiresIn,
        timestamp: new Date().toISOString(),
      });
    }

    // ℹ️ Ya verificado anteriormente
    if (result.status === API_STATUS.ALREADY_VERIFIED) {
      logger.info("ℹ️ Email already verified", {
        ...meta,
        email,
        event: "user.email.verification.already_verified",
        source: "verifyEmailController",
      });

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        alreadyVerified: true,
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ Verificación exitosa
    if (result.status === API_STATUS.VERIFIED) {
      // 🍪 Guardar tokens en cookies
      setAuthCookies({
        res,
        accessKey: result.tokens.accessTokenId,
        clientKey: result.tokens.hashedPublicKey,
      });

      logger.info("✅ Email verified and session started successfully", {
        ...meta,
        email: result.data.email,
        userId: result.data.userId,
        sessionId: result.data.sessionId,
        role: result.data.role,
        sessionStarted: true,
        source: "verifyEmailController",
        event: "user.email.verification.success",
      });

      loggerEvent(
        "user.email.verified.success",
        {
          email: result.data.email,
          userId: result.data.userId,
          sessionId: result.data.sessionId,
          role: result.data.role,
          sessionStarted: true,
        },
        req,
        "verifyEmailController"
      );

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString(),
      });
    }

    // 🧨 Estado inesperado
    throw new HttpException(
      HTTP_CODE.INTERNAL_SERVER_ERROR,
      "Unexpected verification state.",
      ERROR_CODE.INTERNAL_SERVER_ERROR
    );
  }
);

export const loginController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    // 🏷️ Idioma del cliente
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    // 🧠 Metadatos del request inyectados por middleware
    const meta = req.meta!;

    // 📝 Validar input
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      const fallbackEmail =
        typeof req.body.email === "string" ? req.body.email : "unknown";

      logger.warn("🚫 Error de validación en login", {
        ...meta,
        email: fallbackEmail,
        input: sanitizeInput(req.body),
        errors: validationErrors,
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const { email, password } = parsed.data;

    // 🔐 Iniciar sesión
    let result;

    try {
      result = await loginService({
        email,
        password,
        meta,
      });
    } catch (err: any) {
      logger.warn("🔒 Fallo en login", {
        ...meta,
        email,
        reason: err?.message || "Unknown",
      });

      throw err;
    }

    // 🍪 Setear cookies de sesión
    if ("tokens" in result) {
      setAuthCookies({
        res,
        accessKey: result.tokens.accessTokenId,
        clientKey: result.tokens.hashedPublicKey,
      });

      // 📋 Evento de login exitoso
      logger.info("✅ User verified and session started successfully", {
        ...meta,
        event: "user.login.success",
        email: result.data.email,
        userId: result.data.userId,
        sessionId: result.data.sessionId,
        source: "loginController",
      });

      loggerEvent(
        "user.logged_in.success",
        {
          userId: result.data.userId,
          email: result.data.email,
          sessionId: result.data.sessionId,
        },
        req,
        "loginController"
      );
    }

    // ✅ Responder al cliente
    res.status(HTTP_CODE.OK).json({
      status: result.status,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
);

export const verifyDeviceController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    // 🏷️ Idioma del cliente
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    // 🧠 Metadatos del request inyectados por middleware
    const meta = req.meta!;

    // 📝 Validar body con Zod
    const parsed = verifyEmailSchema.safeParse(req.body);

    if (!parsed.success) {
      const validationErrors = parsed.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      const fallbackEmail =
        typeof req.body.email === "string" ? req.body.email : "unknown";

      logger.warn("🚫 Invalid input on device verification", {
        ...meta,
        email: fallbackEmail,
        input: sanitizeInput(req.body),
        errors: validationErrors,
        event: "auth.device.verification.failed",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang) +
          `: ${validationErrors.map((e) => e.message).join(", ")}`,
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const { email, code } = parsed.data;

    // 🔑 Ejecutar lógica de verificación
    const result = await verifyDeviceService({
      email,
      code,
      meta,
    });

    // 🔁 Código expirado: se reenvió uno nuevo
    if (result.status === API_STATUS.RESEND) {
      logger.warn("🔁 Verification code expired, new code sent", {
        ...meta,
        email,
        event: "user.device.verification.code_resent",
        source: "verifyDeviceController",
      });

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        resend: true,
        timestamp: new Date().toISOString(),
      });
    }

    // ℹ️ Ya verificado anteriormente
    if (result.status === API_STATUS.ALREADY_VALIDATED) {
      logger.info("ℹ️ Email already verified", {
        ...meta,
        email,
        event: "user.device.verification.already_verified",
        source: "verifyDeviceController",
      });

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        alreadyVerified: true,
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ Verificación exitosa
    if (result.status === API_STATUS.DEVICE_VALIDATED) {
      // 🍪 Guardar tokens en cookies
      setAuthCookies({
        res,
        accessKey: result.tokens.accessTokenId,
        clientKey: result.tokens.hashedPublicKey,
      });

      logger.info("✅ User verified and session started successfully", {
        ...meta,
        email: result.data.email,
        userId: result.data.userId,
        sessionId: result.data.sessionId,
        role: result.data.role,
        sessionStarted: true,
        source: "verifyDeviceController",
        event: "user.device.verification.success",
      });

      loggerEvent(
        "user.logged_in.success",
        {
          email: result.data.email,
          userId: result.data.userId,
          sessionId: result.data.sessionId,
          role: result.data.role,
          sessionStarted: true,
        },
        req,
        "verifyDeviceController"
      );

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString(),
      });
    }

    // 🧨 Estado inesperado
    throw new HttpException(
      HTTP_CODE.INTERNAL_SERVER_ERROR,
      "Unexpected verification state.",
      ERROR_CODE.INTERNAL_SERVER_ERROR
    );
  }
);

export const refreshAccessTokenController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    // Extracción del idioma y metadata desde la petición
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!; // Se asume que meta ya está seteada por un middleware previo
    const clientKey = req.cookies?.clientKey;

    if (!clientKey) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Client key is required.",
        ERROR_CODE.CLIENT_KEY_REQUIRED
      );
    }

    // Invoca el servicio para refrescar el token
    const result = await refreshAccessTokenService(clientKey, meta, lang);

    // Establece las cookies de autenticación usando los nuevos tokens
    setAuthCookies({
      res,
      accessKey: result.tokens.accessTokenId,
      clientKey: result.tokens.hashedPublicKey,
    });

    // Registra el evento de refresh de token
    loggerEvent("token.refreshed", {
      ...meta,
      userId: result.data.userId,
      sessionId: result.data.sessionId,
    });

    // Envía la respuesta exitosa
    return void res.status(HTTP_CODE.OK).json({
      status: result.status,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
);

export const logoutController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;
    const clientKey = getClientKey(req);

    if (!clientKey) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        getErrorMessage("CLIENT_KEY_REQUIRED", lang),
        ERROR_CODE.CLIENT_KEY_REQUIRED
      );
    }

    // 🧹 Cerrar sesión y revocar tokens
    const result = await logoutService(clientKey, meta, lang);

    // 🧼 Limpiar cookies de autenticación
    clearAuthCookies(res);

    // 📋 Log de evento de logout
    loggerEvent("user.logged_out", {
      userId: result.data.userId,
      sessionId: result.data.sessionId,
      ...meta,
    });

    return void res.status(HTTP_CODE.OK).json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  }
);

export const logoutAllOtherSessionsController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;
    const clientKey = getClientKey(req);

    if (!clientKey) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        getErrorMessage("CLIENT_KEY_REQUIRED", lang),
        ERROR_CODE.CLIENT_KEY_REQUIRED
      );
    }

    const result = await logoutAllOtherSessionsService(clientKey, meta, lang);

    loggerEvent("user.logout_all_other_sessions", {
      userId: result.data.userId,
      sessionKept: result.data.sessionKept,
      ...meta,
    });

    res.status(HTTP_CODE.OK).json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  }
);

export const requestPasswordResetController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;

    const parsed = emailSchema.safeParse(req.body.email);

    if (!parsed.success) {
      const fallbackEmail =
        typeof req.body.email === "string" ? req.body.email : "unknown";
      const validationErrors = parsed.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      logger.warn("🚫 Invalid input on password reset request", {
        ...meta,
        email: fallbackEmail,
        input: sanitizeInput(req.body),
        errors: validationErrors,
        event: "auth.reset_password.request.failed",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang),
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const email = parsed.data;

    const result = await requestPasswordResetService(email);

    logger.info("📩 Password reset code sent", {
      ...meta,
      email,
      event: "auth.reset_password.code.sent",
    });

    loggerEvent("user.password.reset.requested", {
      email,
      ...meta,
    });

    return void res.status(HTTP_CODE.OK).json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  }
);

export const resetPasswordController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const meta = req.meta!;

    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      const fallbackEmail =
        typeof req.body.email === "string" ? req.body.email : "unknown";

      const validationErrors = parsed.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      logger.warn("🚫 Invalid input on reset password attempt", {
        ...meta,
        email: fallbackEmail,
        input: sanitizeInput(req.body),
        errors: validationErrors,
        event: "auth.reset_password.failed.validation",
      });

      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INVALID_INPUT", lang),
        ERROR_CODE.BAD_REQUEST,
        validationErrors
      );
    }

    const { email, code, newPassword } = parsed.data;

    const result = await resetPasswordService({
      email,
      code,
      newPassword,
      meta,
    });

    if (result.status === API_STATUS.RESEND) {
      logger.warn("🔁 Reset code expired, new one sent", {
        ...meta,
        email,
        event: "auth.reset_password.code.resent",
      });

      return void res.status(HTTP_CODE.OK).json({
        status: result.status,
        message: result.message,
        resend: true,
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ Setear cookies con jti y clientKey actualizados
    setAuthCookies({
      res,
      accessKey: result.tokens.accessTokenId,
      clientKey: result.tokens.hashedPublicKey,
    });

    loggerEvent("user.password.reset.success", {
      ...meta,
      userId: result.data.userId,
      email: result.data.email,
      sessionId: result.data.sessionId,
    });

    logger.info("🔐 Password reset successful, user signed in", {
      ...meta,
      userId: result.data.userId,
      email: result.data.email,
      sessionId: result.data.sessionId,
    });

    return void res.status(HTTP_CODE.OK).json({
      status: result.status,
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  }
);
