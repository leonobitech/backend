// =============================================================================
// Shared email wrapper with Leonobitech branding
// =============================================================================

const currentYear = new Date().getFullYear();

const emailWrapper = (content: string) => `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

<!-- Header full-width -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#2B2B2B">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0">
    <tr><td style="padding:0">
      <img src="https://www.leonobitech.com/email-header.png" width="600" style="display:block;width:100%;height:auto" alt="Leonobitech" />
    </td></tr>
  </table>
</td></tr>
</table>

<!-- Body card -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222">
<tr><td align="center" style="padding:0">
  <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff">
    ${content}
  </table>
</td></tr>
</table>

<!-- Divider -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222">
<tr><td align="center" style="padding:0">
  <table width="600" cellpadding="0" cellspacing="0">
    <tr><td style="padding:0 32px"><div style="border-top:1px solid #e5e5e5"></div></td></tr>
  </table>
</td></tr>
</table>

<!-- Footer -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#222222">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0">
    <tr><td style="padding:24px 32px;text-align:center">
      <p style="margin:0 0 12px;font-size:13px;color:#A8A29E;line-height:1.6">Leonobitech &middot; Soluciones Empresariales con IA</p>
      <p style="margin:0 0 16px;font-size:12px;color:#78716C">contact@leonobitech.com</p>
      <!-- Social Icons -->
      <table cellpadding="0" cellspacing="0" style="margin:0 auto">
        <tr>
          <td style="padding:0 8px"><a href="https://github.com/leonobitech" style="text-decoration:none"><img src="https://www.leonobitech.com/email/github.png" width="22" height="22" alt="GitHub" style="display:block" /></a></td>
          <td style="padding:0 8px"><a href="https://www.instagram.com/leonobitech/" style="text-decoration:none"><img src="https://www.leonobitech.com/email/instagram.png" width="22" height="22" alt="Instagram" style="display:block" /></a></td>
          <td style="padding:0 8px"><a href="https://x.com/leonobitech" style="text-decoration:none"><img src="https://www.leonobitech.com/email/x.png" width="22" height="22" alt="X" style="display:block" /></a></td>
          <td style="padding:0 8px"><a href="https://www.linkedin.com/company/leonobitech" style="text-decoration:none"><img src="https://www.leonobitech.com/email/linkedin.png" width="22" height="22" alt="LinkedIn" style="display:block" /></a></td>
          <td style="padding:0 8px"><a href="https://www.youtube.com/@leonobitech" style="text-decoration:none"><img src="https://www.leonobitech.com/email/youtube.png" width="22" height="22" alt="YouTube" style="display:block" /></a></td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:10px;color:#52524e">&copy; ${currentYear} Leonobitech. Todos los derechos reservados.</p>
    </td></tr>
  </table>
</td></tr>
</table>

</body>
</html>`;

const codeBlock = (code: string) => `
<table cellpadding="0" cellspacing="0" style="margin:0 auto">
  <tr>
    <td style="background-color:#f4f4f5;border-radius:10px;padding:16px 32px">
      <span style="font-size:28px;font-weight:700;color:#1a1a1a;letter-spacing:6px;font-family:monospace">${code}</span>
    </td>
  </tr>
</table>`;

const buttonBlock = (url: string, label: string) => `
<table cellpadding="0" cellspacing="0" style="margin:0 auto">
  <tr>
    <td style="background-color:#2B2B2B;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
      <a href="${url}" style="display:inline-block;padding:14px 40px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.5px">${label}</a>
    </td>
  </tr>
</table>`;

