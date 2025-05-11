import { z } from "zod";

export const emailSchema = z.string().email("Invalid email format");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[@$!%*?&]/, "Password must contain at least one special character");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerSchema = loginSchema
  .extend({
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, "El código debe tener 6 dígitos"),
  requestId: z.string(),
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  newPassword: passwordSchema,
  code: z.string().length(6, "El código debe tener 6 dígitos"),
});

export const verificationCodeSchema = z.string().min(1).max(24);

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  avatar: z.string().url().optional(),
  bio: z.string().max(200).optional(),
});
