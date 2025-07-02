// middlewares/requestMeta.ts

/* import { Request, Response, NextFunction } from "express";
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
 */

import { Request, Response, NextFunction } from "express";
import { getRequestMeta } from "@utils/request/getRequestMeta";
import { getClientMeta } from "@utils/auth/getAccessKeysFromRequest";

export const requestMeta = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isForwardAuth = req.path === "/security/verify-admin";

  req.meta = isForwardAuth
    ? getClientMeta(req) || getRequestMeta(req) // fallback si la cookie está mal
    : getRequestMeta(req);

  next();
};
