import { Request, Response } from "express";
import { z } from "zod";
import catchErrors from "@utils/http/catchErrors";
import appAssert from "@utils/validation/appAssert";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { SupportedLang } from "@constants/errorMessages";

import {
  getUserSessions,
  revokeAllUserSessionsExceptCurrent,
  revokeUserSessionById,
} from "@services/session.service";

import {
  GetUserSessionsResponse,
  RevokeSessionResponse,
  RevokeOthersResponse,
} from "@custom-types/modules/auth/session";

import { loggerEvent } from "@utils/logging/loggerEvent";
import { loggerAudit } from "@utils/logging/loggerAudit";

//==============================================================================
// 📌 Obtener sesiones activas
//==============================================================================
export const getActiveSessions = catchErrors(
  async (
    req: Request,
    res: Response<GetUserSessionsResponse>
  ): Promise<void> => {
    appAssert(
      req.userId && req.sessionId,
      HTTP_CODE.BAD_REQUEST,
      "User ID and Session ID are required."
    );

    const result = await getUserSessions({
      userId: req.userId,
      currentSessionId: req.sessionId,
    });

    loggerEvent(
      "session.list",
      {
        userId: req.userId,
        currentSessionId: req.sessionId,
        total: result.totalDevices,
        active: result.activeDevices,
      },
      req,
      "getActiveSessions"
    );

    res.status(HTTP_CODE.OK).json(result);
  }
);

//==============================================================================
// 🧨 Cerrar sesión específica (menos la actual)
//==============================================================================
export const deleteSession = catchErrors(
  async (req: Request, res: Response<RevokeSessionResponse>): Promise<void> => {
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;

    const sessionId = z.string().min(1).safeParse(req.params.id);

    appAssert(
      req.userId && req.sessionId,
      HTTP_CODE.BAD_REQUEST,
      "User ID and Session ID are required."
    );

    appAssert(
      sessionId.success,
      HTTP_CODE.BAD_REQUEST,
      getErrorMessage("INVALID_SESSION_ID", lang),
      ERROR_CODE.BAD_REQUEST
    );

    appAssert(
      sessionId.data !== req.sessionId,
      HTTP_CODE.BAD_REQUEST,
      getErrorMessage("CANNOT_DELETE_CURRENT_SESSION", lang),
      ERROR_CODE.CANNOT_DELETE_CURRENT_SESSION
    );

    const result = await revokeUserSessionById(
      {
        userId: req.userId,
        sessionId: sessionId.data,
        meta: req.meta!,
      },
      lang
    );

    loggerEvent(
      "session.revoked",
      {
        userId: req.userId,
        revokedSessionId: result.sessionId,
      },
      req,
      "deleteSession"
    );

    loggerAudit(
      "session.revoked",
      {
        performedBy: req.userId,
        targetId: result.sessionId,
        reason: "Closed manually from another device.",
      },
      req
    );

    res.status(HTTP_CODE.OK).json(result);
  }
);

//==============================================================================
// 🚫 Cerrar todas las sesiones excepto la actual
//==============================================================================
export const deleteAllOtherSessions = catchErrors(
  async (req: Request, res: Response<RevokeOthersResponse>): Promise<void> => {
    appAssert(
      req.userId && req.sessionId,
      HTTP_CODE.BAD_REQUEST,
      "User ID and Session ID are required."
    );

    const result = await revokeAllUserSessionsExceptCurrent({
      userId: req.userId,
      currentSessionId: req.sessionId,
    });

    loggerEvent(
      "session.revoke_all_except_current",
      {
        userId: req.userId,
        keptSessionId: req.sessionId,
        deletedCount: result.deletedCount,
      },
      req,
      "deleteAllOtherSessions"
    );

    loggerAudit(
      "session.mass_revoked",
      {
        performedBy: req.userId,
        targetId: req.userId,
        reason: "Closed all other sessions for security.",
      },
      req
    );

    res.status(HTTP_CODE.OK).json(result);
  }
);
