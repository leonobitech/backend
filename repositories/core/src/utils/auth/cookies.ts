// src/utils/auth/authCookies.ts

import { Response, CookieOptions } from "express";
import { fifteenMinutesFromNow, thirtyDaysFromNow } from "@utils/date/date";

// 📍 Ruta base para cookies persistentes como el refresh
export const AUTH_COOKIE_PATH = "/";

// 🧱 Configuración base para todas las cookies de autenticación
const baseCookieOptions: CookieOptions = {
  sameSite: "strict",
  httpOnly: true,
  secure: true,
  maxAge: 3600000, // 1h por default, pero se sobrescribe con expires
};

// 🍪 Configuración para el access token (corto, temporal)
export const accessTokenCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  expires: fifteenMinutesFromNow(),
  path: AUTH_COOKIE_PATH,
});

// 🍪 Configuración para el clientKey (más persistente, sirve para buscar el refresh token)
export const clientKeyCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  expires: fifteenMinutesFromNow(),
  path: AUTH_COOKIE_PATH,
});

type SetAuthCookiesParams = {
  res: Response;
  accessKey: string; // hashedJti
  clientKey: string; // fingerprint hash
};

// ✅ Función para setear las cookies de autenticación
export const setAuthCookies = ({
  res,
  accessKey,
  clientKey,
}: SetAuthCookiesParams): Response =>
  res
    .cookie("accessKey", accessKey, accessTokenCookieOptions())
    .cookie("clientKey", clientKey, clientKeyCookieOptions());

// ❌ Función para limpiar ambas cookies de autenticación
export const clearAuthCookies = (res: Response): Response =>
  res
    .clearCookie("accessKey", { path: AUTH_COOKIE_PATH })
    .clearCookie("clientKey", { path: AUTH_COOKIE_PATH });
