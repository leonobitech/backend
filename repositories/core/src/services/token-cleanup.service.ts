import prisma from "@config/prisma";
import logger from "@utils/logging/logger";

/**
 * 🧹 Limpia tokens expirados de la base de datos
 *
 * Esto incluye:
 * - Access tokens revocados que ya pasaron su grace period
 * - Refresh tokens expirados
 * - Cualquier token con expiresAt en el pasado
 *
 * Se ejecuta cada 10 minutos para mantener la DB limpia
 */
export async function cleanupExpiredTokens(): Promise<{
  deleted: number;
}> {
  try {
    const now = new Date();

    logger.info(`🧹 [Cleanup] Starting token cleanup at ${now.toISOString()}`);

    // Primero ver cuántos tokens hay antes de limpiar
    const beforeCount = await prisma.tokenRecord.count();
    logger.info(`🧹 [Cleanup] Total tokens in DB before cleanup: ${beforeCount}`);

    // ⚠️ IMPORTANTE: NO borrar tokens recién expirados porque son necesarios para refresh
    // Solo borrar tokens que:
    // 1. Están revocados (revoked: true) Y ya pasaron su grace period
    // 2. O expiraron hace más de 1 hora (para dar tiempo al refresh flow)

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Obtener tokens que se van a borrar (para logging)
    const tokensToDelete = await prisma.tokenRecord.findMany({
      where: {
        OR: [
          // Tokens revocados que ya pasaron su grace period
          {
            revoked: true,
            expiresAt: {
              lt: now,
            },
          },
          // Tokens expirados hace más de 1 hora (no revocados)
          {
            revoked: false,
            expiresAt: {
              lt: oneHourAgo,
            },
          },
        ],
      },
      select: {
        id: true,
        type: true,
        jti: true,
        expiresAt: true,
        revoked: true,
      },
    });

    if (tokensToDelete.length > 0) {
      logger.info(`🧹 [Cleanup] Found ${tokensToDelete.length} tokens to delete:`);
      tokensToDelete.forEach(t => {
        const expiredAgo = Math.floor((now.getTime() - t.expiresAt.getTime()) / 1000 / 60);
        logger.info(`   - ${t.type} token (JTI: ${t.jti.substring(0, 16)}..., expires: ${t.expiresAt.toISOString()}, revoked: ${t.revoked}, expired ${expiredAgo} min ago)`);
      });
    }

    // Eliminar solo los tokens que cumplen las condiciones
    const result = await prisma.tokenRecord.deleteMany({
      where: {
        OR: [
          // Tokens revocados que ya pasaron su grace period
          {
            revoked: true,
            expiresAt: {
              lt: now,
            },
          },
          // Tokens expirados hace más de 1 hora (no revocados)
          {
            revoked: false,
            expiresAt: {
              lt: oneHourAgo,
            },
          },
        ],
      },
    });

    const afterCount = await prisma.tokenRecord.count();
    logger.info(`🧹 [Cleanup] Total tokens in DB after cleanup: ${afterCount}`);

    if (result.count > 0) {
      logger.info(
        `🧹 [Cleanup] Cleaned up ${result.count} token(s) from database`
      );
    } else {
      logger.info(`🧹 [Cleanup] No tokens to clean up`);
    }

    return {
      deleted: result.count,
    };
  } catch (error) {
    logger.error({ err: error }, "❌ Failed to cleanup expired tokens");
    throw error;
  }
}

/**
 * 🕐 Programa limpieza automática cada 10 minutos
 */
export function scheduleTokenCleanup() {
  const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutos

  // Ejecutar inmediatamente al inicio
  cleanupExpiredTokens().catch((error) => {
    logger.error({ err: error }, "❌ Initial token cleanup failed");
  });

  // Luego cada 10 minutos
  setInterval(async () => {
    try {
      await cleanupExpiredTokens();
    } catch (error) {
      logger.error({ err: error }, "❌ Scheduled token cleanup failed");
    }
  }, CLEANUP_INTERVAL);

  logger.info(
    { intervalMs: CLEANUP_INTERVAL },
    "✅ Token cleanup scheduled"
  );
}
