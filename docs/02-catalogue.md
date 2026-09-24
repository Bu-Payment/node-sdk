# Catalogue

Products and prices are canonical environment resources. A dashboard user assigns them to
an App before a machine credential can read them, and the machine routes expose nothing
else. Catalogue mutations are a dashboard responsibility.

Requires `catalogue:read`.

## Products

```ts
const page = await client.products.list({ active: true, limit: 50 });
const product = await client.products.get("prod_1");
```

`list` answers `{ data, nextCursor }`. The cursor is opaque and bound to the workspace,
environment, App and the `active` filter in force.

`active` defaults to `true` on the API side, so `list()` with no query returns active
products only and archived ones are absent without any signal. The filter is an exact
match: `active: false` returns the archived products and nothing else, and no single walk
returns both. Reconciling a local catalogue means two walks, or `get` by identifier, which
returns a product whatever its state.

```ts
for await (const product of client.products.listAll({ active: true })) {
  console.log(product.name);
}
```

## Prices

```ts
const prices = await client.prices.list({ productId: "prod_1", active: true });
const price = await client.prices.get("price_1");
```

A price carries `unitAmount`, `currency`, `type` and, for a recurring price, `recurring`
with its interval and interval count.

`active` defaults to `true` here too, and it matters more: a price is archived when it is
superseded, while the subscriptions on it keep pointing at it. Building a price map from
`listAll({ productId })` leaves every superseded price out, even though `get` on the same
identifier returns it.

## Cross-sells and entitlements

```ts
const crossSells = await client.products.listCrossSells("prod_1");
const resolution = await client.products.getEntitlements("prod_1");
```

Cross-sells page like products and embed the suggested product. `getEntitlements` answers the
whole resolution for the product in one object, with no cursor.

---

Previous: [Getting started](01-getting-started.md) · Next: [Customers](03-customers.md)
