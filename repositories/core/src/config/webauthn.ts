import { APP_ORIGIN } from "./env";

// Extract hostname from APP_ORIGIN for RP ID
// IMPORTANT: rpId must be the registrable domain (eTLD+1) without 'www.' prefix
// This ensures passkeys are grouped correctly with passwords in Apple Keychain
// and allows the passkey to work on both www and non-www versions of the site
const rpId = new URL(APP_ORIGIN).hostname.replace(/^www\./, '');

// Generate all valid origins (with and without www)
// This allows users to access from either https://leonobitech.com or https://www.leonobitech.com
const baseOrigin = APP_ORIGIN.replace(/^(https?:\/\/)www\./, '$1');
const wwwOrigin = APP_ORIGIN.includes('www.') ? APP_ORIGIN : APP_ORIGIN.replace(/^(https?:\/\/)/, '$1www.');
const validOrigins = [baseOrigin, wwwOrigin].filter((v, i, a) => a.indexOf(v) === i);

export const webAuthnConfig = {
  // Relying Party (RP) - Your application
  rpName: "LeonobiTech",
  rpId, // Registrable domain (e.g., "leonobitech.com" without www)

  // Origins for verification - supports both www and non-www
  origin: validOrigins, // Array of valid origins
  primaryOrigin: APP_ORIGIN, // Primary origin from env

  // Challenge TTL (5 minutes)
  challengeTTL: 5 * 60 * 1000,

  // Timeout for user to complete the passkey ceremony (2 minutes)
  timeout: 120000,

  // Supported algorithms (ES256, RS256)
  supportedAlgorithms: [-7, -257] as const,

  // Authenticator attachment preference
  authenticatorAttachment: undefined as "platform" | "cross-platform" | undefined,

  // Require resident key (passkey stored on authenticator)
  requireResidentKey: true,

  // User verification requirement (mandatory biometrics/PIN)
  userVerification: "required" as const,

  // Attestation preference (none = no attestation, faster)
  attestation: "none" as const,
} as const;
