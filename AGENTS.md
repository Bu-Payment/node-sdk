# Agent instructions

## Public API architecture: immutable builders

This SDK uses the builder pattern for every public operation. This is an
architectural invariant, not a local naming preference, and it is shared with
the BuPayment browser SDK.

- Public operation inputs are configured through fluent, immutable builders.
- Every builder instance must be frozen and every configuration method must
  return a new builder without mutating an earlier instance.
- Network requests begin only in an explicit terminal method. The terminal names
  the action the caller is taking: `get()`, `all()`, `create()`, `update()`,
  `remove()`, `cancel()`, `pause()`, `resume()`, `approve()`, `settle()`,
  `evaluate()`, `redeem()`, `calculate()`, `retry()`, `reschedule()`. The set is
  open, but a new terminal must be a verb for what the caller asked for, never a
  transport detail.
- An entry point must never issue a request. Build the path lazily inside the
  terminal: `encodePathSegment` throws on an empty segment, and that rejection
  belongs to the awaited call, not to the lookup expression.
- Do not replace a builder with an options-object terminal such as
  `create({ customerId, priceId })` or introduce imperative root methods.
- Required input must be represented with TypeScript type-state when practical,
  so the terminal method is unavailable until all required fields are set.
- Express type-state by omitting the method, intersecting with `object` when it
  does not apply. Never return `never` from a method that should not be
  reachable: the call then compiles, and the diagnostic blames whatever is
  chained after it instead of the method that is missing.
- An idempotency key belongs on the builder whose terminal consumes it, never on
  a resource builder that several operations branch from.
- A configuration method takes one value. Two positional values of the same type
  can be swapped silently; split them into named methods and gate the second on
  the first.
- Method names describe the user's action rather than provider or transport
  details.
- A domain holding one resource names its list `list()` and its record by the
  resource noun: `customers.list()` and `customers.customer(id)`. A domain
  holding several names each in the plural and each record in the singular:
  `catalogue.products()` and `catalogue.product(id)`. The creation entry is
  `create()` where the domain creates one thing and names the thing where it
  creates several: `webhooks.createEndpoint()`.
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
