# Checkout

Coupons, tax rates, shipping rates and subscription checkouts all require
`checkout:create`, and each resolves only against catalogue assigned to the App.

## Coupons

```ts
const evaluation = await client.coupons.evaluate({
  code: "WELCOME",
  unitAmount: 5000,
  currency: "EUR",
  productId: "prod_1",
});

const redemption = await client.coupons.redeem(
  { code: "WELCOME", unitAmount: 5000, currency: "EUR", reference: "order_1" },
  "order_1",
);
```

`evaluate` prices the discount without consuming it. `redeem` consumes one redemption and
records it against `reference`; pass that reference as the idempotency key so a retry
replays the same redemption instead of consuming a second one.

## Tax rates

```ts
const rates = await client.taxRates.list({ productId: "prod_1", country: "PT" });
const calculation = await client.taxRates.calculate("txr_1", {
  amount: 5000,
  productId: "prod_1",
  country: "PT",
});
```

`list` answers `{ data }` with the rates applicable to that product and destination. It has
no cursor. `state` requires `country`.

`calculate` answers the subtotal, the tax and the total in minor units, with the rounding
rule that produced them.

## Shipping rates

```ts
const shipping = await client.shippingRates.list({
  currency: "EUR",
  destinationCountry: "PT",
  productIds: ["prod_1", "prod_2"],
});
```

`productIds` is an array here and reaches the API as one comma-separated parameter. The
page's cursor is bound to that resolution, so reuse it only through `listAll`.

## Subscription checkouts

```ts
const session = await client.subscriptionCheckouts.create({
  name: "Gold",
  priceId: "price_1",
  customer: { id: customer.id, email: customer.email },
  successUrl: "https://shop.example/ok",
  cancelUrl: "https://shop.example/cancel",
});
```

The session answers an `id` and a `url` to redirect the buyer to. The price must be
assigned to the App and the customer must belong to it.

---

Previous: [Customers](03-customers.md) · Next: [Payments and refunds](05-payments-and-refunds.md)
