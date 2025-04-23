// 📁 utils/eventDispatcher.ts

import { Request } from "express";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { loggerAudit } from "@utils/logging/loggerAudit";

/**
 * 🔀 Dispatcher central de eventos del sistema
 */
export const dispatchEvent = (
  eventName: string,
  data: Record<string, any>,
  req?: Request
) => {
  const isSensitive =
    eventName.includes("password") ||
    eventName.includes("deleted") ||
    eventName.includes("role");

  if (isSensitive) {
    // 🔒 Validación runtime
    if (typeof data.performedBy !== "string" || !data.performedBy.trim()) {
      throw new Error(
        `[dispatchEvent] Event "${eventName}" requiere performedBy como string válido para loggerAudit`
      );
    }

    // ✅ TypeScript feliz con tipado seguro
    loggerAudit(
      eventName,
      data as {
        performedBy: string;
        targetId?: string;
        reason?: string;
        [key: string]: any;
      },
      req
    );
  } else {
    loggerEvent(eventName, data, req);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("🛰️ dispatchEvent ▶", eventName, data);
  }
};
