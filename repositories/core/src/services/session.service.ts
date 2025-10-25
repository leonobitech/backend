import prisma from "@config/prisma";
import { ERROR_CODE } from "@constants/errorCode";
import { SupportedLang } from "@constants/errorMessages";
import { HTTP_CODE } from "@constants/httpCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import appAssert from "@utils/validation/appAssert";
import {
  GetUserSessionsParams,
  GetUserSessionsResponse,
  RevokeSessionByIdParams,
  RevokeSessionResponse,
  RevokeAllOtherSessionsParams,
  RevokeOthersResponse,
  SessionInfo,
} from "@custom-types/modules/auth/session";
import { loggerSecurityEvent } from "@utils/logging/loggerSecurityEvent";

/**
 * 🔍 Obtener todas las sesiones activas del usuario
 */
export const getUserSessions = async (
  params: GetUserSessionsParams
): Promise<GetUserSessionsResponse> => {
  const { userId, currentSessionId } = params;

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    include: { device: true },
    orderBy: { createdAt: "desc" },
  });

  const sessionsWithFlag: SessionInfo[] = sessions.map((session) => ({
    id: session.id,
    device: {
      device: session.device.device,
      browser: session.device.browser,
      os: session.device.os,
      ipAddress: session.device.ipAddress,
      timezone: session.device.timezone,
    },
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt?.toISOString() || "",
    expiresAt: session.expiresAt.toISOString(),
    isCurrent: session.id === currentSessionId,
  }));

  return {
    status: "success",
    message: "Sesiones activas obtenidas con éxito.",
    sessions: sessionsWithFlag,
    totalDevices: sessionsWithFlag.length,
    activeDevices: sessionsWithFlag.filter((s) => !s.isCurrent).length,
  };
};

/**
 * ❌ Revocar una sesión específica (por ID)
 */
export const revokeUserSessionById = async (
  params: RevokeSessionByIdParams & { meta: RequestMeta },
  lang: SupportedLang
): Promise<RevokeSessionResponse> => {
  const session = await prisma.session.findFirst({
    where: {
      id: params.sessionId,
      userId: params.userId,
      isRevoked: false,
    },
  });

  appAssert(
    session,
    HTTP_CODE.NOT_FOUND,
    getErrorMessage("SESSION_NOT_FOUND", lang),
    ERROR_CODE.SESSION_NOT_FOUND
  );

  await prisma.session.update({
    where: { id: session.id },
    data: {
      isRevoked: true,
      expiresAt: new Date(),
    },
  });

  await prisma.tokenRecord.updateMany({
    where: {
      sessionId: session.id,
      userId: session.userId,
      revoked: false,
    },
    data: { revoked: true },
  });

  await loggerSecurityEvent({
    meta: params.meta,
    type: "session.revoked.manual",
    userId: session.userId,
    sessionId: session.id,
    details: {
      reason: "Manual session revocation by user",
    },
  });

  return {
    status: "success",
    message: "Sesión cerrada correctamente.",
    sessionId: session.id,
  };
};

/**
 * 🔐 Revocar todas las sesiones excepto la actual
 */
export const revokeAllUserSessionsExceptCurrent = async ({
  userId,
  currentSessionId,
}: RevokeAllOtherSessionsParams): Promise<RevokeOthersResponse> => {
  const { count } = await prisma.session.updateMany({
    where: {
      userId,
      id: { not: currentSessionId },
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      expiresAt: new Date(),
    },
  });

  await prisma.tokenRecord.updateMany({
    where: {
      userId,
      sessionId: { not: currentSessionId },
      revoked: false,
    },
    data: { revoked: true },
  });

  return {
    status: "success",
    message: "Todas las sesiones excepto la actual fueron revocadas.",
    deletedCount: count,
  };
};
