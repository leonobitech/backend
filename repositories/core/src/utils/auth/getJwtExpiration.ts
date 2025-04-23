import { loadRsaKeys } from "@config/rsaKeys";
import { compactDecrypt, decodeJwt } from "jose";

/**
 * Extrae la fecha de expiración de un JWT como objeto Date.
 */
export const getJwtExpiration = async (token: string): Promise<Date> => {
  const { privateKey } = await loadRsaKeys();
  const { plaintext } = await compactDecrypt(token, privateKey);
  const jwt = new TextDecoder().decode(plaintext);
  const decoded = decodeJwt(jwt);
  if (!decoded.exp) {
    throw new Error("Token does not contain 'exp' field.");
  }

  return new Date(decoded.exp * 1000);
};
