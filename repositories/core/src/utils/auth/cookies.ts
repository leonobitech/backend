// src/utils/auth/authCookies.ts

import { Response, CookieOptions } from "express";

// 📍 Ruta base para cookies persistentes como el refresh
export const AUTH_COOKIE_PATH = "/";

// 🧱 Configuración base para todas las cookies de autenticación
const baseCookieOptions: CookieOptions = {
  sameSite: "strict", // ✅ ← Seguridad CSRF OK
  httpOnly: true,
  secure: true,
  domain: "leonobitech.com", //  ✅ ← dominio para compartir entre subdominios las cookies
  path: AUTH_COOKIE_PATH,
};

// 🍪 Configuración para el access token (corto, temporal)
export const accessTokenCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  // expires: fifteenMinutesFromNow(),
});

// 🍪 Configuración para el clientKey (más persistente, sirve para buscar el refresh token)
export const clientKeyCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  // expires: fifteenMinutesFromNow(),
});

// 🧼 Opciones para limpiar ambas cookies
const clearCookieOptions: CookieOptions = {
  domain: "leonobitech.com",
  path: AUTH_COOKIE_PATH,
  sameSite: "strict",
  httpOnly: true,
  secure: true,
};

// —— Funciones exportadas ——

type SetAuthCookiesParams = {
  res: Response;
  accessKey: string; // hashedJti
  clientKey: string; // fingerprint hash
};

/**
 * ✅ Setea las cookies de autenticación (accessKey + clientKey)
 *    con dominio compartido y SameSite=Strict para subdominios.
 */
export const setAuthCookies = ({
  res,
  accessKey,
  clientKey,
}: SetAuthCookiesParams): Response =>
  res
    .cookie("accessKey", accessKey, accessTokenCookieOptions())
    .cookie("clientKey", clientKey, clientKeyCookieOptions());

/**
 * ✅ Refresca las cookies de autenticación (accessKey + clientKey)
 *    con dominio compartido y SameSite=Strict para subdominios.
 */
export const refreshAuthCookies = ({
  res,
  accessKey,
  clientKey,
}: SetAuthCookiesParams): Response =>
  res
    .clearCookie("accessKey", clearCookieOptions)
    .clearCookie("clientKey", clearCookieOptions)
    .cookie("accessKey", accessKey, accessTokenCookieOptions())
    .cookie("clientKey", clientKey, clientKeyCookieOptions());

/**
 * ❌ Limpia las cookies de autenticación.
 */
export const clearAuthCookies = (res: Response): Response =>
  res
    .clearCookie("accessKey", clearCookieOptions)
    .clearCookie("clientKey", clearCookieOptions)
    .clearCookie("clientMeta", clearCookieOptions)
    .clearCookie("user_session", clearCookieOptions);
