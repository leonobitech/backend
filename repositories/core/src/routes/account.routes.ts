import { Router } from "express";
import {
  registerController,
  verifyEmailController,
  loginController,
  refreshAccessTokenController,
  logoutController,
  logoutAllOtherSessionsController,
  requestPasswordResetController,
  resetPasswordController,
} from "@controllers/account.controllers";
import {
  requestMagicLinkController,
  verifyMagicLinkController,
  completeOnboardingController,
} from "@controllers/magicLink.controllers";
import authenticate from "@middlewares/authenticate";
import {
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  emailVerificationRateLimiter,
  magicLinkRateLimiter,
} from "@middlewares/rateLimiter";

const accountRoutes = Router();

// 🌐 prefix: /account

// ====================================================================
// 🔑 Magic Link (new passwordless auth)
// ====================================================================

/**
 * @route   POST /account/auth/magic-link
 * @desc    Solicita un magic link para login/registro (passwordless)
 * @limit   5 solicitudes cada 15 minutos por IP
 */
accountRoutes.post("/auth/magic-link", magicLinkRateLimiter, requestMagicLinkController);

/**
 * @route   POST /account/auth/verify-magic-link
 * @desc    Verifica el token del magic link y emite pendingToken
 * @limit   5 intentos cada 15 minutos por IP
 */
accountRoutes.post("/auth/verify-magic-link", magicLinkRateLimiter, verifyMagicLinkController);

/**
 * @route   POST /account/auth/onboarding
 * @desc    Completa el onboarding de un usuario nuevo (nombre)
 */
accountRoutes.post("/auth/onboarding", completeOnboardingController);

// ====================================================================
// 🔄 Token & Session Management
// ====================================================================

/**
 * @route   POST /account/refresh
 * @desc    Rota refreshToken y genera nuevo accessToken
 * @access  Público (solo con refreshToken válido)
 */
accountRoutes.post("/refresh", refreshAccessTokenController);

/**
 * @route   POST /account/logout
 * @desc    Cierra la sesión actual, borra cookies y revoca refreshToken
 * @access  Protegido
 */
accountRoutes.post("/logout", authenticate, logoutController);

/**
 * @route   POST /account/logout-all
 * @desc    Cierra todas las sesiones activas excepto la actual
 * @access  Protegido
 */
accountRoutes.post("/logout-all", authenticate, logoutAllOtherSessionsController);

// ====================================================================
// 🕰️ Legacy routes (will be removed after migration)
// ====================================================================

accountRoutes.post("/register", registerRateLimiter, registerController);
accountRoutes.post("/verify-email", emailVerificationRateLimiter, verifyEmailController);
accountRoutes.post("/login", loginRateLimiter, loginController);
accountRoutes.post("/password/forgot", passwordResetRateLimiter, requestPasswordResetController);
accountRoutes.post("/password/reset", passwordResetRateLimiter, resetPasswordController);

export default accountRoutes;
