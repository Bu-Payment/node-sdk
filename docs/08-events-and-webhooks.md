# Events and webhooks

Event reads return only events whose trusted owner is the authenticated App. Ownership is
never derived from provider metadata, payload fields or customer email, so historical
events without a trustworthy owner are not exposed.

## Events

Requires `events:read`.

```ts
const events = await client.events.list().type("payment.succeeded").limit(50).get();
const event = await client.events.event("evt_1").get();

for await (const one of client.events.list().type("payment.succeeded").all()) {
  console.log(one.type, one.occurredAt);
}
```

The cursor is bound to the workspace, environment, App and the active type filter. Reusing
it under a different filter is rejected, which is why `all()` replays the original query on
every page.

## Endpoints

Requires `webhooks:manage`.

```ts
const endpoint = await client.webhooks
  .createEndpoint()
  .url("https://shop.example/hooks")
  .event("payment.succeeded")
  .event("payment.failed")
  .create();
```

Event types accumulate one call at a time. The signing `secret` is returned once, on
creation, and never again. Store it before discarding the response.

```ts
const endpoints = await client.webhooks.endpoints().get();
await client.webhooks.endpoint(endpoint.id).status("disabled").update();
await client.webhooks.endpoint(endpoint.id).remove();
```

`endpoints()` is a builder like any other, ending in `get()`, although the API neither
paginates nor filters that list. `update()` does not exist until a field is set.

## Verifying deliveries

Every delivery is signed with the endpoint `secret` returned by `createEndpoint()`. Verify
it before acting on the body, and answer only once the work is done:

```ts
import express from "express";
import { BuPaymentError, ErrorCode, verifyWebhookDelivery } from "@bu-payment/node-sdk";

const REJECTED = new Set<string>([
  ErrorCode.WEBHOOK_SIGNATURE_MISSING,
  ErrorCode.WEBHOOK_SIGNATURE_INVALID,
  ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED,
  ErrorCode.WEBHOOK_PAYLOAD_INVALID,
]);

app.post("/hooks/bupayment", express.raw({ type: "application/json" }), async (req, res) => {
  let delivery;
  try {
    delivery = verifyWebhookDelivery({
      body: req.body,
      headers: req.headers,
      secret: process.env.BUPAYMENT_WEBHOOK_SECRET ?? "",
    });
  } catch (error) {
    if (error instanceof BuPaymentError && REJECTED.has(error.code)) {
      res.sendStatus(400);
      return;
    }
    throw error;
  }
  await handle(delivery.event);
  res.sendStatus(200);
});
```

