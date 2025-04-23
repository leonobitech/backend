// 📁 utils/auth/findOrCreateDevice.ts

import { prisma } from "@config/prisma";

export const findOrCreateDevice = async (userId: string, meta: RequestMeta) => {
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

  // 1️⃣ Buscar por índice único primero
  let deviceRecord = await prisma.device.findUnique({
    where: {
      unique_device: {
        userId,
        device,
        os,
        browser,
        ipAddress,
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
        platform,
        timezone,
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
        platform,
        timezone,
        screenResolution,
        label,
      },
    });
  }

  return deviceRecord;
};
