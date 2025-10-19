import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import HttpException from "@utils/http/HttpException";
import logger from "@utils/logging/logger";
import { getServiceClientById, verifyClientSecret } from "@config/serviceClients";
import { generateServiceToken } from "@utils/auth/serviceTokens";

interface IssueServiceTokenParams {
  clientId: string;
  clientSecret: string;
  requestedScopes?: string[];
  meta?: RequestMeta;
}

export const issueServiceToken = async ({
  clientId,
  clientSecret,
  requestedScopes,
  meta,
}: IssueServiceTokenParams) => {
  const client = getServiceClientById(clientId);

  if (!client || !client.active) {
    logger.warn("Service token request rejected: client not found or inactive", {
      ...meta,
      clientId,
      event: "service.token.client_not_found",
    });
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      "Invalid client credentials.",
      ERROR_CODE.UNAUTHORIZED
    );
  }

  const secretValid = verifyClientSecret(client, clientSecret);

  if (!secretValid) {
    logger.warn("Service token request rejected: invalid secret", {
      ...meta,
      clientId,
      event: "service.token.invalid_secret",
    });
    throw new HttpException(
      HTTP_CODE.UNAUTHORIZED,
      "Invalid client credentials.",
      ERROR_CODE.UNAUTHORIZED
    );
  }

  const grantedScopes = requestedScopes?.length
    ? Array.from(new Set(requestedScopes))
    : client.scopes;

  const unauthorizedScopes = grantedScopes.filter((scope) => !client.scopes.includes(scope));

  if (unauthorizedScopes.length > 0) {
    logger.warn("Service token request rejected: scope not allowed", {
      ...meta,
      clientId,
      requestedScopes: grantedScopes,
      unauthorizedScopes,
      event: "service.token.scope_denied",
    });
    throw new HttpException(
      HTTP_CODE.FORBIDDEN,
      "Requested scope is not allowed for this client.",
      ERROR_CODE.FORBIDDEN,
      unauthorizedScopes.map((scope) => ({
        field: "scope",
        message: `Scope '${scope}' is not permitted.`,
      }))
    );
  }

  const token = await generateServiceToken({
    clientId: client.id,
    scopes: grantedScopes,
  });

  logger.info("Service token issued", {
    ...meta,
    clientId: client.id,
    scopes: grantedScopes,
    expiresIn: token.expiresIn,
    event: "service.token.issued",
  });

  return {
    accessToken: token.token,
    expiresIn: token.expiresIn,
    scope: grantedScopes,
    client,
  };
};
