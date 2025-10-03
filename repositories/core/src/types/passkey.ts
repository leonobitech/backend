import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import type { ClientMeta } from "./request";

/**
 * Passkey registration challenge request
 */
export interface PasskeyRegisterChallengeRequest {
  meta: ClientMeta;
}

/**
 * Passkey registration challenge response
 */
export interface PasskeyRegisterChallengeResponse {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: "public-key";
    alg: number;
  }>;
  timeout: number;
  attestation: "none" | "indirect" | "direct";
  authenticatorSelection: {
    authenticatorAttachment?: "platform" | "cross-platform";
    requireResidentKey: boolean;
    residentKey: "discouraged" | "preferred" | "required";
    userVerification: "required" | "preferred" | "discouraged";
  };
}

/**
 * Passkey registration verification request
 */
export interface PasskeyRegisterVerifyRequest {
  name?: string; // Friendly name for the passkey
  credential: RegistrationResponseJSON;
  meta: ClientMeta;
}

/**
 * Passkey registration verification response
 */
export interface PasskeyRegisterVerifyResponse {
  message: string;
  passkey: {
    id: string;
    name: string | null;
    createdAt: Date;
  };
}

/**
 * Passkey login challenge request
 */
export interface PasskeyLoginChallengeRequest {
  email?: string; // Optional: for user identification
  meta: ClientMeta;
}

/**
 * Passkey login challenge response
 */
export interface PasskeyLoginChallengeResponse {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials?: Array<{
    type: "public-key";
    id: string;
    transports?: AuthenticatorTransportFuture[];
  }>;
  userVerification: "required" | "preferred" | "discouraged";
}

/**
 * Passkey login verification request
 */
export interface PasskeyLoginVerifyRequest {
  credential: AuthenticationResponseJSON;
  meta: ClientMeta;
}

/**
 * Passkey login verification response
 */
export interface PasskeyLoginVerifyResponse {
  message: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
}

/**
 * Passkey list item
 */
export interface PasskeyListItem {
  id: string;
  name: string | null;
  device: {
    device: string;
    os: string;
    browser: string;
  } | null;
  transports: string[];
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Passkey delete request
 */
export interface PasskeyDeleteRequest {
  passkeyId: string;
  meta: ClientMeta;
}

/**
 * Passkey delete response
 */
export interface PasskeyDeleteResponse {
  message: string;
  passkeyId: string;
}

/**
 * Stored challenge in Redis
 */
export interface StoredChallenge {
  challenge: string;
  userId?: string; // For login challenges
  expiresAt: number;
}
