import prisma from "@config/prisma";
import { TokenType } from "@prisma/client";

/**
 * Busca el refresh token válido más reciente por clientKey (publicKey hash).
 */
export const findRefreshTokenByClientKey = async (
  clientKey: string
) => {
  return prisma.tokenRecord.findFirst({
    where: {
      publicKey: clientKey,
      type: TokenType.REFRESH,
      revoked: false,
    },
    orderBy: {
      expiresAt: "desc",
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
