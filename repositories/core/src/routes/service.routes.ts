import { Router } from "express";
import { z } from "zod";
import { issueServiceToken } from "@services/serviceToken.service";
import catchErrors from "@utils/http/catchErrors";
import { HTTP_CODE } from "@constants/httpCode";
import { sanitizeInput } from "@utils/validation/sanitizeInput";
import logger from "@utils/logging/logger";

const router = Router();

const tokenRequestSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().optional(),
});

router.post(
  "/token",
  catchErrors(async (req, res) => {
    const meta = req.meta;
    const parseResult = tokenRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      logger.warn("Invalid service token request payload", {
        ...meta,
        input: sanitizeInput(req.body),
        event: "service.token.invalid_payload",
      });

      return res.status(HTTP_CODE.BAD_REQUEST).json({
        error: "invalid_request",
        message: "Invalid client credentials payload.",
        details: parseResult.error.flatten(),
      });
    }

    const { client_id, client_secret, scope } = parseResult.data;
    const requestedScopes = scope
      ? Array.from(new Set(scope.split(/\s+/).filter(Boolean)))
      : undefined;

    const token = await issueServiceToken({
      clientId: client_id,
      clientSecret: client_secret,
      requestedScopes,
      meta,
    });

    return res.status(HTTP_CODE.OK).json({
      token_type: "Bearer",
      access_token: token.accessToken,
      expires_in: token.expiresIn,
      scope: token.scope.join(" "),
      client_id: client_id,
    });
  })
);

export default router;
