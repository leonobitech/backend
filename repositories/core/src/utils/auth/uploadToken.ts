import { redis } from "@config/redis";
import crypto from "crypto";

/**
 * 🎫 Upload Token System
 *
 * Tokens de un solo uso para uploads grandes que requieren
 * autenticación pero no pueden pasar por el proxy de Vercel.
 *
 * Flujo:
 * 1. Usuario autenticado solicita token vía Next.js API proxy
 * 2. Core genera token de 5 minutos, single-use, almacenado en Redis
 * 3. Usuario sube archivo directamente a Core con X-Upload-Token header
 * 4. Core valida y consume el token, procede con upload
 */

const UPLOAD_TOKEN_PREFIX = "upload_token:";
const UPLOAD_TOKEN_TTL_SECONDS = 300; // 5 minutos

interface UploadTokenPayload {
  userId: string;
  sessionId: string;
  action: "upload-podcast";
  createdAt: number;
}

/**
 * 📦 Genera un token de upload single-use
 */
export const generateUploadToken = async (
  userId: string,
  sessionId: string,
  action: "upload-podcast"
): Promise<string> => {
  const token = crypto.randomBytes(32).toString("hex");
  const key = `${UPLOAD_TOKEN_PREFIX}${token}`;

  const payload: UploadTokenPayload = {
    userId,
    sessionId,
    action,
    createdAt: Date.now(),
  };

  await redis.set(key, JSON.stringify(payload), {
    EX: UPLOAD_TOKEN_TTL_SECONDS,
  });

  console.log(`🎫 Upload token generated for user ${userId}, action: ${action}`);

  return token;
};

/**
 * ✅ Valida y consume un token de upload (single-use)
 * Retorna el payload si es válido, null si no existe o ya fue usado
 */
export const validateAndConsumeUploadToken = async (
  token: string,
  expectedAction: "upload-podcast"
): Promise<UploadTokenPayload | null> => {
  const key = `${UPLOAD_TOKEN_PREFIX}${token}`;

  // Obtener y eliminar en una sola operación (atomic)
  const data = await redis.getDel(key);

  if (!data) {
    console.warn(`⚠️ Upload token not found or already used`);
    return null;
  }

  const payload: UploadTokenPayload = JSON.parse(data);

  // Validar que la acción coincide
  if (payload.action !== expectedAction) {
    console.warn(`⚠️ Upload token action mismatch: expected ${expectedAction}, got ${payload.action}`);
    return null;
  }

  console.log(`✅ Upload token validated and consumed for user ${payload.userId}`);

  return payload;
};
