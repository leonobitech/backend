// =============================================================================
// Shared email wrapper with Leonobitech branding
// =============================================================================

const currentYear = new Date().getFullYear();

const emailWrapper = (content: string) => `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

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
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff">
<tr><td align="center" style="padding:0">
  <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff">
    ${content}
  </table>
</td></tr>
</table>

<!-- Footer -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0">
    <tr><td style="padding:0 32px"><div style="border-top:1px solid #e5e5e5"></div></td></tr>
    <tr><td style="padding:24px 32px;text-align:center">
      <p style="margin:0 0 12px;font-size:13px;color:#a1a1aa;line-height:1.6">Leonobitech &middot; AI-Powered Enterprise Solutions</p>
      <p style="margin:0 0 16px;font-size:12px"><a href="mailto:contact@leonobitech.com" style="color:#a1a1aa;text-decoration:none">contact&#64;leonobitech.com</a></p>
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
      <p style="margin:20px 0 0;font-size:10px;color:#c4c4c4">&copy; ${currentYear} Leonobitech. All rights reserved.</p>
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
    <td style="background:linear-gradient(135deg,#E91E63,#9B5DE5);border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
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
  subject: "Reset your password — Leonobitech",
  text: `Your password reset code is: ${code}. This code will expire in 5 minutes.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Security</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Reset your password</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    We received a request to reset your password at <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">This code expires in <strong style="color:#52525b">5 minutes</strong></p>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">If you didn't request this email, you can safely ignore it.</p>
</td></tr>`),
});

export const getVerifyEmailTemplate = (code: string) => ({
  subject: "Welcome to Leonobitech — Verify your account",
  text: `Your verification code is: ${code}. This code will expire in 15 minutes.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Welcome</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Verify your account</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Thanks for signing up at <strong style="color:#1a1a1a">Leonobitech</strong>. Use the following code to verify your account:
  </p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">This code expires in <strong style="color:#52525b">15 minutes</strong></p>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">If you didn't request this email, you can safely ignore it.</p>
</td></tr>`),
});

export const getTwoFactorAuthTemplate = (otpCode: string) => ({
  subject: "Your 2FA authentication code — Leonobitech",
  text: `Your two-factor authentication code is: ${otpCode}. This code will expire in 15 minutes.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Authentication</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">2FA Code</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">Your two-factor authentication code is:</p>
  ${codeBlock(otpCode)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">This code expires in <strong style="color:#52525b">15 minutes</strong>. Do not share this code with anyone.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">If you didn't request this code, please ignore this message.</p>
</td></tr>`),
});

export const getDeviceValidationTemplate = (code: string) => ({
  subject: "New device detected — Leonobitech",
  text: `We detected a login attempt from a new device. Your verification code is: ${code}. This code will expire in 10 minutes.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Security</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">New device detected</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6">
    We detected a login attempt from an unregistered device on <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  <div style="padding:0 0 16px">${warningBlock("If this wasn't you, ignore this message. Your account remains secure.")}</div>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b">If this was you, use the following code to authorize it:</p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">This code expires in <strong style="color:#52525b">10 minutes</strong></p>
</td></tr>`),
});

export const getPasskeyRecoveryTemplate = (code: string) => ({
  subject: "Passkey recovery code — Leonobitech",
  text: `Your passkey recovery code is: ${code}. This code will expire in 10 minutes. If you didn't request this code, please ignore this message.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Recovery</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Passkey Recovery</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6">
    We received a request to recover access to your account at <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  <div style="padding:0 0 16px">${warningBlock("If you didn't request this code, someone may be trying to access your account. Ignore this message.")}</div>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b">Enter the following code to continue:</p>
  ${codeBlock(code)}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">This code expires in <strong style="color:#52525b">10 minutes</strong></p>
  <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa">After verifying the code, you'll be able to set up a new passkey.</p>
</td></tr>`),
});

export const getMagicLinkTemplate = (magicLinkUrl: string) => ({
  subject: "Sign in to Leonobitech",
  text: `Click the following link to sign in: ${magicLinkUrl}. This link will expire in 5 minutes.`,
  html: emailWrapper(`
<tr><td style="padding:32px 32px 8px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:3px">Secure Access</p>
  <h1 style="margin:12px 0 0;font-size:24px;color:#1a1a1a;font-weight:700">Sign in</h1>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6">
    Click the button to access your account at <strong style="color:#1a1a1a">Leonobitech</strong>.
  </p>
  ${buttonBlock(magicLinkUrl, "Sign in")}
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">This link expires in <strong style="color:#52525b">5 minutes</strong></p>
</td></tr>
<tr><td style="padding:0 32px 32px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;border-radius:8px;overflow:hidden">
    <tr><td style="padding:12px 16px">
      <p style="margin:0 0 6px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px">If the button doesn't work</p>
      <p style="margin:0;font-size:12px;color:#52525b;word-break:break-all;font-family:monospace">${magicLinkUrl}</p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#a1a1aa">If you didn't request this email, you can safely ignore it.</p>
</td></tr>`),
});
