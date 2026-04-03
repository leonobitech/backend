import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import { stripe } from "@config/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@config/env";
import {
  createCheckoutSessionService,
  handleCheckoutCompletedService,
} from "@services/lms/payment.service";
import logger from "@utils/logging/logger";
import type Stripe from "stripe";

// =============================================================================
// POST /payments/checkout — Create Stripe Checkout Session (auth required)
// =============================================================================

export const createCheckout = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const userId = req.userId as string;
  const { courseId } = req.body;

  if (!courseId) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      getErrorMessage("INVALID_INPUT", lang),
      ERROR_CODE.INVALID_INPUT,
      [{ field: "courseId", message: "Course ID is required" }]
    );
  }

  // Get user email for Stripe
  const user = await (await import("@config/prisma")).default.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    throw new HttpException(HTTP_CODE.NOT_FOUND, "User not found", ERROR_CODE.USER_NOT_FOUND);
  }

  const result = await createCheckoutSessionService(userId, courseId, user.email);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// POST /payments/webhook — Stripe Webhook (public, signature verified)
// =============================================================================

export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    logger.warn("Webhook missing stripe-signature header", {
      event: "lms.webhook.no_signature",
    });
    return void res.status(HTTP_CODE.BAD_REQUEST).json({ message: "Missing signature" });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn("Webhook signature verification failed", {
      error: message,
      event: "lms.webhook.invalid_signature",
    });
    return void res.status(HTTP_CODE.BAD_REQUEST).json({ message: `Webhook Error: ${message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutCompletedService(session);
  }

  return void res.status(HTTP_CODE.OK).json({ received: true });
};
