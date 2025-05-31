import { Request } from "express";

/**
 * 🔑 Extrae la cookie `accessKey` del request.
 *
 * Esta cookie representa el **token de acceso temporal** (hashed JTI) del usuario.
 * Es utilizada para autenticar la sesión en el backend, con una TTL corta (ej: 15 min).
 *
 * @param req Express Request (el objeto de la request HTTP entrante)
 * @returns string | undefined - El valor de la cookie `accessKey` si existe, o `undefined` si no.
 *
 * ⚠️ Nota: Esta cookie debe ser segura (`httpOnly`, `secure`, `sameSite`) y persistente
 * en el dominio raíz (`.leonobitech.com`) para compartir entre subdominios.
 */
export const getAccessKey = (req: Request): string | undefined => {
  return req.cookies?.accessKey;
};

/**
 * 🧠 Extrae la cookie `clientKey` (fingerprint hash) del request.
 *
 * Esta cookie es un identificador persistente generado a partir de un fingerprint único
 * del dispositivo/navegador del cliente. Se utiliza como **llave secundaria** para
 * buscar el `refreshToken` en el backend o para validar la integridad de la sesión.
 *
 * @param req Express Request
 * @returns string | undefined - El valor de la cookie `clientKey` si existe, o `undefined`.
 *
 * ⚠️ Nota: Esta cookie debe persistir más tiempo que `accessKey` y debe estar asociada
 * al dominio `.leonobitech.com`. Debe ser segura, `httpOnly` y `secure`.
 */
export const getClientKey = (req: Request): string | undefined => {
  return req.cookies?.clientKey;
};

/**
 * 🧭 Extrae la cookie `clientMeta` (metadata del cliente) del request.
 *
 * Esta cookie contiene información valiosa del cliente generada en el frontend (fingerprint),
 * como el sistema operativo, navegador, dispositivo, idioma, zona horaria, resolución de pantalla,
 * y la dirección IP obtenida en el backend de Next.js.
 *
 * Es utilizada en el backend Core para validar la identidad del cliente junto al `accessKey`
 * y `clientKey`, proporcionando una **segunda capa de defensa** contra ataques de sesión robada
 * o accesos desde otros dispositivos no autorizados.
 *
 * @param req Express Request
 * @returns string | undefined - El valor crudo (JSON stringificado) de la cookie `clientMeta`, o `undefined`.
 *
 * ⚠️ Nota: Esta cookie debe ser segura (`secure`, `sameSite`), pero NO `httpOnly` porque es
 * generada en el frontend y luego enviada en el request. Debería estar asociada al dominio raíz
 * `.leonobitech.com` para funcionar en todos los subdominios.
 */
export const getClientMeta = (req: Request): string | undefined => {
  return req.cookies?.clientMeta;
};
