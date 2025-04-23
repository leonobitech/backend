import { NODE_ENV } from "@config/env";
import catchErrors from "@utils/http/catchErrors";
import { Request, Response } from "express";

const debugHandler = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    const sessionId = req.sessionId;
    const role = req.role || "guest";
    const lang = req.lang || "en";

    const isAuthenticated = Boolean(userId && sessionId);

    if (isAuthenticated) {
      res.locals.user = { id: userId!, role };
    }

    if (NODE_ENV === "production") {
      res.status(403).json({
        message: "🚫 Endpoint de debug deshabilitado en producción.",
      });
    }

    res.status(200).json({
      message: isAuthenticated
        ? "✅ Usuario autenticado con token válido"
        : "⚠️ Usuario no autenticado o token ausente",
      isAuthenticated,
      userId,
      sessionId,
      role,
      lang,
      resLocalsUser: res.locals.user || null,
      env: NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  }
);

export default debugHandler;
