// =============================================================================
// Shared email wrapper with Leonobitech branding (full HTML/CSS, no images)
// =============================================================================

const currentYear = new Date().getFullYear();

const emailWrapper = (content: string) => `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:20px 0">
<tr><td align="center" style="padding:0 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

<!-- Header -->
<tr><td style="background-color:#2B2B2B;padding:24px 32px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="vertical-align:middle">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;padding-right:12px">
              <img src="https://www.leonobitech.com/icon_512x512.png" width="40" height="40" style="display:block;border-radius:8px" alt="L" />
            </td>
            <td style="vertical-align:middle">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Leonobitech</p>
              <p style="margin:2px 0 0;font-size:12px;color:#78716C">Soluciones Empresariales con IA</p>
            </td>
          </tr>
        </table>
      </td>
      <td style="vertical-align:middle;text-align:right">
        <a href="https://www.leonobitech.com" style="font-size:12px;color:#a1a1aa;text-decoration:none">leonobitech.com</a>
      </td>
    </tr>
  </table>
</td></tr>

${content}

<!-- Footer -->
<tr><td style="background-color:#2B2B2B;padding:32px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <!-- Logo + Description -->
    <tr><td style="padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;width:50%">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px">
                  <img src="https://www.leonobitech.com/icon_512x512.png" width="28" height="28" style="display:block;border-radius:6px" alt="L" />
                </td>
                <td style="vertical-align:middle">
                  <p style="margin:0;font-size:16px;font-weight:700;color:#D1D5DB">Leonobitech</p>
                </td>
              </tr>
            </table>
            <p style="margin:10px 0 0;font-size:12px;color:#78716C;line-height:1.5;max-width:260px">
              Agentes de voz, automatizaci&oacute;n inteligente, cursos y consultor&iacute;a con el ecosistema Anthropic.
            </p>
          </td>
          <td style="vertical-align:top;text-align:right">
            <p style="margin:0 0 8px;font-size:11px;color:#78716C;text-transform:uppercase;letter-spacing:1px">Contacto</p>
            <p style="margin:0;font-size:12px;color:#A8A29E">felix@leonobitech.com</p>
            <p style="margin:4px 0 0;font-size:12px;color:#A8A29E">leonobitech.com</p>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Social + Copyright -->
    <tr><td style="padding-top:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <!-- Social Icons -->
            <a href="https://x.com/leonobitech" style="text-decoration:none;margin-right:12px">
              <img src="https://img.icons8.com/ios-filled/20/78716C/twitterx--v1.png" width="20" height="20" alt="X" style="display:inline-block" />
            </a>
            <a href="https://www.instagram.com/leonobitech/" style="text-decoration:none;margin-right:12px">
              <img src="https://img.icons8.com/ios-filled/20/78716C/instagram-new--v1.png" width="20" height="20" alt="IG" style="display:inline-block" />
            </a>
            <a href="https://www.linkedin.com/company/leonobitech" style="text-decoration:none;margin-right:12px">
              <img src="https://img.icons8.com/ios-filled/20/78716C/linkedin.png" width="20" height="20" alt="LI" style="display:inline-block" />
            </a>
            <a href="https://www.youtube.com/@leonobitech" style="text-decoration:none;margin-right:12px">
              <img src="https://img.icons8.com/ios-filled/20/78716C/youtube-play.png" width="20" height="20" alt="YT" style="display:inline-block" />
            </a>
            <a href="https://github.com/leonobitech" style="text-decoration:none">
              <img src="https://img.icons8.com/ios-filled/20/78716C/github.png" width="20" height="20" alt="GH" style="display:inline-block" />
            </a>
          </td>
          <td style="text-align:right">
            <p style="margin:0;font-size:11px;color:#78716C">&copy; ${currentYear} Leonobitech. Todos los derechos reservados.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
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
<!-- Title -->
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Seguridad</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Restablece tu contraseña</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Recibimos una solicitud para restablecer tu contraseña en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">
    Este código expira en <strong style="color:#52525b">5 minutos</strong>
  </p>
</td></tr>

<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este correo, puedes ignorarlo de forma segura.</p>
</td></tr>`),
});

