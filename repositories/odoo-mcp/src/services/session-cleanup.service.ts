import { prisma } from "@/config/database";
import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Clean up zombie sessions in MongoDB that no longer have tokens in Redis
 *
 * A zombie session is one where:
 * - MongoDB has session record with isRevoked: false
 * - But Redis doesn't have the corresponding session token
 *
 * This happens when:
 * - Redis TTL expires naturally
 * - Redis is cleared/restarted
 * - User closes browser without logout (cookie lost)
 */
export async function cleanupZombieSessions(): Promise<{
  scanned: number;
  revoked: number;
  errors: number;
}> {
  const redis = await getRedisClient();

  try {
    // Get all active (non-revoked) sessions from MongoDB
    const activeSessions = await prisma.session.findMany({
      where: {
        isRevoked: false,
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
      },
    });

    logger.info(
      { totalSessions: activeSessions.length },
      "[Cleanup] Scanning active sessions"
    );

    const zombieSessions: string[] = [];
    let errors = 0;

    // Check each session: does its token exist in Redis?
    for (const session of activeSessions) {
      try {
        // We need to find if ANY Redis key maps to this sessionId
        // Pattern: session:* → sessionId
        const sessionKeys = await redis.keys("session:*");

        let foundInRedis = false;
        for (const key of sessionKeys) {
          const redisSessionId = await redis.get(key);
          if (redisSessionId === session.id) {
            foundInRedis = true;
            break;
          }
        }

        // If session exists in MongoDB but NOT in Redis → Zombie!
        if (!foundInRedis) {
          zombieSessions.push(session.id);
          logger.debug(
            { sessionId: session.id, userId: session.userId },
            "[Cleanup] Found zombie session"
          );
        }
      } catch (err) {
        logger.error(
          { err, sessionId: session.id },
          "[Cleanup] Error checking session"
        );
        errors++;
      }
    }

    // Revoke all zombie sessions
    if (zombieSessions.length > 0) {
      const result = await prisma.session.updateMany({
        where: {
          id: { in: zombieSessions },
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: "Automatic cleanup: session token expired in Redis",
        },
      });

      logger.info(
        { scanned: activeSessions.length, revoked: result.count },
        "[Cleanup] Zombie sessions cleaned up"
      );

      return {
        scanned: activeSessions.length,
        revoked: result.count,
        errors,
      };
    }

    logger.info(
      { scanned: activeSessions.length },
      "[Cleanup] No zombie sessions found"
    );

    return {
      scanned: activeSessions.length,
      revoked: 0,
      errors,
    };
  } catch (error) {
    logger.error({ err: error }, "[Cleanup] Failed to cleanup zombie sessions");
    throw error;
  }
}

/**
 * Schedule automatic cleanup every hour
 */
export function scheduleSessionCleanup() {
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  setInterval(async () => {
    try {
      await cleanupZombieSessions();
    } catch (error) {
      logger.error({ err: error }, "[Cleanup] Scheduled cleanup failed");
    }
  }, CLEANUP_INTERVAL);

  logger.info(
    { intervalMs: CLEANUP_INTERVAL },
    "[Cleanup] Session cleanup scheduled"
  );
}
