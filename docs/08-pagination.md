# Pagination

## Three response shapes

Catalogue, customer and event lists answer `{ data, nextCursor }`. Payments, invoices,
refunds, subscriptions and price migrations add `hasMore`. Applicable tax rates answer
`{ data }` alone, and webhook endpoints and deliveries answer a plain array. The types say
which shape a call returns.

## The cursor is scoped

A cursor is opaque and bound to the workspace, environment, App and the filters that
produced it. Sending it back with different filters is rejected with `request_invalid`.

## Reading one page

```ts
let cursor: string | undefined;
do {
  const page = await client.products.list({ active: true, cursor });
  handle(page.data);
  cursor = page.nextCursor ?? undefined;
} while (cursor !== undefined);
```

## Reading every page

Each paginated list has a `listAll` sibling that captures the query once and only advances
the cursor, so the filters a cursor is bound to cannot drift:

```ts
for await (const product of client.products.listAll({ active: true })) {
  handle(product);
}
```

It stops on a null cursor, and also when the API answers with the cursor it was given,
which would otherwise loop forever.

## Building your own

`paginate` is exported for lists the typed surface has not reached:

```ts
import { paginate } from "@bu-payment/node-sdk";

const pages = paginate(
  (query) => client.request({ method: "GET", path: "/v1/products", query }),
  { active: true },
);
```

---

Previous: [Events and webhooks](07-events-and-webhooks.md) · Next: [Errors](09-errors.md)
