// middlewares/rateLimiter.ts
import rateLimit from "express-rate-limit";
import { HTTP_CODE } from "@constants/httpCode";

/**
 * 🛡️ Rate Limiter Global
 * Aplica a TODAS las rutas para prevenir abuso general
 * Límite: 100 requests por minuto por IP
 */
export const globalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 requests por ventana
  message: "Too many requests from this IP, please try again later.",
  statusCode: HTTP_CODE.TOO_MANY_REQUESTS,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skipSuccessfulRequests: false,
  // FIX: Validar trust proxy para express-rate-limit
  validate: { trustProxy: false }, // Deshabilita validación estricta
});

/**
 * 🔐 Rate Limiter para Login
 * Previene brute force attacks
 * Límite: 5 intentos cada 15 minutos por IP
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por ventana
  message: {
    error: "Too many login attempts. Please try again in 15 minutes.",
    retryAfter: "15 minutes",
  },
  statusCode: HTTP_CODE.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  validate: { trustProxy: false },
});

/**
 * 📝 Rate Limiter para Registro
 * Previene spam de cuentas
 * Límite: 3 registros por hora por IP
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 registros por hora
  message: {
    error: "Too many accounts created. Please try again in 1 hour.",
    retryAfter: "1 hour",
  },
  statusCode: HTTP_CODE.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  validate: { trustProxy: false },
});

/**
 * 🔑 Rate Limiter para Password Reset
 * Previene abuso de solicitudes de reset
 * Límite: 3 solicitudes por hora por IP
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 solicitudes por hora
  message: {
    error: "Too many password reset requests. Please try again in 1 hour.",
    retryAfter: "1 hour",
  },
  statusCode: HTTP_CODE.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  validate: { trustProxy: false },
});

/**
 * ✉️ Rate Limiter para Email Verification
 * Previene spam de códigos de verificación
 * Límite: 5 solicitudes cada 15 minutos por IP
 */
export const emailVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 solicitudes por ventana
  message: {
    error: "Too many verification code requests. Please try again in 15 minutes.",
    retryAfter: "15 minutes",
  },
  statusCode: HTTP_CODE.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  validate: { trustProxy: false },
});

/**
 * 🔒 Rate Limiter para rutas de Admin
 * Más restrictivo para operaciones sensibles
 * Límite: 30 requests por minuto por IP
 */
export const adminRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // 30 requests por minuto
  message: {
    error: "Too many admin requests. Please slow down.",
    retryAfter: "1 minute",
  },
  statusCode: HTTP_CODE.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  validate: { trustProxy: false },
});
