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
  .create()
  .customerId("cus_123")
  .priceId("price_123")
  .idempotencyKey(orderId)
  .create();

for await (const event of client.events.list().type("payment.succeeded").all()) {
  handle(event);
}
```

Required input is enforced by the type, not by a runtime check: the terminal does not exist until
every required field is set. `create()` is absent from a payment with no customer, and absent from
one with no price; `amount()` disappears once `priceId()` is called, and `priceId()` disappears
once an amount is set, so a request can never override the price of a canonical resource.

`catalogue`, `customers`, `checkout`, `payments`, `paymentMethods`, `billing`, `invoices`,
`refunds`, `subscriptions`, `priceMigrations`, `events`, and `webhooks`. Each route needs its
capability on the credential. See [the documentation](docs/00-index.md) for the whole surface.

`paymentMethods` also supplies the `paymentMethodId` that payment allocations require.

## Catalogue writes

A credential with `catalogue:write` creates and changes the catalogue of its own App. BuPayment is
the source of truth for prices: when your application keeps a copy, change the price in BuPayment
first and update your copy only once the API has answered. Your copy can then only lag behind the
catalogue, never contradict it, and reconciliation repairs a lag.

A price's amount is fixed when it is created, so changing a price means creating a replacement and
archiving the old one. `replace()` does both in that order and reports each step:

```ts
const change = await client.catalogue
  .createPrice(productId)
  .unitAmount(1_200)
  .currency("EUR")
  .interval("month")
  .replacing(currentPriceId)
  .expectedUpdatedAt(observedUpdatedAt)
  .idempotencyKey(`reprice-${productId}-${revision}`)
  .replace();

await localPrices.save(productId, change.replacement);
if (change.outcome === "archive_failed") {
  queueArchiveRetry(change.previousPriceId, change.error);
}
```

A rejected `replace()` means the creation step failed; after a timeout or a network failure the
replacement may still exist, so retry on the same builder, which replays the creation under the
same key instead of creating a second price. A resolved one always carries the replacement, and
`archive_failed` names the previous price and the error, so the application decides how to
retry. The SDK stores nothing between requests: the last agreed amount, the local copy and what to
do on a conflict belong to the application.

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

See [Catalogue](docs/02-catalogue.md) for every route.

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
const draft = client.payments
  .create()
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
key of its own, because a changed body under an old key is refused as `idempotency_conflict`.

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
