import prisma from "@config/prisma";
import { TokenType } from "@prisma/client";

/**
 * Busca el refresh token válido más reciente por clientKey (publicKey hash).
 *
 * @param clientKey - El clientKey recibido del cliente (puede ser legacy o nuevo formato)
 * @param alternativeClientKey - Formato alternativo para backward compatibility (opcional)
 */
export const findRefreshTokenByClientKey = async (
  clientKey: string,
  alternativeClientKey?: string
) => {
  // Si hay formato alternativo, buscar con ambos formatos
  const publicKeyCondition = alternativeClientKey
    ? { OR: [{ publicKey: clientKey }, { publicKey: alternativeClientKey }] }
    : { publicKey: clientKey };

  return prisma.tokenRecord.findFirst({
    where: {
      ...publicKeyCondition,
      type: TokenType.REFRESH,
      revoked: false,
    },
    orderBy: {
      expiresAt: "desc", // o createdAt: "desc" si lo prefieres
    },
    include: {
      user: true,
      session: true,
    },
  });
};

export const revokeTokenByJti = async (jti: string) => {
  return prisma.tokenRecord.update({
    where: { jti },
    data: { revoked: true },
  });
};

export const saveTokenRecord = async ({
  jti,
  type,
  token,
  publicKey,
  sessionId,
  userId,
  expiresAt,
  revoked,
}: {
  jti: string;
  type: TokenType;
  token: string;
  publicKey: string;
  sessionId: string;
  userId: string;
  expiresAt: Date;
  revoked: boolean;
}) => {
  return prisma.tokenRecord.create({
    data: {
      jti,
      type,
      token,
      publicKey,
      sessionId,
      userId,
      expiresAt,
      revoked,
    },
  });
};
