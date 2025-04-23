import { Request, Response } from "express";
import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import catchErrors from "@utils/http/catchErrors";
import appAssert from "@utils/validation/appAssert";
import { updateProfileSchema } from "@schemas/accountSchemas";
import logger from "@utils/logging/logger";
import { ERROR_CODE } from "@constants/errorCode";
import { loggerAudit } from "@utils/logging/loggerAudit";

// 📌 GET /account/me
export const getMe = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        avatar: true,
        role: true,
        verified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    appAssert(
      user,
      HTTP_CODE.UNAUTHORIZED,
      "Usuario no encontrado",
      ERROR_CODE.USER_NOT_FOUND
    );

    const session = await prisma.session.findUnique({
      where: { id: req.sessionId },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        device: {
          select: {
            device: true,
            os: true,
            browser: true,
            ipAddress: true,
            userAgent: true,
            language: true,
            platform: true,
            timezone: true,
            screenResolution: true,
            label: true,
          },
        },
      },
    });

    if (!session) {
      logger.warn("[getMe] Sesión no encontrada", {
        sessionId: req.sessionId,
        userId: req.userId,
      });
    }

    res.status(HTTP_CODE.OK).json({
      message: "Datos del usuario obtenidos con éxito.",
      user,
      session: session ?? null,
    });
  }
);
//==============================================================================

// 📌 PATCH /account/profile
export const updateProfile = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const parsed = updateProfileSchema.safeParse(req.body);

    appAssert(
      parsed.success,
      HTTP_CODE.BAD_REQUEST,
      "Datos del perfil inválidos",
      ERROR_CODE.INVALID_INPUT,
      parsed.error
        ? Object.entries(parsed.error.flatten().fieldErrors).map(
            ([field, messages]) => ({
              field,
              message: messages?.join(", ") || "Valor inválido",
            })
          )
        : []
    );

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        email: true,
        role: true,
        verified: true,
        updatedAt: true,
      },
    });

    // 🧾 Auditoría del cambio
    loggerAudit(
      "account.profile.updated",
      {
        performedBy: req.userId,
        changes: parsed.data,
      },
      req
    );

    res.status(HTTP_CODE.OK).json({
      message: "Perfil actualizado correctamente.",
      user: updatedUser,
    });
  }
);
