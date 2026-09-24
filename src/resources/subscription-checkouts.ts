import type { CheckoutSession, CreateSubscriptionCheckoutBody } from "../models/checkout";
import { Resource } from "./resource";

export class SubscriptionCheckoutsResource extends Resource {
  create(body: CreateSubscriptionCheckoutBody, idempotencyKey?: string): Promise<CheckoutSession> {
    return this.send({
      method: "POST",
      path: "/v1/subscription-checkouts",
      body,
      ...this.replay(idempotencyKey),
    });
  }
}
