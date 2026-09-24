# Agent instructions

## Public API architecture: immutable builders

This SDK uses the builder pattern for every public operation. This is an
architectural invariant, not a local naming preference, and it is shared with
the BuPayment browser SDK.

- Public operation inputs are configured through fluent, immutable builders.
- Every builder instance must be frozen and every configuration method must
  return a new builder without mutating an earlier instance.
- Network requests begin only in an explicit terminal method such as `get()`,
  `all()`, `create()`, `update()`, `remove()`, `cancel()`, `pause()`,
  `resume()`, `evaluate()`, `redeem()`, `calculate()`, `retry()` or
  `reschedule()`.
- Do not replace a builder with an options-object terminal such as
  `create({ customerId, priceId })` or introduce imperative root methods.
- Required input must be represented with TypeScript type-state when practical,
  so the terminal method is unavailable until all required fields are set.
- Method names describe the user's action rather than provider or transport
  details.
- A list entry point is a plural verb, a single-resource entry point is the
  resource noun: `catalogue.products()` and `catalogue.product(id)`.
- A paginated list carries both terminals: `get()` for one page and `all()` for
  an async iterator that captures the query once and only advances the cursor.

Canonical public style:

```ts
const payment = await client.payments
  .create()
  .customerId("cus_1")
  .priceId("price_1")
  .idempotencyKey(orderId)
  .create();
```

Any new public API or breaking public API change must include compile-time and
runtime tests proving builder immutability, terminal side-effect boundaries,
and required type-state. The compile-time proofs live in `test/type-state.ts`,
which is checked by `bun run typecheck`; the runtime proofs live in
`test/builder-contract.test.ts`. Documentation and examples must use the
builder form.

## Scope is fixed by the credential

The authenticated confidential credential fixes the App, workspace and
environment. `assertNoScopeOverrides` runs inside `SignedTransport`, on the
query and on the body as it will be serialized, so every path to the network
passes it. Never move that check up into a wrapper.

## Commit scopes

This repository uses scope-less Conventional Commits: `feat:`, `fix:`, `docs:`,
`test:`, `ci:`, `chore:`, `refactor:`.
