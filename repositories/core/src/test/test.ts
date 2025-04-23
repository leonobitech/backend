import { Request, Response, NextFunction } from "express";
import catchErrors from "@utils/http/catchErrors";

export const testHandler = catchErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;
    const sessionId = req.sessionId;
    const lang = req.lang;
    const role = req.role;

    res.locals.user = {
      id: userId || "anonymous",
      role: role || "user",
    };

    res.status(200).json({
      message: "Tipos extendidos funcionando correctamente",
      userId,
      sessionId,
      lang,
      role,
      injectedUser: res.locals.user,
    });
  }
);
