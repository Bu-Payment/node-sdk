import type { createCustomersClient } from "../src/customers/client";
import type { createPaymentsClient } from "../src/payments/client";
import type { createWebhooksClient } from "../src/webhooks/client";

declare const customers: ReturnType<typeof createCustomersClient>;
declare const payments: ReturnType<typeof createPaymentsClient>;
declare const webhooks: ReturnType<typeof createWebhooksClient>;

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
];
