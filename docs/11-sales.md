# Sales

A sale charges one customer for one canonical price, at the amount the customer was shown,
and tells you in a typed result what happened. It does the work every shop would otherwise
write around `payments.draft()`: finding or creating the customer, asserting the displayed
price, turning a `price_changed` refusal into an answer you can show, and holding a unit of
stock only while the charge is in flight.

Use `payments.draft()` directly when you need something a sale does not offer, such as an ad
hoc amount, a stored payment method or allocations. Everything a sale does is built on it.

## A complete sale

```ts
import { publicError } from "@bu-payment/node-sdk";

app.post("/checkout", async (request, response) => {
  const { sku, email } = request.body;
  const product = catalogue.find(sku);
  try {
    const sale = await client.sales
      .draft()
      .priceId(product.priceId)
      .displayedPrice({ unitAmount: product.amount, currency: product.currency })
      .customerEmail(email)
      .reference(sku)
      .reservation({
        reserve: () => stock.take(sku),
        release: () => stock.giveBack(sku),
      })
      .idempotencyKey(`order-${request.body.orderId}`)
      .charge();

    switch (sale.outcome) {
      case "paid":
        return response.status(201).json({ paymentId: sale.payment.id });
      case "unpaid":
        return response.status(202).json({ paymentId: sale.payment.id, status: sale.payment.status });
      case "price_changed":
        return response.status(409).json({ shown: sale.shown, current: sale.current });
      case "unconfirmed":
        return response.status(202).json({ status: "confirming" });
      case "needs_reconciliation":
        alertOperations(orderId, sale.error);
        return response.status(202).json({ status: "under_review" });
      case "unavailable":
        return response.status(409).json({ reason: "out_of_stock" });
    }
  } catch (error) {
    const failure = publicError(error);
    return response.status(failure.status).json(failure);
  }
});
```

Nothing in that handler inspects an error code, reads `error.price`, or remembers to put
stock back. The `switch` is exhaustive: TypeScript flags a missing case if a new outcome is
ever added.

## The builder

