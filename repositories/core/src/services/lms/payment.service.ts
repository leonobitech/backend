import { stripe } from "@config/stripe";
import { APP_ORIGIN } from "@config/env";
import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";
import type Stripe from "stripe";

// =============================================================================
// Create Checkout Session
// =============================================================================

export const createCheckoutSessionService = async (
  userId: string,
  courseId: string,
  userEmail: string
) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);
  appAssert(course.status === "PUBLISHED", HTTP_CODE.BAD_REQUEST, "Course is not available for purchase", ERROR_CODE.BAD_REQUEST);

  // Check if already enrolled
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  appAssert(!existing, HTTP_CODE.CONFLICT, "You are already enrolled in this course", ERROR_CODE.CONFLICT);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: course.currency.toLowerCase(),
          product_data: {
            name: course.title,
            description: course.description.slice(0, 500),
            ...(course.thumbnailUrl ? { images: [course.thumbnailUrl] } : {}),
          },
          unit_amount: Math.round(course.price * 100), // Stripe uses cents
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      courseId,
    },
    success_url: `${APP_ORIGIN}/courses/${course.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_ORIGIN}/courses/${course.slug}`,
  });

  logger.info("Checkout session created", {
    userId,
    courseId,
    sessionId: session.id,
    event: "lms.checkout.created",
  });

  return { url: session.url };
};

// =============================================================================
// Handle Webhook — checkout.session.completed
// =============================================================================

export const handleCheckoutCompletedService = async (
  session: Stripe.Checkout.Session
) => {
  const userId = session.metadata?.userId;
  const courseId = session.metadata?.courseId;

  if (!userId || !courseId) {
    logger.warn("Webhook missing metadata", {
      sessionId: session.id,
      event: "lms.webhook.missing_metadata",
    });
    return;
  }

  // Idempotency — skip if already enrolled
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });

  if (existing) {
    logger.info("Enrollment already exists, skipping", {
      userId,
      courseId,
      event: "lms.webhook.duplicate",
    });
    return;
  }

  await prisma.enrollment.create({
    data: {
      userId,
      courseId,
      status: "ACTIVE",
      stripePaymentId: session.payment_intent as string,
      stripeSessionId: session.id,
    },
  });

  logger.info("Enrollment created via webhook", {
    userId,
    courseId,
    stripeSessionId: session.id,
    event: "lms.enrollment.created",
  });
};
