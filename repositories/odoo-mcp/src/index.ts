import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { ensureRedisConnection, getRedisClient } from "@/lib/redis";
import { testDatabaseConnection } from "@/config/database";
import { initializeTools } from "@/tools/init";
import { healthRouter } from "@/routes/health";
import { mcpHttpRouter } from "@/routes/mcp-http";
import { oauthRouter } from "@/routes/oauth";
import { wellKnownRouter } from "@/routes/well-known";
import { authRouter } from "@/routes/auth";
import { consentRouter } from "@/routes/consent";
import { optionalAuth } from "@/middlewares/session.middleware";
import { scheduleSessionCleanup, cleanupZombieSessions } from "@/services/session-cleanup.service";

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

// Security headers - disable CSP for UI pages to avoid blocking styles/scripts
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP to allow UI pages to work properly
  })
);

// Override Cloudflare CSP for UI routes
app.use((req, res, next) => {
  if (req.path === '/register' || req.path === '/login' || req.path === '/' || req.path.startsWith('/styles') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';");
  }
  next();
});

// CORS configuration
// Required origins:
// - claude.ai, app.claude.ai, desktop.claude.ai → Claude Desktop OAuth flow
// - odoo-mcp.leonobitech.com → Self-origin for UI
// - leonobitech.com → Frontend needs to fetch /auth/status for OdooMcpConnector component
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

// Serve HTML pages with session check
app.get("/register", async (req, res) => {
  // Check if user already has active session
  const sessionToken = req.cookies[env.SESSION_COOKIE_NAME];

  if (sessionToken) {
    const redis = await getRedisClient();
    const sessionId = await redis.get(`session:${sessionToken}`);

    if (sessionId) {
      // User already has session, redirect to login page (which shows status)
      return res.redirect("/login");
    }
  }

  res.sendFile(path.join(__dirname, "../public/register.html"));
});

app.get("/login", async (req, res) => {
  // Always serve login page (it will show session status or login form)
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

// Redirect root to login (which will handle session detection)
app.get("/", (_req, res) => {
  res.redirect("/login");
});

// Debug: Show ALL headers to understand IP detection
app.get("/debug/all-headers", (req, res) => {
  res.json({
    message: "Complete Headers Debug",
    headers: req.headers,
    connection: {
      remoteAddress: req.socket.remoteAddress,
      remotePort: req.socket.remotePort,
      localAddress: req.socket.localAddress,
    },
    expressIp: req.ip,
    expressIps: req.ips,
  });
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

  // Clean up zombie sessions on startup
  logger.info("[Cleanup] Running initial zombie session cleanup...");
  await cleanupZombieSessions();

  // Schedule automatic cleanup every hour
  scheduleSessionCleanup();

  // Start HTTP server
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "[odoo-mcp] MCP server with authentication ready");
  });
}

start().catch((err) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
