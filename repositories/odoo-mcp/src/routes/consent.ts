import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/config/database";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { extractIpAddress, extractUserAgent } from "@/lib/security";
import { logSecurityEvent } from "@/services/security-event.service";
import { createAuthorizationCode } from "@/lib/store";

export const consentRouter = Router();

const consentQuerySchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  scope: z.string(),
  state: z.string().optional(),
  code_challenge: z.string(),
  code_challenge_method: z.enum(["S256", "plain"]),
  nonce: z.string().optional(),
});

/**
 * GET /oauth/consent
 * Display consent screen (or return consent data for frontend to render)
 */
consentRouter.get("/", async (req, res) => {
  // User must be authenticated to see consent screen
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "not_authenticated",
      message: "Authentication required to grant consent",
    });
  }

  const parseResult = consentQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "invalid_request",
      details: parseResult.error.flatten(),
    });
  }

  const { client_id, scope } = parseResult.data;

  // Check if request accepts HTML (browser) or JSON (API)
  const acceptsHtml = req.headers.accept?.includes('text/html');

  const consentData = {
    clientId: client_id,
    clientName: "Odoo MCP Server",
    scopes: scope.split(/\s+/),
    scopeDescriptions: {
      "odoo:read": "Read access to your Odoo data (contacts, leads, calendar)",
      "odoo:write": "Write access to your Odoo data (create/update contacts, leads)",
    },
    user: {
      email: req.session.user?.email,
      name: req.session.user?.name,
    },
  };

  // If browser request, serve HTML page
  if (acceptsHtml) {
    return res.sendFile("consent.html", { root: "./public" });
  }

  // Otherwise return JSON for API clients
  return res.json(consentData);
});

const consentActionSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  scope: z.string(),
  state: z.string().optional().transform(val => val === '' ? undefined : val),
  code_challenge: z.string(),
  code_challenge_method: z.enum(["S256", "plain"]),
  nonce: z.string().optional().transform(val => val === '' ? undefined : val),
  action: z.enum(["allow", "deny"]),
});

/**
 * POST /oauth/consent
 * User grants or denies consent
 */
consentRouter.post("/", async (req, res) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);

  // User must be authenticated
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "not_authenticated",
      message: "Authentication required",
    });
  }

  const userId = req.session.userId;

  const parseResult = consentActionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "invalid_request",
      details: parseResult.error.flatten(),
    });
  }

  const {
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    nonce,
    action,
  } = parseResult.data;

  // User denied consent
  if (action === "deny") {
    logger.info({ userId, client_id, scope }, "User denied OAuth consent");

    await logSecurityEvent({
      userId,
      eventType: "oauth.consent.denied",
      severity: "info",
      ipAddress,
      userAgent,
      metadata: { client_id, scope },
    });

    // Redirect back with error
    const url = new URL(redirect_uri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "User denied consent");
    if (state) url.searchParams.set("state", state);

    return res.redirect(url.toString());
  }

  // User allowed consent
  try {
    // Save consent to database
    await prisma.oAuthConsent.upsert({
      where: {
        userId_clientId: {
          userId,
          clientId: client_id,
        },
      },
      update: {
        scopes: scope,
        grantedAt: new Date(),
        revokedAt: null, // Un-revoke if previously revoked
        ipAddress,
        userAgent,
      },
      create: {
        userId,
        clientId: client_id,
        scopes: scope,
        ipAddress,
        userAgent,
      },
    });

    logger.info({ userId, client_id, scope }, "User granted OAuth consent");

    await logSecurityEvent({
      userId,
      eventType: "oauth.consent.granted",
      severity: "info",
      ipAddress,
      userAgent,
      metadata: { client_id, scope },
    });

    // Issue authorization code
    const codePayload = await createAuthorizationCode({
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      scope,
      subject: userId,
      state,
      nonce,
    });

    // Redirect back with authorization code
    const url = new URL(redirect_uri);
    url.searchParams.set("code", codePayload.code);
    if (state) url.searchParams.set("state", state);
    url.searchParams.set("client_id", client_id);

    return res.redirect(url.toString());
  } catch (error) {
    logger.error({ err: error, userId, client_id }, "Error processing consent");
    return res.status(500).json({
      error: "server_error",
      message: "Failed to process consent",
    });
  }
});

/**
 * GET /oauth/consents
 * List user's active OAuth consents (for user dashboard)
 */
consentRouter.get("/list", async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "not_authenticated",
      message: "Authentication required",
    });
  }

  const consents = await prisma.oAuthConsent.findMany({
    where: {
      userId: req.session.userId,
      revokedAt: null,
    },
    orderBy: { grantedAt: "desc" },
  });

  return res.json({
    consents: consents.map((c) => ({
      clientId: c.clientId,
      scopes: c.scopes,
      grantedAt: c.grantedAt,
    })),
  });
});

/**
 * DELETE /oauth/consents/:clientId
 * Revoke consent for a specific client
 */
consentRouter.delete("/:clientId", async (req, res) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);

  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "not_authenticated",
      message: "Authentication required",
    });
  }

  const { clientId } = req.params;
  const userId = req.session.userId;

  try {
    await prisma.oAuthConsent.update({
      where: {
        userId_clientId: {
          userId,
          clientId,
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    logger.info({ userId, clientId }, "User revoked OAuth consent");

    await logSecurityEvent({
      userId,
      eventType: "oauth.consent.revoked",
      severity: "info",
      ipAddress,
      userAgent,
      metadata: { clientId },
    });

    return res.json({ success: true, message: "Consent revoked" });
  } catch (error) {
    logger.error({ err: error, userId, clientId }, "Error revoking consent");
    return res.status(500).json({
      error: "server_error",
      message: "Failed to revoke consent",
    });
  }
});
