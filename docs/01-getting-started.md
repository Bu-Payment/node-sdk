# Getting started

## Install

```bash
bun add @bu-payment/node-sdk
```

The package is server-only. Importing it in a browser bundle raises an error rather than
shipping a confidential secret to a client.

## Configure the client

```ts
import { BuPaymentClient } from "@bu-payment/node-sdk";

const client = new BuPaymentClient({
  applicationId: process.env.BU_PAYMENT_APP_ID!,
  keyId: process.env.BU_PAYMENT_KEY_ID!,
  secret: process.env.BU_PAYMENT_SECRET!,
  apiBaseUrl: "https://api.bupayment.com",
});
```

The environment is derived from the key identifier, not configured separately. Passing an
`environment` that disagrees with the key is rejected at construction.

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
| `catalogue:read` | `products`, `prices` |
| `customers:read`, `customers:write` | `customers` |
| `checkout:create` | `coupons`, `taxRates`, `shippingRates`, `subscriptionCheckouts` |
| `payments:read`, `payments:write` | `payments`, `invoices`, `refunds` reads |
| `refunds:write` | `refunds.create` |
| `subscriptions:read`, `subscriptions:write` | `subscriptions`, `subscriptionPriceMigrations` |
| `events:read` | `events`, `webhookDeliveries` reads |
| `webhooks:manage` | `webhookEndpoints`, `webhookDeliveries.retry` |

## Idempotency

Every `POST`, `PUT`, `PATCH` and `DELETE` carries an `Idempotency-Key`. The SDK generates a
fresh one for each call the caller does not key, which means a retry of an unkeyed
`payments.create` after a timeout is a second charge, not a replay. Pass your own key, as
the last argument of every mutation, whenever a retry is possible:

```ts
await client.payments.create({ customerId, priceId }, orderId);
```

The key must be the same on the retry as on the first attempt, and derived from the
operation rather than generated per attempt.

## The low-level escape hatch

`client.request<T>()` signs an arbitrary method, path, query and body. It exists for routes
the typed surface has not reached yet; prefer the resource clients, which carry the
contract's types.

---

Previous: [Index](00-index.md) · Next: [Catalogue](02-catalogue.md)
