import { Request } from "express";
import { prisma } from "@config/prisma";
import HttpException from "@utils/http/HttpException";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { dispatchEvent } from "@utils/logging/eventDispatcher";
import { logHttpError } from "@utils/logging/logHttpError";

/**
 * 🔐 Crea un dispositivo vinculado a un usuario.
 * 🚨 Este helper solo debe usarse en el flujo de verificación inicial (verifyEmailService).
 * ❌ Si el dispositivo ya existe, se lanza una excepción: posible intento sospechoso.
 */
export const createNewDevice = async (
  userId: string,
  meta: RequestMeta,
  req?: Request
) => {
  const { device, os, browser } = meta.deviceInfo;
  const {
    ipAddress,
    userAgent,
    language,
    platform,
    timezone,
    screenResolution,
    label,
  } = meta;

  // 🔍 Verificar si ya existe el dispositivo
  const existing = await prisma.device.findUnique({
    where: {
      unique_device: {
        userId,
        device,
        os,
        browser,
      },
    },
  });

  if (existing) {
    // 📡 Registrar intento sospechoso
    dispatchEvent(
      "auth.device.duplicate_detected",
      {
        performedBy: userId,
        device,
        os,
        browser,
        ipAddress,
        label,
        source: "auth.verifyEmailService",
      },
      req
    );

    // 🛑 Lanzar error y registrar en log
    const error = new HttpException(
      HTTP_CODE.CONFLICT,
      "Ya existe un dispositivo con esta huella",
      ERROR_CODE.DEVICE_ALREADY_EXISTS
    );

    if (req) logHttpError(error, req);
    throw error;
  }

  // ✅ Crear el dispositivo
  const newDevice = await prisma.device.create({
    data: {
      userId,
      device,
      os,
      browser,
      ipAddress,
      userAgent,
      language,
      timezone,
      platform,
      screenResolution,
      label,
    },
  });

  // 📡 Registrar creación exitosa
  dispatchEvent(
    "auth.device.created",
    {
      performedBy: userId,
      device,
      os,
      browser,
      ipAddress,
      userAgent,
      language,
      timezone,
      platform,
      screenResolution,
      label,
    },
    req
  );

  return newDevice;
};
