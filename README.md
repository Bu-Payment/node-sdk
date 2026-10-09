# @bu-payment/node-sdk

Confidential BuPayment client for Node.js servers. Every request is signed with the versioned
BuPayment HMAC protocol.

This package holds a confidential secret and must never reach a browser. Public browser
applications use [`@bu-payment/browser-sdk`](https://github.com/Bu-Payment/browser-sdk), which is
built for the publishable key and cannot sign confidential requests.

## Install

```sh
bun add @bu-payment/node-sdk
```

## Configuration

```ts
import { createBuPaymentClient } from "@bu-payment/node-sdk";

const client = createBuPaymentClient({
  applicationId: process.env.BU_PAYMENT_APP_ID!,
  keyId: process.env.BU_PAYMENT_KEY_ID!,
  secret: process.env.BU_PAYMENT_SECRET!,
  apiBaseUrl: "https://api.bupayment.com",
});
```

Client creation validates the application and key identifiers, parses the secret into a
non-printable holder, normalizes the API URL, enforces HTTPS except for loopback development, and
rejects an explicit Test or Live mismatch. The environment comes from the key, never from a
separate field. Failures are a `BuPaymentError` with `ErrorCode.CONFIGURATION_INVALID` and never
echo the secret.

## Commerce builders

Every operation is configured through a fluent, immutable builder, and no request is sent until
an explicit terminal method. Each configuration method returns a new frozen builder, so a partly
configured builder is safe to hold and branch from.

```ts
const products = await client.catalogue.products().active(true).limit(20).get();

const payment = await client.payments
  .draft()
  .customerId("cus_123")
  .priceId("price_123")
  .idempotencyKey(orderId)
  .create();

const checkout = await client.checkout
  .sessionDraft()
  .priceId("price_123")
  .customerEmail("buyer@example.com")
  .destination("default")
  .reference(orderId)
  .idempotencyKey(orderId)
  .create();

for await (const event of client.events.list().type("payment.succeeded.v1").all()) {
  handle(event);
}
```

Required input is enforced by the type, not by a runtime check: the terminal does not exist until
every required field is set. `create()` is absent from a payment with no customer, and absent from
one with no price; `amount()` disappears once `priceId()` is called, and `priceId()` disappears
once an amount is set, so a request can never override the price of a canonical resource.

`catalogue`, `customers`, `checkout`, `payments`, `sales`, `paymentMethods`, `billing`,
`invoices`, `refunds`, `subscriptions`, `priceMigrations`, `events`, and `webhooks`. Each route needs its
capability on the credential. See [the documentation](docs/00-index.md) for the whole surface.

`paymentMethods` also supplies the `paymentMethodId` that payment allocations require.

`checkout.sessionDraft()` creates a hosted one-time checkout and answers the `checkoutUrl` to
send the buyer to, for providers that cannot be charged directly; `checkout.session(id).get()`
reads it. The outcome arrives as a typed `checkout.*` webhook event. See
[Checkout](docs/04-checkout.md#one-time-checkout).

## Catalogue writes

A credential with `catalogue:write` creates and changes the catalogue of its own App. BuPayment is
the source of truth for prices: when your application keeps a copy, change the price in BuPayment
first and update your copy only once the API has answered. Your copy can then only lag behind the
catalogue, never contradict it, and reconciliation repairs a lag.

A price's amount is fixed when it is created, so changing a price means creating a replacement and
archiving the old one. The API refuses to archive a product's default price, so when the old price
is the default, `replace()` makes the replacement the default in between. It reads the product to
know, which needs `catalogue:read` as well as `catalogue:write`, and reports each step:

```ts
const change = await client.catalogue
  .priceDraft(productId)
  .unitAmount(1_200)
  .currency("EUR")
  .interval("month")
  .replacing(currentPriceId)
  .expectedUpdatedAt(observedUpdatedAt)
  .idempotencyKey(`reprice-${productId}-${revision}`)
  .replace();

await localPrices.save(productId, change.replacement);
if (change.outcome !== "replaced") {
  queueReplaceRetry(productId, change.outcome, change.error);
}
```

A rejected `replace()` means the product could not be read or the replacement could not be
created; after a timeout or a network failure the replacement may still exist, so retry on the
same builder, which replays the creation under the same key instead of creating a second price. A
resolved one always carries the replacement. `default_failed` means nothing was archived and,
unless the request timed out or the network failed, the default did not move; `archive_failed`
means the old price is still active. Both name the previous price and the error, so the
application decides how to retry. `replaced` and `archive_failed` also carry the product as the
replacement last observed it, with its `defaultPriceId` and `updatedAt`, so a
following write can assert that version without reading the product again. `default_failed`
carries none, because after a timeout the product's state is unknown. The SDK stores nothing between requests: the last agreed
amount, the local copy and what to do on a conflict belong to the application.

A write that passes `expectedUpdatedAt()` is refused with `stale_resource` when the resource has
changed since, and the error carries the current resource:

```ts
import { BuPaymentError, ErrorCode, type Product } from "@bu-payment/node-sdk";

try {
  await client.catalogue.updateProduct(id).name(name).expectedUpdatedAt(seen).update();
} catch (error) {
  if (error instanceof BuPaymentError && error.code === ErrorCode.STALE_RESOURCE) {
    const current = (error as BuPaymentError<Product>).resource;
  }
}
```

The same write as a signed request through the low-level `request`:

```ts
const product = await client.request<Product>({
  method: "PATCH",
  path: `/v1/products/${encodeURIComponent(id)}`,
  body: { name, expectedUpdatedAt: seen },
  idempotencyKey: `rename-${id}-${revision}`,
});
```

A product carries `defaultPriceId` on every product read and write, and in the `resource` of a
conflict. The product a cross-sell suggests does not, and is typed as `SuggestedProduct`.
It is `null` when the product has no default price or its default price is not assigned to your
App. When the price a link points to is archived, a sweep of `products().all()` finds the default
price to repoint it to, without waiting for an event.

See [Catalogue](docs/02-catalogue.md) for every route.

## Selling a one-time product

`client.sales` charges a canonical price at the amount the customer saw and answers with a typed
outcome instead of an exception for the refusals a shop expects:

```ts
import { publicError } from "@bu-payment/node-sdk";

try {
  const sale = await client.sales
    .draft()
    .priceId(priceId)
    .displayedPrice({ unitAmount: 1_500, currency: "EUR" })
    .customerEmail(email)
    .reference(sku)
    .reservation({ reserve: () => stock.take(sku), release: () => stock.giveBack(sku) })
    .idempotencyKey(`order-${orderId}`)
    .charge();

  switch (sale.outcome) {
    case "paid":
      return fulfil(sale.payment);
    case "unpaid":
      return awaitSettlement(sale.payment);
    case "price_changed":
      return askCustomerToConfirm(sale.shown, sale.current);
    case "unconfirmed":
      return retryLater(orderId);
    case "needs_reconciliation":
      return reconcile(orderId, sale.error);
    case "unavailable":
      return outOfStock();
  }
} catch (error) {
  const failure = publicError(error);
  return response.status(failure.status).json(failure);
}
```

The sale finds the customer by email or creates one (`customerId()` skips the lookup), asserts the
displayed price, and calls `reserve()` before any request, so the last unit cannot be charged
twice. `release()` runs once when the sale ends `unpaid`, `price_changed` or throws. A payment
whose fate is unknown after a timeout, a cut-off answer or a server error resolves to `unconfirmed`
and keeps the unit; charging the same sale again settles it, which is why `idempotencyKey()` is
required. When the API itself lost the outcome, or the key was already used for a different sale,
the sale resolves to `needs_reconciliation` instead, because no retry will settle it. A server
error the API raised before the provider was called, `financial_preparation_failed`, charged
nothing: the sale releases the unit and throws. Any other failure is still a `BuPaymentError`;
`publicError(error)` turns it into `{ status, code, message }` with a fixed message, never the
API's, and `502` when the status is not a 4xx or 5xx or the failure is the merchant's own
credential.
[Sales](docs/11-sales.md) covers each step, each outcome, retries and the customer lookup.

## Charging the price the customer saw

Every builder that charges a canonical price accepts the price the customer was shown. When the
price in BuPayment no longer matches, the API refuses the request with `price_changed` before
anything is created, so the customer is never charged an amount they did not see:

```ts
import { isPriceChanged } from "@bu-payment/node-sdk";

const draft = client.payments
  .draft()
  .customerId(customerId)
  .priceId(priceId)
  .idempotencyKey(orderId);

try {
  await draft.expectedPrice({ unitAmount: 1_500, currency: "EUR" }).create();
} catch (error) {
  if (isPriceChanged(error) && error.price) {
    const confirmed = await askCustomerToConfirm(error.price);
    if (confirmed) {
      await draft.expectedPrice(error.price).create();
    }
  }
}
```

`isPriceChanged` narrows any caught value to a `BuPaymentError` whose code is `price_changed`.
`error.price` is the current price: `{ id, unitAmount, currency, active, updatedAt }`, or
`undefined` when the API response carried none, which is why it is still checked. Show it
to the customer, ask them to confirm, and retry with the new amount. A `price_changed` is never
stored against the `Idempotency-Key`, so the retry may reuse the same key. After a success, the
key is bound to the price it asserted, and a different `expectedPrice` under it is
`idempotency_conflict`.

`expectedPrice()` takes any object with `unitAmount` and `currency`, including a `Price` read from
the catalogue; only those two fields are sent. It exists on `payments.draft()` once `priceId()`
is set, on `subscriptions.draft()`, on `checkout.subscriptionSession()` and on a subscription's
`priceMigration()`, where it is compared with `targetPriceId`. Omitting it changes nothing.

## Webhook events

`webhookDelivery()` checks the signature and the timestamp, then parses the signed body into
a typed event. Every delivery is the envelope `{ version: 1, id, type, occurredAt, data }`, and
`event` is a union discriminated on `type`, so `data` narrows with it:

```ts
const { event } = webhookDelivery().secret(secret).body(req.body).headers(req.headers).verify();

switch (event.type) {
  case "catalogue.product.updated.v1":
    await products.applyIfNewer(event.data.resource, event.data.updatedAt);
    break;
  case "catalogue.price.assigned.v1":
    await prices.assignIfNewer(event.data.resource, event.occurredAt);
    break;
  case "unknown":
    logger.info({ type: event.receivedType, id: event.id }, "unhandled BuPayment event");
    break;
}
```

| Type | `data.resource` | Advances `data.updatedAt` |
| --- | --- | --- |
| `catalogue.product.created.v1` | product | yes |
| `catalogue.product.updated.v1` | product | yes |
| `catalogue.product.archived.v1` | product | yes |
| `catalogue.product.reactivated.v1` | product | yes |
| `catalogue.product.default_price.updated.v1` | product | yes, unless an assignment caused it |
| `catalogue.product.assigned.v1` | product | no |
| `catalogue.product.unassigned.v1` | product | no |
| `catalogue.price.created.v1` | price | yes |
| `catalogue.price.updated.v1` | price | yes |
| `catalogue.price.archived.v1` | price | yes |
| `catalogue.price.reactivated.v1` | price | yes |
| `catalogue.price.assigned.v1` | price | no |
| `catalogue.price.unassigned.v1` | price | no |

`checkout.completed`, `checkout.failed`, `checkout.expired` and `checkout.cancelled` are typed
too, with `data.checkoutId`, the `reference` sent at creation and, once paid, `paymentId`. See
[Checkout events](docs/08-events-and-webhooks.md#checkout-events).

A product in an event is the `Product` the catalogue reads return, `defaultPriceId` included. A
price is the `Price` the catalogue reads return. `data` always carries `resourceType`,
`resourceId`, `occurredAt`, `updatedAt` and `resource`, and `data.updatedAt` repeats
`resource.updatedAt`.

Deliveries are at least once and unordered. Order the events of one resource by
`data.updatedAt`, then by `occurredAt` when `data.updatedAt` is equal: a mutation advances
`data.updatedAt`, while an assignment, an unassignment and a default price change caused by one
keep it and differ only in `occurredAt`. Store that pair for each resource and ignore an event
whose pair is not newer. Every timestamp is ISO 8601 in UTC with milliseconds, as
`Date.prototype.toISOString` writes it, and the SDK refuses any other form, so two of them
compare correctly as strings. `occurredAt` is the same in the envelope and in `data`.

Deduplicate on `event.id`, which is signed and identical across endpoints and retries;
`deliveryId` comes from an unsigned header. The SDK stores none of this: the ordering state, the
deduplication and applying the event are your application's.

A type the SDK does not know yet comes back as `type: "unknown"` with the type in `receivedType`
and the raw `data`, so a new platform event type never throws. An envelope that is not version `1` is
refused with `webhook_event_version_unsupported`, and a known type whose `data` does not match its
shape with `webhook_event_invalid`. Neither is a forged delivery: both mean this SDK and the
platform disagree, so alert on them instead of answering them as a bad signature. See
[Events and webhooks](docs/08-events-and-webhooks.md) for the full handler.

## Signed requests

```ts
import type { Page, Product } from "@bu-payment/node-sdk/types";

const products = await client.request<Page<Product>>({
  method: "GET",
  path: "/v1/products",
  query: { limit: 20 },
});
```

`request` is the low-level escape hatch, for routes the builders have not reached yet. It carries
the response type the caller declares, and it is the only method on the client that takes an
options object rather than a builder.

Each call derives a fresh timestamp and nonce, canonicalizes the exact path and query it transmits,
hashes the exact body bytes it sends, and signs the nine-line canonical request with HMAC-SHA256.
The request carries `Bu-Payment-Signature-Version`, `Bu-Payment-App-Id`, `Bu-Payment-Key-Id`,
`Bu-Payment-Timestamp`, `Bu-Payment-Nonce`, and `Bu-Payment-Signature`.

The authenticated application, workspace, and environment come from the credential. Nothing in a
query or body can widen or replace that scope: a scope key is refused before the request is
signed, whatever its casing or separator, and the body is checked as it will be serialized. A
path that smuggles a query string past the signer produces a signature the API rejects.

## Idempotency

Every `POST`, `PUT`, `PATCH`, and `DELETE` sends an `Idempotency-Key`. The SDK mints a fresh one
for each call the caller does not key, which means a retry of an unkeyed mutation after a timeout
is a second charge rather than a replay. Every mutation builder takes `idempotencyKey()`; use it
whenever a retry is possible, with a key derived from the operation rather than from the attempt:

```ts
import { isPriceChanged } from "@bu-payment/node-sdk";

const draft = client.payments
  .draft()
  .customerId(customerId)
  .priceId(priceId)
  .idempotencyKey(`order-${orderId}`);

await draft.create();
await draft.create();
```

The second call makes the API replay the stored result of the first instead of performing the
mutation twice. A key is valid when it is well-formed Unicode, has no surrounding whitespace, and
is 1 to 255 characters long.

The catalogue write builders are the exception to the fresh key per call: each keeps the key it
generates, so calling the terminal again on the same builder, or on one that only changed
`signal()` or `timeoutMs()`, is a replay. A method that changes the body returns a builder with a
key of its own, because a changed body under an old key is refused as `idempotency_conflict`. For
the same reason, the key a price replacement generates for moving the default price follows the
product version it asserts: a retry that reads a newer version moves the default under a new key.

## Errors and cancellation

Every failure is a `BuPaymentError` with a provider-neutral `code`, the HTTP `status` when the API
answered, and the `requestId` to quote in a support request. Secrets never appear in the message,
the metadata, or the JSON form of the error.

```ts
import { BuPaymentError, ErrorCode } from "@bu-payment/node-sdk";

try {
  await client.request({ method: "GET", path: "/v1/products", signal: AbortSignal.timeout(5_000) });
} catch (error) {
  if (error instanceof BuPaymentError && error.code === ErrorCode.APPLICATION_AUTH_EXPIRED) {
    // The local clock drifted outside the five-minute window the server accepts.
  }
}
```

Before answering an end customer, pass the error through `publicError(error)`: it keeps the status
and the canonical code, replaces the message with a fixed one, and maps a status outside 4xx and 5xx,
or a failure of the merchant's own credential, to `502`. See [Errors](docs/10-errors.md#answering-the-end-customer).

Before undoing anything a failed write was meant to pay for, ask `isOutcomeUncertain(error)`: it
answers `true` when the write may still have been applied, so the reservation stays. Retry it under
the same `Idempotency-Key`, unless `needsReconciliation(error)` is also `true`, in which case no retry
will settle it. `isNotFound(error)` and `requiresHostedCheckout(error)` answer the other common
questions, and `error.apiError` holds the API's own code when the SDK has none for it. See
[Errors](docs/10-errors.md#classifying-a-failure).

Pass any `AbortSignal` as `signal` to cancel a request; the SDK reports it as `request_cancelled`.
A request that outlives its own timeout fails as `network_unavailable`.

The server is authoritative for time, credential status, nonce replay, and credential rotation. A
replacement credential works immediately, and its source credential keeps working only until the
overlap the server records has expired. Rotate by deploying the new credential, not by tracking the
overlap locally.

## Secret handling

Keep the secret in a secret manager, or in an environment variable populated from one at boot.
Never commit it, never log it, never send it to a browser, and never pass it to a client-side
bundler.

```ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({});

async function loadClient(): Promise<BuPaymentClient> {
  const response = await secrets.send(
    new GetSecretValueCommand({ SecretId: "bupayment/confidential-credential" }),
  );
  const credential = JSON.parse(response.SecretString ?? "{}");
  return new BuPaymentClient({
    applicationId: credential.applicationId,
    keyId: credential.keyId,
    secret: credential.secret,
    apiBaseUrl: process.env.BUPAYMENT_API_BASE_URL!,
  });
}
```

Any manager works the same way: read the credential at startup, build the client, and let the
secret live only inside it. Rotate by writing the replacement credential to the manager and
restarting, while the previous credential stays valid for the server-side overlap window.

The package declares a browser field that resolves to a module which throws on import, so a browser
bundle can never pull confidential code in by accident.

## Protocol conformance

`conformance/v1/conformance-vectors.json` is a byte-for-byte copy of the shared, language-neutral
vectors published with the protocol. The test suite verifies the copy against the shared manifest
digest, reproduces every canonical request and signature, and replays the security scenarios for
clock skew, nonce replay, and credential rotation against the signing transport.

## Requirements

Node.js 20 or later. The package ships ESM and CommonJS builds with TypeScript declarations, and
has no runtime dependencies.

## Development

```sh
bun install
bun run check
```

`bun run check` runs lint, type checking, tests with coverage, and an installed-consumer check that
packs the package and verifies the ESM entry point, the CommonJS entry point, and the published
type declarations.
