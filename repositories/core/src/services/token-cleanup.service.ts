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

    // Eliminar todos los tokens (ACCESS y REFRESH) que ya expiraron
    const result = await prisma.tokenRecord.deleteMany({
      where: {
        expiresAt: {
          lt: now, // Menor que ahora = expirado
        },
      },
    });

    if (result.count > 0) {
      logger.info(
        `🧹 Cleaned up ${result.count} expired token(s) from database`
      );
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
