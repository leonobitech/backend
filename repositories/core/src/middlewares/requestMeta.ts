// middlewares/requestMeta.ts

import { Request, Response, NextFunction } from "express";
import { getRequestMeta } from "@utils/request/getRequestMeta";

export const requestMeta = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Función pura que toma un Request y te da el objeto RequestMeta.
  // 📌 Es lo que hace que req.meta efectivamente exista cuando llega a los controladores.
  req.meta = getRequestMeta(req);
  next();
};
