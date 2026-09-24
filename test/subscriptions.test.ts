import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./support/harness";

const detail = { subscription: { id: "sub_1" }, capabilities: {} };

describe("subscriptions", () => {
  it("creates a subscription against a canonical price", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions
      .create()
      .customerId("cus_1")
      .name("Gold")
      .priceId("price_1")
      .quantity(2)
      .activeFrom("2026-01-01T00:00:00Z")
      .create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions");
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      name: "Gold",
      priceId: "price_1",
      quantity: 2,
      activation: { state: "active", startsAt: "2026-01-01T00:00:00Z" },
    });
  });

  it("carries a trial activation with both of its dates", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions
      .create()
      .customerId("cus_1")
      .name("Gold")
      .priceId("price_1")
      .trialing("2026-01-01T00:00:00Z", "2026-01-15T00:00:00Z")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({
      activation: {
        state: "trialing",
        startsAt: "2026-01-01T00:00:00Z",
        trialEndsAt: "2026-01-15T00:00:00Z",
      },
    });
  });

  it("lists subscriptions by customer and status", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.subscriptions.list().customerId("cus_1").status("active").get();
    expect(queryOf(callAt(calls, 0))).toBe("?customerId=cus_1&status=active");
  });

  it("posts the cancellation timing to the cancel route", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions
      .subscription("sub_1")
      .cancellation()
      .timing("period_end")
      .idempotencyKey("cancel-1")
      .cancel();
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/cancel");
    expect(callAt(calls, 0).body).toEqual({ timing: "period_end" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("cancel-1");
  });

  it("names the pause target the caller chose", async () => {
    const { client, calls } = harnessReturning(detail, detail);
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
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscriptions/sub_1/pause",
      "/v1/subscriptions/sub_1/pause",
    ]);
    expect(callAt(calls, 0).body).toEqual({
      target: "subscription",
      effectiveTiming: "nextRenewal",
      resumeBillingPolicy: "startNewBillingPeriod",
    });
    expect(callAt(calls, 1).body).toEqual({ target: "payment_collection", behavior: "void" });
  });

  it("names the resume target the caller chose", async () => {
    const { client, calls } = harnessReturning(detail, detail, detail);
    await client.subscriptions.subscription("sub_1").resumePendingCancellation().resume();
    await client.subscriptions.subscription("sub_1").resumePaymentCollection().resume();
    await client.subscriptions
      .subscription("sub_1")
      .resumePausedSubscription()
      .scheduledAt("2026-02-01T00:00:00Z")
      .billingPolicy("continueExistingBillingPeriod")
      .resume();
    expect(callAt(calls, 0).body).toEqual({ target: "pending_cancellation" });
    expect(callAt(calls, 1).body).toEqual({ target: "payment_collection" });
    expect(callAt(calls, 2).body).toEqual({
      target: "paused_subscription",
      effectiveTiming: "scheduled",
      effectiveAt: "2026-02-01T00:00:00Z",
      billingPolicy: "continueExistingBillingPeriod",
    });
  });

  it("cancels a scheduled change with no body", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.subscription("sub_1").cancelScheduledChange();
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/scheduled-change/cancel");
    expect(callAt(calls, 0).body).toBeUndefined();
  });

  it("opens a price migration under the subscription", async () => {
    const { client, calls } = harnessReturning({ id: "mig_1" });
    await client.subscriptions
      .subscription("sub_1")
      .priceMigration()
      .targetPriceId("price_2")
      .atNextRenewal()
      .prorationPolicy("prorateAtNextRenewal")
      .paymentFailurePolicy("preventChange")
      .create();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/price-migrations");
    expect(callAt(calls, 0).body).toEqual({
      targetPriceId: "price_2",
      timing: { kind: "nextRenewal" },
      prorationPolicy: "prorateAtNextRenewal",
      paymentFailurePolicy: "preventChange",
    });
  });
});

describe("price migrations", () => {
  it("lists and reads migrations", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null, hasMore: false },
      { id: "mig_1" },
    );
    await client.priceMigrations.list().subscriptionId("sub_1").status("applied").get();
    await client.priceMigrations.migration("mig_1").get();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscription-price-migrations");
    expect(queryOf(callAt(calls, 0))).toBe("?subscriptionId=sub_1&status=applied");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/subscription-price-migrations/mig_1");
  });

  it("posts every mutation to its own route with the caller's key", async () => {
    const { client, calls } = harnessReturning({}, {}, {}, {});
    const migration = client.priceMigrations.migration("mig_1").idempotencyKey("mig-key");
    await migration.approve();
    await migration.cancel();
    await migration.retry();
    await migration.settle();
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "POST", "POST"]);
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscription-price-migrations/mig_1/approve",
      "/v1/subscription-price-migrations/mig_1/cancel",
      "/v1/subscription-price-migrations/mig_1/retry",
      "/v1/subscription-price-migrations/mig_1/settle",
    ]);
    expect(calls.every((call) => call.headers["Idempotency-Key"] === "mig-key")).toBe(true);
  });

  it("drives the notification plan on the versioned routes", async () => {
    const { client, calls } = harnessReturning({}, {}, {});
    const plan = client.priceMigrations.migration("mig_1").notificationPlan();
    await plan.get();
    await plan.version(3).channel("in app").retry();
    await plan.version(3).availableAt("2026-02-01T00:00:00Z").reschedule();
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "POST"]);
    expect(pathOf(callAt(calls, 0))).toBe(
      "/v1/subscription-price-migrations/mig_1/notification-plan",
    );
    expect(callAt(calls, 1).url).toContain("/notification-plans/3/channels/in%20app/retry");
    expect(pathOf(callAt(calls, 2))).toBe(
      "/v1/subscription-price-migrations/mig_1/notification-plans/3/reschedule",
    );
    expect(callAt(calls, 2).body).toEqual({ availableAt: "2026-02-01T00:00:00Z" });
  });
});
