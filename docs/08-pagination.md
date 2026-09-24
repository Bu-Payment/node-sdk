# Pagination

## Four response shapes

Products, prices, cross-sells, customers, shipping rates and events answer
`{ data, nextCursor }`. Payments, invoices, refunds, subscriptions and price migrations add
`hasMore`, which is always `nextCursor !== null`. Applicable tax rates answer `{ data }`
alone. Webhook endpoints and webhook deliveries answer a plain array. The return type of
each method says which shape that call produces.

## The cursor is scoped

A cursor is opaque and bound to the workspace, environment, App and the filters that
produced it. Sending it back with different filters is rejected with `request_invalid`.

## Reading one page

The SDK compiles under `exactOptionalPropertyTypes`, so spread the cursor in rather than
assigning `string | undefined` to an optional property:

```ts
let cursor: string | undefined;
do {
  const page = await client.products.list({
    active: true,
    ...(cursor === undefined ? {} : { cursor }),
  });
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

It ends on a null cursor. It throws `response_invalid` when the API answers a cursor it has
already served, or a page whose `nextCursor` is missing or empty, because both would
otherwise walk the same pages forever or stop early while reporting success. A walk that
ends without an error read every page.

## Building your own

`paginate` is exported for lists the typed surface has not reached. Name both type
arguments: they cannot be inferred from an untyped callback parameter.

```ts
import { paginate } from "@bu-payment/node-sdk";
import type { ListProductsQuery, Page, Product } from "@bu-payment/node-sdk/types";

const products = paginate<Product, ListProductsQuery>(
  (query) => client.request<Page<Product>>({ method: "GET", path: "/v1/products", query }),
  { active: true },
);

for await (const product of products) {
  handle(product);
}
```

---

Previous: [Events and webhooks](07-events-and-webhooks.md) · Next: [Errors](09-errors.md)
