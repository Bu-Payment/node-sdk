# Subscriptions

Reads require `subscriptions:read`, mutations `subscriptions:write`. Every operation stays
bound to the App that owns the subscription.

## Creating and reading

```ts
const detail = await client.subscriptions.create({
  customerId: "cus_1",
  name: "Gold",
  priceId: "price_1",
  quantity: 1,
  activation: { state: "active", startsAt: "2026-01-01T00:00:00Z" },
});

const subscriptions = await client.subscriptions.list({ status: "active" });
const one = await client.subscriptions.get("sub_1");
```

`activation` is a discriminated union: `pending`, `active` with `startsAt`, or `trialing`
with `startsAt` and `trialEndsAt`. Reads answer `{ subscription, capabilities }`.

## Lifecycle

```ts
await client.subscriptions.cancel("sub_1", { timing: "period_end" });

await client.subscriptions.pause("sub_1", {
  target: "subscription",
  effectiveTiming: "nextRenewal",
  resumeBillingPolicy: "startNewBillingPeriod",
});

await client.subscriptions.resume("sub_1", {
  target: "paused_subscription",
  effectiveTiming: "immediate",
  billingPolicy: "continueExistingBillingPeriod",
});

await client.subscriptions.cancelScheduledChange("sub_1");
```

Pausing the subscription needs a timing and a resume policy; pausing payment collection
needs a behaviour instead. Resuming a paused subscription on a schedule needs
`effectiveAt`. The types enforce each combination.

## Price migrations

```ts
const migration = await client.subscriptions.createPriceMigration("sub_1", {
  targetPriceId: "price_2",
  timing: { kind: "nextRenewal" },
  prorationPolicy: "prorateAtNextRenewal",
  paymentFailurePolicy: "preventChange",
});

await client.subscriptionPriceMigrations.approve(migration.id);
```

The created migration is a preview: it carries the immediate adjustment, the next renewal,
warnings and provider limitations, and expires. Approve, cancel, retry and settle drive it
from there.

```ts
const migrations = await client.subscriptionPriceMigrations.list({ status: "scheduled" });
const plan = await client.subscriptionPriceMigrations.notificationPlan(migration.id);

await client.subscriptionPriceMigrations.retryNotification(migration.id, plan.planVersion, "email");
await client.subscriptionPriceMigrations.rescheduleNotification(migration.id, plan.planVersion, {
  availableAt: "2026-02-01T00:00:00Z",
});
```

---

Previous: [Payments and refunds](05-payments-and-refunds.md) · Next: [Events and webhooks](07-events-and-webhooks.md)
