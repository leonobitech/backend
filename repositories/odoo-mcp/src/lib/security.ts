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
 * Normalize IPv6-mapped IPv4 addresses to pure IPv4
 * Example: ::ffff:192.168.0.1 → 192.168.0.1
 */
function normalizeIpAddress(ip: string): string {
  if (!ip) return "0.0.0.0";
  // Remove IPv6-mapped IPv4 prefix
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * Check if an IP address is IPv6
 */
function isIPv6(ip: string): boolean {
  return ip.includes(":");
}

/**
 * Normalize IPv6 to /64 prefix for stable identification
 * IPv6 privacy extensions change the last 64 bits frequently
 * Example: 2800:810:5e7:dd6:58a1:5a54:a49c:37ff → 2800:810:5e7:dd6::
 */
function normalizeIPv6ToPrefix(ip: string): string {
  if (!isIPv6(ip)) {
    return ip; // Already IPv4, return as-is
  }

  // Split IPv6 into segments
  const segments = ip.split(":");

  // Take first 4 segments (64 bits / 16 bits per segment = 4 segments)
  // This is the network prefix that stays stable
  const prefix = segments.slice(0, 4).join(":");

  return `${prefix}::`; // Add :: to indicate it's a prefix
}

/**
 * Extract IP address from request, considering proxies
 * Priority: CF-Connecting-IP (Cloudflare) > X-Real-IP > X-Forwarded-For > Socket
 * Note: ALWAYS prefers IPv4 over IPv6 when available for consistency
 */
export function extractIpAddress(req: any): string {
  // Collect all possible IPs from different headers
  const possibleIps: string[] = [];

  // Priority 1: CF-Connecting-IP (Cloudflare's real client IP)
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp) {
    possibleIps.push(cfIp.trim());
  }

  // Priority 2: X-Real-IP header (from nginx/Traefik)
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    possibleIps.push(realIp.trim());
  }

  // Priority 3: X-Forwarded-For header (from proxies/load balancers)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, add all of them
    const ips = forwardedFor.split(",").map((ip: string) => ip.trim());
    possibleIps.push(...ips);
  }

  // Priority 4: Fallback to connection remote address
  const socketIp = req.socket.remoteAddress;
  if (socketIp) {
    possibleIps.push(socketIp);
  }

  // Normalize all IPs (remove IPv6-mapped IPv4 prefix)
  const normalizedIps = possibleIps.map(ip => normalizeIpAddress(ip));

  // ALWAYS prefer IPv4 over IPv6 for consistency
  // Look for the first IPv4 address
  const ipv4 = normalizedIps.find(ip => !isIPv6(ip));

  if (ipv4) {
    // Found IPv4, use it
    return ipv4;
  }

  // No IPv4 found, fallback to first IPv6 (normalized to /64 prefix)
  const ipv6 = normalizedIps[0] || "unknown";
  return normalizeIPv6ToPrefix(ipv6);
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
