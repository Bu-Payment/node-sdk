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
import { BuPaymentClient } from "@bu-payment/node-sdk";

const client = new BuPaymentClient({
  applicationId: process.env.BUPAYMENT_APP_ID!,
  keyId: process.env.BUPAYMENT_KEY_ID!,
  secret: process.env.BUPAYMENT_SECRET!,
  apiBaseUrl: process.env.BUPAYMENT_API_BASE_URL!,
});
```

The environment is derived from the key ID, so a test credential can never be pointed at live by
configuration alone. The secret is parsed into its 32 HMAC key bytes and wrapped so that string
conversion, `JSON.stringify`, `util.inspect`, and thrown error metadata all render `[redacted]`.

## Commerce resources

The client exposes one typed resource per part of the machine API. Every model, request body,
list query, and page envelope mirrors the contract, so no response type has to be declared by
hand.

```ts
const products = await client.products.list({ active: true, limit: 20 });

const payment = await client.payments.create({
  customerId: "cus_123",
  priceId: "price_123",
});

for await (const event of client.events.listAll({ type: "payment.succeeded" })) {
  handle(event);
}
```

`products`, `prices`, `customers`, `coupons`, `taxRates`, `shippingRates`,
`subscriptionCheckouts`, `payments`, `subscriptions`, `subscriptionPriceMigrations`, `invoices`,
`refunds`, `events`, `webhookEndpoints`, and `webhookDeliveries`. Each route needs its capability
on the credential. See [the documentation](docs/00-index.md) for the whole surface.

A payment is priced either by a canonical `priceId` or by an ad hoc `amount` with its `currency`,
never by both: a request can never override the price of a canonical resource.

## Signed requests

```ts
import type { Page, Product } from "@bu-payment/node-sdk/types";

const products = await client.request<Page<Product>>({
  method: "GET",
  path: "/v1/products",
  query: { limit: 20 },
});
```

`request` is the low-level escape hatch, for routes the typed resources have not reached yet. It
carries the response type the caller declares.

Each call derives a fresh timestamp and nonce, canonicalizes the exact path and query it transmits,
hashes the exact body bytes it sends, and signs the nine-line canonical request with HMAC-SHA256.
The request carries `Bu-Payment-Signature-Version`, `Bu-Payment-App-Id`, `Bu-Payment-Key-Id`,
`Bu-Payment-Timestamp`, `Bu-Payment-Nonce`, and `Bu-Payment-Signature`.

The authenticated application, workspace, and environment come from the credential. Nothing in a
path, query, or body can widen or replace that scope: a body carrying `workspaceId`,
`environmentId`, `applicationId`, `appId`, `tenantId`, `provider`, `providerAccountId`, or
`providerAccountVersion` is refused before the request is signed.

## Idempotency

Every `POST`, `PUT`, `PATCH`, and `DELETE` sends an `Idempotency-Key`. The SDK generates one when
the caller does not supply it. Pass your own key to replay a mutation safely after a network
failure or a timeout:

```ts
const idempotencyKey = `order-${orderId}`;

await client.request({ method: "POST", path: "/v1/payments", body, idempotencyKey });
await client.request({ method: "POST", path: "/v1/payments", body, idempotencyKey });
```

The second call makes the API replay the stored result of the first instead of performing the
mutation twice. A key is valid when it is well-formed Unicode, has no surrounding whitespace, and
is 1 to 255 characters long.

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
