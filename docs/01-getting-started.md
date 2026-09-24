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
never request data: a body carrying `workspaceId`, `environmentId`, `applicationId`,
`appId`, `tenantId`, `provider`, `providerAccountId` or `providerAccountVersion` is refused
before the request is signed.

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

Every `POST`, `PUT`, `PATCH` and `DELETE` carries an `Idempotency-Key`. The SDK generates
one when the caller does not supply it. Pass your own as the last argument of a mutation to
make a retry replay the original outcome instead of creating a second resource.

```ts
await client.payments.create({ customerId, priceId }, orderId);
```

## The low-level escape hatch

`client.request<T>()` signs an arbitrary method, path, query and body. It exists for routes
the typed surface has not reached yet; prefer the resource clients, which carry the
contract's types.

---

Previous: [Index](00-index.md) · Next: [Catalogue](02-catalogue.md)
