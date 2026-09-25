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
