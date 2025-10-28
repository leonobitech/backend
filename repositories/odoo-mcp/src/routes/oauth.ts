import { Router, Request } from "express";
import { z } from "zod";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { signAccessToken } from "@/lib/keys";
import { verifyCodeChallenge } from "@/lib/pkce";
import {
  consumeAuthorizationCode,
  createAuthorizationCode,
  createRefreshToken,
  getRefreshToken,
  revokeRefreshToken
} from "@/lib/store";
import { optionalAuth } from "@/middlewares/session.middleware";

export const oauthRouter = Router();

const authorizeQuerySchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  scope: z.string(),
  state: z.string().optional(),
  code_challenge: z.string(),
  code_challenge_method: z.enum(["S256", "plain"]).default("S256"),
  nonce: z.string().optional(),
  login_hint: z.string().optional(),
  prompt: z.string().optional()
});

const allowedScopes = Array.from(new Set(env.SCOPES.split(/\s+/).filter(Boolean)));
const registrationBodySchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().optional(),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
  scope: z.string().optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .optional()
});

/**
 * GET /oauth/authorize
 * OAuth 2.1 Authorization Endpoint with Real Authentication
 *
 * Flow:
 * 1. Validate OAuth parameters
 * 2. Check if user is authenticated (has valid session)
 * 3. If not authenticated → redirect to login page with return_to
 * 4. If authenticated → check if user has previously consented
 * 5. If not consented → show consent screen
 * 6. If consented → issue authorization code
 */
oauthRouter.get("/authorize", optionalAuth, async (req, res) => {
  const parseResult = authorizeQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    logger.warn({ query: req.query, errors: parseResult.error.flatten() }, "Invalid authorize request");
    return res.status(400).json({ error: "invalid_request", details: parseResult.error.flatten() });
  }

  const {
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    nonce,
  } = parseResult.data;

  // Validate client_id
  if (client_id !== env.CLIENT_ID) {
    logger.warn({ client_id }, "Unauthorized client_id on authorize");
    return res.status(400).json({ error: "unauthorized_client" });
  }

  // Validate redirect_uri
  const allowedRedirectUris = new Set(
    [env.REDIRECT_URI, "https://claude.ai/api/mcp/auth_callback", "https://claude.ai/mcp/oauth/callback"].filter(
      Boolean
    )
  );

  if (!allowedRedirectUris.has(redirect_uri)) {
    logger.warn({ redirect_uri }, "Invalid redirect_uri on authorize");
    return res.status(400).json({ error: "invalid_redirect_uri" });
  }

  // Validate scopes
  const requestedScopes = Array.from(new Set(scope.split(/\s+/).filter(Boolean)));

  if (!requestedScopes.length) {
    logger.warn({ scope }, "Empty scope set on authorize");
    return res.status(400).json({ error: "invalid_scope" });
  }

  const invalidScopes = requestedScopes.filter((requested) => !allowedScopes.includes(requested));
  if (invalidScopes.length > 0) {
    logger.warn({ requested: requestedScopes, invalid: invalidScopes }, "Invalid scope on authorize");
    return res.status(400).json({ error: "invalid_scope" });
  }

  const normalizedScope = requestedScopes.join(" ");

  // ⚠️ CRITICAL SECURITY CHECK: Verify user is authenticated
  if (!req.session || !req.session.userId) {
    // User not authenticated → redirect to login page
    const loginUrl = new URL("/login", env.PUBLIC_URL);

    // Preserve OAuth parameters in return_to
    const authorizeUrl = new URL("/oauth/authorize", env.PUBLIC_URL);
    authorizeUrl.searchParams.set("client_id", client_id);
    authorizeUrl.searchParams.set("redirect_uri", redirect_uri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", scope);
    if (state) authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", code_challenge);
    authorizeUrl.searchParams.set("code_challenge_method", code_challenge_method);
    if (nonce) authorizeUrl.searchParams.set("nonce", nonce);

    loginUrl.searchParams.set("return_to", authorizeUrl.toString());

    logger.info({ client_id, scope }, "User not authenticated, redirecting to login");
    return res.redirect(loginUrl.toString());
  }

  const userId = req.session.userId;

  // ✅ User is authenticated → ALWAYS show consent screen
  // This ensures user explicitly authorizes each OAuth connection
  const consentUrl = new URL("/oauth/consent", env.PUBLIC_URL);
  consentUrl.searchParams.set("client_id", client_id);
  consentUrl.searchParams.set("redirect_uri", redirect_uri);
  consentUrl.searchParams.set("scope", scope);
  if (state) consentUrl.searchParams.set("state", state);
  consentUrl.searchParams.set("code_challenge", code_challenge);
  consentUrl.searchParams.set("code_challenge_method", code_challenge_method);
  if (nonce) consentUrl.searchParams.set("nonce", nonce);

  logger.info({ userId, client_id, scope }, "Redirecting to consent screen");
  return res.redirect(consentUrl.toString());
});

