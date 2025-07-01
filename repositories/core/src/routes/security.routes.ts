// src/routes/security.routes.ts
import { Router } from "express";
import authenticate from "@middlewares/authenticate";
import authorize from "@middlewares/authorize";
import { UserRole } from "@constants/userRole";
import { HTTP_CODE } from "@constants/httpCode";
import { appendForwardedHeaders } from "@utils/http/forwardHeaders";
import { Request, Response } from "express";

const securityRoutes = Router();

/**
 * 🔐 Endpoint utilizado por Traefik (ForwardAuth) para verificar que el usuario:
 * 1. Esté autenticado (accessKey + clientKey)
 * 2. Tenga rol de administrador
 */
securityRoutes.get(
  "/verify-admin",
  (req, res, next) => {
    // 🐞 Debug básico 🐞
    appendForwardedHeaders(req, res);
    console.log("=== DEBUG HEADERS /security/verify-admin ===");
    console.log({
      method: req.method,
      path: req.originalUrl,
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "cf-connecting-ip": req.headers["cf-connecting-ip"],
      ip: req.ip,
      "x-real-ip": req.headers["x-real-ip"],
      "x-forwarded-proto": req.headers["x-forwarded-proto"],
      "x-forwarded-host": req.headers["x-forwarded-host"],
      "x-forwarded-port": req.headers["x-forwarded-port"],
      "x-forwarded-scheme": req.headers["x-forwarded-scheme"],
      "x-forwarded-client-cert": req.headers["x-forwarded-client-cert"],
      "x-forwarded-for-raw": req.headers["x-forwarded-for-raw"],
      "x-forwarded-client-ip": req.headers["x-forwarded-client-ip"],
      "x-forwarded-user-id": req.headers["x-user-id"],
      "x-forwarded-user-role": req.headers["x-user-role"],
      "x-forwarded-session-id": req.headers["x-session-id"],
      "x-forwarded-access-key": req.headers["x-access-key"],
      "x-forwarded-client-key": req.headers["x-client-key"],
      "x-forwarded-client-meta": req.headers["x-client-meta"],
    });

    next();
  },
  authenticate,
  authorize(UserRole.Admin),
  (req, res) => {
    //console.log("→ DEBUG: Usuario autenticado y autorizado como admin ✅");

    // 🔁 Reinyectamos headers para Traefik
    appendForwardedHeaders(req, res);
    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

export default securityRoutes;

/* securityRoutes.get(
  "/verify-admin",
  (req, res, next) => {
    // 🐞 Debug básico
    console.log("=== DEBUG HEADERS /security/verify-admin ===");
    console.log({
      method: req.method,
      path: req.originalUrl,
      cookies: req.headers.cookie,
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
      "x-forwarded-for": req.headers["x-forwarded-for"],
      ip: req.ip,
    });

    next();
  },
  authenticate,
  authorize(UserRole.Admin),
  (req, res) => {
    console.log("→ DEBUG: Usuario autenticado y autorizado como admin ✅");

    // 🔁 Reinyectamos headers para Traefik
    appendForwardedHeaders(req, res);
    res.status(HTTP_CODE.OK).send("✅ OK");
  }
);

export default securityRoutes; */
