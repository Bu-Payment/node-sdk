# Getting started

## Install

The package is not published to a registry. Install it from GitHub, pinned to a full commit SHA:

```bash
npm install "github:Bu-Payment/node-sdk#<commit-sha>"
```

npm builds `dist` from source during the install, through the package's `prepare` script, so an
install with `--ignore-scripts` leaves the package without it.

The package is server-only. Importing it in a browser bundle raises an error rather than
shipping a confidential secret to a client.

## Create the client

```ts
import { createBuPaymentClientFromEnv } from "@bu-payment/node-sdk";

const client = createBuPaymentClientFromEnv(process.env);
```

| Variable | Required | Holds |
| --- | --- | --- |
| `BU_PAYMENT_API_URL` | yes | The API base URL, such as `https://api.bupayment.com`. |
| `BU_PAYMENT_APP_ID` | yes | The App identifier. |
| `BU_PAYMENT_KEY_ID` | yes | The confidential key identifier, `bup_ck_test_...` or `bup_ck_live_...`. |
| `BU_PAYMENT_SECRET` | yes | The confidential secret, `bup_sec_...`. |
| `BU_PAYMENT_WEBHOOK_SECRET` | no | The webhook endpoint secret, exposed as `client.webhookSecret`. |
| `BU_PAYMENT_DESTINATION_KEY` | no | The default checkout destination of `sessionDraft()`. |

The names are exported as `EnvVariable`. The environment is an argument, defaulting to
`process.env`, and is read only when the function is called, never when the package is imported.
Values are trimmed and an empty value counts as missing. Missing required variables are reported
together, in one `BuPaymentError` with `configuration_missing` whose message and
`metadata.variables` name every one of them and carry no value. `isConfigured(env)` answers
whether all required variables are set, without throwing.

Settings that do not come from the environment go to `createBuPaymentClient`:

```ts
import { createBuPaymentClient } from "@bu-payment/node-sdk";

const client = createBuPaymentClient({
  applicationId: credential.applicationId,
  keyId: credential.keyId,
  secret: credential.secret,
  apiBaseUrl: "https://api.bupayment.com",
  webhookSecret: credential.webhookSecret,
  destinationKey: "default",
});
```

`webhookSecret` and `destinationKey` are optional; given empty, they are refused with
`configuration_invalid`. The environment is derived from the key identifier, not configured
separately. Passing an `environment` that disagrees with the key is rejected at creation. The
client is frozen.

`client.webhookSecret` returns the configured webhook secret for
[receiving deliveries](08-events-and-webhooks.md#receiving-deliveries). It is not an enumerable
key, so it stays out of `JSON.stringify(client)`, and reading it with none configured throws
`configuration_missing` naming `BU_PAYMENT_WEBHOOK_SECRET`.

## The builder contract

Every operation follows the same three steps: an entry point, configuration, a terminal.

```ts
const products = await client.catalogue.products().active(true).limit(20).get();
```

- A list entry point is a plural verb, `catalogue.products()`. A single-resource entry
  point is the resource noun, `catalogue.product(id)`.
- Every configuration method returns a new frozen builder. An earlier builder is never
  mutated, so it is safe to hold one and branch from it.
- Nothing reaches the network until a terminal: `get()`, `find()`, `all()`, `collect()`,
  `create()`, `update()`, `remove()`, `cancel()`, `pause()`, `resume()`, `evaluate()`, `redeem()`, `calculate()`,
  `retry()`, `reschedule()`.
- Required input is type-state. `client.payments.draft().customerId("cus_1")` has no
  `create()` method at all until it is priced, and the compiler says so.

`signal()` and `timeoutMs()` are available on every builder.

## Scope is fixed by the credential

The authenticated credential fixes the App, workspace and environment. Those values are
never request data: a body or query carrying `workspace`, `environment`, `application`,
`app`, `tenant`, `provider`, `providerAccountId` or `providerAccountVersion`, with or
without an `Id` suffix and whatever the casing or separator, is refused before the request
is signed. The check runs on the body as it will be serialized, so a class with a `toJSON`
is examined by what it actually sends.

A resource owned by another App answers exactly like a resource that does not exist. Never
read an identifier's existence out of a not-found response.

## Capabilities

Each route requires a capability on the credential. Without it the API answers
`application_capability_denied`.

| Capability | Surface |
| --- | --- |
| `catalogue:read` | `catalogue` |
| `customers:read`, `customers:write` | `customers` |
| `checkout:create` | `checkout` |
| `checkout:custom_amount` | `checkout.sessionDraft().amount()`, with `checkout:create` |
| `payments:read`, `payments:write` | `payments`, `paymentMethods`, `billing`, `invoices`, refund reads |
| `refunds:write` | `refunds.draft()` |
| `subscriptions:read`, `subscriptions:write` | `subscriptions`, `priceMigrations` |
| `events:read` | `events`, delivery reads |
| `webhooks:manage` | endpoint management, delivery retries |

## Idempotency

Every `POST`, `PUT`, `PATCH` and `DELETE` carries an `Idempotency-Key`. The SDK mints a
fresh one for each call the caller does not key, so a retry of an unkeyed mutation after a
timeout is a second charge, not a replay. Every mutation builder takes `idempotencyKey()`:

```ts
await client.payments
  .draft()
  .customerId(customerId)
  .priceId(priceId)
  .idempotencyKey(`order-${orderId}`)
  .create();
```

The key must be the same on the retry as on the first attempt, and derived from the
operation rather than generated per attempt.

## The low-level escape hatch

`client.request<T>()` signs an arbitrary method, path, query and body. It exists for routes
the builders have not reached yet, and it is the only method on the client that takes an
options object.

---

Previous: [Index](00-index.md) · Next: [Catalogue](02-catalogue.md)