| Method | Required | What it sets |
| --- | --- | --- |
| `priceId(id)` | yes | The canonical price to charge. |
| `displayedPrice({ unitAmount, currency })` | yes | The amount the customer saw. The API refuses the charge if the price no longer matches. |
| `customerEmail(email)` | one of the two | The customer, found or created by email. |
| `customerId(id)` | one of the two | A customer you already hold the identifier of. No lookup is made. |
| `reference(text)` | no | Your reference on the payment, such as a SKU or an order number. |
| `description(text)` | no | A description on the payment. |
| `reservation({ reserve, release })` | no | Stock hooks the sale calls around the charge. See [Holding stock](#holding-stock). |
| `idempotencyKey(key)` | yes | The key sent with the payment, derived from your order. See [Retrying a sale](#retrying-a-sale). |
| `signal(signal)` | no | Cancels whichever request of the sale is in flight. |
| `timeoutMs(ms)` | no | The timeout applied to each request of the sale. |

`charge()` exists only once the price, the displayed price, a customer and an idempotency
key are set, so an incomplete sale does not compile:

```ts
client.sales.draft().priceId("price_1").customerEmail(email).idempotencyKey(orderId).charge();
// Property 'charge' does not exist: the displayed price is missing.
```

The key is required because a sale is the operation most likely to be retried, and a retry
without one charges the customer a second time.

A sale names its customer once. After `customerEmail()`, `customerId()` is gone from the
builder, and the other way round, so a sale can never carry two customers.

Like every builder in the SDK, a sale is frozen: each method returns a new builder and
leaves the earlier one untouched, and no request is made until `charge()`. You can keep a
base sale for a product and branch from it per customer. `displayedPrice()` keeps only
`unitAmount` and `currency`, so a `Price` read from the catalogue can be passed as is.
`reservation()` keeps the two functions it was given, bound to the object that carried them,
so a class instance works as a reservation and replacing a hook on your object afterwards does
not change a sale already configured.

## What `charge()` does

In this order:

1. When a reservation is set, it calls `reserve()`. If `reserve()` answers `false`, the sale
   stops there and resolves to `{ outcome: "unavailable" }`. No request has been made.
2. It resolves the customer. With `customerId()`, the identifier is used as given. With
   `customerEmail()`, it reads the first customer with that email and, when there is none,
   creates one.
   If another sale created the same customer in between, the creation is refused with a
   conflict and the sale reads the customer again and uses it.
3. It creates the payment with the price, the displayed price as `expectedPrice`, the
   idempotency key, and the reference and description you set.
4. It reads the result:
   - a payment whose status is `succeeded` resolves to `paid` and the unit stays reserved;
   - a payment with any other status releases the unit and resolves to `unpaid`;
   - a `price_changed` refusal releases the unit and resolves to `price_changed`;
   - a failure that leaves the payment's fate open, but that a retry settles, resolves to
     `unconfirmed` and the unit stays reserved (see [An unconfirmed payment](#an-unconfirmed-payment));
   - a payment whose fate the API itself no longer knows resolves to `needs_reconciliation`
     and the unit stays reserved (see [A payment to reconcile](#a-payment-to-reconcile));
   - any other failure releases the unit and is thrown unchanged. That covers every failure
     in step 2, since no payment was sent, every refusal the API answered with a 4xx, and a
     payment the API failed to prepare and never sent to the provider.

`release()` is called at most once per `charge()`, and never after `paid`, `unconfirmed` or
`needs_reconciliation`.
The rule to remember: when `charge()` throws, the unit has been released.

## Outcomes

| `outcome` | Fields | When | What to do |
| --- | --- | --- | --- |
| `paid` | `payment` | The payment succeeded. | Fulfil the order. The reserved unit is sold. |
| `unpaid` | `payment` | The payment was created with a status other than `succeeded`, such as `pending` or `failed`. | Read `payment.status`. The unit was released. |
| `price_changed` | `shown`, `current` | The price changed after the customer saw it. Nothing was charged. | Show `current` and ask the customer to confirm. The unit was released. |
| `unconfirmed` | `error` | The payment request got no usable answer (a timeout, a cancellation, a network failure, a response cut off or malformed, a 5xx other than `financial_preparation_failed`), or an earlier attempt under the same key is still running. The customer may or may not have been charged. | Charge the same sale again, with the same key, until it resolves otherwise. The unit is still reserved. |
| `needs_reconciliation` | `error` | The API lost track of an attempt under this key while it was with the payment provider, or the key was already used for a different sale. The customer may have been charged, and retrying will never tell. | Stop retrying. Check the payment in BuPayment, wait for the `payment.succeeded` event, or contact support. The unit is still reserved. |
| `unavailable` | none | `reserve()` answered `false`. | Tell the customer the product is out of stock. Nothing was sent to BuPayment. |

`shown` is the displayed price you passed. `current` is the price BuPayment holds now,
`{ id, unitAmount, currency, active, updatedAt }`, or `null` when the API response did not
carry one. Treat `null` as "the price changed, reload the product" rather than as a price.

An `unpaid` payment is not necessarily lost. A payment that settles later is announced by
the `payment.succeeded` webhook event (see [Events and webhooks](08-events-and-webhooks.md)).
The sale releases the unit straight away because it cannot wait for that event; if you prefer
to keep the unit for a pending payment, take it again when the event arrives.

## An unconfirmed payment

When the payment request times out, is cancelled, loses the connection, meets a server error, or
gets an answer that is cut off or is not JSON, the SDK cannot tell whether BuPayment charged the customer.
Releasing the unit then could sell it twice; throwing would leave you unsure whether it was
released. The sale resolves to `{ outcome: "unconfirmed", error }` instead and keeps the unit.

The same outcome answers a retry that arrives while the first attempt under the key is still
running: the API refuses it with `idempotency_in_progress` rather than charging twice, and the
first attempt carries on.

To settle it, charge the same sale again, a little later. The idempotency key makes that safe:
if the first payment went through, the API answers with it and the sale resolves to `paid`; if
it did not, the payment is made now. `error` is the `BuPaymentError` that left the outcome open,
for your logs. Until you retry, the unit stays reserved; the `payment.succeeded` webhook event
also tells you when a payment settled (see [Events and webhooks](08-events-and-webhooks.md)).

When the API failed to prepare the payment and never sent it to the provider, a retry answers
with `financial_preparation_failed`. Nothing was charged, so the sale releases the unit and
throws, and the loop ends there.

## A payment to reconcile

An attempt can be lost while it is with the payment provider: the request outlived the API's
lease on the key, or the process handling it stopped. The API then records the key's outcome as
unknown, for good, and answers every later attempt under it with `idempotency_outcome_unknown`.
The provider may still have charged the customer.

The same outcome answers a key that was already used for a different sale, refused with
`idempotency_conflict`: the API did not run this request, but the sale that first used the key
may have been charged, and its unit is the one this sale holds. This is a bug in how the key is
derived; a key must name one order and that order must not change between attempts.

The sale resolves to `{ outcome: "needs_reconciliation", error }` and keeps the unit, because
the unit may already be paid for. Retrying the same sale gives the same answer forever, so do
not loop on it. Find out what happened instead: wait for the `payment.succeeded` event, which
carries the payment and its reference, check the payment in the BuPayment dashboard, or contact
support with `error.requestId`. Release the unit yourself once you know the customer was not
charged.

## Holding stock

Selling the last unit safely needs a reservation. Without one, two customers checking out
at the same moment both see one unit left, both are charged, and one of them is sold
something you do not have.

```ts
.reservation({
  reserve: () => stock.take(sku),
  release: () => stock.giveBack(sku),
})
```

- `reserve()` answers `true` when it took a unit and `false` when there was none. It may be
  asynchronous. It must be atomic in your store, such as a conditional decrement, since that
  atomicity is what stops the double sale.
- `release()` puts the unit back. It may be asynchronous. The sale awaits it before it
  answers or throws.
- `reserve()` runs before any request, so a sale that cannot be fulfilled never touches
  BuPayment.
- `release()` runs once when the sale ends in `unpaid`, `price_changed` or an exception, and
  never after `paid`, `unconfirmed` or `needs_reconciliation`.
- If `release()` throws, that error is what `charge()` throws, even when the sale was also
  failing for another reason. A failed release means your stock count is wrong, and hiding it
  behind a payment error would leave it wrong without anyone noticing.

The stock stays yours: the SDK never stores it and does not know what a unit is. It only
decides when to call your two functions.

## Retrying a sale

Every mutation the SDK sends carries an `Idempotency-Key`, and a sale requires you to choose it.
Key it by the order, not by the attempt, so every retry of the same order is recognised:

```ts
const sale = client.sales
  .draft()
  .priceId(priceId)
  .displayedPrice(shown)
  .customerEmail(email)
  .idempotencyKey(`order-${orderId}`);
```

The key goes with the payment only. Customer creation gets its own key, because the same
key with a different body is refused as `idempotency_conflict`.

A `price_changed` refusal is never stored against the key. Once the customer accepts the
new price, charge again with the same key:

```ts
const first = await sale.charge();
if (first.outcome === "price_changed" && first.current !== null) {
  const again = await sale.displayedPrice(first.current).charge();
}
```

Every `charge()` calls `reserve()` again, including a retry after `unconfirmed`, when the first
attempt still holds its unit. Make `reserve()` idempotent per order, for example by recording
which order holds the unit and answering `true` without taking another, so a retry does not
take a second one.

## Finding the customer by email

`customerEmail()` reads the customer with that email and, when there is none, creates one.
BuPayment compares emails after trimming them and lowering their case, and holds at most one
customer per email in an App and environment, so `Buyer@Example.test` and
`buyer@example.test` are the same customer.

Reading and creating are two requests, not one atomic operation. When two sales for the same
new email run at the same moment, both find nothing and both try to create the customer; the
API accepts one and refuses the other with a conflict, and the refused sale reads the customer
again and charges it. Neither sale fails and no duplicate is created. The extra round trip
disappears once the API offers an atomic find-or-create, without any change to the builder.

With `customerId()` none of this happens. Use it when you already store the customer's
identifier, for example from sign-up.

## Answering the end customer

`publicError(error)` turns anything a sale throws into a value you can send to a browser:

```ts
import { publicError } from "@bu-payment/node-sdk";

const failure = publicError(error);
// { status: 503, code: "operation_failed", message: "The payment could not be completed." }
```

- `status` is the HTTP status BuPayment answered with when it is a 4xx or a 5xx. Anything
  else, such as the `200` of a malformed response reported as `response_invalid`, or a
  network failure with no status at all, becomes `502`: the fault is upstream of your server.
- `code` is the SDK's canonical code, from the table in [Errors](10-errors.md#codes).
- A failure of your own credential or configuration (`configuration_invalid`, any
  `application_auth_*` code, `application_capability_denied`) becomes
  `{ status: 502, code: "operation_failed" }`. A `401` or `403` would tell the browser its own
  session was refused, when the fault is between your server and BuPayment.
- `message` is fixed. The API's message is never copied, because it can quote details of
  your request or your credential that the end customer must not see.
- A value that is not a `BuPaymentError`, such as a bug in your own code or a failing
  `release()`, becomes `{ status: 500, code: "operation_failed" }` with a generic message.

Log the original error on your side before answering; `publicError` deliberately drops the
`requestId` and everything else support would need.

## Capabilities

A sale needs `payments:write`. With `customerEmail()` it also needs `customers:read` and,
for a new customer, `customers:write`.

---

Previous: [Errors](10-errors.md) · Next: [Index](00-index.md)
