export const getPasswordResetTemplate = (code: string) => {
  return {
    subject: "Restablece tu contraseña en Leonobitech",
    text: `Tu código para restablecer la contraseña es: ${code}. Este código expirará en 5 minutos.`,
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Restablecimiento de Contraseña</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
                  text-align: center;
              }
              .container {
                  width: 100%;
                  max-width: 600px;
                  margin: 30px auto;
                  background: #ffffff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              h1 {
                  color: #333;
              }
              p {
                  font-size: 16px;
                  color: #555;
              }
              .code {
                  font-size: 24px;
                  font-weight: bold;
                  color: #2196F3;
                  margin: 20px 0;
                  padding: 10px;
                  background: #f3f3f3;
                  border-radius: 5px;
                  display: inline-block;
                  letter-spacing: 2px;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>Restablece tu contraseña</h1>
              <p>Recibimos una solicitud para restablecer tu contraseña de <strong>Leonobitech</strong>.</p>
              <p>Ingresa el siguiente código para continuar con el proceso:</p>
              <div class="code">${code}</div>
              <p>Este código expirará en <strong>5 minutos</strong>. Si no fuiste tú quien lo solicitó, puedes ignorar este mensaje.</p>
              <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} Leonobitech. Todos los derechos reservados.</p>
              </div>
          </div>
      </body>
      </html>
    `,
  };
};

export const getVerifyEmailTemplate = (code: string) => {
  return {
    subject: "🚀 Bienvenido a Leonobitech - Verifica tu cuenta",
    text: `Tu código de verificación es: ${code}. Este código expirará en 15 minutos.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verificación de cuenta</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
                  text-align: center;
              }
              .container {
                  width: 100%;
                  max-width: 600px;
                  margin: 30px auto;
                  background: #ffffff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
              }
              h1 {
                  color: #333;
              }
              p {
                  font-size: 16px;
                  color: #555;
              }
              .code {
                  font-size: 24px;
                  font-weight: bold;
                  color: #4CAF50;
                  margin: 20px 0;
                  display: inline-block;
                  padding: 10px;
                  border-radius: 5px;
                  background: #f3f3f3;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>Verifica tu cuenta</h1>
              <p>Gracias por registrarte en <strong>Leonobitech</strong>. Usa el siguiente código para verificar tu cuenta:</p>
              <div class="code">${code}</div>
              <p>Este código expirará en 15 minutos. Si no solicitaste este correo, puedes ignorarlo.</p>
              <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} Leonobitech. Todos los derechos reservados.</p>
              </div>
          </div>
      </body>
      </html>
    `,
  };
};

export const getTwoFactorAuthTemplate = (otpCode: string) => ({
  subject: "🔐 Tu código de autenticación 2FA",
  text: `Tu código de autenticación de dos factores (2FA) es: ${otpCode}. Este código expirará en 15 minutos.`,
  html: `<!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Código de Autenticación 2FA</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; text-align: center; padding: 20px; }
        .container { background-color: white; padding: 20px; border-radius: 5px; box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1); }
        .code { font-size: 24px; font-weight: bold; background: #eee; padding: 10px 20px; display: inline-block; border-radius: 5px; }
        .footer { font-size: 12px; color: #666; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔐 Autenticación de Dos Factores</h2>
        <p>Tu código de autenticación es:</p>
        <p class="code">${otpCode}</p>
        <p>Este código expirará en <strong>15 minutos</strong>. No compartas este código con nadie.</p>
        <p class="footer">Si no solicitaste este código, ignora este mensaje.</p>
      </div>
    </body>
    </html>`,
});

export const getDeviceValidationTemplate = (code: string) => {
  return {
    subject: "⚠️ Nuevo dispositivo detectado en Leonobitech",
    text: `Recibimos un intento de inicio de sesión desde un nuevo dispositivo. Tu código de verificación es: ${code}. Este código expirará en 10 minutos.`,
    html: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Verificación de Dispositivo</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                    text-align: center;
                }
                .container {
                    width: 100%;
                    max-width: 600px;
                    margin: 30px auto;
                    background: #ffffff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    color: #333;
                }
                p {
                    font-size: 16px;
                    color: #555;
                }
                .code {
                    font-size: 24px;
                    font-weight: bold;
                    color: #ff9800;
                    margin: 20px 0;
                    padding: 10px;
                    background: #f3f3f3;
                    border-radius: 5px;
                    display: inline-block;
                    letter-spacing: 2px;
                }
                .footer {
                    font-size: 12px;
                    color: #777;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Nuevo dispositivo detectado</h1>
                <p>Detectamos un intento de inicio de sesión desde un dispositivo no registrado en <strong>Leonobitech</strong>.</p>
                <p>Si fuiste tú, utiliza el siguiente código para autorizarlo:</p>
                <div class="code">${code}</div>
                <p>Este código expirará en <strong>10 minutos</strong>. Si no fuiste tú, ignora este mensaje o cambia tu contraseña.</p>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Leonobitech. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
      `,
  };
};

