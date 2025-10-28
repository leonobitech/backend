import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/config/database";
import { env } from "@/config/env";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  validateEmail,
  sanitizeInput,
  extractIpAddress,
  extractUserAgent,
} from "@/lib/security";
import {
  encryptOdooCredentials,
  decryptOdooCredentials,
} from "@/lib/encryption";
import { validateOdooCredentials } from "@/services/odoo.service";
import { createSession, revokeSession, revokeAllUserSessions, getUserActiveSessions } from "@/services/session.service";
import { logSecurityEvent, isRateLimited } from "@/services/security-event.service";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis";

export const authRouter = Router();

/**
 * Register schema - validates user registration data
 */
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  odoo: z.object({
    url: z.string().url(),
    db: z.string().min(1),
    username: z.string().min(1),
    apiKey: z.string().min(1),
  }),
});

/**
 * POST /auth/register
 * Register a new user with Odoo credentials
 */
authRouter.post("/register", async (req, res) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);

  try {
    // Rate limiting check
    const rateLimited = await isRateLimited(
      ipAddress,
      "user.registered",
      3, // Max 3 registrations
      60 // per hour
    );

    if (rateLimited) {
      await logSecurityEvent({
        eventType: "security.rate_limit_exceeded",
        severity: "warning",
        ipAddress,
        userAgent,
        metadata: { endpoint: "/auth/register" },
      });

      return res.status(429).json({
        error: "too_many_requests",
        message: "Too many registration attempts. Please try again later.",
      });
    }

    // Validate request body
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "invalid_request",
        details: parseResult.error.flatten(),
      });
    }

    const { email, password, name, odoo } = parseResult.data;

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Invalid email format",
      });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({
        error: "weak_password",
        message: passwordError,
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        error: "user_exists",
        message: "User with this email already exists",
      });
    }

    // Validate Odoo credentials
    logger.info({ email, odooUrl: odoo.url, odooDb: odoo.db }, "Validating Odoo credentials...");

    const odooValidation = await validateOdooCredentials({
      url: odoo.url,
      db: odoo.db,
      username: odoo.username,
      apiKey: odoo.apiKey,
    });

    if (!odooValidation.success) {
      await logSecurityEvent({
        eventType: "user.login.failed",
        severity: "warning",
        ipAddress,
        userAgent,
        metadata: { email, reason: "Invalid Odoo credentials" },
      });

      return res.status(400).json({
        error: "invalid_odoo_credentials",
        message: odooValidation.error || "Failed to validate Odoo credentials",
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Encrypt Odoo credentials
    const encryptedOdoo = encryptOdooCredentials({
      url: odoo.url,
      db: odoo.db,
      username: odoo.username,
      apiKey: odoo.apiKey,
    });

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: sanitizeInput(name || ""),
        ...encryptedOdoo,
        isActive: true,
        emailVerified: true, // Auto-verify for now, can implement email verification later
      },
    });

    logger.info({ userId: user.id, email: user.email }, "User registered successfully");

    // Log security event
    await logSecurityEvent({
      userId: user.id,
      eventType: "user.registered",
      severity: "info",
      ipAddress,
      userAgent,
      metadata: { odooUrl: odoo.url, odooDb: odoo.db },
    });

    // No auto-login - user must login after registration
    return res.status(201).json({
      success: true,
      message: "Registration successful. Please login to continue.",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Registration error");
    return res.status(500).json({
      error: "internal_error",
      message: "An error occurred during registration",
    });
  }
});

/**
 * Login schema
 */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /auth/login
 * Login with email and password
 */