const warningBlock = (text: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:8px;overflow:hidden">
  <tr><td style="padding:12px 16px">
    <p style="margin:0;font-size:13px;color:#92400e"><strong>&#9888;&#65039; Importante:</strong> ${text}</p>
  </td></tr>
</table>`;

// =============================================================================
// Templates
// =============================================================================

export const getPasswordResetTemplate = (code: string) => ({
  subject: "Restablece tu contraseña en Leonobitech",
  text: `Tu código para restablecer la contraseña es: ${code}. Este código expirará en 5 minutos.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Seguridad</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Restablece tu contraseña</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Recibimos una solicitud para restablecer tu contraseña en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Este código expira en <strong style="color:#52525b">5 minutos</strong></p>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este correo, puedes ignorarlo de forma segura.</p>
</td></tr>`),
});

export const getVerifyEmailTemplate = (code: string) => ({
  subject: "🚀 Bienvenido a Leonobitech - Verifica tu cuenta",
  text: `Tu código de verificación es: ${code}. Este código expirará en 15 minutos.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Bienvenido</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Verifica tu cuenta</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Gracias por registrarte en <strong style="color:#1a1a1a">Leonobitech</strong>. Usa el siguiente código para verificar tu cuenta:
  </p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Este código expira en <strong style="color:#52525b">15 minutos</strong></p>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este correo, puedes ignorarlo de forma segura.</p>
</td></tr>`),
});

export const getTwoFactorAuthTemplate = (otpCode: string) => ({
  subject: "🔐 Tu código de autenticación 2FA",
  text: `Tu código de autenticación de dos factores (2FA) es: ${otpCode}. Este código expirará en 15 minutos.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Autenticación</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Código 2FA</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">Tu código de autenticación de dos factores es:</p>
  ${codeBlock(otpCode)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Este código expira en <strong style="color:#52525b">15 minutos</strong>. No compartas este código con nadie.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este código, ignora este mensaje.</p>
</td></tr>`),
});

export const getDeviceValidationTemplate = (code: string) => ({
  subject: "⚠️ Nuevo dispositivo detectado en Leonobitech",
  text: `Recibimos un intento de inicio de sesión desde un nuevo dispositivo. Tu código de verificación es: ${code}. Este código expirará en 10 minutos.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Seguridad</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Nuevo dispositivo detectado</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6">
    Detectamos un intento de inicio de sesión desde un dispositivo no registrado en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  <div style="padding:0 0 16px">${warningBlock("Si no fuiste tú, ignora este mensaje. Tu cuenta permanece segura.")}</div>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b">Si fuiste tú, usa el siguiente código para autorizarlo:</p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Este código expira en <strong style="color:#52525b">10 minutos</strong></p>
</td></tr>`),
});

export const getPasskeyRecoveryTemplate = (code: string) => ({
  subject: "🔐 Código de recuperación de Passkey - Leonobitech",
  text: `Tu código de recuperación de passkey es: ${code}. Este código expirará en 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Recuperación</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Recuperación de Passkey</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6">
    Recibimos una solicitud para recuperar el acceso a tu cuenta en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  <div style="padding:0 0 16px">${warningBlock("Si no solicitaste este código, alguien podría estar intentando acceder a tu cuenta. Ignora este mensaje.")}</div>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b">Ingresa el siguiente código para continuar:</p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Este código expira en <strong style="color:#52525b">10 minutos</strong></p>
  <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa">Después de verificar el código, podrás configurar un nuevo passkey.</p>
</td></tr>`),
});

export const getMagicLinkTemplate = (magicLinkUrl: string) => ({
  subject: "🔑 Inicia sesión en Leonobitech",
  text: `Haz clic en el siguiente enlace para iniciar sesión: ${magicLinkUrl}. Este enlace expirará en 5 minutos.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Acceso Seguro</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Inicia sesión</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Haz clic en el botón para acceder a tu cuenta en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  ${buttonBlock(magicLinkUrl, "Iniciar sesión")}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Este enlace expira en <strong style="color:#52525b">5 minutos</strong></p>
</td></tr>
<tr><td style="padding:0 32px 32px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;border-radius:8px;overflow:hidden">
    <tr><td style="padding:12px 16px">
      <p style="margin:0 0 6px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px">Si el botón no funciona</p>
      <p style="margin:0;font-size:12px;color:#52525b;word-break:break-all;font-family:monospace">${magicLinkUrl}</p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este correo, puedes ignorarlo de forma segura.</p>
</td></tr>`),
});
