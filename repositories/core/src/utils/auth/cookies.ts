// src/utils/auth/authCookies.ts

import { Request, Response, CookieOptions } from "express";
import { createCipheriv, randomBytes } from "crypto";
import { getClientMeta } from "@utils/auth/getAccessKeysFromRequest";
import logger from "@utils/logging/logger";

// 📍 Ruta base para cookies persistentes como el refresh
export const AUTH_COOKIE_PATH = "/";

// 🧱 Configuración base para todas las cookies de autenticación
const baseCookieOptions: CookieOptions = {
  sameSite: "lax", // ✅ ← "lax" permite Set-Cookie same-site (www↔core). Cross-origin reads se manejan via proxy server-side.
  httpOnly: true,
  secure: true,
  domain: ".leonobitech.com", // ✅ ← Punto inicial para compartir entre TODOS los subdominios (www, core, etc)
  path: AUTH_COOKIE_PATH,
};

// 🍪 Configuración para el access token (sin expiración)
// Sin maxAge = cookie de sesión que NO expira por tiempo
// Se borra SOLO cuando:
// 1. Usuario hace logout explícito
// 2. Usuario cierra el navegador
// La expiración del JWT se maneja server-side (15 min con refresh automático)
export const accessTokenCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  // NO maxAge - persiste hasta logout o cierre de navegador
});

// 🍪 Configuración para el clientKey (sin expiración, consistente con accessKey)
// Ambas cookies deben tener el mismo comportamiento
export const clientKeyCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  // NO maxAge - persiste hasta logout o cierre de navegador
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

/**
 * 🔄 Renueva la cookie `clientMeta` con un `createdAt` fresco.
 *
 * Se llama durante silent refresh para mantener viva la sesión de
 * servicios admin (n8n, Baserow, etc.) protegidos por ForwardAuth.
 *
 * Re-encripta la metadata existente con AES-256-GCM (misma lógica que el frontend)
 * actualizando solo el timestamp `createdAt` para resetear el TTL de 20 min.
 */
export const refreshClientMetaCookie = (req: Request, res: Response): void => {
  try {
    const secret = process.env.CLIENT_META_KEY;
    if (!secret) return;

    // Desencriptar clientMeta existente
    const meta = getClientMeta(req);
    if (!meta || !meta.sessionId) return;

    // Actualizar createdAt con timestamp fresco
    const refreshedMeta = {
      ...meta,
      createdAt: Date.now(),
    };

    // Re-encriptar con AES-256-GCM (mismo formato que frontend)
    const key = Buffer.from(secret, "hex");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(JSON.stringify(refreshedMeta), "utf8", "base64");
    encrypted += cipher.final("base64");
    const tag = cipher.getAuthTag().toString("base64");

    const payload = `${iv.toString("base64")}:${tag}:${encrypted}`;

    res.cookie("clientMeta", payload, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      domain: ".leonobitech.com",
    });

    logger.info("🔄 clientMeta renovado durante refresh", {
      sessionId: meta.sessionId,
      event: "auth.clientmeta.refreshed",
    });
  } catch (err) {
    // No romper el flujo de autenticación si falla la renovación
    logger.warn("⚠️ Error al renovar clientMeta", {
      error: err instanceof Error ? err.message : "Unknown",
      event: "auth.clientmeta.refresh_failed",
    });
  }
};
