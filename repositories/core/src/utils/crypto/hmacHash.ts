// src/utils/crypto/hmacHash.ts
import { createHmac } from "crypto";

export const hmacHash = (input: string, secret: string): string => {
  return createHmac("sha512", secret).update(input).digest("hex");
};
