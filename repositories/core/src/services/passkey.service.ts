import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";
import { prisma } from "@config/prisma";
import { redis } from "@config/redis";
import { webAuthnConfig } from "@config/webauthn";
import { HttpException } from "@utils/errors";
import { ERROR_CODE } from "@constants/errorCode";
import { HTTP_CODE } from "@constants/httpCode";
import type { ClientMeta } from "@/types/request";
import type { StoredChallenge } from "@/types/passkey";
import { findOrCreateDevice } from "@utils/auth/findOrCreateDevice";
import { generateClientKeyFromMeta } from "@utils/auth/generateClientKey";
import { generateAccessToken, generateRefreshToken } from "@utils/auth/jwt";
import { getJwtExpiration } from "@utils/auth/getJwtExpiration";
import { thirtyDaysFromNow } from "@utils/date/date";
import type { UserRole } from "@constants/userRole";

/**
 * Generate passkey registration options (challenge)
 */
export async function generatePasskeyRegistrationChallenge(
  userId: string,
  meta: ClientMeta
) {
  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.USER_NOT_FOUND,
      "User not found"
    );
  }

  // Get existing passkeys for excludeCredentials
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: webAuthnConfig.rpName,
    rpID: webAuthnConfig.rpId,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name || user.email,
    timeout: webAuthnConfig.timeout,
    attestationType: webAuthnConfig.attestation,
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key",
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: webAuthnConfig.authenticatorAttachment,
      requireResidentKey: webAuthnConfig.requireResidentKey,
      residentKey: "required",
      userVerification: webAuthnConfig.userVerification,
    },
    supportedAlgorithmIDs: webAuthnConfig.supportedAlgorithms as number[],
  });

  // Store challenge in Redis with 5 minute expiration
  const challengeKey = `passkey:register:challenge:${userId}`;
  const challengeData: StoredChallenge = {
    challenge: options.challenge,
    userId,
    expiresAt: Date.now() + webAuthnConfig.challengeTTL,
  };

  await redis.setex(
    challengeKey,
    Math.floor(webAuthnConfig.challengeTTL / 1000),
    JSON.stringify(challengeData)
  );

  return options;
}

/**
 * Verify passkey registration and store credential
 */
export async function verifyPasskeyRegistration(
  userId: string,
  credential: RegistrationResponseJSON,
  name: string | undefined,
  meta: ClientMeta
) {
  // Retrieve and validate challenge
  const challengeKey = `passkey:register:challenge:${userId}`;
  const storedChallengeData = await redis.get(challengeKey);

  if (!storedChallengeData) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.INVALID_OR_EXPIRED_CODE,
      "Challenge expired or not found"
    );
  }

  const storedChallenge: StoredChallenge = JSON.parse(storedChallengeData);

  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(challengeKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CODE_EXPIRED,
      "Challenge expired"
    );
  }

  // Verify registration response
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: webAuthnConfig.origin,
    expectedRPID: webAuthnConfig.rpId,
    requireUserVerification: webAuthnConfig.userVerification === "required",
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.INVALID_CREDENTIALS,
      "Passkey verification failed"
    );
  }

  const { credential: credentialInfo } = verification.registrationInfo;

  // Find or create device
  const device = await prisma.device.upsert({
    where: {
      unique_device: {
        userId,
        device: meta.deviceInfo.device,
        os: meta.deviceInfo.os,
        browser: meta.deviceInfo.browser,
      },
    },
    update: {
      lastUsedAt: new Date(),
      ipAddress: meta.ipAddress,
    },
    create: {
      userId,
      device: meta.deviceInfo.device,
      os: meta.deviceInfo.os,
      browser: meta.deviceInfo.browser,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      language: meta.language,
      timezone: meta.timezone,
      platform: meta.platform,
      screenResolution: meta.screenResolution,
      label: meta.label,
    },
  });

  // Store passkey
  const passkey = await prisma.passkey.create({
    data: {
      userId,
      deviceId: device.id,
      credentialId: Buffer.from(credentialInfo.id).toString("base64url"),
      publicKey: Buffer.from(credentialInfo.publicKey).toString("base64url"),
      counter: credentialInfo.counter,
      name: name || `${meta.deviceInfo.device} (${meta.deviceInfo.os})`,
      transports: credential.response.transports || [],
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  // Delete challenge
  await redis.del(challengeKey);

  return passkey;
}

/**
 * Generate passkey authentication options (challenge)
 */
export async function generatePasskeyAuthenticationChallenge(
  email?: string,
  meta?: ClientMeta
) {
  let allowCredentials: Array<{
    id: string;
    type: "public-key";
    transports: AuthenticatorTransportFuture[];
  }> = [];

  let userId: string | undefined;

  // If email provided, get user's passkeys
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      throw new HttpException(
        HTTP_CODE.NOT_FOUND,
        ERROR_CODE.USER_NOT_FOUND,
        "User not found"
      );
    }

    userId = user.id;

    const passkeys = await prisma.passkey.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });

    allowCredentials = passkeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key" as const,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID: webAuthnConfig.rpId,
    timeout: webAuthnConfig.timeout,
    userVerification: webAuthnConfig.userVerification,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  });

  // Store challenge in Redis
  const challengeKey = `passkey:login:challenge:${options.challenge}`;
  const challengeData: StoredChallenge = {
    challenge: options.challenge,
    userId,
    expiresAt: Date.now() + webAuthnConfig.challengeTTL,
  };

  await redis.setex(
    challengeKey,
    Math.floor(webAuthnConfig.challengeTTL / 1000),
    JSON.stringify(challengeData)
  );

  return options;
}

