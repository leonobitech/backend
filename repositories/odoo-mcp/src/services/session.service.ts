import { prisma } from "@/config/database";
import { getRedisClient } from "@/config/redis";
import { env } from "@/config/env";
import { generateDeviceFingerprint, generateSecureToken } from "@/lib/security";
import { logger } from "@/lib/logger";
import { logSecurityEvent } from "./security-event.service";

/**
 * Session Management Service
 * Handles creation, validation, and revocation of user sessions
 */

export interface CreateSessionParams {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

export interface SessionData {
  id: string;
  userId: string;
  deviceFingerprint: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Create a new session for a user
 */
export async function createSession(
  params: CreateSessionParams
): Promise<{ sessionId: string; sessionToken: string }> {
  const { userId, ipAddress, userAgent } = params;

  // Generate device fingerprint
  const deviceFingerprint = generateDeviceFingerprint(
    ipAddress,
    userAgent,
    userId
  );

  // Calculate expiration
  const expiresAt = new Date(Date.now() + env.SESSION_TTL * 1000);

  // Create session in database
  const session = await prisma.session.create({
    data: {
      userId,
      deviceFingerprint,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  // Generate session token (random string)
  const sessionToken = generateSecureToken(32);

  // Store session token in Redis pointing to session ID
  const redis = await getRedisClient();
  await redis.setex(
    `session:${sessionToken}`,
    env.SESSION_TTL,
    session.id
  );

  logger.info(
    { sessionId: session.id, userId, deviceFingerprint },
    "Session created"
  );

  // Log security event
  await logSecurityEvent({
    userId,
    eventType: "session.created",
    severity: "info",
    ipAddress,
    userAgent,
    metadata: { sessionId: session.id },
  });

  return {
    sessionId: session.id,
    sessionToken,
  };
}

/**
 * Validate a session token and return session data
 */
export async function validateSession(
  sessionToken: string,
  ipAddress: string,
  userAgent: string
): Promise<SessionData | null> {
  try {
    // Get session ID from Redis
    const redis = await getRedisClient();
    const sessionId = await redis.get(`session:${sessionToken}`);

    if (!sessionId) {
      return null;
    }

    // Get session from database
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) {
      // Session not found in DB, clean up Redis
      await redis.del(`session:${sessionToken}`);
      return null;
    }

    // Check if session is revoked
    if (session.isRevoked) {
      await redis.del(`session:${sessionToken}`);
      return null;
    }

    // Check if session expired
    if (session.expiresAt < new Date()) {
      await revokeSession(sessionId, "Session expired");
      return null;
    }

    // Validate device fingerprint
    const expectedFingerprint = generateDeviceFingerprint(
      ipAddress,
      userAgent,
      session.userId
    );

    if (session.deviceFingerprint !== expectedFingerprint) {
      // Device changed - potential session hijacking
      await logSecurityEvent({
        userId: session.userId,
        eventType: "session.device_changed",
        severity: "warning",
        ipAddress,
        userAgent,
        metadata: {
          sessionId: session.id,
          originalIp: session.ipAddress,
          originalUserAgent: session.userAgent,
        },
      });

      // Revoke session for security
      await revokeSession(sessionId, "Device fingerprint mismatch");
      return null;
    }

    // Update last used time
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: session.id,
      userId: session.userId,
      deviceFingerprint: session.deviceFingerprint,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastUsedAt: new Date(),
    };
  } catch (error) {
    logger.error({ err: error }, "Error validating session");
    return null;
  }
}

/**
 * Revoke a session
 */
export async function revokeSession(
  sessionId: string,
  reason: string = "User logout"
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return;
  }

  // Mark as revoked in database
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokeReason: reason,
    },
  });

  // Remove from Redis (we don't know the token, so we can't delete it directly)
  // It will expire naturally based on TTL

  logger.info({ sessionId, reason }, "Session revoked");

  await logSecurityEvent({
    userId: session.userId,
    eventType: "session.revoked",
    severity: "info",
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    metadata: { sessionId, reason },
  });
}

/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string
): Promise<number> {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      isRevoked: false,
      id: exceptSessionId ? { not: exceptSessionId } : undefined,
    },
  });

  for (const session of sessions) {
    await revokeSession(session.id, "All sessions revoked by user");
  }

  return sessions.length;
}

/**
 * Get active sessions for a user
 */
export async function getUserActiveSessions(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastUsedAt: "desc" },
  });
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokeReason: "Session expired",
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, "Cleaned up expired sessions");
  }

  return result.count;
}
