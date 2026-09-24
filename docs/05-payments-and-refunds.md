# Payments and refunds

Payments, invoices and refunds carry immutable App provenance. A resource owned by another
App answers as not found.

## Creating a payment

A payment is priced one of two ways, never both:

```ts
await client.payments.create({ customerId: "cus_1", priceId: "price_1" });

await client.payments.create({ customerId: "cus_1", amount: 5000, currency: "EUR" });
```

Passing `priceId` together with `amount` or `currency` is refused before the request is
signed, so a request can never override the price of a canonical resource. An ad hoc
payment needs both `amount` and `currency`.

`allocations` splits the charge across references and requires a `paymentMethodId`:

```ts
await client.payments.create({
  customerId: "cus_1",
  priceId: "price_1",
  paymentMethodId: "pm_1",
  allocations: [{ reference: "line_1", amount: 5000, currency: "EUR" }],
});
```

Requires `payments:write`. The API rejects a creation without an idempotency key; the SDK
always sends one.

## Reading payments and invoices

```ts
const payments = await client.payments.list({ limit: 50 });
const payment = await client.payments.get("pay_1");

const invoices = await client.invoices.list({ subscriptionId: "sub_1", status: "open" });
const invoice = await client.invoices.get("inv_1");
```

Both require `payments:read` and page on `{ data, nextCursor, hasMore }`.

## Refunds

```ts
const refunds = await client.refunds.list();
const refund = await client.refunds.get("ref_1");

await client.refunds.create({ paymentId: "pay_1", amount: 2500, currency: "EUR" });
```

Reads require `payments:read`; creation requires `refunds:write`. A partial refund needs
its currency alongside the amount. Omitting both refunds the payment in full.

---

Previous: [Checkout](04-checkout.md) · Next: [Subscriptions](06-subscriptions.md)
