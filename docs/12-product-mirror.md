# Product mirror

An application that keeps its own catalogue, and mirrors each local product into BuPayment,
needs the same few steps for every product: find it, create it when it is missing, and bring
its name and state in line. `catalogue.productMirror(lookupKey)` takes those steps with the
catalogue builders described in [Catalogue](02-catalogue.md), so it needs `catalogue:read` and
`catalogue:write`.

```ts
const result = await client.catalogue
  .productMirror(lookupKey)
  .knownId(storedProductId)
  .name(title)
  .active(isActive)
  .defaultUnitAmount(100)
  .defaultCurrency("EUR")
  .idempotencyKey(`mirror-${lookupKey}`)
  .ensure();

await localProducts.saveRemoteId(lookupKey, result.product.id);
```

`lookupKey` is the natural key of the local product, and it identifies the mirror: the SDK
stores nothing between calls, so save `result.product.id` and pass it to `knownId()` next time.

| Method | Required | Effect |
| --- | --- | --- |
| `name(name)` | yes | The product's name; a product with another name is renamed. |
| `idempotencyKey(key)` | yes | The base every write derives its key from. |
| `knownId(id)` | no | The product id saved from an earlier run, read before any lookup. |
| `active(active)` | no | The state to hold; without it the product keeps its state. |
| `defaultUnitAmount(amount)` | no | The amount of the price created for a product with no price. |
| `defaultCurrency(currency)` | with the amount | Appears after `defaultUnitAmount()`, and `ensure()` waits for it. |

`ensure()` does not exist until `name()` and `idempotencyKey()` are set, and not while a
default amount is missing its currency. The entry and every configuration method send no
request; an empty lookup key, an empty known id or a malformed key rejects the `ensure()`
call instead, before anything is sent.

## Steps

1. With `knownId()`, reads the product by id. A product unknown to the App, or one that holds
   another lookup key or none, moves on to the lookup and is left untouched; any other failure
   rejects.
2. Looks the lookup key up among the active products, then among the archived ones.
3. When nothing holds the key, creates the product with its name and lookup key. A creation
   refused with `lookup_key_conflict` takes the holder the API names when it holds this
   lookup key, so two writers racing on one key settle on one product. A conflict that names
   no holder, or a holder of another key, rejects.
4. With `active(true)`, reactivates an archived product.
5. With a default price, creates it on an active product that has no default price and none
   of the App's prices, active or archived, then reads the product again. The first price of a product becomes
   its default, so no separate default price change is needed.
6. Renames the product when its name differs.
7. With `active(false)`, archives an active product. A product mirrored archived is created
   active first, so it can take its default price before the archive. Until the archive
   succeeds the product is active, so retry an `ensure()` that rejected at this step.

Every rename, archive and reactivation asserts the `updatedAt` it last observed. A product
another writer changed in between rejects with `stale_resource` and the current product in
`error.resource`; nothing after that step runs.

## Result

```ts
interface ProductMirrorResult {
  product: Product;
  outcome: "found" | "recovered" | "created";
  changes: ("priced" | "renamed" | "archived" | "reactivated")[];
}
```

- `found`: the product was read by its known id, or by its lookup key when no id was given.
- `recovered`: the known id was not found or holds another lookup key or none, and the lookup
  key led to the product, so the saved id is out of date and should be replaced with
  `result.product.id`.
- `created`: no product held the lookup key, and `ensure()` created it.

`changes` lists the writes this call made, in order. `priced` means the default price was
created. `product` is the product as the last step answered it.

## Idempotency

The key passed to `idempotencyKey()` is a base, never sent as it is. Each write sends a key
derived from it, `<base>:<step>:<digest>`, where the digest is an opaque hash of what the step
depends on:

| Write | Step | The digest covers |
| --- | --- | --- |
| Product creation | `create-product` | the lookup key and the name |
| Default price creation | `create-price` | the product id |
| Rename | `rename` | the product id, its `updatedAt` and the name |
| Archive, reactivation | `archive`, `reactivate` | the product id and its `updatedAt` |

The derivation is deterministic, so a retry with the same base and the same input, on the same
builder or on a new one after a restart, repeats each step under the key it used the first
time. After a timeout or a network failure, call `ensure()` again: a creation the API stored
replays instead of creating a second product or price, and a step that was never stored runs
now. A changed name gets a key of its own, and the lookup that runs first finds a product that
was created. A changed amount or currency keeps the key, so while the API still holds a price
creation it was not yet visible to the read before, the retry fails with
`idempotency_conflict` instead of creating a second price.

A write whose body carries a version takes that version into its key. A later sync that
renames, archives or reactivates the same product again, under the same base, reads a newer
version and so sends a new key, instead of replaying a key the API already stored with a
different body. A stable base such as `mirror-${lookupKey}` therefore serves every sync of a
product. A base too long to take the suffix within the 255 characters of a key is replaced by
its digest.

A creation is the exception. While the API still holds the key of a product creation, a
product whose lookup key was cleared in the meantime is replayed under it instead of being
created again; use a new base after clearing a mirrored product's lookup key. The default
price is taken only when the product gets its first price; change it afterwards with
`priceDraft(productId).unitAmount(amount).currency(currency).replacing(priceId).replace()`.

---

Previous: [Sales](11-sales.md) · Next: [Index](00-index.md)
