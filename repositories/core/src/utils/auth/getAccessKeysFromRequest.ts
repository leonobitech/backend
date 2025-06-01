import { Request } from "express";
import { createDecipheriv } from "crypto";

export type ClientMeta = {
  deviceInfo: {
    device: string;
    os: string;
    browser: string;
  };
  userAgent: string;
  language: string;
  platform: string;
  timezone: string;
  screenResolution: string;
  label: string;
  ipAddress: string;
  host?: string;
  method?: string;
  path?: string;
};

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
export const getClientMeta = (req: any): ClientMeta | null => {
  try {
    const raw = req.cookies?.clientMeta;
    if (!raw) return null;

    const secret = process.env.CLIENT_META_KEY!;
    if (!secret) throw new Error("Missing CLIENT_META_KEY");

    const key = Buffer.from(secret, "hex");
    const [ivB64, tagB64, dataB64] = raw.split(":");

    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Malformed clientMeta cookie");
    }

    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const meta = JSON.parse(decrypted.toString("utf8")) as ClientMeta;

    // 🔧 Completar datos faltantes
    meta.host = req.hostname;
    meta.method = req.method;
    meta.path = req.originalUrl;

    return meta;
  } catch (err) {
    console.error("❌ Error al descifrar clientMeta:", err);
    return null;
  }
};
