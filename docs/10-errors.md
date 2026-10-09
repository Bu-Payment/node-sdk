# Errors

Every failure is a `BuPaymentError` carrying a `code`, and where the API answered, a
`status`, a `requestId` and `metadata`.

```ts
import { isNotFound } from "@bu-payment/node-sdk";

try {
  await client.payments.payment("pay_1").get();
} catch (error) {
  if (isNotFound(error)) {
    return null;
  }
  throw error;
}
```

## Codes

| Code | Raised when |
| --- | --- |
| `configuration_invalid` | The client configuration is malformed. |
| `request_invalid` | The SDK or the API refused the request as built. |
| `request_cancelled` | The caller's `AbortSignal` fired. |
| `network_unavailable` | The API could not be reached, the request timed out, or the response was cut off before it was read. |
| `response_invalid` | The API answered something that is not JSON. |
| `resource_not_found` | The resource is unknown, unassigned, or owned by another App. |
| `resource_conflict` | The mutation conflicts with current App-owned state. |
| `stale_resource` | The resource changed after the `expectedUpdatedAt` given; `resource` holds it now. |
| `lookup_key_conflict` | Another product holds the lookup key; `resource` holds it when it is assigned to the App. |
| `price_changed` | The canonical price no longer matches the `expectedPrice` given; `price` holds the current one. |
| `default_price_in_use` | The price is its product's default and cannot be archived until another price is. |
| `default_price_not_owned` | The product's default price belongs to another App, which alone can move it. |
| `price_product_mismatch` | The price belongs to another product. |
| `invalid_state` | The resource's state refuses the change, such as an archived price or product. |
| `idempotency_conflict` | The `Idempotency-Key` was already used with a different request. |
| `application_auth_required` | The request carried no credential. |
| `application_auth_malformed` | The signed request is not well formed. |
| `application_auth_version_unsupported` | The signature version is not accepted. |
| `application_auth_expired` | The signed timestamp is outside the accepted window. |
| `application_auth_replayed` | The nonce has already been used. |
| `application_auth_invalid` | The credential no longer resolves to an active App. |
| `application_capability_denied` | The credential lacks the route's capability. |
| `too_many_requests` | The credential is rate limited; read `metadata.retryAfter`. |
| `application_auth_unavailable` | Authentication or ownership storage is unavailable. |
| `operation_failed` | The API failed for a reason with no more specific code. |
| `webhook_signature_missing` | A delivery lacks `x-webhook-id`, `x-webhook-timestamp` or `x-webhook-signature`, or carries one more than once. |
| `webhook_signature_invalid` | A delivery was not signed with the endpoint secret given. |
| `webhook_timestamp_expired` | A correctly signed delivery is outside the tolerance window. |
| `webhook_payload_invalid` | A delivery body is not raw bytes or text, or is not a JSON object. |
| `webhook_event_version_unsupported` | A verified delivery is not a version `1` envelope; `metadata.version` holds a numeric version. |
| `webhook_event_invalid` | A verified delivery of a known type does not match its documented shape; `metadata.field` names the field. |

### API codes behind a generic code

Some refusals have no code of their own in the SDK: `error.code` is the generic code for the
HTTP status, and the API's code is in `error.apiError`, read from `error.metadata.apiError`.
It is `null` when the API sent no code of its own. `ApiErrorCode` holds every code in this
table, such as `ApiErrorCode.CHECKOUT_UNAVAILABLE`.

