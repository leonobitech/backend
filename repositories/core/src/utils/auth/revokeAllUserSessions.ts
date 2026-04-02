import prisma from "@config/prisma";
import { revokeAccessToken } from "@utils/auth/tokenRedis";
import { loggerAudit } from "@utils/logging/loggerAudit";
import { TokenType } from "@prisma/client";
import logger from "@utils/logging/logger";

/**
 * Revoca TODAS las sesiones activas de un usuario.
 * - Revoca access tokens en Redis
 * - Revoca/elimina token records en DB
 * - Marca sesiones como revocadas
 *
 * Se usa para enforcar sesión única: al crear una nueva sesión,
 * primero se revocan todas las anteriores.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const activeSessions = await prisma.session.findMany({
    where: {
      userId,
      isRevoked: false,
    },
  });

  if (activeSessions.length === 0) return 0;

  const sessionIds = activeSessions.map((s) => s.id);

  // 1. Revocar tokens en Redis y DB
  const tokenRecords = await prisma.tokenRecord.findMany({
    where: {
      sessionId: { in: sessionIds },
      revoked: false,
    },
  });

  for (const token of tokenRecords) {
    if (token.type === TokenType.ACCESS) {
      await revokeAccessToken(token.jti);
      await prisma.tokenRecord.deleteMany({
        where: { jti: token.jti, userId },
      });
    } else {
      await prisma.tokenRecord.updateMany({
        where: { jti: token.jti, userId },
        data: { revoked: true },
      });
    }
  }

  // 2. Revocar sesiones
  await prisma.session.updateMany({
    where: {
      id: { in: sessionIds },
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      lastUsedAt: new Date(),
    },
  });

  // 3. Auditoría
  await loggerAudit("user.all_sessions_revoked", {
    performedBy: userId,
    revokedSessions: sessionIds,
    totalRevoked: sessionIds.length,
  });

  logger.info(`🔒 Revoked ${sessionIds.length} sessions for user ${userId}`);

  return sessionIds.length;
}
