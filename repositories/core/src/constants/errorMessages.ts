// 📁 constants/errorMessages.ts

export const ERROR_MESSAGES = {
  INTERNAL_SERVER_ERROR: {
    en: "Internal server error.",
    es: "Error interno del servidor.",
  },
  INVALID_INPUT: {
    en: "Invalid input data",
    es: "Datos de entrada inválidos",
  },
  REFRESH_TOKEN_MISSING: {
    en: "Refresh Token not found.",
    es: "Token de actualización no encontrado.",
  },
  TOKEN_EXPIRED: {
    en: "Token has expired.",
    es: "Token ha expirado",
  },
  INVALID_SIGNATURE: {
    en: "Invalid token signature.",
    es: "Firma del token inválida.",
  },
  INVALID_TOKEN: {
    en: "Invalid token.",
    es: "Token inválido.",
  },
  INVALID_AUDIENCE: {
    en: "Invalid Audience",
    es: "Audiencia Inválida",
  },
  INVALID_TOKEN_STRUCTURE: {
    en: "Invalid token structure",
    es: "Estructura de token Inválida",
  },
  INVALID_PAYLOAD_STRUCTURE: {
    en: "Invalid Payload Structure.",
    es: "Estructura inválida de token",
  },
  ACCESS_KEYS_REQUIRED: {
    en: "Access keys required.",
    es: "Claves de Acceso requerido.",
  },
  META_CLIENT_REQUIRED: {
    en: "Meta Client required.",
    es: "Cliente Meta requerido.",
  },
  ACCESS_DENIED: {
    en: "You do not have permission to access this resource.",
    es: "No tienes permiso para acceder a este recurso.",
  },
  INVALID_ACCESS_TOKEN: {
    en: "Token Invalid.",
    es: "Token invalido.",
  },
  INVALID_REFRESH_TOKEN: {
    en: "Token Invalid.",
    es: "Token invalido.",
  },
  TOKEN_INVALID_OR_EXPIRED: {
    en: "Token Invalid or Expired.",
    es: "Token invalido o expirado.",
  },
  UNRECOGNIZED_TOKEN: {
    en: "Unrecognized token.",
    es: "Token no reconocido.",
  },
  TOKEN_NOT_FOUND: {
    en: "Token not found.",
    es: "Token no encontrado.",
  },
  SESSION_NOT_FOUND: {
    en: "Session not found.",
    es: "Sesión no encontrada.",
  },
  REVOKED_SESSION: {
    en: "RevokedSession",
    es: "Session revocada",
  },
  SESSION_NOT_FOUND_WITH_USER: {
    en: "SessionNotFoundWithUser",
    es: "Sesión no encontrada con usuario",
  },
  SESSION_NOT_FOUND_WITH_USER_ACTIVE: {
    en: "SessionNotFoundWithUserActive",
    es: "Sesión no encontrada con usuario activo",
  },
  SESSION_INVALID_OR_EXPIRED: {
    en: "Session Invalid or Expired.",
    es: "Sesión invalida o expirada.",
  },
  CANNOT_DELETE_CURRENT_SESSION: {
    en: "You cannot delete your current session.",
    es: "No puedes eliminar tu sesión actual.",
  },
  UNAUTHORIZED_SESSION_ACCESS: {
    en: "Unauthorized session access.",
    es: "Acceso no autorizado a la sesión.",
  },
  INVALID_SESSION_ID: {
    en: "Invalid session ID.",
    es: "ID de sesión inválido.",
  },
} as const;

export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;
export type SupportedLang = keyof (typeof ERROR_MESSAGES)[ErrorMessageKey];
