# Payments and refunds

Payments, invoices and refunds carry immutable App provenance. A resource owned by another
App answers as not found.

## Creating a payment

A payment is priced one of two ways, and the type makes the other unreachable:

```ts
await client.payments.create().customerId("cus_1").priceId("price_1").create();

await client.payments.create().customerId("cus_1").amount(5000).currency("EUR").create();
```

Once `priceId()` is called, `amount()` and `currency()` are gone from the builder; once an
amount or a currency is set, `priceId()` is gone. A request can never override the price of
a canonical resource, and the compiler says so rather than the server.

`create()` appears only when a customer is set and the payment is priced, so a payment with
an amount and no currency cannot be sent at all.

The SDK is deliberately stricter than the API here: the API accepts an amount with no
currency and charges in its default currency. An implicit currency on a charge is not a
default worth inheriting silently, so a caller who wants it must go through
`client.request`.

Allocations accumulate and are reachable only after a payment method, which is the API's
own rule:

```ts
await client.payments
  .create()
  .customerId("cus_1")
  .priceId("price_1")
  .paymentMethodId("pm_1")
  .allocation("line_1", 2500, "EUR")
  .allocation("line_2", 2500, "EUR")
  .create();
```

Requires `payments:write`. The API rejects a creation without an idempotency key; the SDK
always sends one.

## Reading payments and invoices

```ts
const payments = await client.payments.list().limit(50).get();
const payment = await client.payments.payment("pay_1").get();

const invoices = await client.invoices.list().subscriptionId("sub_1").status("open").get();
const invoice = await client.invoices.invoice("inv_1").get();
```

Both require `payments:read` and answer `{ data, nextCursor, hasMore }`.

## Refunds

```ts
const refunds = await client.refunds.list().get();
const refund = await client.refunds.refund("ref_1").get();

await client.refunds.create().paymentId("pay_1").amount(2500).currency("EUR").create();
```

Reads require `payments:read`; creation requires `refunds:write`. `create()` disappears when
an amount is set without a currency, so a partial refund cannot be sent incomplete.
Omitting both refunds the payment in full.

`list()` and `refund(id)` answer an `OwnedRefund`, which carries the `customerId` the API
grafts on from the App provenance. `create()` answers a `Refund` without it: that field is
not in the creation response. Read the refund back if the caller needs the customer.

---

Previous: [Checkout](04-checkout.md) · Next: [Subscriptions](06-subscriptions.md)
