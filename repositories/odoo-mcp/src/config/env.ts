import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  // Server
  NODE_ENV: z.string().optional().default("development"),
  PORT: z.coerce.number().min(1).max(65535).default(8100),
  PUBLIC_URL: z.string().url(),

  // OAuth 2.1
  CLIENT_ID: z.string().min(1),
  CLIENT_SECRET: z.string().min(1),
  REDIRECT_URI: z.string().url(),
  SCOPES: z.string().min(1),

  // JWT
  JWKS_KID: z.string().min(1),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL: z.coerce.number().min(60).default(300),
  AUTH_CODE_TTL: z.coerce.number().min(30).default(180),
  REFRESH_TOKEN_TTL: z.coerce.number().min(300).default(604800),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().min(1), // Now required for production
  REDIS_DB: z.coerce.number().min(0).max(15).default(1),

  // Session
  SESSION_TTL: z.coerce.number().min(3600).default(604800), // 7 days
  SESSION_COOKIE_NAME: z.string().default("odoo_mcp_session"),
  SESSION_COOKIE_SECRET: z.string().min(32),

  // Security
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(5),

  // Encryption (for Odoo credentials in DB)
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes as hex

  // CORS
  CORS_ORIGINS: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .optional()
    .default("info")
});

export const env = envSchema.parse(process.env);
