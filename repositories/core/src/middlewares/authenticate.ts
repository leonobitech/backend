import { RequestHandler } from "express";
import catchErrors from "@utils/http/catchErrors";
import { HTTP_CODE } from "@constants/httpCode";
import { SupportedLang } from "@constants/errorMessages";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import {
  getAccessKey,
  getClientKey,
} from "@utils/auth/getAccessKeysFromRequest";
import { verifyToken } from "@utils/auth/jwt";
import { Audience } from "@constants/audience";
import { AccessTokenPayload } from "@schemas/tokenSchemas";
import HttpException from "@utils/http/HttpException";
import { getTokenAudience } from "@utils/auth/getTokenAudience";
import logger from "@utils/logging/logger";
import { findAccessTokenOrThrow } from "@utils/auth/tokenRedis";
import { createHash } from "crypto";
import { generateClientKeyFromMeta } from "@utils/auth/generateClientKey";
import { loggerSecurityEvent } from "@utils/logging/loggerSecurityEvent";
import { clearAuthCookies } from "@utils/auth/cookies";
import { refreshAccessTokenService } from "@services/account.service";
import { refreshAuthCookies } from "@utils/auth/cookies";
import { loggerEvent } from "@utils/logging/loggerEvent";

/**
 * 🛡️ Middleware para autenticar al usuario mediante Access Token válido.
 */
