// 📁 utils/auth/findOrCreateDevice.ts

import { prisma } from "@config/prisma";
import { dispatchEvent } from "@utils/logging/eventDispatcher";

export const findOrCreateDevice = async (userId: string, meta: RequestMeta) => {
  const { device, os, browser } = meta.deviceInfo;
  const {
    ipAddress,
    userAgent,
    language,
    timezone,
    platform,
    screenResolution,
    label,
  } = meta;

  // 1️⃣ Buscar por índice único primero
  let deviceRecord = await prisma.device.findUnique({
    where: {
      unique_device: {
        userId,
        device,
        os,
        browser,
      },
    },
  });

  // 2️⃣ Si no se encuentra, buscar coincidencia más precisa
  if (!deviceRecord) {
    deviceRecord = await prisma.device.findFirst({
      where: {
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
  }

  // 3️⃣ Si no existe nada, crearlo
  if (!deviceRecord) {
    deviceRecord = await prisma.device.create({
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
  }

  // 📡 Registrar creación exitosa
  dispatchEvent("auth.device.created", {
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
  });

  return deviceRecord;
};
