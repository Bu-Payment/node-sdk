# Payment methods and billing

Stored payment methods belong to an App customer. Every route sits under the customer, so a
customer owned by another App answers as not found before any payment method is looked at.

## Setting up a payment method

A setup starts the provider flow that stores a card for future merchant-initiated charges.
It requires `payments:write` and the moment the buyer gave their consent:

```ts
const setup = await client.paymentMethods
  .createSetup("cus_1")
  .currency("EUR")
  .returnUrl("https://shop.example/payment-methods/return")
  .consentAcceptedAt("2026-09-24T10:00:00+01:00")
  .idempotencyKey(`setup-${orderId}`)
  .create();
```

`create()` appears only once the currency, the return URL and the consent are all set. The
consent is sent as `merchant_initiated_future_payments`, the only kind the API accepts, and
`consentAcceptedAt()` takes an ISO 8601 timestamp with an offset.

`replacesPaymentMethodId()` names a stored method of the same customer that is still
`active` or `replacement_required`, in the setup's currency, and stored through the provider
account the environment uses now. A method stored before the provider account changed does
not qualify. A refusal fails with `operation_failed`, status 403 and `metadata.apiError` set
to `payment_method_replacement_invalid`.

The route refuses a setup without an idempotency key. The SDK always sends one, but a retry
replays the first attempt only when it carries the same key and the same body. The API
fingerprints the whole body, consent timestamp included, so keep the `consentAcceptedAt()`
value the buyer gave rather than recomputing it: the same key with a different body fails
with `idempotency_conflict`. An unkeyed retry starts a second setup.

## Setup states

A setup answers one of five states, and the type narrows on `status`:

```ts
if (setup.status === "requires_action") {
  redirectBuyer(setup.presentation.url);
}
```

| `status` | Carries |
| --- | --- |
| `requires_action` | `presentation` (`{ kind: "redirect", url }`) and `actions.confirm` |
| `processing`, `succeeded`, `failed`, `expired` | neither; `paymentMethod` once one is stored |

Every setup carries `actions.status` and stops being usable at `expiresAt`.

## The browser boundary

`actions.status` and `actions.confirm` point at `/public/v1/payment-method-setups/...`.
Those are public routes for the buyer's browser, not machine routes, and this SDK does not
call them. It hands back the URLs the setup carries and stops there. Driving the redirect
and the confirmation belongs to the browser, the same boundary this SDK keeps for end-user
sessions.

## Reading payment methods

```ts
const { data } = await client.paymentMethods.list("cus_1").get();
const method = await client.paymentMethods.paymentMethod("cus_1", "pm_1").get();
```

Both require `payments:read`. A payment method carries its `status`, and `brand`,
`lastDigits` and `expiry` only while the card data is retained.

`list()` answers at most the 100 newest payment methods, with `hasMore` always `false` and
`nextCursor` always `null`, and the type says exactly that. There is no cursor and nothing in
the response says whether it was truncated, so a customer with more than 100 stored methods
silently loses the oldest. The builder offers no `cursor()`, `limit()` or `all()` for the
same reason: no page follows the first.

## Revoking a payment method

```ts
const revoked = await client.paymentMethods.paymentMethod("cus_1", "pm_1").revoke();
```

Requires `payments:write`. Revoking erases the retained card data and answers the payment
method in its new state. It is idempotent: a method already `revoked` or
`permanently_invalid` is returned unchanged rather than refused.

A payment method that is unknown, or owned by another App, fails with `operation_failed`,
status 403 and `metadata.apiError` set to `payment_method_unusable`. The answer is the same
in both cases, so it reveals nothing about another App's data.

## Charging allocations

`allocation()` is reachable on a payment only after `paymentMethodId()`. The most reliable
identifier is the one stored when the setup succeeded, `setup.paymentMethod.id`. Reading it
back from `list()` works while the customer has at most 100 stored methods; beyond that, and
revoked methods count towards the 100, an older active card is missing from the list and the
lookup below wrongly finds none:

```ts
const { data } = await client.paymentMethods.list("cus_1").get();
const method = data.find((candidate) => candidate.status === "active");
if (method === undefined) {
  throw new Error("The customer has no active payment method");
}

await client.payments
  .create()
  .customerId("cus_1")
  .priceId("price_1")
  .paymentMethodId(method.id)
  .allocation("line_1", 5000, "EUR")
  .create();
```

## Billing capabilities

```ts
const capabilities = await client.billing.capabilities().get();

if (capabilities.subscriptions.cancel.atPeriodEnd) {
  offerCancellationAtPeriodEnd();
}
```

Requires `payments:read`. The answer describes what the environment's provider supports:
`configured`, whether customers can be created, updated and synchronized, and which
subscription operations, timings and policies are available. An environment without a
provider answers `configured: false` with every subscription operation disabled.

---

Previous: [Payments and refunds](05-payments-and-refunds.md) · Next: [Subscriptions](07-subscriptions.md)
