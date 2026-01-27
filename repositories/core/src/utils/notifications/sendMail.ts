import resend from "@config/resend";
import { EMAIL_SENDER, NODE_ENV } from "@config/env";
import {
  getTwoFactorAuthTemplate,
  getVerifyEmailTemplate,
  getPasswordResetTemplate,
  getDeviceValidationTemplate,
  getPasskeyRecoveryTemplate,
} from "./emailTemplates";

type Params = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const getFromEmail = () =>
  NODE_ENV === "development"
    ? "Leonobitech Dev <onboarding@resend.dev>"
    : `Leonobitech <${EMAIL_SENDER}>`;

const getToEmail = (to: string) =>
  NODE_ENV === "development" ? "delivered@resend.dev" : to;

export const sendMail = async ({ to, subject, text, html }: Params) =>
  await resend.emails.send({
    from: getFromEmail(),
    to: getToEmail(to),
    subject,
    text,
    html,
    replyTo: "noreply@leonobitech.com",
  });

/**
 * Enviar el email de verificación de cuenta con código de activación.
 */
export const sendVerificationEmail = async (
  to: string,
  verificationCode: string
) => {
  const template = getVerifyEmailTemplate(verificationCode);

  await sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
};

/**
 * Enviar el email de verificación de usuario con código para reset password.
 */
export const sendPasswordResetEmail = async (
  to: string,
  verificationCode: string
) => {
  const template = getPasswordResetTemplate(verificationCode);

  await sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
};

/**
 * Enviar el código de autenticación 2FA por correo electrónico.
 */
export const sendTwoFactorCodeMail = async (to: string, otpCode: string) => {
  const template = getTwoFactorAuthTemplate(otpCode);

  await sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
};

/**
 * Enviar código para validar un nuevo dispositivo durante el login.
 */
export const sendDeviceValidationEmail = async (
  to: string,
  verificationCode: string
) => {
  const template = getDeviceValidationTemplate(verificationCode);

  await sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
};

/**
 * 🔐 Enviar código OTP para recuperación de passkey.
 * Se usa cuando el usuario pierde acceso a su teléfono.
 */
export const sendPasskeyRecoveryEmail = async (
  to: string,
  recoveryCode: string
) => {
  const template = getPasskeyRecoveryTemplate(recoveryCode);

  await sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
};
