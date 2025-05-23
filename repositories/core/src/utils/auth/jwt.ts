import { createHash, randomUUID } from "crypto";
import {
  jwtVerify,
  decodeJwt,
  errors as JoseErrors,
  SignJWT,
  CompactEncrypt,
  compactDecrypt,
} from "jose";

import prisma from "@config/prisma";

import {
  AccessTokenSchema,
  AccessTokenPayload,
  RefreshTokenSchema,
  RefreshTokenPayload,
  AccessTokenValidatedPayload,
  RefreshTokenValidatedPayload,
  SignOptionsAndSecret,
} from "@schemas/tokenSchemas";

import {
  fifteenMinutesFromNow,
  //oneHourFromNow,
  thirtyDaysFromNow,
  thirtyMinutesFromNow,
} from "@utils/date/date";

import { Audience } from "@constants/audience";
import { UserRole } from "@constants/userRole";
import { SupportedLang } from "@constants/errorMessages";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import {
  JWT_REFRESH_SECRET,
  JWT_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
} from "@config/env";

import HttpException from "@utils/http/HttpException";
import appAssert from "@utils/validation/appAssert";

import { loggerEvent } from "@utils/logging/loggerEvent";
import { logTokenAudit, TokenAuditLog } from "@utils/logging/logTokenAudit";
import { cacheAccessToken } from "./tokenRedis";
import { loadRsaKeys } from "@config/rsaKeys";

// Tipos derivados de los schemas

type ValidatedToken<T> = { payload: T; jwt: string };

// *******************************************************************************************
// ✅ Función para verificar el token y parsearlo con validaciones Zod y multilanguage
// *******************************************************************************************
const verifyTokenAndParse = async <T>(
  jwt: string,
  secret: string,
  audience: Audience.Access | Audience.Refresh,
  schema: any,
  _lang: SupportedLang
): Promise<ValidatedToken<T>> => {
  try {
    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(secret), {
      issuer: JWT_ISSUER,
      audience,
    });

    appAssert(
      payload.sub && payload.iss && payload.jti,
      HTTP_CODE.UNAUTHORIZED,
      "Invalid token structure.",
      ERROR_CODE.INVALID_TOKEN_STRUCTURE
    );

    appAssert(
      payload.aud === audience,
      HTTP_CODE.UNAUTHORIZED,
      "Invalid audience.",
      ERROR_CODE.INVALID_AUDIENCE
    );

    const parsed = schema.safeParse(payload);

    appAssert(
      parsed.success,
      HTTP_CODE.UNAUTHORIZED,
      "Invalid payload structure.",
      ERROR_CODE.INVALID_PAYLOAD_STRUCTURE,
      parsed.success ? undefined : parsed.error.flatten().fieldErrors
    );

    return {
      jwt,
      payload: {
        ...parsed.data,
        sub: payload.sub,
        iss: payload.iss,
        jti: payload.jti,
      } as T,
    };
  } catch (error) {
    if (error instanceof JoseErrors.JWTExpired) {
      const payload = (error as any).payload;
      const jti = payload?.jti;

      if (typeof jti === "string") {
        await prisma.tokenRecord.updateMany({
          where: { jti, revoked: false },
          data: { revoked: true },
        });
      }

      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Token expired.",
        ERROR_CODE.TOKEN_EXPIRED
      );
    }

    if (error instanceof JoseErrors.JWTClaimValidationFailed) {
      throw new HttpException(
        HTTP_CODE.UNAUTHORIZED,
        "Invalid claim validation.",
        ERROR_CODE.INVALID_CLAIMS
      );
    }

    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      "Invalid token.",
      ERROR_CODE.INVALID_TOKEN
    );
  }
};

// *******************************************************************************************
// ✅ Verifica si el token es Access o Refresh y retorna payload validado
// *******************************************************************************************
export const verifyToken = async (
  jwe: string,
  lang: SupportedLang
): Promise<
  ValidatedToken<AccessTokenValidatedPayload | RefreshTokenValidatedPayload>
> => {
  const { privateKey } = await loadRsaKeys();
  const { plaintext } = await compactDecrypt(jwe, privateKey);
  const jwt = new TextDecoder().decode(plaintext);

  const decoded = decodeJwt(jwt); // Solo estructura, sin verificar firma

  appAssert(
    decoded && typeof decoded === "object",
    HTTP_CODE.UNAUTHORIZED,
    "Malformed token",
    ERROR_CODE.INVALID_ACCESS_TOKEN
  );

  const isAccess = AccessTokenSchema.safeParse(decoded);
  const isRefresh = RefreshTokenSchema.safeParse(decoded);

  if (isAccess.success) {
    const { payload } = await verifyTokenAndParse<AccessTokenValidatedPayload>(
      jwt,
      JWT_SECRET,
      Audience.Access,
      AccessTokenSchema,
      lang
    );

    const date = new Date(payload.exp * 1000).toISOString();
    loggerEvent("token.access.verified", {
      sessionId: payload.sessionId,
      userId: payload.userId,
      role: payload.role,
      jti: payload.jti,
      sub: payload.sub,
      exp: date,
      iss: payload.iss,
    });

    return { payload, jwt };
  }

  if (isRefresh.success) {
    const { payload } = await verifyTokenAndParse<RefreshTokenValidatedPayload>(
      jwt,
      JWT_REFRESH_SECRET,
      Audience.Refresh,
      RefreshTokenSchema,
      lang
    );

    const date = new Date(payload.exp * 1000).toISOString();
    loggerEvent("token.refresh.verified", {
      sessionId: payload.sessionId,
      jti: payload.jti,
      sub: payload.sub,
      exp: date,
      iss: payload.iss,
    });

    return { payload, jwt };
  }

  throw new HttpException(
    HTTP_CODE.UNAUTHORIZED,
    "Unrecognized token structure.",
    ERROR_CODE.UNRECOGNIZED_TOKEN
  );
};

