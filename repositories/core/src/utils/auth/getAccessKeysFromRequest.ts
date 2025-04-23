import { Request } from "express";

/**
 * 🔑 Extrae el accessKey desde las cookies
 * @param req Express Request
 * @returns string | undefined
 */
export const getAccessKey = (req: Request): string | undefined => {
  return req.cookies?.accessKey;
};

/**
 * 🧠 Extrae el clientKey (fingerprint hash) desde las cookies
 * @param req Express Request
 * @returns string | undefined
 */
export const getClientKey = (req: Request): string | undefined => {
  return req.cookies?.clientKey;
};
