import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  PORT: z.coerce.number().min(1).max(65535).default(8100),
  PUBLIC_URL: z.string().url(),
  CLIENT_ID: z.string().min(1),
  CLIENT_SECRET: z.string().min(1),
  REDIRECT_URI: z.string().url(),
  SCOPES: z.string().min(1),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .optional()
    .default("info"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).max(15).default(1),
  ACCESS_TOKEN_TTL: z.coerce.number().min(60).default(300),
  AUTH_CODE_TTL: z.coerce.number().min(30).default(180),
  REFRESH_TOKEN_TTL: z.coerce.number().min(300).default(604800),
  JWKS_KID: z.string().min(1),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  CORS_ORIGINS: z.string().optional(),
});

export const env = envSchema.parse(process.env);
