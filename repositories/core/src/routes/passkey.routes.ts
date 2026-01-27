import { Router } from "express";
import {
  generateRegisterChallenge,
  verifyRegister,
  generateLoginChallenge,
  verifyLogin,
  getPasskeys,
  deletePasskeyById,
  // 🔐 Mandatory 2FA controllers
  generateSetupChallenge,
  verifySetupAndLogin,
  generate2FAChallenge,
  verify2FAAndLogin,
  // 🔐 Recovery controllers
  requestRecovery,
  verifyRecovery,
} from "@controllers/passkey.controllers";
import authenticate from "@middlewares/authenticate";

const passkeyRoutes = Router();

// 🌐 prefix: /account/passkey

// ═══════════════════════════════════════════════════════════════════════════════
// 📝 OPTIONAL REGISTRATION (authenticated users adding extra passkeys)
// These endpoints require an active session
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /account/passkey/register/challenge
 * @desc    Generate passkey registration challenge (WebAuthn)
 * @access  Private (requires authentication)
 */
passkeyRoutes.post("/register/challenge", authenticate, generateRegisterChallenge);

/**
 * @route   POST /account/passkey/register/verify
 * @desc    Verify passkey registration response and store credential
 * @access  Private (requires authentication)
 */
passkeyRoutes.post("/register/verify", authenticate, verifyRegister);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔑 PASSKEY-ONLY LOGIN (for users who want to login only with passkey)
// No password required, just passkey
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /account/passkey/login/challenge
 * @desc    Generate passkey authentication challenge (WebAuthn)
 * @access  Public
 */
passkeyRoutes.post("/login/challenge", generateLoginChallenge);

/**
 * @route   POST /account/passkey/login/verify
 * @desc    Verify passkey authentication and create session
 * @access  Public
 */
passkeyRoutes.post("/login/verify", verifyLogin);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 MANDATORY 2FA SETUP (first login after registration)
// Requires pendingToken from email/password login
// ONLY allows cross-platform passkeys (phone), NOT Keychain
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /account/passkey/setup/challenge
 * @desc    Generate passkey setup challenge (cross-platform ONLY)
 * @access  Public (requires pendingToken in body)
 */
passkeyRoutes.post("/setup/challenge", generateSetupChallenge);

/**
 * @route   POST /account/passkey/setup/verify
 * @desc    Verify passkey setup and create session
 * @access  Public (requires pendingToken in body)
 */
passkeyRoutes.post("/setup/verify", verifySetupAndLogin);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 MANDATORY 2FA VERIFICATION (subsequent logins)
// Requires pendingToken from email/password login
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /account/passkey/2fa/challenge
 * @desc    Generate 2FA challenge for existing passkey
 * @access  Public (requires pendingToken in body)
 */
passkeyRoutes.post("/2fa/challenge", generate2FAChallenge);

/**
 * @route   POST /account/passkey/2fa/verify
 * @desc    Verify 2FA and create session
 * @access  Public (requires pendingToken in body)
 */
passkeyRoutes.post("/2fa/verify", verify2FAAndLogin);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 RECOVERY (when user loses phone/passkey access)
// OTP sent to email, allows creating new passkey
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /account/passkey/recovery/request
 * @desc    Request recovery code via email
 * @access  Public (requires pendingToken in body)
 */
passkeyRoutes.post("/recovery/request", requestRecovery);

/**
 * @route   POST /account/passkey/recovery/verify
 * @desc    Verify recovery code and get new pendingToken for setup
 * @access  Public
 */
passkeyRoutes.post("/recovery/verify", verifyRecovery);

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 PASSKEY MANAGEMENT (authenticated users)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /account/passkey
 * @desc    List user's passkeys (changed to POST to send meta in body)
 * @access  Private (requires authentication)
 */
passkeyRoutes.post("/", authenticate, getPasskeys);

/**
 * @route   DELETE /account/passkeys/:passkeyId
 * @desc    Delete a passkey
 * @access  Private (requires authentication)
 */
passkeyRoutes.delete("/:passkeyId", authenticate, deletePasskeyById);

export default passkeyRoutes;
