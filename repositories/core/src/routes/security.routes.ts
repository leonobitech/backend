// src/routes/security.routes.ts
import { Router } from "express";
import authenticate from "@middlewares/authenticate";
import authorize from "@middlewares/authorize";
import { UserRole } from "@constants/userRole";
import { HTTP_CODE } from "@constants/httpCode";
import prisma from "@config/prisma";

const securityRoutes = Router();

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
 */
securityRoutes.get(
  "/verify-admin",
  (req, res, next) => {
    // 🐞 Debug básico
    /* console.log("=== DEBUG HEADERS /security/verify-admin ===");
    console.log({
      method: req.method,
      path: req.originalUrl,
      cookies: req.headers.cookie,
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
      "x-forwarded-for": req.headers["x-forwarded-for"],
      ip: req.ip,
    });
     */

    next();
  },
  authenticate,
  authorize(UserRole.Admin),
  (req, res) => {
    //console.log("→ DEBUG: Usuario autenticado y autorizado como admin ✅");

    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

/**
 * 🔐 Endpoint utilizado por Traefik (ForwardAuth) para verificar que el usuario:
 * 1. Esté autenticado (accessKey + clientKey)
 * 2. NO requiere ser administrador (solo autenticado)
 *
 * Usado por: odoo-mcp y otros microservicios que no requieren rol admin
 */
securityRoutes.get(
  "/verify-user",
  authenticate,
  (req, res) => {
    // Usuario autenticado → inyectar headers para Traefik
    res.setHeader("X-User-Id", req.userId);
    res.setHeader("X-User-Role", req.role);
    res.setHeader("X-Session-Id", req.sessionId);

    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

export default securityRoutes;
