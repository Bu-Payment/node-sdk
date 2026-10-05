import type { createCatalogueClient } from "../src/catalogue/client";
import type { createCheckoutClient } from "../src/checkout/client";
import type { ErrorCode } from "../src/constants";
import type { createCustomersClient } from "../src/customers/client";
import { isPriceChanged } from "../src/errors";
import type { createPaymentMethodsClient } from "../src/payment-methods/client";
import type { createPaymentsClient } from "../src/payments/client";
import type { createPriceMigrationsClient } from "../src/price-migrations/client";
import type { createRefundsClient } from "../src/refunds/client";
import type { createSubscriptionsClient } from "../src/subscriptions/client";
import type { CurrentPrice, PriceChangedError } from "../src/types";
import type { createWebhooksClient } from "../src/webhooks/client";

declare const catalogue: ReturnType<typeof createCatalogueClient>;
declare const customers: ReturnType<typeof createCustomersClient>;
declare const payments: ReturnType<typeof createPaymentsClient>;
declare const paymentMethods: ReturnType<typeof createPaymentMethodsClient>;
declare const webhooks: ReturnType<typeof createWebhooksClient>;
declare const checkout: ReturnType<typeof createCheckoutClient>;
declare const refunds: ReturnType<typeof createRefundsClient>;
declare const subscriptions: ReturnType<typeof createSubscriptionsClient>;
declare const priceMigrations: ReturnType<typeof createPriceMigrationsClient>;

// @ts-expect-error a payment is drafted at the entry and created only by the terminal
payments.create();

// @ts-expect-error a product is drafted at the entry and created only by the terminal
catalogue.createProduct();

// @ts-expect-error an endpoint is drafted at the entry and created only by the terminal
webhooks.createEndpoint();

// @ts-expect-error a product cannot be created before its name is set
catalogue.productDraft().lookupKey("gold").create();

// @ts-expect-error a product cannot be updated before a field is set
catalogue.updateProduct("prod_1").expectedUpdatedAt("2026-01-01T00:00:00Z").update();

// @ts-expect-error a product draft has no observed version to assert
catalogue.productDraft().expectedUpdatedAt("2026-01-01T00:00:00Z");

// @ts-expect-error a price cannot be created before its currency is set
catalogue.priceDraft("prod_1").unitAmount(1_000).create();

// @ts-expect-error a price cannot be created before its amount is set
catalogue.priceDraft("prod_1").currency("EUR").create();

// @ts-expect-error a new price has no observed version to assert
catalogue.priceDraft("prod_1").unitAmount(1_000).currency("EUR").expectedUpdatedAt("x");

// @ts-expect-error an interval count needs an interval
catalogue.priceDraft("prod_1").intervalCount(3);

// @ts-expect-error a lookup key transfer needs a lookup key
catalogue.priceDraft("prod_1").transferLookupKey();

const replacingWithoutCurrency = catalogue.priceDraft("prod_1").unitAmount(1).replacing("p_1");
// @ts-expect-error a replacement price cannot be sent before its currency is set
replacingWithoutCurrency.replace();

const replacingPrice = catalogue.priceDraft("prod_1").unitAmount(1).currency("EUR");
// @ts-expect-error a price that replaces another is not created on its own
replacingPrice.replacing("price_1").create();

// @ts-expect-error a price with nothing to replace has no replace step
replacingPrice.replace();

// @ts-expect-error a default price cannot be set before the price is chosen
catalogue.setDefaultPrice("prod_1").update();

// @ts-expect-error an observed product version is asserted only on a chosen price
catalogue.setDefaultPrice("prod_1").expectedUpdatedAt("2026-01-01T00:00:00Z");

// @ts-expect-error archiving a product does not reactivate it
catalogue.archiveProduct("prod_1").reactivate();

// @ts-expect-error reactivating a price does not archive it
catalogue.reactivatePrice("price_1").archive();

// @ts-expect-error a customer cannot be created before an email is set
customers.draft().create();

// @ts-expect-error a customer cannot be updated before a field is set
customers.customer("cus_1").update();

// @ts-expect-error a payment cannot be created before a customer is set
payments.draft().priceId("price_1").create();

// @ts-expect-error a payment cannot be created with no pricing source
payments.draft().customerId("cus_1").create();

// @ts-expect-error an ad hoc amount cannot be created without its currency
payments.draft().customerId("cus_1").amount(1_000).create();

// @ts-expect-error a currency cannot be created without its amount
payments.draft().customerId("cus_1").currency("EUR").create();

// @ts-expect-error an ad hoc amount must not reach a payment priced canonically
payments.draft().priceId("price_1").amount(1_000);

// @ts-expect-error a canonical price must not reach a payment priced ad hoc
payments.draft().amount(1_000).priceId("price_1");

// @ts-expect-error a currency must not reach a payment priced canonically
payments.draft().priceId("price_1").currency("EUR");

const displayedPrice = { unitAmount: 1_000, currency: "EUR" };

// @ts-expect-error a displayed price is asserted against a canonical price only
payments.draft().customerId("cus_1").expectedPrice(displayedPrice);

