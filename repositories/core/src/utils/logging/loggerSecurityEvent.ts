// utils/logging/loggerSecurityEvent.ts
import prisma from "@config/prisma";

/**
 * 🔐 Registra eventos de seguridad en la base de datos.
 * Ideal para: huella inválida, intentos sospechosos, dispositivos no reconocidos.
 */
export const loggerSecurityEvent = async ({
  meta,
  type,
  userId,
  sessionId,
  details,
}: {
  meta: RequestMeta;
  type: string;
  userId: string;
  sessionId: string;
  details?: any;
}): Promise<void> => {
  try {
    await prisma.securityEventLog.create({
      data: {
        type,
        userId,
        sessionId,
        ipAddress: meta.ipAddress,
        browser: meta.deviceInfo.browser,
        os: meta.deviceInfo.os,
        path: meta.path,
        method: meta.method,
        host: meta.host,
        details: details ? JSON.stringify(details) : undefined,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    console.error("❌ Error al registrar SecurityEventLog:", err);
  }
};
