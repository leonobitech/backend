// 📁 @types/global/express.d.ts

import "express";
import { AccessTokenPayload } from "@schemas/tokenSchemas";
import { UserRole } from "@constants/userRole";

declare global {
  // Definimos la interfaz para el objeto meta que se agrega a la petición
  interface RequestMeta {
    ipAddress: string;
    deviceInfo: {
      browser: string;
      os: string;
      device: string;
    };
    userAgent: string; // ✅ ahora es obligatorio
    language: string;
    platform: string;
    timezone: string;
    screenResolution: string;
    label: string;
    path: string;
    method: string;
    host: string;
    // 🔐 Security fields for ForwardAuth validation
    sessionId?: string;  // Bound to authenticated session
    createdAt?: number;  // Timestamp for expiry validation
  }

  // Definimos la interfaz para el objeto de configuración de la petición
  namespace Express {
    interface Request {
      meta: RequestMeta;
      user: AccessTokenPayload;
      userId: string;
      sessionId: string;
      role: UserRole;
      lang: string;
    }

    interface Locals {
      user: {
        id: string;
        role: string;
      };
    }
  }
}

export {};

/**
 * Nota:
 * res.locals es un objeto temporal que vive dentro de una sola petición,
 * y sirve para compartir datos entre middlewares y controladores sin modificar el req.
 *  res.locals.user = {
      id: req.userId,
      role: req.role,
    };
 *
 */
