import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { ensureRedisConnection } from "@/lib/redis";
import { testDatabaseConnection } from "@/config/database";
import { initializeTools } from "@/tools/init";
import { healthRouter } from "@/routes/health";
import { mcpHttpRouter } from "@/routes/mcp-http";
import { oauthRouter } from "@/routes/oauth";
import { wellKnownRouter } from "@/routes/well-known";
import { authRouter } from "@/routes/auth";
import { consentRouter } from "@/routes/consent";
import { optionalAuth } from "@/middlewares/session.middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", true);

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      headers: {
        host: req.headers.host,
        "user-agent": req.headers["user-agent"],
        accept: req.headers.accept,
        "content-type": req.headers["content-type"]
      }
    },
    "incoming request"
  );
  next();
});

// Security headers
app.use(helmet());

// CORS configuration
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : [env.PUBLIC_URL],
    credentials: true
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Cookie parsing (for session management)
app.use(cookieParser());

// Apply optional auth middleware globally (attaches session if exists)
// This makes req.session available in OAuth routes
app.use(optionalAuth);

// Static files (for login/register pages)
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/healthz", healthRouter);
app.use("/.well-known", wellKnownRouter);
app.use("/auth", authRouter);
app.use("/oauth/consent", consentRouter);
app.use("/oauth", oauthRouter);
app.use("/mcp", mcpHttpRouter);

// Serve HTML pages
app.get("/register", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/register.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

// Redirect root to register
app.get("/", (_req, res) => {
  res.redirect("/register");
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  // Test database connection
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    logger.fatal("Database connection failed - cannot start server");
    process.exit(1);
  }

  // Initialize Redis connection
  await ensureRedisConnection();

  // Initialize and register all tools
  await initializeTools();
  logger.info("[odoo-mcp] All tools registered");

  // Start HTTP server
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "[odoo-mcp] MCP server with authentication ready");
  });
}

start().catch((err) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