authRouter.post("/login", async (req, res) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);

  try {
    // Rate limiting check
    const rateLimited = await isRateLimited(
      ipAddress,
      "user.login.failed",
      5, // Max 5 failed attempts
      15 // per 15 minutes
    );

    if (rateLimited) {
      await logSecurityEvent({
        eventType: "security.rate_limit_exceeded",
        severity: "critical",
        ipAddress,
        userAgent,
        metadata: { endpoint: "/auth/login" },
      });

      return res.status(429).json({
        error: "too_many_requests",
        message: "Too many login attempts. Please try again later.",
      });
    }

    // Validate request body
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "invalid_request",
        details: parseResult.error.flatten(),
      });
    }

    const { email, password } = parseResult.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Log failed login attempt
      await logSecurityEvent({
        eventType: "user.login.failed",
        severity: "warning",
        ipAddress,
        userAgent,
        metadata: { email, reason: "User not found" },
      });

      return res.status(401).json({
        error: "invalid_credentials",
        message: "Invalid email or password",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      await logSecurityEvent({
        userId: user.id,
        eventType: "user.login.failed",
        severity: "warning",
        ipAddress,
        userAgent,
        metadata: { reason: "Account inactive" },
      });

      return res.status(403).json({
        error: "account_inactive",
        message: "Your account has been deactivated",
      });
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await logSecurityEvent({
        userId: user.id,
        eventType: "user.login.failed",
        severity: "warning",
        ipAddress,
        userAgent,
        metadata: { reason: "Invalid password" },
      });

      return res.status(401).json({
        error: "invalid_credentials",
        message: "Invalid email or password",
      });
    }

    // Create session
    const { sessionToken } = await createSession({
      userId: user.id,
      ipAddress,
      userAgent,
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log successful login
    await logSecurityEvent({
      userId: user.id,
      eventType: "user.login.success",
      severity: "info",
      ipAddress,
      userAgent,
      metadata: { sessionId: sessionToken, endpoint: "/auth/login" },
    });

    // Set session cookie
    res.cookie(env.SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: ".leonobitech.com",
      maxAge: env.SESSION_TTL * 1000,
      path: "/",
    });

    logger.info({ userId: user.id, email: user.email }, "User logged in successfully");

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Login error");
    return res.status(500).json({
      error: "internal_error",
      message: "An error occurred during login",
    });
  }
});

/**
 * POST /auth/logout
 * Logout and revoke current session
 */
authRouter.post("/logout", async (req, res) => {
  try {
    const sessionToken = req.cookies[env.SESSION_COOKIE_NAME];
    if (!sessionToken) {
      // No session, just redirect to login
      return res.redirect("/login");
    }

    // Get session ID from Redis
    const redis = await getRedisClient();
    const sessionId = await redis.get(`session:${sessionToken}`);

    if (sessionId) {
      // Get session from DB for logging
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      // Revoke session in DB
      await revokeSession(sessionId, "User logout");

      // Delete from Redis
      await redis.del(`session:${sessionToken}`);

      logger.info(
        { userId: session?.userId, sessionId },
        "User logged out successfully"
      );
    }

    // Clear session cookie (both wildcard and specific domain)
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      domain: ".leonobitech.com",
      path: "/",
    });
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      domain: "odoo-mcp.leonobitech.com",
      path: "/",
    });

    // Redirect to login page
    return res.redirect("/login");
  } catch (error) {
    logger.error({ err: error }, "Logout error");
    // On error, still redirect to login
    return res.redirect("/login");
  }
});

/**
 * GET /auth/status
 * Check if user has active session (for UI feedback)
 */
authRouter.get("/status", async (req, res) => {
  // Disable caching for this endpoint - it needs to be real-time
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const sessionToken = req.cookies[env.SESSION_COOKIE_NAME];
    logger.info({ sessionToken: sessionToken ? sessionToken.substring(0, 16) + "..." : null }, "🔍 [/auth/status] Checking session");

    if (!sessionToken) {
      logger.info("❌ [/auth/status] No session token in cookies");
      return res.json({
        authenticated: false,
        hasSession: false,
      });
    }

    // Check if session exists in Redis
    const redis = await getRedisClient();
    const redisKey = `session:${sessionToken}`;
    const sessionId = await redis.get(redisKey);
    logger.info({ redisKey, sessionId }, "📦 [/auth/status] Redis lookup");

    if (!sessionId) {
      logger.warn({ redisKey }, "⚠️ [/auth/status] Session not found in Redis");
      return res.json({
        authenticated: false,
        hasSession: false,
      });
    }

    // Get session from DB
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { email: true } } },
    });

    if (!session || !session.isActive) {
      return res.json({
        authenticated: false,
        hasSession: false,
      });
    }

    // Check if user has OAuth tokens (connector active in Claude Desktop)
    const accessTokenKeys = await redis.keys(`access_token:*`);
    const userTokens = [];

    for (const key of accessTokenKeys) {
      const tokenData = await redis.get(key);
      if (tokenData) {
        try {
          const parsed = JSON.parse(tokenData);
          if (parsed.subject === session.userId) {
            userTokens.push(key);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    return res.json({
      authenticated: true,
      hasSession: true,
      email: session.user?.email || null,
      connectorActive: userTokens.length > 0,
      sessionCreatedAt: session.createdAt,
    });
  } catch (error) {
    logger.error({ err: error }, "Error checking session status");
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to check session status",
    });
  }
});

/**
 * GET /auth/me
 * Get current user info (requires session)
 */
authRouter.get("/me", async (req, res) => {
  // This will be protected by session middleware
  return res.json({ message: "Not implemented yet - requires session middleware" });
});
