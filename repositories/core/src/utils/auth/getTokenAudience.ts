import { compactDecrypt, decodeJwt } from "jose";
import { Audience } from "@constants/audience";
import { loadRsaKeys } from "@config/rsaKeys";

export const getTokenAudience = async (
  token: string
): Promise<Audience | null> => {
  try {
    const { privateKey } = await loadRsaKeys();
    const { plaintext } = await compactDecrypt(token, privateKey);
    const jwt = new TextDecoder().decode(plaintext);
    const decoded = decodeJwt(jwt); // 👈 decodifica sin verificar
    return (decoded.aud as Audience) ?? null;
  } catch {
    return null;
  }
};
