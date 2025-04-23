export const API_STATUS = {
  CREATED: "created",
  VERIFIED: "verified",
  RESEND: "resend",
  DEVICE_VALIDATED: "deviceValidated",
  ALREADY_VALIDATED: "alreadyValidated",
  DEVICE_PENDING_VERIFICATION: "devicePendingVerification",
  ALREADY_VERIFIED: "alreadyVerified",
  REFRESHED: "refreshed",
  SUCCESS: "success",
  LOGGED_OUT: "loggedOut",
  OTHERS_LOGGED_OUT: "othersLoggedOut",
  ERROR: "error",
  PASSWORD_RESET_CODE_SENT: "passwordResetCodeSent",
  PASSWORD_RESET_SUCCESS: "passwordResetSuccess",
} as const;

export type ApiStatus = (typeof API_STATUS)[keyof typeof API_STATUS];
