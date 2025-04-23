import { Audience } from "@constants/audience";
import { loggerAudit } from "@utils/logging/loggerAudit";

export type TokenAuditLog = {
  performedBy: string;
  sessionId: string;
  aud: string;
  jti: string;
  role: string;
  exp: string;
};

export const logTokenAudit = (
  type: Audience.Access | Audience.Refresh,
  payload: TokenAuditLog
) => {
  loggerAudit(`token.${type}.generated`, payload);
};
