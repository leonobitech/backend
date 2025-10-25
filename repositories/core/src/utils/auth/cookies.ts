// src/utils/auth/authCookies.ts

import { Response, CookieOptions } from "express";

// 📍 Ruta base para cookies persistentes como el refresh
export const AUTH_COOKIE_PATH = "/";

// 🧱 Configuración base para todas las cookies de autenticación
const baseCookieOptions: CookieOptions = {
  sameSite: "lax", // ✅ ← Cambiado de "strict" a "lax" para mejor compatibilidad mobile
  httpOnly: true,
  secure: true,
  domain: ".leonobitech.com", // ✅ ← Punto inicial para compartir entre TODOS los subdominios (www, core, etc)
  path: AUTH_COOKIE_PATH,
};

// 🍪 Configuración para el access token (30 días, igual que clientKey)
// La expiración del JWT se maneja server-side, la cookie debe persistir
// para permitir refresh automático incluso después de cerrar el navegador
export const accessTokenCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días en milisegundos (consistente con clientKey)
});

// 🍪 Configuración para el clientKey (30 días, persiste con refresh)
export const clientKeyCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días en milisegundos
});

// 🧼 Opciones para limpiar ambas cookies
const clearCookieOptions: CookieOptions = {
  domain: ".leonobitech.com",
  path: AUTH_COOKIE_PATH,
  sameSite: "lax",
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
    .clearCookie("sidebar_state", clearCookieOptions);
