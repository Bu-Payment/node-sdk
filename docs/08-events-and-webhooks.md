# Events and webhooks

Event reads return only events whose trusted owner is the authenticated App. Ownership is
never derived from provider metadata, payload fields or customer email, so historical
events without a trustworthy owner are not exposed.

## Events

Requires `events:read`.

```ts
const events = await client.events.list().type("payment.succeeded.v1").limit(50).get();
const event = await client.events.event("evt_1").get();

for await (const one of client.events.list().type("payment.succeeded.v1").all()) {
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
  .endpointDraft()
  .url("https://shop.example/hooks")
  .event("payment.succeeded.v1")
  .event("payment.failed.v1")
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

## Receiving deliveries

Every delivery is signed with the endpoint `secret` returned by `endpointDraft()`. `handle()`
verifies the delivery, runs your function on the event and resolves to the status to answer:

```ts
import express from "express";
import { webhookDelivery } from "@bu-payment/node-sdk";
import { processedEvents } from "./processed-events";

const receiver = webhookDelivery()
  .secret(process.env.BUPAYMENT_WEBHOOK_SECRET ?? "")
  .deduplicateWith(processedEvents);

const app = express();

app.post("/hooks/bupayment", express.raw({ type: "application/json" }), async (req, res) => {
  const outcome = await receiver
    .body(req.body)
    .headers(req.headers)
    .handle(async (event) => {
      if (event.type === "checkout.completed") {
        await orders.markPaid(event.data.checkoutId, event.data.paymentId);
      }
    });
  if (outcome.status === 400) {
    logger.warn({ code: outcome.error.code }, "rejected BuPayment delivery");
  }
  res.sendStatus(outcome.status);
});
```

`handle()` resolves to `{ status: 200 }` once your function has finished, and to
`{ status: 400, error }` when the delivery failed verification, without calling your function.
Everything else rejects, and the rejection should answer `500`: an error thrown by your
function, a failing store, a deployment fault such as a malformed secret
(`configuration_invalid`), and an authentic event this SDK cannot read,
`webhook_event_version_unsupported` or `webhook_event_invalid` (see
[Typed events](#typed-events)). Express 5 answers `500` for a rejected route handler; on
Express 4, catch the rejection and pass it to `next`. Nothing here depends on Express: any
framework that exposes the raw body and the headers works the same way.

A `2xx` marks the delivery as succeeded and it is never sent again, which is why `handle()`
resolves only after your function has, and why a network or rate-limit error inside it is not
answered `400`: the platform retries every delivery not answered `2xx`. Your function also
receives the verified delivery as its second argument, with `deliveryId`, `signature` and
`timestamp`.

Log the `error` of a `400`. A wrong but well formed secret, or an `express.json()` mounted
before the route, rejects every authentic delivery, and the code it carries is the only trace.

The receiver holding the secret is built once and reused: each delivery branches from it
without changing it, and `handle()` only becomes available once `body()` and `headers()`
are set. `body()` takes the raw request body, as a string or bytes. The platform signs the exact
bytes it sends; a body parsed by `express.json()` and serialized again is not guaranteed to
reproduce them, so a parsed object is refused with `webhook_payload_invalid` rather than
verified against the wrong bytes.

`headers()` accepts Node's `IncomingHttpHeaders` or anything with a Fetch `get(name)` method,
in any casing. A header sent more than once is refused with `webhook_signature_missing`,
whether it arrives as an array or joined with a comma, which is how both Node and Fetch
represent a repeated header.

The signature is checked before the timestamp. `webhook_signature_invalid` therefore means
the delivery was not signed with this secret, and `webhook_timestamp_expired` means it was,
but more than `toleranceSeconds()` (default 300) away from the local clock in either
direction. Every attempt, retries included, is signed afresh with the time it is sent, so an
expired timestamp points at clock drift on the receiving server or a delivery replayed by
someone other than the platform, not at a slow retry. A missing or malformed secret raises
`configuration_invalid`, which is a deployment fault and should not be answered as a bad
delivery.

The secret must be the full `whsec_` value issued for the endpoint. The confidential
`bup_sec_` credential, an empty value and a truncated one are refused, and neither the
secret nor either signature appears in any thrown error.

### Deduplicating events

Deliveries are at least once. `deduplicateWith(store)` makes `handle()` run your function at
most once per event `id`, on a store you keep in your own database:

```ts
import type { WebhookEventStore } from "@bu-payment/node-sdk";

