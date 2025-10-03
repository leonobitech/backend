import type { Request, Response } from "express";
import { catchErrors } from "@utils/errors";
import {
  generatePasskeyRegistrationChallenge,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationChallenge,
  verifyPasskeyAuthentication,
  listUserPasskeys,
  deletePasskey,
} from "@services/passkey.service";
import {
  generateAccessTokens,
  setAuthCookies,
} from "@services/account.service";
import { findOrCreateDevice } from "@utils/auth/findOrCreateDevice";
import { HTTP_CODE } from "@constants/httpCode";
import type {
  PasskeyRegisterChallengeRequest,
  PasskeyRegisterVerifyRequest,
  PasskeyLoginChallengeRequest,
  PasskeyLoginVerifyRequest,
} from "@/types/passkey";

/**
 * POST /account/passkey/register/challenge
 * Generate passkey registration challenge
 */
export const generateRegisterChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!; // From authenticate middleware
    const { meta } = req.body as PasskeyRegisterChallengeRequest;

    const options = await generatePasskeyRegistrationChallenge(userId, meta);

    res.status(HTTP_CODE.OK).json({
      message: "Registration challenge generated",
      options,
    });
  }
);

/**
 * POST /account/passkey/register/verify
 * Verify and store passkey credential
 */
export const verifyRegister = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!; // From authenticate middleware
    const { credential, name, meta } =
      req.body as PasskeyRegisterVerifyRequest;

    const passkey = await verifyPasskeyRegistration(
      userId,
      credential,
      name,
      meta
    );

    res.status(HTTP_CODE.CREATED).json({
      message: "Passkey registered successfully",
      passkey,
    });
  }
);

/**
 * POST /account/passkey/login/challenge
 * Generate passkey authentication challenge
 */
export const generateLoginChallenge = catchErrors(
  async (req: Request, res: Response) => {
    const { email, meta } = req.body as PasskeyLoginChallengeRequest;

    const options = await generatePasskeyAuthenticationChallenge(email, meta);

    res.status(HTTP_CODE.OK).json({
      message: "Authentication challenge generated",
      options,
    });
  }
);

/**
 * POST /account/passkey/login/verify
 * Verify passkey authentication and create session
 */
export const verifyLogin = catchErrors(
  async (req: Request, res: Response) => {
    const { credential, meta } = req.body as PasskeyLoginVerifyRequest;

    const { user, passkeyId } = await verifyPasskeyAuthentication(
      credential,
      meta
    );

    // Find or create device
    const device = await findOrCreateDevice(user.id, meta);

    // Generate tokens and create session
    const { accessToken, refreshToken, session } = await generateAccessTokens(
      user.id,
      device.id,
      meta
    );

    // Set auth cookies
    setAuthCookies(res, accessToken, refreshToken, session.clientKey);

    res.status(HTTP_CODE.OK).json({
      message: "Login successful with passkey",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    });
  }
);

/**
 * GET /account/passkeys
 * List user's passkeys
 */
export const getPasskeys = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!; // From authenticate middleware

    const passkeys = await listUserPasskeys(userId);

    res.status(HTTP_CODE.OK).json({
      message: "Passkeys retrieved successfully",
      passkeys,
    });
  }
);

/**
 * DELETE /account/passkeys/:passkeyId
 * Delete a passkey
 */
export const deletePasskeyById = catchErrors(
  async (req: Request, res: Response) => {
    const userId = req.userId!; // From authenticate middleware
    const { passkeyId } = req.params;

    const result = await deletePasskey(userId, passkeyId);

    res.status(HTTP_CODE.OK).json({
      message: "Passkey deleted successfully",
      passkeyId: result.passkeyId,
    });
  }
);
