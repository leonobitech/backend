/**
 * Dual Authentication Middleware
 *
 * Supports two authentication methods for MCP endpoints:
 * 1. OAuth Bearer Token (for Claude Desktop)
 * 2. Service Token (for n8n and other automated services)
 *
 * This allows the same /mcp endpoint to work with both:
 * - Interactive users (OAuth)
 * - Automated services (Service Token)
 */

import { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { verifyAccessToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

const requiredScopes = new Set(env.SCOPES.split(/\s+/).filter(Boolean));

/**
 * Dual authentication middleware
 * Tries OAuth first, then falls back to Service Token
 */
export async function dualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const serviceToken = req.headers["x-service-token"] as string | undefined;

  // Try OAuth first (Bearer token)
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();

    try {
      const payload = await verifyAccessToken(token);
      const tokenScopes = new Set(
        typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : []
      );
      const missingScopes = Array.from(requiredScopes).filter((scope) => !tokenScopes.has(scope));

      if (missingScopes.length > 0) {
        logger.warn({ sub: payload.sub, missingScopes }, "[DualAuth] OAuth token missing required scopes");
        res.setHeader(
          "WWW-Authenticate",
          `Bearer realm="${env.PUBLIC_URL}", error="insufficient_scope", scope="${env.SCOPES}"`
        );
        return res.status(403).json({ error: "insufficient_scope", scope: env.SCOPES });
      }

      // OAuth successful
      res.locals.auth = {
        type: "oauth",
        subject: payload.sub,
        scope: payload.scope,
        token
      };

      logger.info({ userId: payload.sub }, "[DualAuth] Authenticated via OAuth");
      return next();
    } catch (error) {
      logger.warn({ err: error }, "[DualAuth] Failed to verify OAuth token");
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="${env.PUBLIC_URL}", error="invalid_token"`
      );
      return res.status(401).json({ error: "invalid_token" });
    }
  }

  // Try Service Token (X-Service-Token header)
  if (serviceToken) {
    // Check if SERVICE_TOKEN is configured
    if (!env.SERVICE_TOKEN) {
      logger.error("[DualAuth] SERVICE_TOKEN not configured");
      return res.status(500).json({
        error: "server_misconfigured",
        message: "Service token authentication not configured"
      });
    }

    // Validate service token
    if (serviceToken !== env.SERVICE_TOKEN) {
      logger.warn("[DualAuth] Invalid service token");
      return res.status(401).json({
        error: "invalid_service_token",
        message: "Invalid or missing service token"
      });
    }

    // Service token successful
    // Use a generic service user ID
    res.locals.auth = {
      type: "service",
      subject: "service-account",
      scope: env.SCOPES, // Grant all scopes to service account
      token: serviceToken
    };

    logger.info("[DualAuth] Authenticated via Service Token");
    return next();
  }

  // No valid authentication provided
  logger.warn("[DualAuth] No valid authentication provided");
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="${env.PUBLIC_URL}", error="invalid_request"`
  );
  return res.status(401).json({
    error: "invalid_request",
    message: "Missing authentication. Provide either Bearer token or X-Service-Token header"
  });
}