export const getVerifyEmailTemplate = (code: string) => ({
  subject: "🚀 Bienvenido a Leonobitech - Verifica tu cuenta",
  text: `Tu código de verificación es: ${code}. Este código expirará en 15 minutos.`,
  html: emailWrapper(`
<!-- Title -->
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Bienvenido</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Verifica tu cuenta</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Gracias por registrarte en <strong style="color:#1a1a1a">Leonobitech</strong>. Usa el siguiente código para verificar tu cuenta:
  </p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">
    Este código expira en <strong style="color:#52525b">15 minutos</strong>
  </p>
</td></tr>

<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este correo, puedes ignorarlo de forma segura.</p>
</td></tr>`),
});

export const getTwoFactorAuthTemplate = (otpCode: string) => ({
  subject: "🔐 Tu código de autenticación 2FA",
  text: `Tu código de autenticación de dos factores (2FA) es: ${otpCode}. Este código expirará en 15 minutos.`,
  html: emailWrapper(`
<!-- Title -->
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Autenticación</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Código 2FA</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Tu código de autenticación de dos factores es:
  </p>
  ${codeBlock(otpCode)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">
    Este código expira en <strong style="color:#52525b">15 minutos</strong>. No compartas este código con nadie.
  </p>
</td></tr>

<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">Si no solicitaste este código, ignora este mensaje.</p>
</td></tr>`),
});

export const getDeviceValidationTemplate = (code: string) => ({
  subject: "⚠️ Nuevo dispositivo detectado en Leonobitech",
  text: `Recibimos un intento de inicio de sesión desde un nuevo dispositivo. Tu código de verificación es: ${code}. Este código expirará en 10 minutos.`,
  html: emailWrapper(`
<!-- Title -->
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Seguridad</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Nuevo dispositivo detectado</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6">
    Detectamos un intento de inicio de sesión desde un dispositivo no registrado en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  <div style="padding:0 0 16px">
    ${warningBlock("Si no fuiste tú, ignora este mensaje. Tu cuenta permanece segura.")}
  </div>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b">Si fuiste tú, usa el siguiente código para autorizarlo:</p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">
    Este código expira en <strong style="color:#52525b">10 minutos</strong>
  </p>
</td></tr>`),
});

export const getPasskeyRecoveryTemplate = (code: string) => ({
  subject: "🔐 Código de recuperación de Passkey - Leonobitech",
  text: `Tu código de recuperación de passkey es: ${code}. Este código expirará en 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
  html: emailWrapper(`
<!-- Title -->
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Recuperación</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Recuperación de Passkey</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6">
    Recibimos una solicitud para recuperar el acceso a tu cuenta en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  <div style="padding:0 0 16px">
    ${warningBlock("Si no solicitaste este código, alguien podría estar intentando acceder a tu cuenta. Ignora este mensaje.")}
  </div>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b">Ingresa el siguiente código para continuar:</p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">
    Este código expira en <strong style="color:#52525b">10 minutos</strong>
  </p>
  <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa">
    Después de verificar el código, podrás configurar un nuevo passkey.
  </p>
</td></tr>`),
});

export const getMagicLinkTemplate = (magicLinkUrl: string) => ({
  subject: "🔑 Inicia sesión en Leonobitech",
  text: `Haz clic en el siguiente enlace para iniciar sesión: ${magicLinkUrl}. Este enlace expirará en 5 minutos.`,
  html: emailWrapper(`
<!-- Title -->
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Acceso Seguro</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Inicia sesión</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Haz clic en el botón para acceder a tu cuenta en <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  ${buttonBlock(magicLinkUrl, "Iniciar sesión")}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">
    Este enlace expira en <strong style="color:#52525b">5 minutos</strong>
  </p>
</td></tr>

<!-- Link Fallback -->
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
