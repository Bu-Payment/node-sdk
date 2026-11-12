import type { createCheckoutClient } from "../src/checkout/client";
import type { createPaymentsClient } from "../src/payments/client";
import type { createSubscriptionsClient } from "../src/subscriptions/client";

declare const payments: ReturnType<typeof createPaymentsClient>;
declare const checkout: ReturnType<typeof createCheckoutClient>;
declare const subscriptions: ReturnType<typeof createSubscriptionsClient>;

const payment = payments.draft().customerId("cus_1").priceId("price_1");
const subscription = subscriptions
  .draft()
  .customerId("cus_1")
  .name("Gold")
  .priceId("price_1")
  .pending();
const session = checkout
  .subscriptionSession()
  .name("Gold")
  .priceId("price_1")
  .customerId("cus_1")
  .customerEmail("buyer@example.test")
  .successUrl("https://shop.test/ok")
  .cancelUrl("https://shop.test/cancel");
const oneTime = checkout
  .sessionDraft()
  .priceId("price_1")
  .customerId("cus_1")
  .destination("default")
  .idempotencyKey("order-1");
const migration = subscriptions
  .subscription("sub_1")
  .priceMigration()
  .targetPriceId("price_2")
  .immediately()
  .prorationPolicy("none")
  .paymentFailurePolicy("preventChange");

// @ts-expect-error a payment asserting an amount must also assert its currency
payment.expectedUnitAmount(1_500).create();

// @ts-expect-error a subscription asserting an amount must also assert its currency
subscription.expectedUnitAmount(1_500).create();

// @ts-expect-error a subscription checkout asserting an amount must also assert its currency
session.expectedUnitAmount(1_500).create();

// @ts-expect-error a checkout asserting an amount must also assert its currency
oneTime.expectedUnitAmount(1_500).create();

// @ts-expect-error a price migration asserting an amount must also assert its currency
migration.expectedUnitAmount(1_500).create();

// @ts-expect-error the expected currency follows the expected amount on a payment
payment.expectedCurrency("EUR");

// @ts-expect-error the expected currency follows the expected amount on a subscription
subscription.expectedCurrency("EUR");

// @ts-expect-error the expected currency follows the expected amount on a subscription checkout
session.expectedCurrency("EUR");

// @ts-expect-error the expected currency follows the expected amount on a checkout
oneTime.expectedCurrency("EUR");

// @ts-expect-error the expected currency follows the expected amount on a price migration
migration.expectedCurrency("EUR");

const pinned = { unitAmount: 1_500, currency: "EUR" };

// @ts-expect-error a payment no longer takes the expected price as one object
payment.expectedPrice(pinned);

// @ts-expect-error a subscription no longer takes the expected price as one object
subscription.expectedPrice(pinned);

// @ts-expect-error a subscription checkout no longer takes the expected price as one object
session.expectedPrice(pinned);

// @ts-expect-error a checkout no longer takes the expected price as one object
oneTime.expectedPrice(pinned);

// @ts-expect-error a price migration no longer takes the expected price as one object
migration.expectedPrice(pinned);

void payment.create();
void payment.expectedUnitAmount(1_500).expectedCurrency("EUR").create();
void subscription.create();
void subscription.expectedUnitAmount(1_500).expectedCurrency("EUR").create();
void session.create();
void session.expectedUnitAmount(1_500).expectedCurrency("EUR").create();
void oneTime.create();
void oneTime.expectedUnitAmount(1_500).expectedCurrency("EUR").create();
void migration.create();
void migration.expectedUnitAmount(1_500).expectedCurrency("EUR").create();
