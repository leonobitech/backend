import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";

/**
 * Encryption utilities for storing sensitive data (Odoo credentials) in database
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // For AES, this is always 16 bytes
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY_BUFFER = Buffer.from(env.ENCRYPTION_KEY, "hex");

if (ENCRYPTION_KEY_BUFFER.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)");
}

/**
 * Encrypts a string value using AES-256-GCM
 * Returns: iv:authTag:encryptedData (all in hex)
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a value encrypted with encrypt()
 * Expects format: iv:authTag:encryptedData (all in hex)
 */
export function decrypt(encryptedValue: string): string {
  const parts = encryptedValue.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Encrypts Odoo credentials for storage
 */
export interface OdooCredentials {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

export function encryptOdooCredentials(credentials: OdooCredentials): {
  odooUrl: string;
  odooDb: string;
  odooUsername: string;
  odooApiKey: string;
} {
  return {
    odooUrl: encrypt(credentials.url),
    odooDb: encrypt(credentials.db),
    odooUsername: encrypt(credentials.username),
    odooApiKey: encrypt(credentials.apiKey),
  };
}

/**
 * Decrypts Odoo credentials from storage
 */
export function decryptOdooCredentials(encrypted: {
  odooUrl: string;
  odooDb: string;
  odooUsername: string;
  odooApiKey: string;
}): OdooCredentials {
  return {
    url: decrypt(encrypted.odooUrl),
    db: decrypt(encrypted.odooDb),
    username: decrypt(encrypted.odooUsername),
    apiKey: decrypt(encrypted.odooApiKey),
  };
}