const tokenBodySchema = z.object({
  grant_type: z.enum(["authorization_code", "refresh_token"]),
  code: z.string().optional(),
  redirect_uri: z.string().url().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  code_verifier: z.string().optional(),
  refresh_token: z.string().optional()
});

function extractClientCredentials(req: Request, bodyClientId?: string, bodyClientSecret?: string) {
  let clientId = bodyClientId;
  let clientSecret = bodyClientSecret;
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Basic ")) {
    const [, encoded] = authHeader.split(" ", 2);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [id, secret] = decoded.split(":");
    clientId = id;
    clientSecret = secret;
  }

  return { clientId, clientSecret };
}

oauthRouter.post("/token", async (req, res) => {
  const parseResult = tokenBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    logger.warn({ body: req.body, errors: parseResult.error.flatten() }, "Invalid token request");
    return res.status(400).json({ error: "invalid_request", details: parseResult.error.flatten() });
  }

  const body = parseResult.data;

  if (body.grant_type === "authorization_code") {
    const { clientId } = extractClientCredentials(req, body.client_id, body.client_secret);

    if (!body.code || !body.redirect_uri || !clientId || !body.code_verifier) {
      logger.warn("Missing parameters on authorization_code grant");
      return res.status(400).json({ error: "invalid_request", message: "Missing parameters" });
    }

    if (clientId !== env.CLIENT_ID) {
      logger.warn({ clientId }, "Unauthorized client on token exchange");
      return res.status(401).json({ error: "unauthorized_client" });
    }

    const storedCode = await consumeAuthorizationCode(body.code);
    if (!storedCode) {
      logger.warn("Authorization code not found or already used");
      return res.status(400).json({ error: "invalid_grant" });
    }

    if (storedCode.redirectUri !== body.redirect_uri) {
      logger.warn("redirect_uri mismatch on token exchange");
      return res.status(400).json({ error: "invalid_grant", message: "redirect_uri mismatch" });
    }

    const validVerifier = verifyCodeChallenge(
      body.code_verifier,
      storedCode.codeChallenge,
      storedCode.codeChallengeMethod
    );
    if (!validVerifier) {
      logger.warn("PKCE verification failed");
      return res.status(400).json({ error: "invalid_grant", message: "PKCE verification failed" });
    }

    const accessToken = await signAccessToken({
      sub: storedCode.subject,
      scope: storedCode.scope,
      nonce: storedCode.nonce
    });

    const refresh = await createRefreshToken({
      clientId: env.CLIENT_ID,
      scope: storedCode.scope,
      subject: storedCode.subject
    });

    logger.info({ sub: storedCode.subject }, "Access token issued via authorization_code");
    return res.json({
      token_type: "Bearer",
      access_token: accessToken,
      expires_in: env.ACCESS_TOKEN_TTL,
      refresh_token: refresh.token,
      scope: storedCode.scope
    });
  }

  if (body.grant_type === "refresh_token") {
    const { clientId } = extractClientCredentials(req, body.client_id, body.client_secret);

    if (!body.refresh_token || !clientId) {
      logger.warn("Missing parameters on refresh_token grant");
      return res.status(400).json({ error: "invalid_request", message: "Missing parameters" });
    }

    if (clientId !== env.CLIENT_ID) {
      logger.warn({ clientId }, "Unauthorized client on refresh grant");
      return res.status(401).json({ error: "unauthorized_client" });
    }

    const storedRefresh = await getRefreshToken(body.refresh_token);
    if (!storedRefresh) {
      logger.warn("Refresh token not found or expired");
      return res.status(400).json({ error: "invalid_grant" });
    }

    if (storedRefresh.clientId !== env.CLIENT_ID) {
      logger.warn("Refresh token client mismatch");
      return res.status(400).json({ error: "invalid_grant" });
    }

    const accessToken = await signAccessToken({
      sub: storedRefresh.subject,
      scope: storedRefresh.scope
    });

    // Rotación de refresh token
    await revokeRefreshToken(body.refresh_token);
    const newRefresh = await createRefreshToken({
      clientId: env.CLIENT_ID,
      scope: storedRefresh.scope,
      subject: storedRefresh.subject
    });

    logger.info({ sub: storedRefresh.subject }, "Access token refreshed");
    return res.json({
      token_type: "Bearer",
      access_token: accessToken,
      expires_in: env.ACCESS_TOKEN_TTL,
      refresh_token: newRefresh.token,
      scope: storedRefresh.scope
    });
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

oauthRouter.post("/register", (req, res) => {
  const parseResult = registrationBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    logger.warn({ body: req.body, errors: parseResult.error.flatten() }, "Invalid client registration request");
    return res.status(400).json({ error: "invalid_client_metadata", details: parseResult.error.flatten() });
  }

  const { redirect_uris, scope, grant_types, token_endpoint_auth_method } = parseResult.data;

  const allowedRedirectUris = new Set(
    [env.REDIRECT_URI, "https://claude.ai/api/mcp/auth_callback", "https://claude.ai/mcp/oauth/callback"].filter(
      Boolean
    )
  );

  const hasAllowedRedirect = redirect_uris.some((uri) => allowedRedirectUris.has(uri));
  if (!hasAllowedRedirect) {
    logger.warn({ redirect_uris }, "Unsupported redirect_uri on registration");
    return res.status(400).json({ error: "invalid_redirect_uri" });
  }

  if (scope) {
    const requestedScopes = Array.from(new Set(scope.split(/\s+/).filter(Boolean)));
    const invalidScopes = requestedScopes.filter((requested) => !allowedScopes.includes(requested));
    if (invalidScopes.length > 0) {
      logger.warn({ requestedScopes }, "Invalid scope on registration");
      return res.status(400).json({ error: "invalid_scope" });
    }
  }

  if (grant_types && !grant_types.includes("authorization_code")) {
    logger.warn({ grant_types }, "Missing authorization_code grant on registration");
    return res.status(400).json({ error: "invalid_client_metadata" });
  }

  if (token_endpoint_auth_method && token_endpoint_auth_method !== "client_secret_post") {
    logger.warn({ token_endpoint_auth_method }, "Unsupported auth method on registration");
    return res.status(400).json({ error: "invalid_client_metadata" });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  logger.info("Served dynamic client registration (static configuration)");

  return res.status(201).json({
    client_id: env.CLIENT_ID,
    client_secret: "dynamic-registration-not-required",
    client_id_issued_at: issuedAt,
    client_secret_expires_at: 0,
    redirect_uris: Array.from(allowedRedirectUris),
    scope: allowedScopes.join(" "),
    token_endpoint_auth_method: "client_secret_post",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"]
  });
});
