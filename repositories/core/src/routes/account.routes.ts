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
  verifyDeviceController,
} from "@controllers/account.controllers";
import authenticate from "@middlewares/authenticate";

const accountRoutes = Router();

// 🌐 prefix: /account

/**
 * @route   POST /account/register
 * @desc    Registra un nuevo usuario y envía un código de verificación por email
 */
accountRoutes.post("/register", registerController);

/**
 * @route   POST /account/verify-email
 * @desc    Verifica el código de email y activa la cuenta del usuario
 */
accountRoutes.post("/verify-email", verifyEmailController);

/**
 * @route   POST /account/login
 * @desc    Inicia sesión y genera tokens de acceso + sesión persistente
 */
accountRoutes.post(
  "/login",
  (req, res, next) => {
    console.log("📩 Se llamó a /account/login"); // 💥 DEBUG opcional
    next();
  },
  loginController
);

/**
 * @route   POST /account/verify-device
 * @desc    Verifica Device con código por email y inicia session normalmente
 */
accountRoutes.post("/verify-device", verifyDeviceController);

/**
 * @route   POST /account/refresh-token
 * @desc    Rota refreshToken y genera nuevo accessToken
 * @access  Público (solo con refreshToken válido)
 */
accountRoutes.post("/refresh", refreshAccessTokenController);

/**
 * @route   POST /account/password/forgot
 * @desc    Solicita un restablecimiento de contraseña y envía un email con el código.
 */
accountRoutes.post("/password/forgot", requestPasswordResetController);

/**
 * @route   POST /password/reset
 * @desc    Restablece la contraseña del usuario y activa la cuenta
 * @access  Público (solo con token de restablecimiento válido)
 */
accountRoutes.post("/password/reset", resetPasswordController);

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
