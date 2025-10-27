import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { env } from "@/config/env";

/**
 * Security utilities for authentication system
 * Includes password hashing and device fingerprinting
 */

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate device fingerprint from request metadata
 * Format: SHA-256(IP + UserAgent + userId)
 */
export function generateDeviceFingerprint(
  ipAddress: string,
  userAgent: string,
  userId: string
): string {
  return createHash("sha256")
    .update(`${ipAddress}:${userAgent}:${userId}`)
    .digest("hex");
}

/**
 * Generate a cryptographically secure random token
 * Used for session IDs, CSRF tokens, etc.
 */
export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Extract IP address from request, considering proxies
 * Priority: CF-Connecting-IP (Cloudflare) > X-Real-IP > X-Forwarded-For > Socket
 */
export function extractIpAddress(req: any): string {
  // Priority 1: CF-Connecting-IP (Cloudflare's real client IP)
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp) {
    return cfIp.trim();
  }

  // Priority 2: X-Real-IP header (from nginx/Traefik)
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return realIp.trim();
  }

  // Priority 3: X-Forwarded-For header (from proxies/load balancers)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = forwardedFor.split(",");
    return ips[0].trim();
  }

  // Fallback to connection remote address
  return req.socket.remoteAddress || "unknown";
}

/**
 * Extract User-Agent from request
 */
export function extractUserAgent(req: any): string {
  return req.headers["user-agent"] || "unknown";
}

/**
 * Validate password strength
 * Returns error message if invalid, null if valid
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (password.length > 128) {
    return "Password must be less than 128 characters";
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  // Check for at least one digit
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }

  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return "Password must contain at least one special character";
  }

  return null;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove < and > to prevent HTML injection
    .substring(0, 1000); // Limit length
}
