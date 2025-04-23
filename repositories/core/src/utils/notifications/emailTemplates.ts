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
    subject: "Verifica tu cuenta en Leonobitech",
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
    subject: "Verifica tu nuevo dispositivo en Leonobitech",
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
