import { prisma } from "@config/prisma";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { hashValue } from "./bcrypt";
import { sendDeviceValidationEmail } from "@utils/notifications/sendMail";
import { fiveMinutesFromNow } from "@utils/date/date";
import { dispatchEvent } from "@utils/logging/eventDispatcher";
import VerificationCodeType from "@constants/verificationCodeType";
import { LoginDeviceCheckResponse } from "@custom-types/modules/auth/account";
import { API_STATUS } from "@constants/apiStatus";

/**
 * 🧠 Verifica si el dispositivo está registrado para el usuario.
 * 📧 Si no lo está, envía un código al email para autorizar el nuevo dispositivo.
 */
export const checkDeviceOrSendVerification = async (
  userId: string,
  email: string,
  meta: RequestMeta
): Promise<LoginDeviceCheckResponse> => {
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

  const existingDevice = await prisma.device.findUnique({
    where: {
      unique_device: {
        userId,
        device,
        os,
        browser,
      },
    },
  });

  if (existingDevice) {
    dispatchEvent("auth.device.found", {
      performedBy: userId,
      deviceId: existingDevice.id,
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

    return {
      status: API_STATUS.SUCCESS,
      message: "Dispositivo reconocido",
      data: {
        deviceId: existingDevice.id,
      },
    };
  }

  const rawCode = crypto.randomInt(100000, 999999).toString();
  const hashedCode = await hashValue(rawCode);
  const requestId = uuidv4();
  const verifyCode = await prisma.verificationCode.create({
    data: {
      userId,
      type: VerificationCodeType.DeviceValidation,
      hashedCode,
      requestId,
      expiresAt: fiveMinutesFromNow(),
    },
  });

  await sendDeviceValidationEmail(email, rawCode);

  dispatchEvent("auth.device.verification_requested", {
    performedBy: userId,
    email,
    codeId: verifyCode.id,
    requestId: requestId,
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

  const expiresIn = Math.floor(
    (verifyCode.expiresAt.getTime() - Date.now()) / 1000
  );

  return {
    status: API_STATUS.DEVICE_PENDING_VERIFICATION,
    message:
      "New device detected — we've sent a verification code to your email.",
    data: {
      userId: userId,
      email: email,
      codeSent: true,
      requestId: requestId,
      expiresIn: expiresIn,
    },
  };
};