export const processedEvents: WebhookEventStore = {
  async claim(eventId) {
    const inserted = await db.query(
      "insert into bupayment_events (event_id, claimed_at) values ($1, now()) on conflict do nothing",
      [eventId],
    );
    return inserted.rowCount === 1;
  },
  async release(eventId) {
    await db.query("delete from bupayment_events where event_id = $1", [eventId]);
  },
};
```

`claim` resolves to `true` when this call recorded the id and `false` when it was already
there, and it must decide that atomically: one insert on a unique key does, so two deliveries
of one event arriving together cannot both claim it. A read followed by a write does not.
`handle()` claims only after the delivery is verified, and answers `200` without calling your
function when the claim fails. When your function throws, `handle()` releases the claim before
rejecting, so the retry of that delivery runs it again. `release` must therefore delete the
claim, not mark it. A `claim` that resolves to anything but a boolean, such as a row count or
Redis' `"OK"`, rejects with `configuration_invalid`. The SDK cannot tell from such an answer
whether the id was recorded, so it releases nothing: once the store is fixed, delete the rows
it claimed while it was wrong, which `claimed_at` finds.

- A delivery that arrives while another of the same event is still running is answered `200`
  at once. If the running one then fails, its own retry carries the event.
- If `release` fails too, `handle()` rejects with an `AggregateError` holding both errors, and
  the id stays claimed with nothing applied. The same happens if the process dies between the
  claim and the end of your function. Keep the claim time, as above, so such rows can be found
  and deleted, and keep reconciling with the list reads.
- The event `id` is the same at every endpoint. Endpoints that each need to apply the same
  event need a store each, or a key that includes the endpoint.
- Once a store is set, `verify()` is no longer offered, so no delivery can bypass it.

### Verifying without handle

`verify()` returns the verified delivery and leaves the answer to you. `isRejectedDelivery(error)`
is `true` for exactly the four codes that mean a bad delivery, answered `400`:
`webhook_signature_missing`, `webhook_signature_invalid`, `webhook_timestamp_expired` and
`webhook_payload_invalid`.

```ts
import { isRejectedDelivery, webhookDelivery } from "@bu-payment/node-sdk";

const verifier = webhookDelivery().secret(process.env.BUPAYMENT_WEBHOOK_SECRET ?? "");

app.post("/hooks/bupayment", express.raw({ type: "application/json" }), async (req, res) => {
  let delivery;
  try {
    delivery = verifier.body(req.body).headers(req.headers).verify();
  } catch (error) {
    if (isRejectedDelivery(error)) {
      res.sendStatus(400);
      return;
    }
    throw error;
  }
  await apply(delivery.event);
  res.sendStatus(200);
});
```

### What is signed, and what is not

The signature covers the timestamp and the body. It does not cover `x-webhook-id`, which
`deliveryId` is read from. Treat `deliveryId` as a hint for logs and support, never as a
trust boundary:

- someone holding a captured delivery can resend it inside the window under a new
  `x-webhook-id`, so a deduplication keyed on `deliveryId` alone lets the replay through.
  `deduplicateWith()` keys on the signed event `id`, so a replay of an event already handled
  answers `200` without running your function. Without it, key replay protection on
  `signature`, which is signed material and unique per attempt;
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
resource }`. `resource` is the resource after the mutation: a `Price`, or a `Product`, which
carries `defaultPriceId` here as it does on catalogue reads. `CatalogueEventProduct` remains
as an alias of `Product`. The README lists the thirteen types and
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

#### Checkout events

The four outcomes of a [one-time checkout](04-checkout.md#one-time-checkout) are typed. Their
names carry no version suffix: subscribe to them exactly as written.

| Type | Emitted when |
| --- | --- |
| `checkout.completed` | The checkout is paid; `data.paymentId` names the payment. |
| `checkout.failed` | The provider reports the payment failed. |
| `checkout.expired` | The checkout reached its expiry unpaid. |
| `checkout.cancelled` | The checkout was cancelled. |

The first three share one `data`: `checkoutId`, `reference` (the one sent at creation, or
`null`), `status` (narrowed to the event's own status), `previousStatus`, `paymentId`,
`provider`, `providerCheckoutId`, `amount`, `currency`, `chargedAmount`, `chargedCurrency`,
`quantity` and `customerId`. `checkout.cancelled` carries `checkoutId`, `reference`,
`provider`, `providerCheckoutId` and `previousStatus`. The `checkout.callback.*` steps arrive as
`"unknown"`.

```ts
switch (event.type) {
  case "checkout.completed":
    await orders.markPaid(event.data.checkoutId, event.data.paymentId);
    break;
  case "checkout.failed":
  case "checkout.expired":
  case "checkout.cancelled":
    await orders.release(event.data.checkoutId);
    break;
}
```

These events carry no `updatedAt`. Key the business effect on `checkoutId`, once, and use
`reference` as the cross-check against your order. A checkout that expired or was cancelled
can still be paid: `checkout.completed` then arrives later with `previousStatus` `expired` or
`cancelled`, and the order is paid even if it was already released.

### What stays with the application

Deliveries are at least once and unordered. The SDK keeps no state between calls:
`deduplicateWith()` runs on the store you give it, and the last `updatedAt` and `occurredAt`
applied per resource and applying the event are the application's, as is reconciling
periodically with the list reads: a delivery that exhausted its attempts is not sent again
unless retried. `isStale(candidate, stored)` compares `updatedAt` alone, so it cannot order
events that share one; compare the pair above for those. See
[Catalogue](02-catalogue.md#applying-the-newer-version).

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

A delivery is `pending`, `delivering`, `succeeded`, `failed`, `exhausted` or `refused`.
`refused` is terminal, like `exhausted`: the endpoint URL resolved to a destination the
platform does not send to, such as a private, loopback or link-local address, so nothing was
sent and the platform makes no further attempt on its own. `responseBody` names the reason.
List them with `deliveries().status("refused")`, fix the endpoint URL, then `retry()` each one.

`retry()` answers the delivery's identifier and its new status; a delivery already in
flight is left alone.

Fanout reaches an endpoint only when the event and the endpoint share the same App scope.

---

Previous: [Subscriptions](07-subscriptions.md) · Next: [Pagination](09-pagination.md)
