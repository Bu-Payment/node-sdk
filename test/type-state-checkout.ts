import type { createCheckoutClient } from "../src/checkout/client";
import type { Checkout, CheckoutStatus } from "../src/checkout/types";

declare const checkout: ReturnType<typeof createCheckoutClient>;

const withoutPrice = checkout.sessionDraft().customerId("c").destination("d").idempotencyKey("o");
// @ts-expect-error a checkout cannot be created before its price is set
withoutPrice.create();

const withoutBuyer = checkout.sessionDraft().priceId("p").destination("d").idempotencyKey("o");
// @ts-expect-error a checkout cannot be created before its buyer is named
withoutBuyer.create();

const withoutDestination = checkout.sessionDraft().priceId("p").customerId("c").idempotencyKey("o");
// @ts-expect-error a checkout cannot be created before its destination is set
withoutDestination.create();

const withoutKey = checkout.sessionDraft().priceId("p").customerId("c").destination("d");
// @ts-expect-error a checkout cannot be created before its idempotency key is set
withoutKey.create();

// @ts-expect-error a buyer is named once, by email or by id
checkout.sessionDraft().customerEmail("buyer@example.test").customerId("c");

// @ts-expect-error a buyer is named once, by id or by email
checkout.sessionDraft().customerId("c").customerEmail("buyer@example.test");

// @ts-expect-error a name belongs to a buyer named by email
checkout.sessionDraft().customerName("Ana");

// @ts-expect-error a buyer named by id carries no name
checkout.sessionDraft().customerId("c").customerName("Ana");

// @ts-expect-error a reader is configured, not created
checkout.session("checkout_1").create();

const created: Promise<Checkout> = checkout
  .sessionDraft()
  .priceId("p")
  .customerEmail("buyer@example.test")
  .customerName("Ana")
  .destination("d")
  .idempotencyKey("o")
  .create();
void created;

const status: CheckoutStatus = "processing";
void status;
// @ts-expect-error only documented statuses exist
const unknownStatus: CheckoutStatus = "paid";
void unknownStatus;
