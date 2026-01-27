// utils/logging/logAttack.ts
import prisma from "@config/prisma";
import logger from "./logger";

export type AttackType =
  | "missing_cookies"
  | "session_mismatch"
  | "expired_meta"
  | "invalid_token"
  | "invalid_signature"
  | "token_revoked"
  | "unauthorized_access"
  | "brute_force";

export type AttackSeverity = "low" | "medium" | "high" | "critical";

interface AttackLogParams {
  type: AttackType;
  severity?: AttackSeverity;
  ipAddress: string;
  userAgent: string;
  path: string;
  method: string;
  host: string;
  details?: Record<string, any>;
  blocked?: boolean;
  attemptedUserId?: string;
  attemptedSessionId?: string;
}

/**
 * 🚨 Registra intentos de acceso no autorizados en la base de datos.
 * Usado para: cookies faltantes, tokens robados, sesiones expiradas, etc.
 */
export const logAttack = async (params: AttackLogParams): Promise<void> => {
  const {
    type,
    severity = "medium",
    ipAddress,
    userAgent,
    path,
    method,
    host,
    details,
    blocked = true,
    attemptedUserId,
    attemptedSessionId,
  } = params;

  // 1. Log inmediato a consola con alerta visual
  const severityEmoji = {
    low: "⚠️",
    medium: "🔶",
    high: "🔴",
    critical: "🚨💀",
  };

  logger.warn(`${severityEmoji[severity]} ATAQUE DETECTADO: ${type}`, {
    severity,
    ipAddress,
    userAgent,
    path,
    method,
    host,
    blocked,
    attemptedUserId,
    attemptedSessionId,
    details,
    event: "security.attack.detected",
  });

  // 2. Persistir en DB para análisis posterior
  try {
    await prisma.attackLog.create({
      data: {
        type,
        severity,
        ipAddress,
        userAgent,
        path,
        method,
        host,
        details: details ? JSON.stringify(details) : undefined,
        blocked,
        attemptedUserId,
        attemptedSessionId,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    console.error("❌ Error al registrar AttackLog:", err);
  }
};

/**
 * 🔍 Helper para extraer info de request para logging
 */
export const extractAttackInfo = (req: {
  ip?: string;
  headers?: Record<string, any>;
  path?: string;
  originalUrl?: string;
  method?: string;
  hostname?: string;
  meta?: { ipAddress?: string };
}) => ({
  ipAddress: req.meta?.ipAddress || req.ip || req.headers?.["x-real-ip"] || req.headers?.["x-forwarded-for"] || "unknown",
  userAgent: req.headers?.["user-agent"] || "unknown",
  path: req.originalUrl || req.path || "/",
  method: req.method || "GET",
  host: req.hostname || req.headers?.host || "unknown",
});
