import type { createCheckoutClient } from "../src/checkout/client";
import type { Checkout, CheckoutAmountSource } from "../src/checkout/types";
import type { createBuPaymentClientFromEnv } from "../src/client";

declare const checkout: ReturnType<typeof createCheckoutClient>;
declare const fromEnv: ReturnType<typeof createBuPaymentClientFromEnv>;

const draft = () => checkout.sessionDraft().customerId("c").destination("d").idempotencyKey("o");

const created: Promise<Checkout> = draft()
  .amount(12_100)
  .currency("EUR")
  .description("Room 12, 3 nights")
  .productId("prod_1")
  .create();
void created;

const withoutProduct: Promise<Checkout> = draft()
  .amount(12_100)
  .currency("EUR")
  .description("Room 12, 3 nights")
  .create();
void withoutProduct;

const withDefaultDestination: Promise<Checkout> = fromEnv.checkout
  .sessionDraft()
  .amount(12_100)
  .currency("EUR")
  .description("Room 12, 3 nights")
  .customerEmail("buyer@example.test")
  .idempotencyKey("o")
  .create();
void withDefaultDestination;

// @ts-expect-error a currency follows the amount
draft().currency("EUR");

// @ts-expect-error a description follows the currency
draft().amount(12_100).description("Room 12");

// @ts-expect-error a product belongs to an amount the App calculated
draft().productId("prod_1");

// @ts-expect-error a checkout for an amount needs its currency
draft().amount(12_100).create();

// @ts-expect-error a checkout for an amount needs its description
draft().amount(12_100).currency("EUR").create();

// @ts-expect-error a checkout for an amount needs its description, whatever the product
draft().amount(12_100).currency("EUR").productId("prod_1").create();

// @ts-expect-error an amount replaces the price
draft().amount(12_100).priceId("price_1");

// @ts-expect-error an amount is a total, so it has no quantity
draft().amount(12_100).quantity(2);

// @ts-expect-error an amount the App calculated has no catalogue price to assert
draft().amount(12_100).expectedUnitAmount(12_100);

// @ts-expect-error a price replaces the amount
draft().priceId("price_1").amount(12_100);

// @ts-expect-error a quantity multiplies a price, so it settles on the catalogue
draft().quantity(2).amount(12_100);

// @ts-expect-error an asserted price settles on the catalogue
draft().expectedUnitAmount(2_900).amount(12_100);

const quantityFirst: Promise<Checkout> = draft().quantity(2).priceId("price_1").create();
void quantityFirst;

const assertionFirst: Promise<Checkout> = draft()
  .expectedUnitAmount(2_900)
  .expectedCurrency("EUR")
  .priceId("price_1")
  .create();
void assertionFirst;

declare const read: Checkout;
const source: CheckoutAmountSource = read.amountSource;
const priceId: string | null = read.priceId;
const productId: string | null = read.productId;
const description: string | null = read.description;
void [source, priceId, productId, description];

// @ts-expect-error a checkout read may have no price
const requiredPrice: string = read.priceId;
void requiredPrice;

// @ts-expect-error only the documented amount sources exist
const unknownSource: CheckoutAmountSource = "custom";
void unknownSource;
