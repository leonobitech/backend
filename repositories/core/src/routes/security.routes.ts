// src/routes/security.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import authenticate from "@middlewares/authenticate";
import authorize from "@middlewares/authorize";
import { UserRole } from "@constants/userRole";
import { HTTP_CODE } from "@constants/httpCode";
import prisma from "@config/prisma";
import logger from "@utils/logging/logger";
import { logAttack } from "@utils/logging/logAttack";

const securityRoutes = Router();

// 🔐 TTL para clientMeta (20 minutos - un poco más que el access token de 15 min)
const CLIENT_META_TTL_MS = 20 * 60 * 1000;

/**
 * 🔐 Middleware para validar clientMeta en ForwardAuth requests
 * Verifica:
 * 1. sessionId en clientMeta coincide con la sesión autenticada
 * 2. createdAt no ha expirado (20 min TTL)
 */
const validateClientMeta = (req: Request, res: Response, next: NextFunction): void => {
  const meta = req.meta;

  // Si no hay meta o no tiene sessionId/createdAt, permitir (backward compatibility)
  // Esto se puede hacer más estricto después de que todos los clientes actualicen
  if (!meta?.sessionId || !meta?.createdAt) {
    logger.warn("⚠️ ForwardAuth: clientMeta sin sessionId/createdAt - permitiendo por compatibilidad", {
      path: req.path,
      hasSessionId: !!meta?.sessionId,
      hasCreatedAt: !!meta?.createdAt,
      event: "security.forwardauth.legacy_client",
    });
    next();
    return;
  }

  // 1️⃣ Validar que sessionId coincida
  if (meta.sessionId !== req.sessionId) {
    logger.warn("🚨 ForwardAuth: sessionId mismatch - posible robo de cookie", {
      metaSessionId: meta.sessionId,
      authSessionId: req.sessionId,
      ipAddress: meta.ipAddress,
      event: "security.forwardauth.session_mismatch",
    });

    // 🚨 Registrar intento de uso de cookie robada
    logAttack({
      type: "session_mismatch",
      severity: "high",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      path: req.path,
      method: req.method,
      host: req.hostname || meta.host,
      details: {
        metaSessionId: meta.sessionId,
        authSessionId: req.sessionId,
        deviceInfo: meta.deviceInfo,
      },
      attemptedUserId: req.userId,
      attemptedSessionId: req.sessionId,
    });

    res.status(HTTP_CODE.UNAUTHORIZED).send("❌ Session mismatch");
    return;
  }

  // 2️⃣ Validar que no haya expirado
  const age = Date.now() - meta.createdAt;
  if (age > CLIENT_META_TTL_MS) {
    logger.warn("🚨 ForwardAuth: clientMeta expirado", {
      createdAt: new Date(meta.createdAt).toISOString(),
      ageMs: age,
      maxAgeMs: CLIENT_META_TTL_MS,
      sessionId: req.sessionId,
      event: "security.forwardauth.meta_expired",
    });

    // 🚨 Registrar intento con cookie expirada (posible replay attack)
    logAttack({
      type: "expired_meta",
      severity: "medium",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      path: req.path,
      method: req.method,
      host: req.hostname || meta.host,
      details: {
        createdAt: new Date(meta.createdAt).toISOString(),
        ageMs: age,
        maxAgeMs: CLIENT_META_TTL_MS,
        sessionId: meta.sessionId,
      },
      attemptedUserId: req.userId,
      attemptedSessionId: req.sessionId,
    });

    res.status(HTTP_CODE.UNAUTHORIZED).send("❌ Session expired - please refresh");
    return;
  }

  logger.info("✅ ForwardAuth: clientMeta validado", {
    sessionId: req.sessionId,
    ageMs: age,
    event: "security.forwardauth.validated",
  });

  next();
};

securityRoutes.get("/verify-session", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true }
    });

    res.status(HTTP_CODE.OK).json({
      userId: req.userId,
      role: req.role,
      sessionId: req.sessionId,
      email: user?.email ?? null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 🔐 Endpoint utilizado por Traefik (ForwardAuth) para verificar que el usuario:
 * 1. Esté autenticado (accessKey + clientKey)
 * 2. Tenga rol de administrador
 * 3. clientMeta esté vinculado a la sesión y no haya expirado
 */
securityRoutes.get(
  "/verify-admin",
  authenticate,
  authorize(UserRole.Admin),
  validateClientMeta,
  (req, res) => {
    // Inyectar headers para Traefik
    res.setHeader("X-User-Id", req.userId);
    res.setHeader("X-User-Role", req.role);
    res.setHeader("X-Session-Id", req.sessionId);

    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

/**
 * 🔐 Endpoint utilizado por Traefik (ForwardAuth) para verificar que el usuario:
 * 1. Esté autenticado (accessKey + clientKey)
 * 2. clientMeta esté vinculado a la sesión y no haya expirado
 * 3. NO requiere ser administrador (solo autenticado)
 *
 * Usado por: odoo-mcp y otros microservicios que no requieren rol admin
 */
securityRoutes.get(
  "/verify-user",
  authenticate,
  validateClientMeta,
  (req, res) => {
    // Usuario autenticado → inyectar headers para Traefik
    res.setHeader("X-User-Id", req.userId);
    res.setHeader("X-User-Role", req.role);
    res.setHeader("X-Session-Id", req.sessionId);

    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

export default securityRoutes;
