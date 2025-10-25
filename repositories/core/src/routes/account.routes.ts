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
import authenticate from "@middlewares/authenticate";
import {
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  emailVerificationRateLimiter,
} from "@middlewares/rateLimiter";

const accountRoutes = Router();

// 🌐 prefix: /account

/**
 * @route   POST /account/register
 * @desc    Registra un nuevo usuario y envía un código de verificación por email
 * @limit   3 registros por hora por IP
 */
accountRoutes.post("/register", registerRateLimiter, registerController);

/**
 * @route   POST /account/verify-email
 * @desc    Verifica el código de email y activa la cuenta del usuario
 * @limit   5 intentos cada 15 minutos por IP
 */
accountRoutes.post("/verify-email", emailVerificationRateLimiter, verifyEmailController);

/**
 * @route   POST /account/login
 * @desc    Inicia sesión y genera tokens de acceso + sesión persistente
 * @limit   5 intentos cada 15 minutos por IP
 */
accountRoutes.post("/login", loginRateLimiter, loginController);

/**
 * @route   POST /account/refresh-token
 * @desc    Rota refreshToken y genera nuevo accessToken
 * @access  Público (solo con refreshToken válido)
 */
accountRoutes.post("/refresh", refreshAccessTokenController);

/**
 * @route   POST /account/password/forgot
 * @desc    Solicita un restablecimiento de contraseña y envía un email con el código.
 * @limit   3 solicitudes por hora por IP
 */
accountRoutes.post("/password/forgot", passwordResetRateLimiter, requestPasswordResetController);

/**
 * @route   POST /password/reset
 * @desc    Restablece la contraseña del usuario y activa la cuenta
 * @access  Público (solo con token de restablecimiento válido)
 * @limit   3 intentos por hora por IP
 */
accountRoutes.post("/password/reset", passwordResetRateLimiter, resetPasswordController);

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
accountRoutes.post(
  "/logout-all",
  authenticate,
  logoutAllOtherSessionsController
);

export default accountRoutes;
