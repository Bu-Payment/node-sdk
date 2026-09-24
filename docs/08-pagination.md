# Pagination

## Four response shapes

Products, prices, cross-sells, customers, shipping rates and events answer
`{ data, nextCursor }`. Payments, invoices, refunds, subscriptions and price migrations add
`hasMore`, which is always `nextCursor !== null`. Applicable tax rates answer `{ data }`
alone. Webhook endpoints and webhook deliveries answer a plain array. The return type of
each terminal says which shape that call produces.

## The cursor is scoped

A cursor is opaque and bound to the workspace, environment, App and the filters that
produced it. Sending it back with different filters is rejected with `request_invalid`.

## Reading one page

`cursor()` is a configuration method like any other, so the loop branches from a builder
that already carries the filters:

```ts
const query = client.catalogue.products().active(true);

let cursor: string | undefined;
do {
  const page = await (cursor === undefined ? query : query.cursor(cursor)).get();
  handle(page.data);
  cursor = page.nextCursor ?? undefined;
} while (cursor !== undefined);
```

Because every configuration method returns a new builder, `query` is never mutated and can
be reused for the next page.

## Reading every page

`all()` is the sibling terminal of `get()`. It captures the query once and only advances
the cursor, so the filters a cursor is bound to cannot drift:

```ts
for await (const product of client.catalogue.products().active(true).all()) {
  handle(product);
}
```

Nothing is requested until the iterator is pulled. It ends on a null cursor, and throws
`response_invalid` when the API answers a cursor it has already served, a page whose
`nextCursor` is missing or empty, a page with no `data` array, or a final page that sets
`hasMore` with no cursor to follow it. Each of those would otherwise walk the same pages
forever, stop early while reporting success, or surface a bare `TypeError`. A walk that
ends without an error read every page.

## Building your own

`paginate` is exported for routes the builders have not reached. Name both type arguments:
they cannot be inferred from an untyped callback parameter.

```ts
import { paginate } from "@bu-payment/node-sdk";
import type { Page, Product } from "@bu-payment/node-sdk/types";

const products = paginate<Product, { cursor?: string; active?: boolean }>(
  (query) => client.request<Page<Product>>({ method: "GET", path: "/v1/products", query }),
  { active: true },
);

for await (const product of products) {
  handle(product);
}
```

---

Previous: [Events and webhooks](07-events-and-webhooks.md) · Next: [Errors](09-errors.md)
