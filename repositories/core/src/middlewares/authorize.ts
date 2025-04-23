import { RequestHandler } from "express";
import { UserRole } from "@constants/userRole";
import { SupportedLang } from "@constants/errorMessages";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import HttpException from "@utils/http/HttpException";
import logger from "@utils/logging/logger";

/**
 * 🛡️ Middleware para restringir acceso a ciertos roles.
 * Uso: `authorize(UserRole.Admin)` o `authorize(UserRole.Admin, UserRole.Moderator)`
 */
const authorize =
  (...allowedRoles: UserRole[]): RequestHandler =>
  (req, res, next) => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const user = res.locals.user;

    if (!user?.role || !allowedRoles.includes(user.role as UserRole)) {
      logger.warn("🚫 Acceso denegado por rol", {
        ...req.meta,
        userId: user?.id || "unknown",
        attemptedRole: user?.role || "undefined",
        allowedRoles,
        event: "access.denied",
        resource: req.originalUrl,
      });

      throw new HttpException(
        HTTP_CODE.FORBIDDEN,
        getErrorMessage("ACCESS_DENIED", lang),
        ERROR_CODE.ACCESS_DENIED,
        [`Required roles: ${allowedRoles.join(", ")}`]
      );
    }

    logger.info("🔐 Acceso autorizado", {
      ...req.meta,
      userId: user.id,
      role: user.role,
      event: "access.granted",
      resource: req.originalUrl,
    });

    next();
  };

export default authorize;