// *******************************************************************************************
// 🔐 Firma un token usando jwt.sign y opciones custom
// *******************************************************************************************
export const signToken = async (
  payload: AccessTokenPayload | RefreshTokenPayload,
  options: SignOptionsAndSecret,
  auditInfo: TokenAuditLog,
  hashedPublicKey: string
): Promise<{ token: string; hashedJti: string }> => {
  if (!options?.secret) {
    throw new Error("Secret is required for signing the token.");
  }

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS512" }) // ✅ más robusto que HS256
    .setIssuer(options.issuer || JWT_ISSUER)
    .setAudience(options.audience || Audience.Access)
    .setJti(randomUUID()) // UUID v4
    .setSubject(options.subject)
    .setExpirationTime(
      options.expiresIn
        ? options.expiresIn
        : Math.floor(fifteenMinutesFromNow().getTime() / 1000)
    ) // 15 minutos por defecto
    .setNotBefore(Math.floor(Date.now() / 1000)) // No antes de ahora
    .setIssuedAt(Math.floor(Date.now() / 1000)) // Ahora
    .sign(new TextEncoder().encode(options.secret));

  const { jti, exp, aud } = decodeJwt(jwt); // Solo estructura, sin verificar firma
  if (!jti || !exp || !aud) {
    throw new Error("Failed to decode JWT.");
  }
  const hashJti = (jti: string): string =>
    createHash("sha512").update(jti).digest("hex");
  const hashedJti = hashJti(jti);

  const { publicKey } = await loadRsaKeys();

  // 🗝️ Encriptar el token con JOSE
  const jwe = await new CompactEncrypt(new TextEncoder().encode(jwt))
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM" })
    .encrypt(publicKey);

  // 🧾 Auditoría si se pasa auditInfo
  logTokenAudit(aud === Audience.Access ? Audience.Access : Audience.Refresh, {
    performedBy: auditInfo.performedBy,
    sessionId: auditInfo.sessionId,
    jti: hashedJti,
    aud: auditInfo.aud,
    role: auditInfo.role,
    exp: auditInfo.exp,
  });

  // 🗄️ Cache del Access Token
  if (aud === Audience.Access) {
    const ttl = exp - Math.floor(Date.now() / 1000); // segundos restantes

    await cacheAccessToken(hashedJti, jwe, hashedPublicKey, ttl);
  }

  return { token: jwe, hashedJti };
};

// *******************************************************************************************
// ⏳ Calcula fecha de expiración dinámica por rol y tipo de token
// *******************************************************************************************
export const getExpirationDate = (role: UserRole, audience: Audience): Date => {
  if (role === UserRole.Admin) {
    return audience === Audience.Access
      ? fifteenMinutesFromNow()
      : thirtyDaysFromNow();
  }

  if (role === UserRole.Moderator) {
    return audience === Audience.Access
      ? thirtyMinutesFromNow()
      : thirtyDaysFromNow();
  }

  return audience === Audience.Access
    ? fifteenMinutesFromNow()
    : thirtyDaysFromNow();
};

// *******************************************************************************************
// 🔧 Crea un Access Token listo para enviar al cliente
// *******************************************************************************************
export const generateAccessToken = async (
  userId: string,
  sessionId: string,
  role: UserRole,
  hashedPublicKey: string
): Promise<{ token: string; hashedJti: string }> => {
  const expiration = getExpirationDate(role, Audience.Access);
  const expiresInAccess = Math.floor(expiration.getTime() / 1000);

  const date = expiration.toISOString();

  const payload: AccessTokenPayload = {
    userId,
    sessionId,
    role,
    aud: Audience.Access,
    exp: expiresInAccess,
  };

  return signToken(
    payload,
    {
      subject: payload.userId,
      issuer: JWT_ISSUER,
      audience: payload.aud,
      expiresIn: payload.exp,
      secret: JWT_SECRET,
    },
    {
      performedBy: payload.userId,
      sessionId,
      aud: JWT_AUDIENCE,
      jti: "",
      role,
      exp: date,
    },
    hashedPublicKey
  );
};

// *******************************************************************************************
// 🔄 Crea un Refresh Token con expiración adecuada
// *******************************************************************************************
export const generateRefreshToken = async (
  userId: string,
  sessionId: string,
  role: UserRole,
  hashedPublicKey: string
): Promise<{ token: string; hashedJti: string }> => {
  const expiration = getExpirationDate(role, Audience.Refresh);
  const expiresInRefresh = Math.floor(expiration.getTime() / 1000);

  const date = expiration.toISOString();

  const payload: RefreshTokenPayload = {
    sessionId,
    aud: Audience.Refresh,
    exp: expiresInRefresh,
  };

  return signToken(
    payload,
    {
      subject: userId,
      issuer: JWT_ISSUER,
      audience: payload.aud,
      expiresIn: payload.exp,
      secret: JWT_REFRESH_SECRET,
    },
    {
      performedBy: userId,
      sessionId,
      aud: JWT_AUDIENCE,
      jti: "",
      role,
      exp: date,
    },
    hashedPublicKey
  );
};
