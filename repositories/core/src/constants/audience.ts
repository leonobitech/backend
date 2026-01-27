export enum Audience {
  Access = "Access", // 🎟️ Token exclusivo para Access
  Refresh = "Refresh", // 🔁 Token exclusivo para refresh
  PasskeyPending = "PasskeyPending", // 🔐 Token temporal para setup/verify passkey
}
