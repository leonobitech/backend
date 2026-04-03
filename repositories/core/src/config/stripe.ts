import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@config/env";

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});
