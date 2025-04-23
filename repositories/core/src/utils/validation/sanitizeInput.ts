/**
 * 🔐 Elimina campos sensibles como password de un input antes de loguear.
 */
export const sanitizeInput = (
  input: Record<string, any>
): Record<string, any> => {
  const clone = { ...input };

  const sensitiveFields = [
    "password",
    "confirmPassword",
    "newPassword",
    "currentPassword",
    "token", // Por si usás magic links o tokens sensibles
  ];

  for (const field of sensitiveFields) {
    if (field in clone) {
      clone[field] = "[REDACTED]";
    }
  }

  return clone;
};
