import { prisma } from "@config/prisma";
import crypto from "crypto";
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
  const { ipAddress } = meta;

  const existingDevice = await prisma.device.findUnique({
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

  if (existingDevice) {
    dispatchEvent("auth.device.found", {
      performedBy: userId,
      deviceId: existingDevice.id,
      device,
      os,
      browser,
      ipAddress,
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

  const verifyCode = await prisma.verificationCode.create({
    data: {
      userId,
      type: VerificationCodeType.DeviceValidation,
      hashedCode,
      expiresAt: fiveMinutesFromNow(),
    },
  });

  await sendDeviceValidationEmail(email, rawCode);

  dispatchEvent("auth.device.verification_requested", {
    performedBy: userId,
    email,
    codeId: verifyCode.id,
    device,
    os,
    browser,
    ipAddress,
  });

  return {
    status: API_STATUS.DEVICE_PENDING_VERIFICATION,
    message: "Verificación requerida para nuevo dispositivo.",
    data: {
      userId: userId,
      email: email,
      codeSent: true,
    },
  };
};
