import { NextFunction, Request, Response, Router } from "express";
import { env } from "@/config/env";
import { verifyAccessToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

const requiredScopes = new Set(env.SCOPES.split(/\s+/).filter(Boolean));

async function authenticateMcpRequest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${env.PUBLIC_URL}", error="invalid_request", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({ error: "invalid_request", message: "Missing bearer token" });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${env.PUBLIC_URL}", error="invalid_request", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({ error: "invalid_request", message: "Missing bearer token" });
  }

  try {
    const payload = await verifyAccessToken(token);
    const tokenScopes = new Set(
      typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : []
    );
    const missingScopes = Array.from(requiredScopes).filter((scope) => !tokenScopes.has(scope));
    if (missingScopes.length > 0) {
      logger.warn({ sub: payload.sub, missingScopes }, "Token missing required MCP scopes");
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="${env.PUBLIC_URL}", error="insufficient_scope", scope="${env.SCOPES}", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
      );
      return res.status(403).json({ error: "insufficient_scope", scope: env.SCOPES });
    }

    res.locals.auth = {
      subject: payload.sub,
      scope: payload.scope,
      token
    };
    return next();
  } catch (error) {
    logger.warn({ err: error }, "Failed to verify MCP access token");
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${env.PUBLIC_URL}", error="invalid_token", error_uri="${env.PUBLIC_URL}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({ error: "invalid_token" });
  }
}

export const mcpRouter = Router();

mcpRouter.post("/ping", authenticateMcpRequest, (_req, res) => {
  res.json({ result: "pong" });
});
