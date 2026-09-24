# Subscriptions

Reads require `subscriptions:read`, mutations `subscriptions:write`. Every operation stays
bound to the App that owns the subscription.

## Creating and reading

```ts
const detail = await client.subscriptions
  .create()
  .customerId("cus_1")
  .name("Gold")
  .priceId("price_1")
  .quantity(1)
  .activeFrom("2026-01-01T00:00:00Z")
  .create();

const subscriptions = await client.subscriptions.list().status("active").get();
const one = await client.subscriptions.subscription("sub_1").get();
```

Activation is a set of named methods rather than a union the caller assembles: `pending()`,
`activeFrom(startsAt)`, or `trialingFrom(startsAt)` followed by `trialEndsAt(endsAt)`, which
only appears once a trial start is set. One of them must complete before `create()` exists.
Reads answer `{ subscription, capabilities }`.

## Lifecycle

Each pause and resume target is its own entry point, carrying exactly the fields that
target requires:

```ts
await client.subscriptions.subscription("sub_1").cancellation().timing("period_end").cancel();

await client.subscriptions
  .subscription("sub_1")
  .pauseSubscription()
  .effectiveTiming("nextRenewal")
  .resumeBillingPolicy("startNewBillingPeriod")
  .pause();

await client.subscriptions
  .subscription("sub_1")
  .pausePaymentCollection()
  .behavior("void")
  .pause();

await client.subscriptions
  .subscription("sub_1")
  .resumePausedSubscription()
  .immediately()
  .billingPolicy("continueExistingBillingPeriod")
  .resume();

await client.subscriptions.subscription("sub_1").resumePendingCancellation().resume();
await client.subscriptions.subscription("sub_1").resumePaymentCollection().resume();
await client.subscriptions.subscription("sub_1").scheduledChange().cancel();
```

Pausing the subscription needs a timing and a resume policy; pausing payment collection
needs a behaviour instead. `scheduledAt(effectiveAt)` replaces `immediately()` for a
scheduled resume. In every case the terminal is absent until that target's own required
fields are set.

## Price migrations

```ts
const migration = await client.subscriptions
  .subscription("sub_1")
  .priceMigration()
  .targetPriceId("price_2")
  .atNextRenewal()
  .prorationPolicy("prorateAtNextRenewal")
  .paymentFailurePolicy("preventChange")
  .create();

await client.priceMigrations.migration(migration.id).approve();
```

Timing is `immediately()`, `atNextRenewal()` or `scheduledAt(effectiveAt)`. The created
migration is a preview: it carries the immediate adjustment, the next renewal, warnings and
provider limitations, and expires. Approve, cancel, retry and settle drive it from there.

```ts
const migrations = await client.priceMigrations.list().status("scheduled").get();

const plan = await client.priceMigrations.migration(migration.id).notificationPlan().get();

await client.priceMigrations
  .migration(migration.id)
  .notificationPlan()
  .version(plan.planVersion)
  .channel("email")
  .retry();

await client.priceMigrations
  .migration(migration.id)
  .notificationPlan()
  .version(plan.planVersion)
  .availableAt("2026-02-01T00:00:00Z")
  .reschedule();
```

---

Previous: [Payments and refunds](05-payments-and-refunds.md) · Next: [Events and webhooks](07-events-and-webhooks.md)
