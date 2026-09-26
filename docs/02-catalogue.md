# Catalogue

Products and prices are canonical environment resources. A dashboard user assigns them to
an App before a machine credential can read them, and the machine routes expose nothing
else. Catalogue mutations are a dashboard responsibility.

Requires `catalogue:read`.

## Products

```ts
const page = await client.catalogue.products().active(true).limit(50).get();
const product = await client.catalogue.product("prod_1").get();
```

`get()` answers `{ data, nextCursor }`. The cursor is opaque and bound to the workspace,
environment, App and the `active` filter in force.

`active` defaults to `true` on the API side, so `products().get()` returns active products
only and archived ones are absent without any signal. The filter is an exact match:
`active(false)` returns the archived products and nothing else, and no single walk returns
both. Reconciling a local catalogue means two walks, or `product(id).get()`, which returns a
product whatever its state.

`lookupKey(key)` finds a product by the natural key it was given, which survives a
reinstall or a repeated import after the original idempotency key is gone:

```ts
const [existing] = (await client.catalogue.products().lookupKey("gold").get()).data;
```

```ts
for await (const product of client.catalogue.products().active(true).all()) {
  console.log(product.name);
}
```

## Prices

```ts
const prices = await client.catalogue.prices().productId("prod_1").lookupKey("gold").get();
const price = await client.catalogue.price("price_1").get();
```

A price carries `unitAmount`, `currency`, `type` and, for a recurring price, `recurring`
with its interval and interval count.

`active` defaults to `true` here too, and it matters more: a price is archived when it is
superseded, while the subscriptions on it keep pointing at it. Building a price map from
`prices().productId(id).all()` leaves every superseded price out, even though
`price(id).get()` returns it.

## Cross-sells and entitlements

```ts
const crossSells = await client.catalogue.crossSells("prod_1").limit(10).get();
const resolution = await client.catalogue.entitlements("prod_1").get();
```

Cross-sells page like products and embed the suggested product. `entitlements` answers the
whole resolution for the product in one object, with no cursor.

---

Previous: [Getting started](01-getting-started.md) · Next: [Customers](03-customers.md)
