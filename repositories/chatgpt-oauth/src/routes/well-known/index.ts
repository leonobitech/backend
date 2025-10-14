import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Router } from "express";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

const keysDir = resolve(process.cwd(), "keys");

export const wellKnownRouter = Router();

wellKnownRouter.get("/ai-plugin.json", (_req, res) => {
  const manifest = {
    schema_version: "v1",
    name_for_human: "Leonobitech ChatGPT App",
    name_for_model: "leonobitech_app",
    description_for_human: "Autentica y habilita la integración MCP de Leonobitech dentro de ChatGPT.",
    description_for_model:
      "Utiliza herramientas de Leonobitech mediante un servidor MCP autenticado con OAuth2 y tokens JWT.",
    auth: {
      type: "oauth",
      client_url: `${env.PUBLIC_URL}/oauth/authorize`,
      scope: env.SCOPES,
      scopes: [env.SCOPES],
      authorization_url: `${env.PUBLIC_URL}/oauth/authorize`,
      authorization_content_type: "application/x-www-form-urlencoded",
      token_url: `${env.PUBLIC_URL}/oauth/token`,
      token_content_type: "application/x-www-form-urlencoded",
      refresh_url: `${env.PUBLIC_URL}/oauth/token`,
      redirect_url: "https://chat.openai.com/aip/oauth/callback"
    },
    api: {
      type: "openapi",
      url: `${env.PUBLIC_URL}/.well-known/openapi.json`,
      is_user_authenticated: true
    },
    mcp_server: {
      type: "openapi",
      url: `${env.PUBLIC_URL}/.well-known/openapi.json`,
      is_user_authenticated: true
    },
    legal_info_url: "https://www.leonobitech.com/legal",
    contact_email: "security@leonobitech.com",
    logo_url: "https://www.leonobitech.com/icon.png"
  };

  res.json(manifest);
});

wellKnownRouter.get("/openapi.json", (_req, res) => {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Leonobitech ChatGPT OAuth Service",
      description: "Endpoints OAuth2, JWKS y salud para la integración con ChatGPT MCP.",
      version: "0.1.0"
    },
    servers: [{ url: env.PUBLIC_URL }],
    paths: {
      "/oauth/authorize": {
        get: {
          summary: "Authorization Code + PKCE",
          description:
            "Inicia el flujo OAuth2 Authorization Code con PKCE. Requiere parámetros `client_id`, `redirect_uri`, `response_type`, `scope`, `state`, `code_challenge` y `code_challenge_method`.",
          parameters: [
            {
              name: "response_type",
              in: "query",
              required: true,
              schema: {
                type: "string",
                enum: ["code"]
              }
            },
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: {
                type: "string"
              }
            },
            {
              name: "redirect_uri",
              in: "query",
              required: true,
              schema: {
                type: "string",
                format: "uri"
              }
            },
            {
              name: "scope",
              in: "query",
              required: true,
              schema: {
                type: "string"
              }
            },
            {
              name: "state",
              in: "query",
              required: true,
              schema: {
                type: "string"
              }
            },
            {
              name: "code_challenge",
              in: "query",
              required: true,
              schema: {
                type: "string"
              }
            },
            {
              name: "code_challenge_method",
              in: "query",
              required: true,
              schema: {
                type: "string",
                enum: ["S256", "plain"]
              }
            },
            {
              name: "prompt",
              in: "query",
              required: false,
              schema: {
                type: "string"
              }
            },
            {
              name: "login_hint",
              in: "query",
              required: false,
              schema: {
                type: "string"
              }
            },
            {
              name: "nonce",
              in: "query",
              required: false,
              schema: {
                type: "string"
              }
            }
          ],
          responses: {
            "302": {
              description: "Redirige al login/consent o al redirect_uri con el authorization code."
            },
            "400": {
              description: "Solicitud inválida."
            }
          }
        }
      },
      "/oauth/token": {
        post: {
          summary: "Token endpoint",
          description:
            "Intercambia un authorization code por access_token/refresh_token firmado con RS256. También soporta refresh_token grant.",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  properties: {
                    grant_type: { type: "string", enum: ["authorization_code", "refresh_token"] },
                    code: { type: "string" },
                    redirect_uri: { type: "string" },
                    client_id: { type: "string" },
                    code_verifier: { type: "string" },
                    refresh_token: { type: "string" }
                  },
                  required: ["grant_type"],
                  additionalProperties: false
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Respuesta con tokens.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token_type: { type: "string", enum: ["Bearer"] },
                      access_token: { type: "string" },
                      expires_in: { type: "integer" },
                      refresh_token: { type: "string" },
                      scope: { type: "string" }
                    },
                    required: ["token_type", "access_token", "expires_in", "scope"]
                  }
                }
              }
            },
            "400": { description: "Solicitud inválida." },
            "401": { description: "Credenciales inválidas." }
          }
        }
      },
      "/.well-known/jwks.json": {
        get: {
          summary: "JSON Web Key Set",
          responses: {
            "200": {
              description: "Conjunto de claves públicas disponibles.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      keys: {
                        type: "array",
                        items: { type: "object" }
                      }
                    },
                    required: ["keys"]
                  }
                }
              }
            }
          }
        }
      },
      "/healthz": {
        get: {
          summary: "Health check",
          responses: {
            "200": {
              description: "Servicio saludable."
            }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        oauth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${env.PUBLIC_URL}/oauth/authorize`,
              tokenUrl: `${env.PUBLIC_URL}/oauth/token`,
              scopes: {
                [env.SCOPES]: "Permite a ChatGPT invocar herramientas Leonobitech MCP."
              }
            }
          }
        }
      }
    },
    security: [{ oauth2: [env.SCOPES] }]
  };

  res.json(spec);
});

wellKnownRouter.get("/jwks.json", async (_req, res, next) => {
  try {
    const jwksRaw = await readFile(resolve(keysDir, "jwks.json"), "utf-8");
    const jwks = JSON.parse(jwksRaw);
    res.json(jwks);
  } catch (error) {
    logger.error({ err: error }, "Unable to read jwks.json");
    next(error);
  }
});

const oauthServerMetadata = {
  issuer: env.PUBLIC_URL,
  authorization_endpoint: `${env.PUBLIC_URL}/oauth/authorize`,
  token_endpoint: `${env.PUBLIC_URL}/oauth/token`,
  jwks_uri: `${env.PUBLIC_URL}/.well-known/jwks.json`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256", "plain"],
  scopes_supported: [env.SCOPES],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"]
};

wellKnownRouter.get("/oauth-authorization-server", (_req, res) => {
  res.json(oauthServerMetadata);
});

wellKnownRouter.get("/openid-configuration", (_req, res) => {
  res.json({
    ...oauthServerMetadata,
    claims_supported: ["iss", "aud", "sub", "exp", "iat", "nonce", "scope"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"]
  });
});

wellKnownRouter.get("/oauth-protected-resource", (_req, res) => {
  res.json({
    issuer: env.PUBLIC_URL,
    resource_scopes_supported: [env.SCOPES]
  });
});
