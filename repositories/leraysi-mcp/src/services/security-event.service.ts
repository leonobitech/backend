import { prisma } from "@/config/database";
import { logger } from "@/lib/logger";

/**
 * Security Event Logging Service
 * Tracks authentication events, suspicious activity, and audit trail
 */

export type SecurityEventType =
  // Authentication events
  | "user.registered"
  | "user.login.success"
  | "user.login.failed"
  | "user.logout"
  | "user.password.changed"
  // OAuth events
  | "oauth.consent.granted"
  | "oauth.consent.denied"
  | "oauth.consent.revoked"
  | "oauth.token.issued"
  | "oauth.token.refreshed"
  | "oauth.token.revoked"
  | "oauth.tokens_revoked_all"
  // Session events
  | "session.created"
  | "session.expired"
  | "session.revoked"
  | "session.device_changed"
  // Security events
  | "security.rate_limit_exceeded"
  | "security.invalid_token"
  | "security.suspicious_activity"
  | "security.account_locked";

export type SecurityEventSeverity = "info" | "warning" | "critical";

export interface LogSecurityEventParams {
  userId?: string;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}

/**
 * Log a security event to database and logger
 */
export async function logSecurityEvent(
  params: LogSecurityEventParams
): Promise<void> {
  const { userId, eventType, severity, ipAddress, userAgent, metadata } =
    params;

  try {
    // Store in database for audit trail
    await prisma.securityEvent.create({
      data: {
        userId: userId || null,
        eventType,
        severity,
        ipAddress,
        userAgent,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // Also log to application logger
    const logData = {
      userId,
      eventType,
      ipAddress,
      userAgent,
      ...metadata,
    };

    switch (severity) {
      case "critical":
        logger.error(logData, `Security event: ${eventType}`);
        break;
      case "warning":
        logger.warn(logData, `Security event: ${eventType}`);
        break;
      default:
        logger.info(logData, `Security event: ${eventType}`);
    }
  } catch (error) {
    logger.error(
      { err: error, eventType },
      "Failed to log security event"
    );
  }
}

/**
 * Get recent security events for a user
 */
export async function getUserSecurityEvents(
  userId: string,
  limit: number = 50
) {
  return prisma.securityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get suspicious activity (multiple failed logins, etc.)
 */
export async function getSuspiciousActivity(
  ipAddress: string,
  eventType: SecurityEventType,
  windowMinutes: number = 15
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const count = await prisma.securityEvent.count({
    where: {
      ipAddress,
      eventType,
      createdAt: { gte: since },
    },
  });

  return count;
}

/**
 * Check if an IP is rate limited based on security events
 */
export async function isRateLimited(
  ipAddress: string,
  eventType: SecurityEventType,
  maxAttempts: number,
  windowMinutes: number
): Promise<boolean> {
  const attempts = await getSuspiciousActivity(
    ipAddress,
    eventType,
    windowMinutes
  );
  return attempts >= maxAttempts;
}

/**
 * Clean up old security events (for GDPR compliance and database maintenance)
 */
export async function cleanupOldSecurityEvents(retentionDays: number = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.securityEvent.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
      severity: { not: "critical" }, // Keep critical events indefinitely
    },
  });

  logger.info(
    { deletedCount: result.count, retentionDays },
    "Cleaned up old security events"
  );

  return result.count;
}
