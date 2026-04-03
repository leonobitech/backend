import { Router } from "express";
import authenticate from "@middlewares/authenticate";
import { createCheckout, handleWebhook } from "@controllers/lms/payment.controller";

const paymentRouter = Router();

// Checkout — requires auth (mounted under apiKeyGuard + authenticate in index.ts)
paymentRouter.post("/checkout", authenticate, createCheckout);

export default paymentRouter;

// Webhook router — separate, needs raw body (mounted before express.json in index.ts)
export const webhookRouter = Router();
webhookRouter.post("/webhook", handleWebhook);