const authenticate: RequestHandler = catchErrors(
  async (req, res, next): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    const accessKey = getAccessKey(req);
    const clientKey = getClientKey(req);

    const meta = req.meta;

    /* // 📍 Determinar si esta es una request de ForwardAuth de Traefik
    const isForwardAuth = req.originalUrl.includes("/security/verify-admin");

    let meta: any;

    if (!isForwardAuth) {
      // 🌐 Request directa (desde el frontend al backend)
      // El middleware `extractMeta` ya procesó la metadata completa
      meta = req.meta!;
    } else {
      // 🚀 Request indirecta (de Traefik via ForwardAuth)
      meta = getClientMeta(req); // Ya devuelve el objeto completo

      if (!meta) {
        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          getErrorMessage("META_REQUIRED", lang),
          ERROR_CODE.META_CLIENT_REQUIRED,
          ["cookie clientMeta faltante"]
        );
      }

      console.log("Request from Traefik:", meta);
    } */

    if (!accessKey || !clientKey) {
      logger.warn("🛑 Acceso denegado: Faltan cookies de autenticación", {
        ...meta,
        reason: "Missing authentication cookies.",
        event: "auth.token.missing",
      });

      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        getErrorMessage("ACCESS_KEYS_REQUIRED", lang),
        ERROR_CODE.ACCESS_KEYS_REQUIRED,
        ["Authorization header o cookie faltante"]
      );
    }

    // Buscar el token en Redis
    let tokenResult;
    try {
      tokenResult = await findAccessTokenOrThrow(accessKey, clientKey, meta, true);
    } catch (err) {
      // Solo limpiar cookies si el token NO EXISTE en DB (TOKEN_REVOKED)
      // NO limpiar si es INVALID_CLIENT_KEY porque puede ser refresh temporal
      if (err instanceof HttpException && err.errorCode === ERROR_CODE.TOKEN_REVOKED) {
        logger.warn("🧹 Token revocado - limpiando cookies y forzando re-login", {
          ...meta,
          errorCode: err.errorCode,
          event: "auth.token.revoked.cleanup",
        });

        clearAuthCookies(res);
        throw err;
      }
      throw err;
    }

    const {
      token: accessToken,
      clientKeyHash,
      ttl,
      refreshed,
      fromGrace,
    } = tokenResult;

    // 🔐 Verificación básica contra Redis
    if (clientKey !== clientKeyHash) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Invalid client key (mismatch with stored key).",
        ERROR_CODE.INVALID_CLIENT_KEY
      );
    }

    // 🔍 Log: token recibido
    const audience = await getTokenAudience(accessToken);
    logger.info("🔑 Token recibido", {
      ...meta,
      ttlSeconds: ttl,
      audience: audience,
      fromGrace: fromGrace || false,
      event: "auth.token.received",
    });

    // ⏳ Si el token viene del período de gracia, NO hacer refresh
    // Esto significa que ya se refrescó y solo estamos esperando propagación de cookies
    if (fromGrace) {
      logger.info("⏳ Token en período de gracia - permitiendo acceso sin nuevo refresh", {
        ...meta,
        ttlRemaining: ttl,
        event: "auth.token.grace_period",
      });

      const { payload } = await verifyToken(accessToken, lang, req);

      if (
        payload.aud !== Audience.Access ||
        !("userId" in payload) ||
        !("role" in payload)
      ) {
        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          getErrorMessage("INVALID_AUDIENCE", lang),
          ERROR_CODE.INVALID_AUDIENCE,
          [`Expected Audience: ${Audience.Access}`]
        );
      }

      req.user = payload;
      req.userId = payload.userId;
      req.sessionId = payload.sessionId;
      req.role = payload.role;

      res.locals.user = {
        id: req.userId!,
        role: req.role!,
      };

      return next();
    }

    // 🔁 Si el token fue refrescado desde DB, forzar regeneración
    if (refreshed) {
      const result = await refreshAccessTokenService(
        clientKey,
        meta,
        lang,
        req
      );

      const { payload } = await verifyToken(
        result.tokens.accessToken,
        lang,
        req
      );

      console.log("🍪 setAuthCookies ejecutado. Cookies seteadas:", {
        accessKey: result.tokens.accessTokenId,
        clientKey: result.tokens.hashedPublicKey,
      });
      // Actualizar cookies con nuevos tokens
      refreshAuthCookies({
        res,
        accessKey: result.tokens.accessTokenId,
        clientKey: result.tokens.hashedPublicKey,
      });

      if (
        payload.aud !== Audience.Access ||
        !("userId" in payload) ||
        !("role" in payload)
      ) {
        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          getErrorMessage("INVALID_AUDIENCE", lang),
          ERROR_CODE.INVALID_AUDIENCE,
          [`Expected Audience: ${Audience.Access}`]
        );
      }

      req.user = payload;
      req.userId = payload.userId;
      req.sessionId = payload.sessionId;
      req.role = payload.role;

      res.locals.user = {
        id: req.userId!,
        role: req.role!,
      };

      loggerEvent("token.refreshed", {
        ...meta,
        userId: req.userId,
        sessionId: req.sessionId,
        event: "auth.token.silent_refresh",
        source: "auth.middleware.silent_refresh",
      });

      logger.info("✅ Usuario autenticado", {
        ...meta,
        userId: req.userId,
        sessionId: req.sessionId,
        role: req.role,
        event: "auth.token.verified",
      });

      return next();
    }

    // 🔐 Verificar token firmado y extraer payload
    let payload: AccessTokenPayload;
    try {
      const { payload: tokenPayload } = await verifyToken(
        accessToken,
        lang,
        req
      );

      if (
        tokenPayload.aud !== Audience.Access ||
        !("userId" in tokenPayload) ||
        !("role" in tokenPayload)
      ) {
        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          getErrorMessage("INVALID_AUDIENCE", lang),
          ERROR_CODE.INVALID_AUDIENCE,
          [`Expected Audience: ${Audience.Access}`]
        );
      }

      const hashedJti = createHash("sha512")
        .update(tokenPayload.jti)
        .digest("hex");
      if (hashedJti !== accessKey) {
        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          "Invalid token identifier.",
          ERROR_CODE.INVALID_TOKEN_STRUCTURE
        );
      }

      const expectedClientKey = await generateClientKeyFromMeta(
        meta,
        tokenPayload.userId,
        tokenPayload.sessionId
      );

      if (clientKey !== expectedClientKey) {
        await loggerSecurityEvent({
          meta,
          type: "client_key_mismatch",
          userId: tokenPayload.userId,
          sessionId: tokenPayload.sessionId,
        });

        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          "This token was not generated from this device or IP address.",
          ERROR_CODE.INVALID_CLIENT_KEY
        );
      }

      payload = tokenPayload;
    } catch (err) {
      if (err instanceof HttpException) {
        logger.warn("⚠️ Token inválido detectado", {
          ...meta,
          errorCode: err.errorCode,
          message: err.message,
          event:
            err.errorCode === ERROR_CODE.TOKEN_REVOKED
              ? "auth.token.revoked"
              : "auth.token.invalid",
        });
        return next(err);
      }

      logger.error("💥 Error inesperado al verificar token", {
        ...meta,
        err,
        event: "auth.token.error",
      });

      return next(
        new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          getErrorMessage("INVALID_ACCESS_TOKEN", lang),
          ERROR_CODE.INVALID_ACCESS_TOKEN,
          ["Verifica firma del token, expiración y formato."]
        )
      );
    }

    // ✅ Autenticación exitosa
    req.user = payload;
    req.userId = payload.userId;
    req.sessionId = payload.sessionId;
    req.role = payload.role;

    res.locals.user = {
      id: req.userId!,
      role: req.role!,
    };

    logger.info("✅ Usuario autenticado", {
      ...meta,
      userId: req.userId,
      sessionId: req.sessionId,
      role: req.role,
      event: "auth.token.verified",
    });

    next();
  }
);

export default authenticate;
