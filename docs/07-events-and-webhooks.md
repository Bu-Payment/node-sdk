# Events and webhooks

Event reads return only events whose trusted owner is the authenticated App. Ownership is
never derived from provider metadata, payload fields or customer email, so historical
events without a trustworthy owner are not exposed.

## Events

Requires `events:read`.

```ts
const events = await client.events.list({ type: "payment.succeeded", limit: 50 });
const event = await client.events.get("evt_1");

for await (const one of client.events.listAll({ type: "payment.succeeded" })) {
  console.log(one.type, one.occurredAt);
}
```

The cursor is bound to the workspace, environment, App and the active type filter. Reusing
it under a different filter is rejected, which is why `listAll` replays the original query
on every page.

## Endpoints

Requires `webhooks:manage`.

```ts
const endpoint = await client.webhookEndpoints.create({
  url: "https://shop.example/hooks",
  enabledEvents: ["payment.succeeded"],
});
```

The signing `secret` is returned once, on creation, and never again. Store it before
discarding the response.

```ts
const endpoints = await client.webhookEndpoints.list();
await client.webhookEndpoints.update(endpoint.id, { status: "disabled" });
await client.webhookEndpoints.remove(endpoint.id);
```

`list` answers a plain array: endpoints are not paginated.

## Deliveries

Reads require `events:read`; retrying requires `webhooks:manage`.

```ts
const deliveries = await client.webhookDeliveries.list({ status: "failed" });
const delivery = await client.webhookDeliveries.get("whd_1");
const retried = await client.webhookDeliveries.retry("whd_1");
```

`list` answers a plain array capped by `limit`, with no cursor. `retry` answers the
delivery's identifier and its new status; a delivery already in flight is left alone.

Fanout reaches an endpoint only when the event and the endpoint share the same App scope.

---

Previous: [Subscriptions](06-subscriptions.md) · Next: [Pagination](08-pagination.md)