/**
 * Verify passkey authentication
 */
export async function verifyPasskeyAuthentication(
  credential: AuthenticationResponseJSON,
  meta: ClientMeta
) {
  // Retrieve challenge
  const challengeKey = `passkey:login:challenge:${credential.response.clientDataJSON}`;

  // Try to find challenge by iterating (Redis doesn't support wildcard get easily)
  // In production, consider using a hash map or different key structure
  const allKeys = await redis.keys("passkey:login:challenge:*");
  let storedChallengeData: string | null = null;
  let foundChallengeKey: string | null = null;

  for (const key of allKeys) {
    const data = await redis.get(key);
    if (data) {
      const parsed: StoredChallenge = JSON.parse(data);
      // We'll verify the challenge matches during verification
      storedChallengeData = data;
      foundChallengeKey = key;
      break;
    }
  }

  if (!storedChallengeData || !foundChallengeKey) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.INVALID_OR_EXPIRED_CODE,
      "Challenge not found or expired"
    );
  }

  const storedChallenge: StoredChallenge = JSON.parse(storedChallengeData);

  if (storedChallenge.expiresAt < Date.now()) {
    await redis.del(foundChallengeKey);
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      ERROR_CODE.CODE_EXPIRED,
      "Challenge expired"
    );
  }

  // Find passkey by credentialId
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: credential.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          verified: true,
          isActive: true,
        },
      },
    },
  });

  if (!passkey) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.INVALID_CREDENTIALS,
      "Passkey not found"
    );
  }

  if (!passkey.user.isActive) {
    throw new HttpException(
      HTTP_CODE.FORBIDDEN,
      ERROR_CODE.FORBIDDEN,
      "User account is deactivated"
    );
  }

  // Verify authentication response
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: webAuthnConfig.origin,
    expectedRPID: webAuthnConfig.rpId,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: passkey.counter,
    },
    requireUserVerification: webAuthnConfig.userVerification === "required",
  });

  if (!verification.verified) {
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      ERROR_CODE.INVALID_CREDENTIALS,
      "Passkey authentication failed"
    );
  }

  // Update counter and lastUsedAt
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  // Delete challenge
  await redis.del(foundChallengeKey);

  // Find or create device
  const device = await findOrCreateDevice(passkey.user.id, meta);

  // Create session
  const session = await prisma.session.create({
    data: {
      userId: passkey.user.id,
      deviceId: device.id,
      clientKey: "",
      expiresAt: thirtyDaysFromNow(),
    },
  });

  // Generate client key (fingerprint)
  const hashedPublicKey = await generateClientKeyFromMeta(
    meta,
    passkey.user.id,
    session.id
  );

  // Update session with clientKey
  await prisma.session.update({
    where: { id: session.id },
    data: { clientKey: hashedPublicKey },
  });

  // Sign tokens
  const { token: accessToken, hashedJti: accessTokenId } =
    await generateAccessToken(
      passkey.user.id,
      session.id,
      passkey.user.role as UserRole,
      hashedPublicKey
    );

  const { token: refreshToken, hashedJti: refreshTokenId } =
    await generateRefreshToken(
      passkey.user.id,
      session.id,
      passkey.user.role as UserRole,
      hashedPublicKey
    );

  // Register tokens in TokenRecord
  await prisma.tokenRecord.createMany({
    data: [
      {
        jti: accessTokenId,
        type: "ACCESS",
        token: accessToken,
        sessionId: session.id,
        userId: passkey.user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(accessToken),
        revoked: false,
      },
      {
        jti: refreshTokenId,
        type: "REFRESH",
        token: refreshToken,
        sessionId: session.id,
        userId: passkey.user.id,
        publicKey: hashedPublicKey,
        expiresAt: await getJwtExpiration(refreshToken),
        revoked: false,
      },
    ],
  });

  return {
    user: passkey.user,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    tokens: {
      accessTokenId,
      hashedPublicKey,
    },
  };
}

/**
 * List user's passkeys
 */
export async function listUserPasskeys(userId: string) {
  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    include: {
      device: {
        select: {
          device: true,
          os: true,
          browser: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return passkeys.map((passkey) => ({
    id: passkey.id,
    name: passkey.name,
    device: passkey.device,
    transports: passkey.transports,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  }));
}

/**
 * Delete a passkey
 */
export async function deletePasskey(userId: string, passkeyId: string) {
  // Verify passkey belongs to user
  const passkey = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
  });

  if (!passkey) {
    throw new HttpException(
      HTTP_CODE.NOT_FOUND,
      ERROR_CODE.NOT_FOUND,
      "Passkey not found"
    );
  }

  await prisma.passkey.delete({
    where: { id: passkeyId },
  });

  return { passkeyId };
}
