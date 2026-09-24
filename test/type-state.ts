import type { createCheckoutClient } from "../src/checkout/client";
import type { createCustomersClient } from "../src/customers/client";
import type { createPaymentsClient } from "../src/payments/client";
import type { createPriceMigrationsClient } from "../src/price-migrations/client";
import type { createRefundsClient } from "../src/refunds/client";
import type { createSubscriptionsClient } from "../src/subscriptions/client";
import type { createWebhooksClient } from "../src/webhooks/client";

declare const customers: ReturnType<typeof createCustomersClient>;
declare const payments: ReturnType<typeof createPaymentsClient>;
declare const webhooks: ReturnType<typeof createWebhooksClient>;
declare const checkout: ReturnType<typeof createCheckoutClient>;
declare const refunds: ReturnType<typeof createRefundsClient>;
declare const subscriptions: ReturnType<typeof createSubscriptionsClient>;
declare const priceMigrations: ReturnType<typeof createPriceMigrationsClient>;

// @ts-expect-error a customer cannot be created before an email is set
customers.create().create();

// @ts-expect-error a customer cannot be updated before a field is set
customers.customer("cus_1").update();

// @ts-expect-error a payment cannot be created before a customer is set
payments.create().priceId("price_1").create();

// @ts-expect-error a payment cannot be created with no pricing source
payments.create().customerId("cus_1").create();

// @ts-expect-error an ad hoc amount cannot be created without its currency
payments.create().customerId("cus_1").amount(1_000).create();

// @ts-expect-error a currency cannot be created without its amount
payments.create().customerId("cus_1").currency("EUR").create();

// @ts-expect-error an ad hoc amount must not reach a payment priced canonically
payments.create().priceId("price_1").amount(1_000);

// @ts-expect-error a canonical price must not reach a payment priced ad hoc
payments.create().amount(1_000).priceId("price_1");

// @ts-expect-error a currency must not reach a payment priced canonically
payments.create().priceId("price_1").currency("EUR");

// @ts-expect-error allocations require a payment method
payments.create().customerId("cus_1").priceId("price_1").allocation("line_1", 100, "EUR");

// @ts-expect-error a webhook endpoint cannot be created before its url is set
webhooks.createEndpoint().event("payment.succeeded").create();

// @ts-expect-error a webhook endpoint cannot be updated before a field is set
webhooks.endpoint("whe_1").update();

// @ts-expect-error a coupon cannot be evaluated before it is priced
checkout.coupon("WELCOME").unitAmount(1_000).evaluate();

// @ts-expect-error a coupon cannot be redeemed without a reference
checkout.coupon("WELCOME").unitAmount(1_000).currency("EUR").redeem();

// @ts-expect-error applicable tax rates cannot be read before a product is named
checkout.taxRates().country("PT").get();

// @ts-expect-error a subdivision must not be set before its country
checkout.taxRates().productId("prod_1").state("LIS");

// @ts-expect-error tax cannot be calculated before an amount is set
checkout.taxRate("txr_1").productId("prod_1").calculate();

// @ts-expect-error tax cannot be calculated before a product is named
checkout.taxRate("txr_1").amount(1_000).calculate();

// @ts-expect-error shipping cannot resolve before a product is added
checkout.shippingRates().currency("EUR").destinationCountry("PT").get();

// @ts-expect-error shipping cannot resolve before a destination is set
checkout.shippingRates().currency("EUR").product("prod_1").all();

const sessionWithoutUrls = checkout
  .subscriptionSession()
  .name("Gold")
  .priceId("price_1")
  .customerId("cus_1")
  .customerEmail("buyer@example.test");
// @ts-expect-error a checkout session cannot be created before its urls are set
sessionWithoutUrls.create();

// @ts-expect-error a refund cannot be created before a payment is named
refunds.create().amount(100).currency("EUR").create();

// @ts-expect-error a partial refund cannot be created without its currency
refunds.create().paymentId("pay_1").amount(100).create();

const subscriptionWithoutActivation = subscriptions
  .create()
  .customerId("cus_1")
  .name("Gold")
  .priceId("price_1");
// @ts-expect-error a subscription cannot be created before an activation is chosen
subscriptionWithoutActivation.create();

// @ts-expect-error a trial cannot end before it is given a start
subscriptions.create().trialEndsAt("2026-01-15T00:00:00Z");

// @ts-expect-error a cancellation cannot be sent before its timing
subscriptions.subscription("sub_1").cancellation().cancel();

// @ts-expect-error a subscription pause needs both of its policies
subscriptions.subscription("sub_1").pauseSubscription().effectiveTiming("immediate").pause();

// @ts-expect-error a payment collection pause needs its behaviour
subscriptions.subscription("sub_1").pausePaymentCollection().pause();

// @ts-expect-error resuming a paused subscription needs a billing policy
subscriptions.subscription("sub_1").resumePausedSubscription().immediately().resume();

// @ts-expect-error a migration cannot be created before its target price
subscriptions.subscription("sub_1").priceMigration().immediately().create();

const migrationWithoutPolicies = subscriptions
  .subscription("sub_1")
  .priceMigration()
  .targetPriceId("price_2")
  .immediately();
// @ts-expect-error a migration cannot be created before its policies
migrationWithoutPolicies.create();

// @ts-expect-error a notification retry needs the plan version
priceMigrations.migration("mig_1").notificationPlan().channel("email").retry();

const rescheduleWithoutVersion = priceMigrations
  .migration("mig_1")
  .notificationPlan()
  .availableAt("2026-02-01T00:00:00Z");
// @ts-expect-error a notification reschedule needs the plan version
rescheduleWithoutVersion.reschedule();

export const accepted = [
  customers.create().email("buyer@example.test").create(),
  customers.customer("cus_1").name("Renamed").update(),
  payments.create().customerId("cus_1").priceId("price_1").create(),
  payments.create().customerId("cus_1").amount(1_000).currency("EUR").create(),
  payments
    .create()
    .customerId("cus_1")
    .priceId("price_1")
    .paymentMethodId("pm_1")
    .allocation("line_1", 100, "EUR")
    .create(),
  webhooks.createEndpoint().url("https://shop.test/hooks").create(),
  webhooks.endpoint("whe_1").status("disabled").update(),
  checkout.coupon("WELCOME").unitAmount(1_000).currency("EUR").evaluate(),
  checkout.coupon("WELCOME").unitAmount(1_000).currency("EUR").reference("order_1").redeem(),
  checkout.taxRates().productId("prod_1").country("PT").state("LIS").get(),
  checkout.taxRate("txr_1").amount(1_000).productId("prod_1").calculate(),
  checkout.shippingRates().currency("EUR").destinationCountry("PT").product("prod_1").get(),
  refunds.create().paymentId("pay_1").create(),
  refunds.create().paymentId("pay_1").amount(100).currency("EUR").create(),
  subscriptions
    .create()
    .customerId("cus_1")
    .name("Gold")
    .priceId("price_1")
    .trialingFrom("2026-01-01T00:00:00Z")
    .trialEndsAt("2026-01-15T00:00:00Z")
    .create(),
  subscriptions.subscription("sub_1").cancellation().timing("immediate").cancel(),
  subscriptions.subscription("sub_1").scheduledChange().cancel(),
  priceMigrations.migration("mig_1").notificationPlan().version(3).channel("email").retry(),
];
