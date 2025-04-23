// 📁 @types/modules/auth/session.ts
// Tipado para gestión de sesiones de usuario (listado, cierre individual, cierre masivo)

import { ApiStatus } from "@constants/apiStatus";

//==============================================================================
//                               Request Types
//==============================================================================

/**
 * 📥 Obtener sesiones activas de un usuario.
 */
export type GetUserSessionsParams = {
  userId: string;
  currentSessionId: string;
};

/**
 * 🧨 Revocar una sesión específica del usuario.
 */
export type RevokeSessionByIdParams = {
  userId: string;
  sessionId: string;
};

/**
 * 🔒 Revocar todas las sesiones excepto la actual.
 */
export type RevokeAllOtherSessionsParams = {
  userId: string;
  currentSessionId: string;
};

//==============================================================================
//                               Response Types
//==============================================================================

/**
 * 📦 Detalles de una sesión del usuario.
 */
export type SessionInfo = {
  id: string;
  device: {
    device: string;
    browser: string;
    os: string;
    ipAddress: string;
  };
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

/**
 * ✅ Respuesta al obtener sesiones activas.
 */
export type GetUserSessionsResponse = {
  status: ApiStatus;
  message: string;
  sessions: SessionInfo[];
  totalDevices: number;
  activeDevices: number;
};

/**
 * ❌ Respuesta al revocar una sesión específica.
 */
export type RevokeSessionResponse = {
  status: ApiStatus;
  message: string;
  sessionId: string;
};

/**
 * 🔐 Respuesta al cerrar todas las sesiones excepto la actual.
 */
export type RevokeOthersResponse = {
  status: ApiStatus;
  message: string;
  deletedCount: number;
};