// @ts-expect-error an ad hoc amount has no canonical price to assert
payments.draft().amount(1_000).currency("EUR").expectedPrice(displayedPrice);

// @ts-expect-error an asserted payment cannot turn ad hoc
payments.draft().priceId("price_1").expectedPrice(displayedPrice).amount(1);

// @ts-expect-error an asserted payment cannot take a currency either
payments.draft().priceId("price_1").expectedPrice(displayedPrice).currency("EUR");

// @ts-expect-error allocations require a payment method
payments.draft().customerId("cus_1").priceId("price_1").allocation("line_1", 100, "EUR");

// @ts-expect-error a payment method setup cannot be created before the buyer's consent
paymentMethods.setupDraft("cus_1").currency("EUR").returnUrl("https://shop.test/r").create();

const setupWithoutReturnUrl = paymentMethods
  .setupDraft("cus_1")
  .currency("EUR")
  .consentAcceptedAt("2026-01-01T00:00:00Z");
// @ts-expect-error a payment method setup cannot be created before its return url
setupWithoutReturnUrl.create();

const setupWithoutCurrency = paymentMethods
  .setupDraft("cus_1")
  .returnUrl("https://shop.test/r")
  .consentAcceptedAt("2026-01-01T00:00:00Z");
// @ts-expect-error a payment method setup cannot be created before its currency
setupWithoutCurrency.create();

// @ts-expect-error a payment method list carries no cursor
paymentMethods.list("cus_1").cursor("cur_2");

// @ts-expect-error a webhook endpoint cannot be created before its url is set
webhooks.endpointDraft().event("payment.succeeded.v1").create();

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
refunds.draft().amount(100).currency("EUR").create();

// @ts-expect-error a partial refund cannot be created without its currency
refunds.draft().paymentId("pay_1").amount(100).create();

const subscriptionWithoutActivation = subscriptions
  .draft()
  .customerId("cus_1")
  .name("Gold")
  .priceId("price_1");
// @ts-expect-error a subscription cannot be created before an activation is chosen
subscriptionWithoutActivation.create();

// @ts-expect-error a trial cannot end before it is given a start
subscriptions.draft().trialEndsAt("2026-01-15T00:00:00Z");

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
  catalogue.productDraft().name("Gold").create(),
  catalogue.updateProduct("prod_1").lookupKey(null).expectedUpdatedAt("x").update(),
  catalogue.archiveProduct("prod_1").expectedUpdatedAt("x").archive(),
  catalogue.reactivateProduct("prod_1").reactivate(),
  catalogue.priceDraft("prod_1").unitAmount(1).currency("EUR").create(),
  catalogue.priceDraft("prod_1").unitAmount(1).currency("EUR").replacing("p_1").replace(),
  catalogue.archivePrice("price_1").archive(),
  catalogue.reactivatePrice("price_1").expectedUpdatedAt("x").reactivate(),
  customers.draft().email("buyer@example.test").create(),
  customers.customer("cus_1").name("Renamed").update(),
  payments.draft().customerId("cus_1").priceId("price_1").create(),
  payments.draft().customerId("cus_1").amount(1_000).currency("EUR").create(),
  payments
    .draft()
    .customerId("cus_1")
    .priceId("price_1")
    .paymentMethodId("pm_1")
    .allocation("line_1", 100, "EUR")
    .create(),
  paymentMethods
    .setupDraft("cus_1")
    .currency("EUR")
    .returnUrl("https://shop.test/r")
    .consentAcceptedAt("2026-01-01T00:00:00Z")
    .create(),
  paymentMethods.paymentMethod("cus_1", "pm_1").revoke(),
  webhooks.endpointDraft().url("https://shop.test/hooks").create(),
  webhooks.endpoint("whe_1").status("disabled").update(),
  checkout.coupon("WELCOME").unitAmount(1_000).currency("EUR").evaluate(),
  checkout.coupon("WELCOME").unitAmount(1_000).currency("EUR").reference("order_1").redeem(),
  checkout.taxRates().productId("prod_1").country("PT").state("LIS").get(),
  checkout.taxRate("txr_1").amount(1_000).productId("prod_1").calculate(),
  checkout.shippingRates().currency("EUR").destinationCountry("PT").product("prod_1").get(),
  refunds.draft().paymentId("pay_1").create(),
  refunds.draft().paymentId("pay_1").amount(100).currency("EUR").create(),
  subscriptions
    .draft()
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

declare const verifyDelivery: typeof import("../src/webhooks/verification").verifyWebhookDelivery;

verifyDelivery({
  // @ts-expect-error a parsed body cannot be verified; the raw bytes were signed
  body: { resourceId: "prod_1" },
  headers: {},
  secret: "whsec_x",
});

declare const caught: unknown;

if (isPriceChanged(caught)) {
  const refusal: PriceChangedError = caught;
  const code: typeof ErrorCode.PRICE_CHANGED = refusal.code;
  const price: CurrentPrice | undefined = refusal.price;
  // @ts-expect-error the current price is absent when the API envelope was malformed
  const unitAmount: number = refusal.price.unitAmount;
  void [code, price, unitAmount];
}
