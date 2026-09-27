# Catalogue

Products and prices are canonical environment resources. A dashboard user assigns them to
an App before a machine credential can read them, and the machine routes expose nothing
else. A credential with `catalogue:write` can also create and change the App's own
catalogue; see [Writes](#writes).

Reads require `catalogue:read`.

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

Every product read or written through the product routes carries `defaultPriceId`: the price the product defaults to,
or `null` when it has none or that price is not assigned to your App. Product events carry
the same field, so a sweep and an event agree on it. When the price a link points to is
archived, repoint the link to `defaultPriceId`. The product a cross-sell suggests carries no
default price and is typed as `SuggestedProduct`.

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

## Writes

Requires `catalogue:write`, which a publishable credential can never hold. A product or
price created here is assigned to the calling App at once.

| Builder | Route | Terminal available once |
| --- | --- | --- |
| `productDraft()` | `POST /v1/products` | `name()` |
| `updateProduct(id)` | `PATCH /v1/products/{id}` | `name()`, `description()` or `lookupKey()` |
| `archiveProduct(id)` | `POST /v1/products/{id}/archive` | always |
| `reactivateProduct(id)` | `POST /v1/products/{id}/reactivate` | always |
| `setDefaultPrice(id)` | `PUT /v1/products/{id}/default-price` | `priceId()` |
| `priceDraft(productId)` | `POST /v1/products/{productId}/prices` | `unitAmount()` and `currency()` |
| `archivePrice(id)` | `POST /v1/prices/{id}/archive` | always |
| `reactivatePrice(id)` | `POST /v1/prices/{id}/reactivate` | always |

```ts
const product = await client.catalogue
  .productDraft()
  .name("Gold")
  .lookupKey("gold")
  .idempotencyKey(`import-${sku}`)
  .create();

await client.catalogue
  .updateProduct(product.id)
  .description(null)
  .expectedUpdatedAt(product.updatedAt)
  .update();

await client.catalogue.archiveProduct(product.id).expectedUpdatedAt(seen).archive();
```

`description(null)` and `lookupKey(null)` clear the field on an update. A price takes
`interval()` for a recurring price, then `intervalCount()`; `transferLookupKey()` appears
once `lookupKey()` is set and moves the key from another of the App's prices.

### Conditional writes

`expectedUpdatedAt()` exists on `updateProduct`, `setDefaultPrice` once `priceId()` is set,
the four archive and reactivate builders and on a price replacement, the routes that accept
it. It takes the `updatedAt` last
observed. When the resource has changed since, the write fails with `stale_resource` and
`error.resource` holds the current product or price, so the change can be reapplied without
another read. Without it the write overwrites unconditionally.

A product `lookupKey` is unique per environment. A key held by another product fails with
`lookup_key_conflict`; `error.resource` holds the holder only when it is assigned to your
App, and is `undefined` otherwise.

### Choosing the default price

The first price created on a product becomes its default. `setDefaultPrice(productId)`
points the default at another price and answers the product with its new `defaultPriceId`:

```ts
const product = await client.catalogue
  .setDefaultPrice(productId)
  .priceId(priceId)
  .expectedUpdatedAt(seenProduct.updatedAt)
  .update();
```

`expectedUpdatedAt()` takes the product's `updatedAt`, and a `stale_resource` carries the
product in `error.resource`. The price must be active, belong to the product and be assigned
to your App: an unassigned price fails with `resource_not_found`, a price of another product
with `price_product_mismatch`, and an archived price or product with `invalid_state`. On a
product shared with other Apps, only the App whose price is the current default can move it;
any other fails with `default_price_not_owned`. Choosing the current default changes nothing.

### Changing a price

The amount of a price is fixed at creation. `replacing(priceId)` turns a price draft into a
replacement, whose `replace()` swaps the new price in for the old one:

```ts
const change = await client.catalogue
  .priceDraft(productId)
  .unitAmount(1_200)
  .currency("EUR")
  .replacing(currentPriceId)
  .replace();
```

The API refuses to archive a product's default price with `default_price_in_use`, and the
first price of a product is always its default, so `replace()` takes up to three steps. It
reads the product first, which is why a replacement needs `catalogue:read` as well as
`catalogue:write`, then:

1. creates the replacement;
2. when the product's `defaultPriceId` is the price being replaced, makes the replacement
   the default, asserting the product `updatedAt` it just read;
3. archives the previous price.

Creating first means a failure never leaves the product without an active price, and moving
the default before the archive means it never points at an archived price. The outcome says
which step failed:

- the promise rejects: the product could not be read or the replacement could not be
  created. After a timeout or a network failure the replacement may exist anyway, so retry
  on the same builder rather than a new one;
- `{ outcome: "replaced", replacement, archived }`: every step succeeded;
- `{ outcome: "default_failed", replacement, previousPriceId, error }`: the replacement is
  active, the previous price is still active, and nothing was archived. When `error` is a
  refusal from the API, such as `stale_resource` because the default changed after the read,
  the default did not move. After a timeout or a network failure it may have moved anyway,
  so read the product or retry on the same builder before acting on it;
- `{ outcome: "archive_failed", replacement, previousPriceId, error }`: the replacement is
  active and, if the previous price was the default, is the default now; the previous price
  is still active, and `error` is why the archive failed.

These are separate requests, not a transaction. Recover from either failure by calling
`replace()` again on the same builder: it replays the creation, reads the product again, moves
the default only if it still points at the previous price, and retries the archive. Or finish
by hand with `setDefaultPrice(productId).priceId(replacement.id).update()` and then
`archivePrice(previousPriceId).archive()`. After a `stale_resource` on the archive, call
`expectedUpdatedAt()` with the `updatedAt` of `error.resource` and `replace()` on that
builder: it keeps the keys of the creation and of the move, so neither is duplicated, and
takes a new key for the archive, whose body changed. `expectedUpdatedAt()` on a replacement
asserts the previous price's version, never the product's. The move asserts the product's
own `updatedAt` from the read, so a default another writer chose in between is never
overwritten: the move fails with `stale_resource` and the product in `error.resource`.
A replacement that transfers the previous price's lookup key changes that price, so its
archive with an `expectedUpdatedAt` observed before the transfer is always stale.

### Idempotency

Every write sends an `Idempotency-Key`. The builder generates it once and resends it when
the same builder's terminal is called again, or on a copy that only changed `signal()` or
`timeoutMs()`, so a retry after a timeout is a replay. A key
passed to `idempotencyKey()` is sent as given, on every write of a replacement: the API
keeps a key per operation, so the creation, the move of the default and the archive do not
collide. Retrying the same logical change with the same key, even from a new builder after a
restart, replays each step instead of creating a second replacement. The same key
with a different body fails with `idempotency_conflict`; a write the API refused leaves no
record under its key, so a corrected retry may reuse it.

---

Previous: [Getting started](01-getting-started.md) · Next: [Customers](03-customers.md)
