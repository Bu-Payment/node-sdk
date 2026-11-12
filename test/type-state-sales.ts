import type { createSalesClient } from "../src/sales/client";

declare const sales: ReturnType<typeof createSalesClient>;

// @ts-expect-error a sale is drafted at the entry and charged only by the terminal
sales.charge();

const withoutPrice = sales
  .draft()
  .displayedUnitAmount(1_500)
  .displayedCurrency("EUR")
  .customerId("cus_1")
  .idempotencyKey("o");
// @ts-expect-error a sale cannot be charged before its price is set
withoutPrice.charge();

const withoutDisplayed = sales.draft().priceId("price_1").customerId("cus_1").idempotencyKey("o");
// @ts-expect-error a sale cannot be charged before the displayed price is set
withoutDisplayed.charge();

const withoutCurrency = sales
  .draft()
  .priceId("price_1")
  .displayedUnitAmount(1_500)
  .customerId("cus_1")
  .idempotencyKey("o");
// @ts-expect-error a sale cannot be charged with a displayed amount but no displayed currency
withoutCurrency.charge();

// @ts-expect-error the displayed currency follows the displayed amount
sales.draft().priceId("price_1").displayedCurrency("EUR");

// @ts-expect-error the displayed price is no longer taken as one object
sales.draft().displayedPrice({ unitAmount: 1_500, currency: "EUR" });

const withoutCustomer = sales
  .draft()
  .priceId("price_1")
  .displayedUnitAmount(1_500)
  .displayedCurrency("EUR")
  .idempotencyKey("o");
// @ts-expect-error a sale cannot be charged before its customer is named
withoutCustomer.charge();

const withoutKey = sales
  .draft()
  .priceId("price_1")
  .displayedUnitAmount(1_500)
  .displayedCurrency("EUR")
  .customerId("cus_1");
// @ts-expect-error a sale cannot be charged before its idempotency key is set
withoutKey.charge();

// @ts-expect-error a sale names its customer once, by email or by id
sales.draft().customerEmail("buyer@example.test").customerId("cus_1");

// @ts-expect-error a sale names its customer once, by id or by email
sales.draft().customerId("cus_1").customerEmail("buyer@example.test");

void sales
  .draft()
  .priceId("price_1")
  .displayedUnitAmount(1_500)
  .displayedCurrency("EUR")
  .customerId("cus_1")
  .idempotencyKey("order-1")
  .charge();
