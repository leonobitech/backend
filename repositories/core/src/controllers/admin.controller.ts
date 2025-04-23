import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";

export const getAdminInfo = (req: Request, res: Response) => {
  res.status(HTTP_CODE.OK).json({
    message: "🎯 Bienvenido al panel de administración",
    userId: req.userId,
    role: req.role,
    time: new Date().toISOString(),
  });
};
