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
it before acting on the body:

```ts
import express from "express";
import { BuPaymentError, ErrorCode, verifyWebhookDelivery } from "@bu-payment/node-sdk";

app.post("/hooks/bupayment", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const delivery = verifyWebhookDelivery({
      body: req.body,
      headers: req.headers,
      secret: process.env.BUPAYMENT_WEBHOOK_SECRET ?? "",
    });
    handle(delivery.deliveryId, delivery.payload);
    res.sendStatus(200);
  } catch (error) {
    if (error instanceof BuPaymentError && error.code !== ErrorCode.CONFIGURATION_INVALID) {
      res.sendStatus(400);
      return;
    }
    throw error;
  }
});
```

`body` must be the raw request body, as a string or bytes. The platform signs the exact
bytes it sends; a body parsed by `express.json()` and serialized again is not guaranteed to
reproduce them, so a parsed object is refused with `webhook_payload_invalid` rather than
verified against the wrong bytes. `headers` accepts Node's `IncomingHttpHeaders` or a Fetch
`Headers`, in any casing; a header sent twice is refused rather than one copy chosen.

The signature is checked before the timestamp. `webhook_signature_invalid` therefore means
the delivery was not signed with this secret, and `webhook_timestamp_expired` means it was,
but more than `toleranceSeconds` (default 300) away from the local clock in either
direction. The second usually points at clock drift or a delivery retried long after it was
sent, not at an attacker. A missing or malformed secret raises `configuration_invalid`,
which is a deployment fault and should not be answered as a bad delivery.

The secret must start with `whsec_`. The confidential `bup_sec_` credential is refused, as
is an empty value, and neither the secret nor the signature appears in any thrown error.

### What the body does not carry

The body is the event payload alone. It carries no event type, no event identifier and no
occurrence time, and the headers carry only the delivery identifier. When an endpoint
subscribes to more than one type, read the type from the delivery record:

```ts
const record = await client.webhooks.delivery(delivery.deliveryId).get();
record.eventType;
record.platformEventId;
```

### What stays with the application

Deliveries are at least once and unordered. The SDK keeps no state between calls, so:

- deduplicate on `deliveryId`, which is stable across retries of the same delivery;
- when the payload describes a resource, compare its `updatedAt` with the one already
  stored and discard the older, since a retry can arrive after a newer change;
- reconcile periodically with the list reads above; a delivery that exhausted its attempts
  is not sent again unless retried.

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