| `error.apiError` | `error.code` | Raised when |
| --- | --- | --- |
| `provider_capability_not_supported` | `operation_failed` | The provider cannot charge directly (422); sell through a hosted checkout. |
| `checkout_live_not_enabled` | `resource_conflict` | A one-time checkout was requested with a Live credential. |
| `checkout_destination_unavailable` | `resource_conflict` | The checkout destination does not exist or is disabled. |
| `checkout_provider_unknown` | `operation_failed` | The environment has no account for the provider given (422). |
| `checkout_provider_failed` | `operation_failed` | The provider failed the checkout (502). |
| `checkout_unavailable` | `operation_failed` | The checkout or its provider account is temporarily unavailable (503). |
| `idempotency_in_progress` | `resource_conflict` | An earlier request under the same `Idempotency-Key` is still running. |
| `idempotency_outcome_unknown` | `resource_conflict` | The API lost the outcome of an earlier request under the same key, for good. |
| `financial_preparation_failed` | `operation_failed` | The API failed to prepare a payment and never sent it to the provider (500). |
| `app_customer_email_conflict` | `resource_conflict` | Another customer of the App holds the email. |
| `payment_method_replacement_invalid` | `operation_failed` | The payment method named for replacement does not qualify (403). |
| `payment_method_unusable` | `operation_failed` | The payment method is unknown or owned by another App (403). |

```ts
import { ApiErrorCode, BuPaymentError } from "@bu-payment/node-sdk";

if (error instanceof BuPaymentError && error.apiError === ApiErrorCode.CHECKOUT_LIVE_NOT_ENABLED) {
  // a Live credential: one-time checkouts are Test only for now
}
```

## Classifying a failure

Four guards answer the questions a caller asks of a caught value. Each accepts anything and
answers `false` for a value that is not a `BuPaymentError`.

| Guard | `true` when | Narrows to |
| --- | --- | --- |
| `isNotFound(error)` | `code` is `resource_not_found` | `NotFoundError` |
| `requiresHostedCheckout(error)` | `apiError` is `provider_capability_not_supported` | `HostedCheckoutRequiredError` |
| `isOutcomeUncertain(error)` | a failed write may still have been applied | nothing, it answers `boolean` |
| `needsReconciliation(error)` | a failed write may have been applied and no retry will tell | nothing, it answers `boolean` |

Read `isOutcomeUncertain` before undoing anything a write was meant to pay for, such as
releasing stock or offering the customer another way to pay. Its rules apply in this order:

1. `financial_preparation_failed` answers `false`: the API never sent the payment to the
   provider.
2. `network_unavailable`, `request_cancelled`, `response_invalid`, `idempotency_conflict`,
   `idempotency_in_progress` and `idempotency_outcome_unknown` answer `true`, whatever the
   status.
3. Any other failure answers `true` when the API answered with a status outside 4xx, such as
   a 5xx or a redirect, and `false` for a 4xx or for a refusal the SDK raised before sending.

`checkout_unavailable` and `checkout_provider_failed` are 5xx and therefore uncertain: a
gateway failure can follow a request the provider already accepted.

An uncertain failure is one of two kinds. When `needsReconciliation(error)` is `false`, retry
the write with the same `Idempotency-Key`: the API answers with the first result when it was
applied, and applies it when it was not. When it is `true` (`idempotency_conflict` or
`idempotency_outcome_unknown`), a retry gives the same answer forever: stop, and find out what
happened from the dashboard, a webhook event or support.

```ts
import { isOutcomeUncertain, needsReconciliation } from "@bu-payment/node-sdk";

try {
  await draft.idempotencyKey(orderId).create();
} catch (error) {
  if (needsReconciliation(error)) {
    return keepReservedAndReconcile(orderId, error);
  }
  if (isOutcomeUncertain(error)) {
    return keepReservedAndRetryLater(orderId);
  }
  await releaseReservation(orderId);
  throw error;
}
```

A [sale](11-sales.md) reads the same two guards to choose between `unconfirmed`,
`needs_reconciliation` and a refusal.

## Conflicts that carry the current resource

`stale_resource` and `lookup_key_conflict` set `error.resource` to the resource the API
returned, typed with a parameter: `BuPaymentError<Product>` or `BuPaymentError<Price>`, also
exported as `ProductConflict` and `PriceConflict`. It is `undefined` when the API sent none,
and it appears in `toJSON()` only when the API sent it. No other code carries a resource.

## A price that changed

