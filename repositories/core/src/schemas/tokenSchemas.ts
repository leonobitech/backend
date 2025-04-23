import { z } from "zod";
import { Audience } from "@constants/audience";
import { UserRole } from "@constants/userRole";

// =================================================================================
// 🧩 Schemas base: solo payload (útil para crear tokens o validación rápida)
// =================================================================================

export const AccessTokenSchema = z.object({
  userId: z.string(), // ID del usuario
  sessionId: z.string(), // ID de sesión
  role: z.nativeEnum(UserRole), // Rol del usuario

  aud: z.literal(Audience.Access), // Audiencia = "access"
  exp: z.number(), // Timestamp de expiración
});

export const RefreshTokenSchema = z.object({
  sessionId: z.string(), // ID de sesión

  aud: z.literal(Audience.Refresh), // Audiencia = "refresh"
  exp: z.number(), // Timestamp de expiración
});

// =================================================================================
// ✅ Schemas extendidos para verificación: incluyen claims estándar del JWT
// =================================================================================

export const AccessTokenValidatedSchema = AccessTokenSchema.extend({
  sub: z.string(), // Subject (user ID normalmente)
  iss: z.string(), // Issuer
  jti: z.string(), // JWT ID único
});

export const RefreshTokenValidatedSchema = RefreshTokenSchema.extend({
  sub: z.string(),
  iss: z.string(),
  jti: z.string(),
});

// =================================================================================
// 🧠 Tipos inferidos
// =================================================================================

export type AccessTokenPayload = z.infer<typeof AccessTokenSchema>;
export type RefreshTokenPayload = z.infer<typeof RefreshTokenSchema>;

export type AccessTokenValidatedPayload = z.infer<
  typeof AccessTokenValidatedSchema
>;
export type RefreshTokenValidatedPayload = z.infer<
  typeof RefreshTokenValidatedSchema
>;

// =================================================================================
// 🔐 Opciones para firmar tokens (claims de firma, no del payload)
// =================================================================================

export interface JoseSignClaims {
  expiresIn: number; // Duración del token en segundos
  subject: string; // sub
  issuer: string; // iss
  audience: Audience; // aud
}

export type SignOptionsAndSecret = JoseSignClaims & {
  secret: string;
};
