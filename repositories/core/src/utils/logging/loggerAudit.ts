// 📁 utils/loggerAudit.ts

import { Request } from "express";
import logger from "@utils/logging/logger";
import { getLogContext } from "@utils/request/getLogContext";

/**
 * 🛡️ Log de auditoría para acciones críticas y trazables.
 * Ej: cambios de contraseña, roles, eliminación de cuentas, etc.
 */
export const loggerAudit = (
  action: string, // Ej: "password.changed", "user.deleted"
  data: {
    performedBy: string; // ID de quien realizó la acción
    targetId?: string; // ID del afectado (opcional)
    reason?: string; // Motivo si aplica
    [key: string]: any; // Más info libre
  },
  req?: Request
) => {
  const context = req ? getLogContext(req) : {};

  logger.info(`🧾 Auditoría: ${action}`, {
    ...context,
    ...data,
    timestamp: new Date().toISOString(),
  });
};
