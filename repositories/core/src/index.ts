import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

import "dotenv/config";
import { NODE_ENV, PORT, API_ORIGIN, APP_ORIGIN } from "@config/env";
import express from "express";
import { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { redis } from "@config/redis";
redis.once;

// constants
import { HTTP_CODE } from "@constants/httpCode";
import { UserRole } from "@constants/userRole";

// middleware
import authenticate from "@middlewares/authenticate";
import errorHandler from "@middlewares/errorHandler";
import authorize from "@middlewares/authorize";
import { requestMeta } from "@middlewares/requestMeta";
import { detectLanguage } from "@middlewares/detectLanguage";
import { globalRateLimiter, adminRateLimiter } from "@middlewares/rateLimiter";

// routes
import accountRoutes from "@routes/account.routes";
import sessionRoutes from "@routes/session.routes";
import userRoutes from "@routes/user.routes";
import adminRouter from "@routes/admin.routes";
import passkeyRoutes from "@routes/passkey.routes";
import serviceRoutes from "@routes/service.routes";

// test route for error handling
import testRouter from "@routes/test.routes";

// Test para los type@
import devDebugRoutes from "@routes/devDebug.routes";
import { testHandler } from "@test/test";
import cleanCookies from "@middlewares/cleanCookies";
import { apiKeyGuard } from "@middlewares/apiKey";
import securityRoutes from "@routes/security.routes";

const app: Application = express();

// 🔐 Necesario para Traefik o NGINX
app.set("trust proxy", true);

// parse application/json
app.use(express.json());

// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// enable cors
app.use(
  cors({
    origin: APP_ORIGIN, // allow to server to accept request from different origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], // allow to server to accept request from different method
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID",
      "Idempotency-Key",
      "x-core-access-key"
    ], // FIXED: was malformed string, now proper array
    credentials: true, // allow session cookie from browser to pass through
    maxAge: 86400, // Cache preflight requests for 24 hours
  })
);
// enable req.cookies.
app.use(cookieParser());

// 🔍 Middleware de cookies
app.use(cleanCookies);

// Middleware global (si querés en toda la API)
app.use(requestMeta);

// 🛡️ Rate limiting global (100 req/min por IP)
app.use(globalRateLimiter);

// initialize the app
app.get("/", (req, res) => {
  res.status(HTTP_CODE.OK).json({
    service: "core",
    status: "running",
    version: "1.0.0",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// 🩺 health check
app.get("/health", (req, res) => {
  res.status(HTTP_CODE.OK).json({
    status: "healthy",
    service: "core",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 🧪 Debug Test for types
app.get("/test-types", testHandler);

// 🚨 add  error's handler middleware
if (NODE_ENV === "development") {
  app.use("/dev", authenticate, detectLanguage, devDebugRoutes);
}

// 🔐 Endpoint usado por Traefik para permitir ver Dashboard de n8n y odoo
app.use("/security", securityRoutes);

// ✅ Rutas públicas de passkey (ANTES del apiKeyGuard para permitir login sin API key)
app.use("/account/passkey", passkeyRoutes); // Passkey routes (mixed auth)

// 🛡️ Aplicar X-API-KEY solo a rutas sensibles
app.use(apiKeyGuard); // <–– desde acá para abajo requieren la clave

// 🔑 Service-to-service OAuth style tokens (sin auth)
app.use("/service/token", serviceRoutes);

// 🔐 User services (requiere authenticate pero NO admin)
app.use("/service", authenticate, serviceRoutes);

// Usar las rutas de account
app.use("/account", accountRoutes);

// 🔐 Auth & protected routes
app.use("/account", authenticate, userRoutes);
app.use("/account/sessions", authenticate, sessionRoutes);
app.use("/admin", authenticate, authorize(UserRole.Admin), adminRateLimiter, adminRouter);

// Test route for error handling
app.use("/api", testRouter);

// Error handling middleware
app.use(errorHandler);

// 🚀 Bootstrap controlado
app.listen(PORT, async () => {
  console.log(`Server listening on ${API_ORIGIN} in ${NODE_ENV} environment`);
});
