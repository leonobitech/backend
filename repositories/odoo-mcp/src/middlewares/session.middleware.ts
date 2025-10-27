import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { validateSession } from "@/services/session.service";
import { extractIpAddress, extractUserAgent } from "@/lib/security";
import { prisma } from "@/config/database";
import { logger } from "@/lib/logger";

/**
 * Session Middleware
 * Validates session cookie and attaches user data to request
 */

// Extend Express Request type to include user data
declare global {
  namespace Express {
    interface Request {
      session?: {
        id: string;
        userId: string;
        user?: {
          id: string;
          email: string;
          name: string | null;
          isActive: boolean;
        };
      };
    }
  }
}

/**
 * Middleware to require authentication
 * Returns 401 if no valid session
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const sessionToken = req.cookies[env.SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return res.status(401).json({
        error: "not_authenticated",
        message: "Authentication required",
      });
    }

    const ipAddress = extractIpAddress(req);
    const userAgent = extractUserAgent(req);

    const session = await validateSession(sessionToken, ipAddress, userAgent);

    if (!session) {
      // Clear invalid cookie
      res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });

      return res.status(401).json({
        error: "invalid_session",
        message: "Invalid or expired session",
      });
    }

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: "user_not_found",
        message: "User not found",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: "account_inactive",
        message: "Account has been deactivated",
      });
    }

    // Attach session and user to request
    req.session = {
      id: session.id,
      userId: session.userId,
      user,
    };

    next();
  } catch (error) {
    logger.error({ err: error }, "Session middleware error");
    return res.status(500).json({
      error: "internal_error",
      message: "An error occurred while validating session",
    });
  }
}

/**
 * Optional auth middleware
 * Attaches user if authenticated, but doesn't require it
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const sessionToken = req.cookies[env.SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return next();
    }

    const ipAddress = extractIpAddress(req);
    const userAgent = extractUserAgent(req);

    const session = await validateSession(sessionToken, ipAddress, userAgent);

    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.session = {
          id: session.id,
          userId: session.userId,
          user,
        };
      }
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "Optional auth middleware error");
    next();
  }
}