A `2xx` marks the delivery as succeeded and it is never sent again. Answering before
`handle` finishes loses the delivery whenever `handle` then fails; letting `handle` throw
answers `500`, and the platform retries. Only a delivery that failed verification is answered
`400`: a network or rate-limit error inside `handle` is not a bad delivery, and neither is an
authentic delivery this SDK cannot read (see [Typed events](#typed-events)).

`body` must be the raw request body, as a string or bytes. The platform signs the exact
bytes it sends; a body parsed by `express.json()` and serialized again is not guaranteed to
reproduce them, so a parsed object is refused with `webhook_payload_invalid` rather than
verified against the wrong bytes.

`headers` accepts Node's `IncomingHttpHeaders` or anything with a Fetch `get(name)` method,
in any casing. A header sent more than once is refused with `webhook_signature_missing`,
whether it arrives as an array or joined with a comma, which is how both Node and Fetch
represent a repeated header.

The signature is checked before the timestamp. `webhook_signature_invalid` therefore means
the delivery was not signed with this secret, and `webhook_timestamp_expired` means it was,
but more than `toleranceSeconds` (default 300) away from the local clock in either
direction. Every attempt, retries included, is signed afresh with the time it is sent, so an
expired timestamp points at clock drift on the receiving server or a delivery replayed by
someone other than the platform, not at a slow retry. A missing or malformed secret raises
`configuration_invalid`, which is a deployment fault and should not be answered as a bad
delivery.

The secret must be the full `whsec_` value issued for the endpoint. The confidential
`bup_sec_` credential, an empty value and a truncated one are refused, and neither the
secret nor either signature appears in any thrown error.

### What is signed, and what is not

The signature covers the timestamp and the body. It does not cover `x-webhook-id`, which
`deliveryId` is read from. Treat `deliveryId` as a hint for logs and support, never as a
trust boundary:

- someone holding a captured delivery can resend it inside the window under a new
  `x-webhook-id`, so a deduplication keyed on `deliveryId` alone lets the replay through.
  Key replay protection on `signature`, which is signed material and unique per attempt;
- the platform re-signs every retry, so a retry has a new `signature`. Make the effect of a
  delivery idempotent on what the signed body says: the event `id`, which every retry and
  every endpoint receives unchanged, and for catalogue events the resource and its
  `updatedAt`.

### Typed events

The body is a versioned envelope, `{ version: 1, id, type, occurredAt, data }`, signed with
the rest of the body. `delivery.event` is that envelope parsed into a union discriminated on
`type`; `data` narrows with it.

```ts
const { event } = delivery;
if (event.type === "catalogue.product.default_price.updated.v1") {
  event.data.resource.defaultPriceId;
}
```

| Field | Meaning |
| --- | --- |
| `id` | Platform event id, identical in every delivery of the event, to every endpoint and on every retry. |
| `type` | The event type, or `"unknown"` for a type this SDK does not know. |
| `occurredAt` | When the event happened, ISO 8601 in UTC. It does not change on retries. |
| `data` | The payload of that type. |

Catalogue events carry `data` as `{ resourceType, resourceId, occurredAt, updatedAt,
resource }`. `resource` is the resource after the mutation: a `Price`, or a `Product` with
`defaultPriceId`, typed as `CatalogueEventProduct`. The README lists the thirteen types and
which of them advance `data.updatedAt`.

Order the events of one resource by `data.updatedAt`, then by `occurredAt` when
`data.updatedAt` is equal. An assignment, an unassignment and a default price change caused by
one leave `data.updatedAt` unchanged, so only `occurredAt` tells them apart. Every timestamp
is ISO 8601 in UTC with milliseconds, exactly as `toISOString()` writes it, and anything else
is refused, so the values compare correctly as strings.

- **An unknown type is a value.** A type the SDK does not know yet comes back as
  `{ type: "unknown", receivedType, data }` with `data` as sent, so a type the platform adds
  later never throws. Handle the `"unknown"` case and answer `2xx` for the types you do not
  consume.
- **Only version 1 is read.** Any other `version`, or a body with none, is refused with
  `webhook_event_version_unsupported`, never read as version 1. It means the platform sends
  a format this SDK predates: upgrade the SDK, then retry the failed deliveries.
- **A known type is checked field by field.** `data` that does not match its type's shape,
  including a `resourceId` or an `updatedAt` that disagrees with `resource` and an
  `occurredAt` that disagrees with the envelope, is refused with
  `webhook_event_invalid`; `metadata.field` names the field and `metadata.eventId` the event.

Both errors are raised only after the signature and the timestamp have passed, so they come
from the platform, not from a forger. Let them answer `500` and alert on them: the platform
keeps retrying, and the delivery stays retryable once the mismatch is fixed.

Payment and subscription events are not typed yet and arrive as `"unknown"`.

### What stays with the application

Deliveries are at least once and unordered. The SDK keeps no state between calls, so the
replay store, the deduplication on the event `id`, the last `updatedAt` and `occurredAt`
applied per resource and applying the event are the application's, as is reconciling
periodically with the list reads: a delivery that exhausted its attempts is not sent again
unless retried.

## Deliveries

Reads require `events:read`; retrying requires `webhooks:manage`.

```ts
const deliveries = await client.webhooks.deliveries().status("failed").limit(100).get();
const delivery = await client.webhooks.delivery("whd_1").get();
const retried = await client.webhooks.delivery("whd_1").retry();
```

`get()` answers a plain array with no cursor and no `hasMore`, so nothing in the response
says whether it was truncated. Omitting `limit()` returns the 50 newest matching
deliveries; the server cap is 100. Driving retries from `deliveries().status("failed")`
without a limit silently leaves the 51st failure and everything older unretried.

`retry()` answers the delivery's identifier and its new status; a delivery already in
flight is left alone.

Fanout reaches an endpoint only when the event and the endpoint share the same App scope.

---

Previous: [Subscriptions](07-subscriptions.md) · Next: [Pagination](09-pagination.md)