/**
 * 🔐 Template para recuperación de passkey
 * Se envía cuando el usuario pierde acceso a su teléfono y necesita configurar un nuevo passkey.
 */
export const getPasskeyRecoveryTemplate = (code: string) => {
  return {
    subject: "🔐 Código de recuperación de Passkey - Leonobitech",
    text: `Tu código de recuperación de passkey es: ${code}. Este código expirará en 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
    html: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Recuperación de Passkey</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                    text-align: center;
                }
                .container {
                    width: 100%;
                    max-width: 600px;
                    margin: 30px auto;
                    background: #ffffff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    color: #333;
                }
                p {
                    font-size: 16px;
                    color: #555;
                }
                .warning {
                    background: #fff3cd;
                    border: 1px solid #ffc107;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                    color: #856404;
                }
                .code {
                    font-size: 28px;
                    font-weight: bold;
                    color: #dc3545;
                    margin: 20px 0;
                    padding: 15px 25px;
                    background: #f8d7da;
                    border-radius: 8px;
                    display: inline-block;
                    letter-spacing: 4px;
                }
                .footer {
                    font-size: 12px;
                    color: #777;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Recuperación de Passkey</h1>
                <p>Recibimos una solicitud para recuperar el acceso a tu cuenta en <strong>Leonobitech</strong>.</p>
                <div class="warning">
                    <strong>⚠️ Importante:</strong> Si no solicitaste este código, alguien podría estar intentando acceder a tu cuenta. Ignora este mensaje y considera cambiar tu contraseña.
                </div>
                <p>Ingresa el siguiente código para continuar con la recuperación:</p>
                <div class="code">${code}</div>
                <p>Este código expirará en <strong>10 minutos</strong>.</p>
                <p>Después de verificar el código, podrás configurar un nuevo passkey desde tu teléfono.</p>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Leonobitech. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
      `,
  };
};

export const getMagicLinkTemplate = (magicLinkUrl: string) => {
  return {
    subject: "🔑 Inicia sesión en Leonobitech",
    text: `Haz clic en el siguiente enlace para iniciar sesión: ${magicLinkUrl}. Este enlace expirará en 5 minutos.`,
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Magic Link - Leonobitech</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
                  text-align: center;
              }
              .container {
                  width: 100%;
                  max-width: 600px;
                  margin: 30px auto;
                  background: #ffffff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              h1 {
                  color: #333;
              }
              p {
                  font-size: 16px;
                  color: #555;
              }
              .button {
                  display: inline-block;
                  margin: 24px 0;
                  padding: 14px 32px;
                  background-color: #171717;
                  color: #ffffff !important;
                  text-decoration: none;
                  border-radius: 8px;
                  font-size: 16px;
                  font-weight: bold;
                  letter-spacing: 0.5px;
              }
              .link-fallback {
                  font-size: 12px;
                  color: #999;
                  word-break: break-all;
                  margin-top: 8px;
              }
              .footer {
                  font-size: 12px;
                  color: #777;
                  margin-top: 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>Inicia sesión</h1>
              <p>Haz clic en el botón para acceder a tu cuenta en <strong>Leonobitech</strong>.</p>
              <a href="${magicLinkUrl}" class="button">Iniciar sesión</a>
              <p class="link-fallback">Si el botón no funciona, copia y pega este enlace:<br/>${magicLinkUrl}</p>
              <p>Este enlace expirará en <strong>5 minutos</strong>. Si no solicitaste este correo, puedes ignorarlo.</p>
              <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} Leonobitech. Todos los derechos reservados.</p>
              </div>
          </div>
      </body>
      </html>
    `,
  };
};
