# Checkout

Coupons, tax rates, shipping rates and subscription sessions all require
`checkout:create`, and each resolves only against catalogue assigned to the App.

## Coupons

```ts
const evaluation = await client.checkout
  .coupon("WELCOME")
  .unitAmount(5000)
  .currency("EUR")
  .productId("prod_1")
  .evaluate();

const redemption = await client.checkout
  .coupon("WELCOME")
  .unitAmount(5000)
  .currency("EUR")
  .reference("order_1")
  .idempotencyKey("order_1")
  .redeem();
```

`evaluate()` appears once an amount and a currency are set; `redeem()` needs a reference as
well, because it consumes one redemption and records it against that reference. Pass the
same reference as the idempotency key so a retry replays the redemption instead of
consuming a second one.

## Tax rates

```ts
const rates = await client.checkout.taxRates().productId("prod_1").country("PT").get();

const calculation = await client.checkout
  .taxRate("txr_1")
  .amount(5000)
  .productId("prod_1")
  .country("PT")
  .calculate();
```

`get()` answers `{ data }` with the rates applicable to that product and destination. It
has no cursor, and it does not exist until a product is set. `state()` is only reachable
once a country is set, which is the API's rule in the type.

`calculate()` answers the subtotal, the tax and the total in minor units, with the rounding
rule that produced them.

## Shipping rates

```ts
const shipping = await client.checkout
  .shippingRates()
  .currency("EUR")
  .destinationCountry("PT")
  .product("prod_1")
  .product("prod_2")
  .get();
```

Products accumulate one call at a time and reach the API as one comma-separated parameter.
`get()` and `all()` do not exist until a currency, a destination and at least one product
are set, so an empty resolution is unrepresentable rather than a runtime error. An
identifier containing a comma is refused, because the wire format would split it in two.

## Subscription sessions

```ts
const session = await client.checkout
  .subscriptionSession()
  .name("Gold")
  .priceId("price_1")
  .customerId(customer.id)
  .customerEmail(customer.email)
  .successUrl("https://shop.example/ok")
  .cancelUrl("https://shop.example/cancel")
  .create();
```

The session answers an `id` and a `url` to redirect the buyer to. The price must be
assigned to the App and the customer must belong to it. `trialDays()` and `customerName()`
are optional; the other six are required and `create()` is absent until all six are set.

---

Previous: [Customers](03-customers.md) · Next: [Payments and refunds](05-payments-and-refunds.md)
