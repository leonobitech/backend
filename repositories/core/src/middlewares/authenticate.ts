import { Request, Response, RequestHandler } from "express";
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
import { AccessTokenPayload, AccessTokenValidatedPayload } from "@schemas/tokenSchemas";
import HttpException from "@utils/http/HttpException";
import { getTokenAudience } from "@utils/auth/getTokenAudience";
import logger from "@utils/logging/logger";
import { findAccessTokenOrThrow } from "@utils/auth/tokenRedis";
import { createHash } from "crypto";
import { generateClientKeyFromMeta } from "@utils/auth/generateClientKey";
import { generateClientKeyLegacy } from "@utils/auth/generateClientKeyLegacy";
import { loggerSecurityEvent } from "@utils/logging/loggerSecurityEvent";
import { clearAuthCookies, refreshClientMetaCookie } from "@utils/auth/cookies";
import { refreshAccessTokenService } from "@services/account.service";
import { refreshAuthCookies } from "@utils/auth/cookies";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { UserRole } from "@constants/userRole";
import appAssert from "@utils/validation/appAssert";

//==============================================================================
// 🧩 HELPER FUNCTIONS
//==============================================================================

/**
 * Valida que el payload sea de tipo Access Token con los campos requeridos
 */
function validateAccessTokenPayload(
  payload: any,
  lang: SupportedLang
): asserts payload is AccessTokenPayload {
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
}

/**
 * Setea los datos del usuario autenticado en el request
 */
function setAuthenticatedUser(
  req: Request,
  res: Response,
  payload: AccessTokenPayload
): void {
  req.user = payload;
  req.userId = payload.userId;
  req.sessionId = payload.sessionId;
  req.role = payload.role;

  res.locals.user = {
    id: payload.userId,
    role: payload.role,
  };
}

/**
 * Construye un AccessTokenValidatedPayload desde datos de DB (usado en grace period)
 */
function buildPayloadFromDbData(
  userId: string,
  sessionId: string,
  role: string,
  accessKey: string,
  ttl: number
): AccessTokenValidatedPayload {
  const expiresAt = Date.now() + ttl * 1000;
  return {
    userId,
    sessionId,
    role: role as UserRole,
    aud: Audience.Access,
    exp: Math.floor(expiresAt / 1000),
    iss: "leonobitech.com",
    jti: accessKey,
    sub: userId,
  };
}

//==============================================================================
// 🛡️ MAIN MIDDLEWARE
//==============================================================================

/**
 * Authentication Middleware
 *
 * Valida el Access Token del usuario y setea req.user con los datos autenticados.
 *
 * Flujo de autenticación:
 * 1. Extrae accessKey y clientKey de cookies
 * 2. Busca el token en Redis (o DB como fallback)
 * 3. Procesa según el origen y estado del token:
 *    - Grace period (fromGrace): Token en período de gracia post-refresh
 *    - Expired DB token (refreshed && ttl<0): Trigger silent refresh
 *    - Valid DB token (refreshed && ttl>=0): Usa datos de DB sin verificar JWT
 *    - Normal Redis token: Verifica JWT y valida fingerprint
 * 4. Setea req.user, req.userId, req.sessionId, req.role
 *
 * @throws {HttpException} 401 si el token es inválido, expirado o revocado
 */
