import { Router } from "express";
import {
  generateRegisterChallenge,
  verifyRegister,
  generateLoginChallenge,
  verifyLogin,
  getPasskeys,
  deletePasskeyById,
} from "@controllers/passkey.controllers";
import authenticate from "@middlewares/authenticate";

const passkeyRoutes = Router();

// 🌐 prefix: /account/passkey

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

/**
 * @route   GET /account/passkeys
 * @desc    List user's passkeys
 * @access  Private (requires authentication)
 */
passkeyRoutes.get("/", authenticate, getPasskeys);

/**
 * @route   DELETE /account/passkeys/:passkeyId
 * @desc    Delete a passkey
 * @access  Private (requires authentication)
 */
passkeyRoutes.delete("/:passkeyId", authenticate, deletePasskeyById);

export default passkeyRoutes;
