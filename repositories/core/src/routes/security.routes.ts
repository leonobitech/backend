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
  (req, res, next) => {
    const accessKey = req.cookies?.accessKey;
    const clientKey = req.cookies?.clientKey;

    if (!accessKey || !clientKey) {
      res.status(401).send("Unauthorized");
      return; // ⛔ corta flujo
    }

    next(); // ✅ pasa al authenticate
  },
  authenticate,
  authorize(UserRole.Admin),
  (req, res) => {
    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

export default securityRoutes;
