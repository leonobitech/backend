import { APP_ORIGIN } from "./env";

// Extract hostname from APP_ORIGIN for RP ID
// IMPORTANT: rpId must be the registrable domain (eTLD+1) without 'www.' prefix
// This ensures passkeys are grouped correctly with passwords in Apple Keychain
// and allows the passkey to work on both www and non-www versions of the site
const rpId = new URL(APP_ORIGIN).hostname.replace(/^www\./, '');

// Single origin from environment variable
const origin = APP_ORIGIN;

export const webAuthnConfig = {
  // Relying Party (RP) - Your application
  rpName: "LeonobiTech",
  rpId, // Registrable domain (e.g., "leonobitech.com" without www)

  // Origin for verification
  origin, // Single origin from APP_ORIGIN

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
