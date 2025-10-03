import { APP_ORIGIN } from "./env";

// Extract hostname from APP_ORIGIN for RP ID
const rpId = new URL(APP_ORIGIN).hostname;

export const webAuthnConfig = {
  // Relying Party (RP) - Your application
  rpName: "LeonobiTech",
  rpId, // Domain name (e.g., "leonobitech.com")

  // Origin for verification
  origin: APP_ORIGIN, // Full origin (e.g., "https://leonobitech.com")

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

  // User verification requirement
  userVerification: "preferred" as const,

  // Attestation preference (none = no attestation, faster)
  attestation: "none" as const,
} as const;
