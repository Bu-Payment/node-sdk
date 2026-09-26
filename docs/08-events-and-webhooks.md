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

app.post("/hooks/bupayment", express.raw({ type: "application/json" }), async (req, res) => {
  let delivery;
  try {
    delivery = verifyWebhookDelivery({
      body: req.body,
      headers: req.headers,
      secret: process.env.BUPAYMENT_WEBHOOK_SECRET ?? "",
    });
  } catch (error) {
    if (error instanceof BuPaymentError && error.code !== ErrorCode.CONFIGURATION_INVALID) {
      res.sendStatus(400);
      return;
    }
    throw error;
  }
  await handle(delivery);
  res.sendStatus(200);
});
```

A `2xx` marks the delivery as succeeded and it is never sent again. Answering before
`handle` finishes loses the delivery whenever `handle` then fails; letting `handle` throw
answers `500`, and the platform retries. Only a verification failure is answered `400`: a
network or rate-limit error inside `handle` is not a bad delivery.

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
  delivery idempotent on what the signed payload says, such as a resource identifier and
  its `updatedAt`, rather than on either identifier.

### What the body does not carry

The body is the event payload alone. It carries no event type, no event identifier and no
occurrence time. When an endpoint subscribes to more than one type, read the type from the
delivery record, and check that the record describes the payload you verified, since the
identifier used to fetch it was not signed:

```ts
import { isDeepStrictEqual } from "node:util";

const record = await client.webhooks.delivery(delivery.deliveryId).get();
if (!isDeepStrictEqual(record.payload, delivery.payload)) {
  throw new Error("delivery record does not match the verified payload");
}
record.eventType;
```

Bu-Payment/api#435 tracks carrying the type and event identity in the signed delivery.

### What stays with the application

Deliveries are at least once and unordered. The SDK keeps no state between calls, so the
replay store, the idempotency on the payload and the ordering by `updatedAt` described
above are the application's, as is reconciling periodically with the list reads: a
delivery that exhausted its attempts is not sent again unless retried.

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
