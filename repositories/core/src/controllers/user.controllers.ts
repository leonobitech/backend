import { Request, Response } from "express";
import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import catchErrors from "@utils/http/catchErrors";
import appAssert from "@utils/validation/appAssert";
import { updateProfileSchema, changePasswordSchema } from "@schemas/accountSchemas";
import logger from "@utils/logging/logger";
import { ERROR_CODE } from "@constants/errorCode";
import { loggerAudit } from "@utils/logging/loggerAudit";
import { compareValue, hashValue } from "@utils/auth/bcrypt";

/**
 * 📌 POST /account/me
 * Retorna los datos del usuario autenticado y su sesión actual
 */
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
        website: true,
        location: true,
        socialTwitter: true,
        socialInstagram: true,
        socialYoutube: true,
        socialGithub: true,
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
        isRevoked: true,
        expiresAt: true,
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

      res.status(HTTP_CODE.UNAUTHORIZED).json({
        message: "Sesión no encontrada.",
        session: null,
        user: null,
      });
      return;
    }

    if (session.isRevoked || session.expiresAt <= new Date()) {
      logger.warn("[getMe] Sesión inválida (revocada o expirada)", {
        sessionId: session.id,
        userId: req.userId,
        isRevoked: session.isRevoked,
        expiresAt: session.expiresAt,
      });

      res.status(HTTP_CODE.UNAUTHORIZED).json({
        message: "Sesión inválida o expirada.",
        session: null,
        user: null,
      });
      return;
    }

    res.status(HTTP_CODE.OK).json({
      message: "Datos del usuario obtenidos con éxito.",
      user,
      session,
    });
    return;
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
        website: true,
        location: true,
        socialTwitter: true,
        socialInstagram: true,
        socialYoutube: true,
        socialGithub: true,
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

//==============================================================================

/**
 * 📌 POST /account/password/change
 * Cambiar la contraseña del usuario autenticado
 */
export const changePassword = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const parsed = changePasswordSchema.safeParse(req.body);

    appAssert(
      parsed.success,
      HTTP_CODE.BAD_REQUEST,
      "Datos inválidos",
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

    const { currentPassword, newPassword } = parsed.data;

    // Obtener el usuario con la contraseña actual
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        password: true,
      },
    });

    appAssert(
      user,
      HTTP_CODE.NOT_FOUND,
      "Usuario no encontrado",
      ERROR_CODE.USER_NOT_FOUND
    );

    // Verificar que la contraseña actual sea correcta
    appAssert(
      user.password,
      HTTP_CODE.BAD_REQUEST,
      "This account uses passwordless login",
      ERROR_CODE.INVALID_INPUT
    );

    const isCurrentPasswordValid = await compareValue(
      currentPassword,
      user.password
    );

    appAssert(
      isCurrentPasswordValid,
      HTTP_CODE.UNAUTHORIZED,
      "Contraseña actual incorrecta",
      ERROR_CODE.INVALID_CREDENTIALS
    );

    // Verificar que la nueva contraseña no sea igual a la actual
    const isSamePassword = await compareValue(newPassword, user.password);

    appAssert(
      !isSamePassword,
      HTTP_CODE.BAD_REQUEST,
      "La nueva contraseña debe ser diferente a la actual",
      ERROR_CODE.INVALID_INPUT
    );

    // Hashear la nueva contraseña
    const hashedNewPassword = await hashValue(newPassword);

    // Actualizar la contraseña
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        password: hashedNewPassword,
      },
    });

    // 🧾 Auditoría del cambio
    loggerAudit(
      "account.password.changed",
      {
        performedBy: req.userId,
        timestamp: new Date().toISOString(),
      },
      req
    );

    logger.info("✅ Contraseña cambiada exitosamente", {
      userId: req.userId,
      sessionId: req.sessionId,
    });

    res.status(HTTP_CODE.OK).json({
      message: "Contraseña actualizada correctamente.",
      passwordChangedAt: new Date().toISOString(),
    });
  }
);

//==============================================================================

/**
 * 📌 PATCH /account/avatar/update-from-n8n
 * Endpoint especial para n8n: actualiza el avatar después de subirlo a Baserow
 * Requiere X-API-KEY en headers
 */
export const updateAvatarFromN8n = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { z } = await import("zod");

    const updateAvatarSchema = z.object({
      userId: z.string().min(1, "userId es requerido"),
      avatarUrl: z.string().url("Debe ser una URL válida"),
    });

    const parsed = updateAvatarSchema.safeParse(req.body);

    appAssert(
      parsed.success,
      HTTP_CODE.BAD_REQUEST,
      "Datos inválidos",
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

    const { userId, avatarUrl } = parsed.data;

    // Verificar que el usuario existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    appAssert(
      user,
      HTTP_CODE.NOT_FOUND,
      "Usuario no encontrado",
      ERROR_CODE.USER_NOT_FOUND
    );

    // Actualizar avatar
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        avatar: true,
        updatedAt: true,
      },
    });

    logger.info("✅ Avatar actualizado desde n8n", {
      userId,
      avatarUrl,
      source: "n8n-webhook",
    });

    res.status(HTTP_CODE.OK).json({
      message: "Avatar actualizado correctamente desde n8n.",
      user: updatedUser,
    });
  }
);
