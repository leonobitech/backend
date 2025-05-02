import { Request, Response, NextFunction } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { loggerAudit } from "@utils/logging/loggerAudit";

const suspiciousPrefixes = [
  "ph_phc_",
  "ph_",
  "rl_",
  "rudder",
  "ajs_",
  "mp_",
  "_ga",
  "_gid",
  "_gat",
  "_hj",
  "_fbp",
  "_clck",
  "_clsk",
  "intercom-id-",
  "intercom-session-",
  "sentry_",
  "sl_",
  "_fp_",
  "_cio",
  "_vercel",
];

export default function monitorCookies(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const cookies = req.cookies || {};
  const found = Object.keys(cookies).filter((name) =>
    suspiciousPrefixes.some((prefix) => name.startsWith(prefix))
  );

  if (found.length > 0) {
    loggerAudit(
      "security.cookie_blocked",
      {
        performedBy: "anonymous",
        reason: "Cookies no autorizadas detectadas",
        cookies: found,
        path: req.originalUrl,
        method: req.method,
        ip: req.meta?.ipAddress,
        userAgent: req.meta?.userAgent,
        label: req.meta?.label,
      },
      req
    );

    res.status(HTTP_CODE.FORBIDDEN).json({
      status: "error",
      message:
        "Se detectaron cookies no autorizadas. Limpiá tu navegador y volvé a intentar.",
      cookies: found,
    });

    return; // 🔑 IMPORTANTE: no retornes el resultado de .json()
  }

  next();
}
