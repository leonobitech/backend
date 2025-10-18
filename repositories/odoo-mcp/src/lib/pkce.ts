import { createHash } from "node:crypto";
import { CodeChallengeMethod } from "@/lib/store";

export function verifyCodeChallenge(codeVerifier: string, codeChallenge: string, method: CodeChallengeMethod) {
  if (method === "S256") {
    const digest = createHash("sha256").update(codeVerifier).digest();
    const encoded = digest
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return encoded === codeChallenge;
  }

  if (method === "plain") {
    return codeVerifier === codeChallenge;
  }

  return false;
}