`price_changed` sets `error.price` to the current price the API returned:
`{ id, unitAmount, currency, active, updatedAt }`. It is `undefined` when the API sent none,
and it appears in `toJSON()` only when the API sent it. The request created nothing, so show
the current price, ask the customer to confirm, and send it again with
`expectedPrice(error.price)`. The refusal is never stored against the `Idempotency-Key`, so
the retry may reuse it.

`isPriceChanged(error)` recognises the refusal from any caught value and narrows it to
`PriceChangedError`, a `BuPaymentError` whose `code` is `price_changed`:

```ts
import { isPriceChanged } from "@bu-payment/node-sdk";

try {
  await draft.expectedPrice(displayed).create();
} catch (error) {
  if (isPriceChanged(error) && error.price) {
    return askCustomerToConfirm(error.price);
  }
  throw error;
}
```

The guard matches on the code alone. `error.price` stays optional after narrowing, because a
refusal whose body lacks a well-formed price is still a price change, and the type does not
claim a price the API did not send.

A [sale](11-sales.md) answers this refusal as `{ outcome: "price_changed", shown, current }`
instead of throwing it, so code that sells through `client.sales` never needs the guard.

## What a not-found does not tell you

A resource owned by another App, an unassigned catalogue identifier and an identifier that
never existed all answer `resource_not_found`. Do not read existence out of it, and do not
retry against another environment: Test and Live never share commerce data.

## Refusals before signing

These checks run in the SDK, before a request is signed, and all raise `request_invalid`:

- a body or query carrying a scope key: `workspace`, `environment`, `application`, `app`,
  `tenant`, `provider`, `providerAccountId` or `providerAccountVersion`, with or without an
  `Id` suffix, in any casing and with any separator. The body is checked as it will be
  serialized, so a `toJSON` cannot hide a key, and nesting depth is not a way past it. The one
  exception is `provider` at the top of a `POST /v1/checkouts` body, which picks a provider
  account inside the credential's environment; nested, on any other route or in a query it is
  still refused;
- a shipping product identifier containing a comma, which the wire format would split into
  two.

Everything the previous release checked at runtime about a payment's pricing is now a
compile error instead. A payment priced both ways, priced by neither, carrying an amount
without a currency, or carrying allocations without a payment method has no `create()`
method to call. The same holds for a shipping resolution with no product, a customer with
no email, and every other required field: the terminal is absent, so the mistake cannot
reach the network.

`paginate` and every `all()` raise `response_invalid` when a page answers a cursor already
served, a `nextCursor` that is missing or empty, no `data` array, or `hasMore` with no
cursor to follow. Every one of those would otherwise end the walk in silence, repeat it
forever, or escape as a bare `TypeError`.

## Answering the end customer

A `BuPaymentError` is for your server. Its `message` can quote the API's own wording, and
its `requestId` and `metadata` are for your logs and for support. `publicError(error)` gives
the part that is safe to send to a browser:

```ts
import { publicError } from "@bu-payment/node-sdk";

try {
  await sale.charge();
} catch (error) {
  logger.error(error);
  const failure = publicError(error);
  response.status(failure.status).json(failure);
}
```

| Input | `status` | `code` | `message` |
| --- | --- | --- | --- |
| `BuPaymentError` with a 4xx or 5xx status | that status | the error's `code` | fixed |
| `BuPaymentError` with any other status, or none | `502` | the error's `code` | fixed |
| `configuration_invalid`, any `application_auth_*`, `application_capability_denied` | `502` | `operation_failed` | fixed |
| anything else | `500` | `operation_failed` | fixed |

The message is always one of two fixed sentences and never the API's. A status outside
4xx and 5xx, such as the `200` of a response that was not JSON, becomes `502`, because the
failure is between your server and BuPayment rather than in the request your customer made.
A refused credential is mapped the same way: answering `401` or `403` would tell the browser that
its own session was refused.

---

Previous: [Pagination](09-pagination.md) · Next: [Sales](11-sales.md)
