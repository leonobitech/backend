import bcrypt from "bcrypt";

export const hashValue = async (val: string, saltRounds?: number) =>
  bcrypt.hash(val, saltRounds || 10);

export const compareValue = async (val: string, hashedValue: string) =>
  bcrypt.compare(val, hashedValue).catch(() => false);

/**
 * Compara un código de 2FA ingresado por el usuario con el código almacenado.
 * - Usa bcrypt para comparar el código ingresado con el hash en BD.
 * - Retorna `true` si el código es válido, `false` si no lo es.
 */
export const verifyTwoFactorCode = async (
  enteredCode: string,
  storedHash: string
): Promise<boolean> => {
  return await bcrypt.compare(enteredCode, storedHash);
};
