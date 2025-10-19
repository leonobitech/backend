const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;

  if (value === undefined) {
    throw Error(`Missing String environment variable for ${key}`);
  }

  return value;
};

export const NODE_ENV = getEnv("NODE_ENV");
export const PORT = getEnv("PORT", "8080");
export const APP_ORIGIN = getEnv("APP_ORIGIN");
export const API_ORIGIN = getEnv("API_ORIGIN");
export const CLIENT_KEY_SECRET = getEnv("CLIENT_KEY_SECRET");
export const JWT_SECRET = getEnv("JWT_SECRET");
export const JWT_AUDIENCE = getEnv("JWT_AUDIENCE");
export const JWT_REFRESH_SECRET = getEnv("JWT_REFRESH_SECRET");
export const JWT_ISSUER = getEnv("JWT_ISSUER");
export const EMAIL_SENDER = getEnv("EMAIL_SENDER");
export const RESEND_API_KEY = getEnv("RESEND_API_KEY");
export const REDIS_HOST = getEnv("REDIS_HOST");
export const REDIS_PORT = getEnv("REDIS_PORT");
export const REDIS_PASSWORD = getEnv("REDIS_PASSWORD", ""); // Empty string for local dev
export const REDIS_DB = getEnv("REDIS_DB");
export const CORE_API_KEY = getEnv("CORE_API_KEY");
export const SERVICE_TOKEN_SECRET = getEnv("SERVICE_TOKEN_SECRET");
export const SERVICE_TOKEN_AUDIENCE = getEnv("SERVICE_TOKEN_AUDIENCE", "service");
export const SERVICE_TOKEN_TTL_SECONDS = Number.parseInt(
  getEnv("SERVICE_TOKEN_TTL_SECONDS", "900"),
  10
);
export const SERVICE_CLIENTS = getEnv("SERVICE_CLIENTS", "[]");
