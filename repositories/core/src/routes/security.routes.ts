// src/routes/security.routes.ts
import { Router } from "express";
import authenticate from "@middlewares/authenticate";
import authorize from "@middlewares/authorize";
import { UserRole } from "@constants/userRole";
import { HTTP_CODE } from "@constants/httpCode";

const securityRoutes = Router();

/**
 * 🔐 Endpoint utilizado por Traefik (ForwardAuth) para verificar que el usuario:
 * 1. Esté autenticado (accessKey + clientKey)
 * 2. Tenga rol de administrador
 */
securityRoutes.get(
  "/verify-admin",
  // 🐞 Debug básico
  (req, res, next) => {
    console.log("=== DEBUG /security/verify-admin ===");
    console.log("Headers:", {
      cookie: req.headers.cookie,
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
    });
    next();
  },
  authenticate,
  authorize(UserRole.Admin),
  (req, res) => {
    console.log("→ DEBUG: Usuario autenticado y autorizado como admin ✅");
    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

export default securityRoutes;
