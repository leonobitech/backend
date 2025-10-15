import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Router } from "express";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

const keysDir = resolve(process.cwd(), "keys");
const scopes = Array.from(new Set(env.SCOPES.split(/\s+/).filter(Boolean)));
const scopeDescriptions = scopes.reduce<Record<string, string>>((acc, scope) => {
  acc[scope] = "Permite a Claude Desktop invocar herramientas Leonobitech MCP.";
  return acc;
}, {});

export const wellKnownRouter = Router();

const baseManifest = {
  schema_version: "v1",
  name_for_human: "Leonobitech Claude Desktop Connector",
  name_for_model: "leonobitech_claude",
  description_for_human:
    "Autentica y habilita la integración MCP de Leonobitech dentro de Claude Desktop.",
  description_for_model:
    "Utiliza herramientas de Leonobitech mediante un servidor MCP autenticado con OAuth2 y tokens JWT.",
  auth: {
    type: "oauth",
    client_url: `${env.PUBLIC_URL}/oauth/authorize`,
    scope: scopes.join(" "),
    scopes,
    authorization_url: `${env.PUBLIC_URL}/oauth/authorize`,
    authorization_content_type: "application/x-www-form-urlencoded",
    token_url: `${env.PUBLIC_URL}/oauth/token`,
    token_content_type: "application/x-www-form-urlencoded",
    refresh_url: `${env.PUBLIC_URL}/oauth/token`,
    redirect_url: env.REDIRECT_URI
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
} as const;

wellKnownRouter.get("/ai-plugin.json", (_req, res) => {
  res.json(baseManifest);
});

wellKnownRouter.get("/anthropic/manifest.json", (_req, res) => {
  res.json({
    schema_version: "1.0",
    name_for_human: baseManifest.name_for_human,
    name_for_model: baseManifest.name_for_model,
    description_for_human: baseManifest.description_for_human,
    description_for_model: baseManifest.description_for_model,
    contact_email: baseManifest.contact_email,
    legal_info_url: baseManifest.legal_info_url,
    logo_url: baseManifest.logo_url,
    oauth: {
      client_id: env.CLIENT_ID,
      scopes,
      scope: scopes.join(" "),
      authorization_url: `${env.PUBLIC_URL}/oauth/authorize`,
      token_url: `${env.PUBLIC_URL}/oauth/token`,
      redirect_uri: env.REDIRECT_URI
    },
    api: baseManifest.api,
    mcp: {
      protocol: "sse",
      transport: {
        type: "sse",
        url: `${env.PUBLIC_URL}/mcp/sse`
      },
      resources: [
        {
          name: "ping",
          description: "Herramienta de diagnóstico que responde con un pong.",
          url: `${env.PUBLIC_URL}/mcp/message`
        },
        {
          name: "get_user_info",
          description: "Devuelve información básica sobre el usuario autenticado.",
          url: `${env.PUBLIC_URL}/mcp/message`
        }
      ]
    }
  });
});

const openApiSpec = {
  openapi: "3.0.1",
  info: {
    title: "Leonobitech Claude OAuth Service",
    description: "Endpoints OAuth2, JWKS y salud para la integración con Claude Desktop MCP.",
    version: "0.1.0"
  },
  servers: [{ url: env.PUBLIC_URL }],
  paths: {
    "/oauth/authorize": {
      get: {
        summary: "Authorization Code + PKCE",
        description:
          "Inicia el flujo OAuth2 Authorization Code con PKCE. Requiere parámetros `client_id`, `redirect_uri`, `response_type`, `scope`, `code_challenge` y `code_challenge_method`. El parámetro `state` es opcional pero recomendado.",
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
              required: false,
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
      "/mcp/sse": {
        get: {
          summary: "MCP SSE Connection",
          description: "Establece una conexión SSE (Server-Sent Events) para el protocolo MCP. Este es el endpoint principal para Claude Desktop.",
          operationId: "mcp_sse_connect",
          responses: {
            "200": {
              description: "Conexión SSE establecida exitosamente.",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string"
                  }
                }
              }
            },
            "401": { description: "Token ausente o inválido." },
            "403": { description: "Token sin scopes suficientes." }
          },
          security: [{ oauth: scopes }]
        }
      },
      "/mcp/message": {
        post: {
          summary: "MCP Message Handler",
          description: "Recibe mensajes JSON-RPC del cliente MCP (usado por Claude Desktop).",
          operationId: "mcp_message",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jsonrpc: { type: "string", enum: ["2.0"] },
                    method: { type: "string" },
                    params: { type: "object" },
                    id: { type: ["string", "number", "null"] }
                  },
                  required: ["jsonrpc", "method"]
                }
              }
            }
          },
          responses: {
            "202": {
              description: "Mensaje aceptado para procesamiento."
            },
            "401": { description: "Token ausente o inválido." },
            "403": { description: "Token sin scopes suficientes." }
          },
          security: [{ oauth: scopes }]
        }
      },
      "/mcp/ping": {
        post: {
          summary: "Ping tool (legacy)",
          description: "Devuelve un payload simple para comprobar conectividad MCP. Nota: Para Claude Desktop, usa /mcp/sse en su lugar.",
          operationId: "ping",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", description: "Mensaje opcional a eco." }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Respuesta pong satisfactoria.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: { type: "string" }
                    },
                    required: ["result"]
                  }
                }
              }
            },
            "401": { description: "Token ausente o inválido." },
            "403": { description: "Token sin scopes suficientes." }
          },
          security: [{ oauth: scopes }]
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
    "/oauth/register": {
      post: {
        summary: "Dynamic client registration",
        description:
          "Registra clientes OAuth dinámicamente. Actualmente devuelve el client_id/client_secret estáticos del servicio si el redirect_uri coincide.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  redirect_uris: {
                    type: "array",
                    items: { type: "string", format: "uri" },
                    minItems: 1
                  },
                  client_name: { type: "string" },
                  grant_types: {
                    type: "array",
                    items: { type: "string", enum: ["authorization_code", "refresh_token"] }
                  },
                  scope: { type: "string" },
                  token_endpoint_auth_method: {
                    type: "string",
                    enum: ["none", "client_secret_post", "client_secret_basic"]
                  }
                },
                required: ["redirect_uris"],
                additionalProperties: true
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Cliente registrado correctamente.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    client_id: { type: "string" },
                    client_secret: { type: "string" },
                    client_id_issued_at: { type: "integer" },
                    client_secret_expires_at: { type: "integer" },
                    redirect_uris: {
                      type: "array",
                      items: { type: "string", format: "uri" }
                    },
                    scope: { type: "string" },
                    token_endpoint_auth_method: { type: "string" },
                    grant_types: {
                      type: "array",
                      items: { type: "string" }
                    },
                    response_types: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: [
                    "client_id",
                    "client_secret",
                    "client_id_issued_at",
                    "client_secret_expires_at",
                    "redirect_uris",
                    "scope",
                    "token_endpoint_auth_method",
                    "grant_types",
                    "response_types"
                  ]
                }
              }
            }
          },
          "400": {
            description: "Solicitud inválida."
          }
        }
      }
    },
    components: {
      securitySchemes: {
        oauth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${env.PUBLIC_URL}/oauth/authorize`,
              tokenUrl: `${env.PUBLIC_URL}/oauth/token`,
              refreshUrl: `${env.PUBLIC_URL}/oauth/token`,
              scopes: scopeDescriptions
            }
          }
        }
      }
    },
    security: [{ oauth: scopes }]
  };

const openApiPaths = [
  "/openapi.json",
  "/anthropic/openapi.json",
  "/oauth-authorization-server/.well-known/openapi.json",
  "/oauth-protected-resource/.well-known/openapi.json",
  "/openid-configuration/.well-known/openapi.json",
  "/openapi.json/.well-known/openid-configuration"
];

openApiPaths.forEach((path) => {
  wellKnownRouter.get(path, (_req, res) => {
    res.json(openApiSpec);
  });
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
  registration_endpoint: `${env.PUBLIC_URL}/oauth/register`,
  jwks_uri: `${env.PUBLIC_URL}/.well-known/jwks.json`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256", "plain"],
  scopes_supported: scopes,
  token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"]
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
    resource_scopes_supported: scopes
  });
});