const authenticate: RequestHandler = catchErrors(
  async (req, res, next): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    const meta = req.meta;

    //==========================================================================
    // STEP 1: Extract & Validate Credentials
    //==========================================================================

    const accessKey = getAccessKey(req);
    const clientKey = getClientKey(req);

    if (!accessKey || !clientKey) {
      // No es un ataque - simplemente un usuario no autenticado
      // (visitante, bot, sesión expirada, primer acceso, etc.)
      logger.debug("🔓 Acceso sin autenticación", {
        path: req.originalUrl,
        event: "auth.token.missing",
      });

      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        getErrorMessage("ACCESS_KEYS_REQUIRED", lang),
        ERROR_CODE.ACCESS_KEYS_REQUIRED,
        ["Authorization header o cookie faltante"]
      );
    }

    //==========================================================================
    // STEP 2: Find Token (Redis or DB Fallback)
    //==========================================================================

    let tokenResult;
    try {
      tokenResult = await findAccessTokenOrThrow(
        accessKey,
        clientKey,
        meta,
        true // useFallback: Si no está en Redis, buscar en DB
      );
    } catch (err) {
      // =======================================================================
      // 🔄 RECOVERY: Si ACCESS token no existe, intentar refresh con clientKey
      // =======================================================================
      // El ACCESS token puede haber expirado/eliminado de DB, pero el REFRESH
      // token aún puede ser válido. Intentamos recuperar antes de forzar re-login.
      if (
        err instanceof HttpException &&
        err.errorCode === ERROR_CODE.TOKEN_REVOKED
      ) {
        logger.info(
          "🔄 ACCESS token no encontrado - intentando recovery via REFRESH token",
          {
            ...meta,
            errorCode: err.errorCode,
            event: "auth.token.revoked.recovery.attempt",
          }
        );

        try {
          const result = await refreshAccessTokenService(
            clientKey,
            meta,
            lang,
            req
          );

          const { payload: recoveredPayload } = await verifyToken(
            result.tokens.accessToken,
            lang,
            req
          );
          validateAccessTokenPayload(recoveredPayload, lang);

          // ✅ Recovery exitoso - actualizar cookies
          logger.info("✅ Recovery via REFRESH exitoso - actualizando cookies", {
            ...meta,
            userId: result.data.userId,
            sessionId: result.data.sessionId,
            event: "auth.token.revoked.recovery.success",
          });

          refreshAuthCookies({
            res,
            accessKey: result.tokens.accessTokenId,
            clientKey: result.tokens.hashedPublicKey,
          });
          refreshClientMetaCookie(req, res);

          setAuthenticatedUser(req, res, recoveredPayload);

          loggerEvent("token.recovered.from.refresh", {
            ...meta,
            userId: recoveredPayload.userId,
            sessionId: recoveredPayload.sessionId,
            event: "auth.token.recovery.refresh",
            source: "auth.middleware.token_revoked_recovery",
          });

          return next();
        } catch (recoveryErr) {
          // ❌ Recovery falló - ahora sí limpiar cookies y forzar re-login
          logger.warn(
            "🧹 Recovery via REFRESH falló - limpiando cookies y forzando re-login",
            {
              ...meta,
              originalError: err instanceof Error ? err.message : "Unknown",
              recoveryError: recoveryErr instanceof Error ? recoveryErr.message : "Unknown",
              event: "auth.token.revoked.recovery.failed",
            }
          );

          clearAuthCookies(res);
          throw err;
        }
      }
      throw err;
    }

    const {
      token: accessToken,
      clientKeyHash,
      ttl,
      refreshed,
      fromGrace,
      userId: dbUserId,
      sessionId: dbSessionId,
      role: dbRole,
    } = tokenResult;

    // Validar clientKey si NO viene de DB (en DB ya se validó)
    if (!refreshed && clientKey !== clientKeyHash) {
      logger.warn("🧹 ClientKey mismatch - limpiando cookies", {
        ...meta,
        event: "auth.clientkey.mismatch.cleanup",
      });
      clearAuthCookies(res);
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Invalid client key (mismatch with stored key).",
        ERROR_CODE.INVALID_CLIENT_KEY
      );
    }

    // Log: Token recibido
    const audience = await getTokenAudience(accessToken);
    logger.info("🔑 Token recibido", {
      ...meta,
      ttlSeconds: ttl,
      audience,
      fromGrace: fromGrace || false,
      refreshed,
      event: "auth.token.received",
    });

    //==========================================================================
    // STEP 3: Process Token Based on Source & Status
    //==========================================================================

    // -------------------------------------------------------------------------
    // PATH A: Grace Period Token
    // -------------------------------------------------------------------------
    // Token encontrado en Redis grace period key (movido ahí post-refresh)
    // Aún válido por 120 segundos para permitir propagación de cookies
    if (fromGrace) {
      logger.info(
        "⏳ Token en período de gracia - permitiendo acceso sin nuevo refresh",
        {
          ...meta,
          ttlRemaining: ttl,
          event: "auth.token.grace_period",
        }
      );

      const { payload } = await verifyToken(accessToken, lang, req);
      validateAccessTokenPayload(payload, lang);
      setAuthenticatedUser(req, res, payload);

      return next();
    }

    // -------------------------------------------------------------------------
    // PATH B: Expired DB Token → Trigger Silent Refresh
    // -------------------------------------------------------------------------
    // Token recuperado de DB pero ya expiró (ttl < 0)
    // Generar nuevo token y actualizar cookies automáticamente
    if (refreshed && ttl < 0) {
      logger.info("🔁 Token expirado - iniciando silent refresh", {
        ...meta,
        ttlRemaining: ttl,
        event: "auth.token.silent_refresh.start",
      });

      const result = await refreshAccessTokenService(
        clientKey,
        meta,
        lang,
        req,
        clientKeyHash // Pasar formato alternativo para backward compatibility
      );

      const { payload } = await verifyToken(
        result.tokens.accessToken,
        lang,
        req
      );
      validateAccessTokenPayload(payload, lang);

      // Actualizar cookies con nuevos tokens
      logger.info("🍪 Actualizando cookies después de refresh", {
        userId: result.data.userId,
        sessionId: result.data.sessionId,
        hasAccessKey: !!result.tokens.accessTokenId,
        hasClientKey: !!result.tokens.hashedPublicKey,
        event: "auth.cookies.refresh",
      });

      refreshAuthCookies({
        res,
        accessKey: result.tokens.accessTokenId,
        clientKey: result.tokens.hashedPublicKey,
      });
      refreshClientMetaCookie(req, res);

      setAuthenticatedUser(req, res, payload);

      loggerEvent("token.refreshed", {
        ...meta,
        userId: payload.userId,
        sessionId: payload.sessionId,
        event: "auth.token.silent_refresh",
        source: "auth.middleware.silent_refresh",
      });

      logger.info("✅ Usuario autenticado (post silent refresh)", {
        ...meta,
        userId: payload.userId,
        sessionId: payload.sessionId,
        role: payload.role,
        event: "auth.token.verified",
      });

      return next();
    }

    // -------------------------------------------------------------------------
    // PATH C: Valid DB Token (Grace Period) → Use DB Data
    // -------------------------------------------------------------------------
    // Token recuperado de DB con TTL aún válido (ttl >= 0)
    // Esto pasa durante grace period cuando el JWT ya expiró pero el TokenRecord
    // todavía tiene expiresAt > now (grace period de 120 segundos)
    //
    // 🔧 FIX: No podemos usar verifyToken() porque el JWT claim 'exp' ya pasó,
    // causando JWTExpired error. En su lugar, usamos los datos que
    // findAccessTokenOrThrow() ya recuperó y validó desde DB.
    //
    // Seguridad: Safe porque findAccessTokenOrThrow() ya validó:
    // - Token existe en DB
    // - expiresAt > now (aún en grace period)
    // - Fingerprint correcto (clientKey matches IP + User Agent + userId + sessionId)
    // - IP matches Device.ipAddress
    if (refreshed && ttl >= 0) {
      logger.info(
        "♻️ Token recuperado de DB con TTL válido - usando datos de DB",
        {
          ...meta,
          ttlRemaining: ttl,
          event: "auth.token.db_recovery_valid",
        }
      );

      appAssert(
        dbUserId && dbSessionId && dbRole,
        HTTP_CODE.UNAUTHORIZED,
        "Token data incomplete from database.",
        ERROR_CODE.TOKEN_REVOKED
      );

      const payload = buildPayloadFromDbData(
        dbUserId,
        dbSessionId,
        dbRole,
        accessKey,
        ttl
      );

      setAuthenticatedUser(req, res, payload);

      logger.info("✅ Usuario autenticado desde DB (grace period)", {
        ...meta,
        userId: payload.userId,
        sessionId: payload.sessionId,
        role: payload.role,
        ttlRemaining: ttl,
        event: "auth.token.verified.db_valid",
      });

      return next();
    }

    // -------------------------------------------------------------------------
    // PATH D: Normal Redis Token → Verify JWT
    // -------------------------------------------------------------------------
    // Token encontrado en Redis con TTL válido
    // Verificar firma JWT, audience, JTI hash, y fingerprint
    let payload: AccessTokenPayload;
    try {
      const { payload: tokenPayload } = await verifyToken(
        accessToken,
        lang,
        req
      );

      validateAccessTokenPayload(tokenPayload, lang);

      // Validar JTI hash
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

      // Validar fingerprint (device + IP)
      const expectedClientKey = await generateClientKeyFromMeta(
        meta,
        tokenPayload.userId,
        tokenPayload.sessionId
      );

      // Backward compatibility: Intentar también con formato legacy (IP /24)
      const expectedClientKeyLegacy = await generateClientKeyLegacy(
        meta,
        tokenPayload.userId,
        tokenPayload.sessionId
      );

      const isValidFingerprint =
        clientKey === expectedClientKey ||
        clientKey === expectedClientKeyLegacy;

      if (!isValidFingerprint) {
        await loggerSecurityEvent({
          meta,
          type: "client_key_mismatch",
          userId: tokenPayload.userId,
          sessionId: tokenPayload.sessionId,
          details: {
            receivedClientKey: clientKey,
            expectedNew: expectedClientKey,
            expectedLegacy: expectedClientKeyLegacy,
          },
        });

        logger.warn("🧹 Fingerprint mismatch - limpiando cookies", {
          ...meta,
          userId: tokenPayload.userId,
          event: "auth.fingerprint.mismatch.cleanup",
        });
        clearAuthCookies(res);

        throw new HttpException(
          HTTP_CODE.UNAUTHORIZED,
          "This token was not generated from this device or IP address.",
          ERROR_CODE.INVALID_CLIENT_KEY
        );
      }

      // Log si detectamos uso de formato legacy
      if (
        clientKey === expectedClientKeyLegacy &&
        clientKey !== expectedClientKey
      ) {
        logger.info("🔄 Cliente usando formato legacy de clientKey detectado", {
          userId: tokenPayload.userId,
          sessionId: tokenPayload.sessionId,
          event: "auth.clientkey.legacy_detected",
        });
      }

      payload = tokenPayload;
    } catch (err) {
      // =========================================================================
      // 🔄 RECOVERY: Intentar silent refresh antes de limpiar cookies
      // =========================================================================
      // El token JWT puede estar inválido/expirado en Redis, pero la sesión
      // puede seguir válida en DB. Intentamos recuperar antes de forzar re-login.
      logger.info("🔄 Token inválido en Redis - intentando recovery desde DB", {
        ...meta,
        originalError: err instanceof Error ? err.message : "Unknown",
        event: "auth.token.recovery.attempt",
      });

      try {
        const result = await refreshAccessTokenService(
          clientKey,
          meta,
          lang,
          req,
          clientKeyHash // Formato alternativo para backward compatibility
        );

        const { payload: recoveredPayload } = await verifyToken(
          result.tokens.accessToken,
          lang,
          req
        );
        validateAccessTokenPayload(recoveredPayload, lang);

        // ✅ Recovery exitoso - actualizar cookies
        logger.info("✅ Recovery exitoso - actualizando cookies", {
          ...meta,
          userId: result.data.userId,
          sessionId: result.data.sessionId,
          event: "auth.token.recovery.success",
        });

        refreshAuthCookies({
          res,
          accessKey: result.tokens.accessTokenId,
          clientKey: result.tokens.hashedPublicKey,
        });
        refreshClientMetaCookie(req, res);

        setAuthenticatedUser(req, res, recoveredPayload);

        loggerEvent("token.recovered", {
          ...meta,
          userId: recoveredPayload.userId,
          sessionId: recoveredPayload.sessionId,
          event: "auth.token.recovery",
          source: "auth.middleware.recovery",
        });

        return next();
      } catch (recoveryErr) {
        // ❌ Recovery falló - ahora sí limpiar cookies y forzar re-login
        logger.warn("🧹 Recovery falló - limpiando cookies y forzando re-login", {
          ...meta,
          originalError: err instanceof Error ? err.message : "Unknown",
          recoveryError: recoveryErr instanceof Error ? recoveryErr.message : "Unknown",
          event: "auth.token.recovery.failed",
        });

        clearAuthCookies(res);

        // Usar el error original si es HttpException, sino crear uno nuevo
        if (err instanceof HttpException) {
          return next(err);
        }

        return next(
          new HttpException(
            HTTP_CODE.UNAUTHORIZED,
            getErrorMessage("INVALID_ACCESS_TOKEN", lang),
            ERROR_CODE.INVALID_ACCESS_TOKEN,
            ["Session expirada. Por favor inicia sesión nuevamente."]
          )
        );
      }
    }

    //==========================================================================
    // STEP 4: Set Authenticated User & Continue
    //==========================================================================

    setAuthenticatedUser(req, res, payload);

    logger.info("✅ Usuario autenticado (token normal)", {
      ...meta,
      userId: payload.userId,
      sessionId: payload.sessionId,
      role: payload.role,
      event: "auth.token.verified",
    });

    next();
  }
);

export default authenticate;
