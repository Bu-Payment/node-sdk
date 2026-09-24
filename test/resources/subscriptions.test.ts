import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

const detail = { subscription: { id: "sub_1" }, capabilities: {} };

describe("SubscriptionsResource", () => {
  it("creates a subscription against a canonical price", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.create({
      customerId: "cus_1",
      name: "Gold",
      priceId: "price_1",
      activation: { state: "pending" },
    });
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions");
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      name: "Gold",
      priceId: "price_1",
      activation: { state: "pending" },
    });
  });

  it("lists subscriptions by customer and status", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.subscriptions.list({ customerId: "cus_1", status: "active" });
    expect(calls).toHaveLength(1);
    expect(queryOf(callAt(calls, 0))).toBe("?customerId=cus_1&status=active");
  });

  it("walks every subscription page keeping the status filter", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "sub_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "sub_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const subscription of client.subscriptions.listAll({ status: "active" })) {
      collected.push(subscription.id);
    }
    expect(collected).toEqual(["sub_1", "sub_2"]);
    expect(queryOf(callAt(calls, 1))).toBe("?status=active&cursor=cur_2");
  });

  it("reads one subscription", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.get("sub_1");
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1");
  });

  it("posts the cancellation timing to the cancel route", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.cancel("sub_1", { timing: "period_end" }, "key-cancel");
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/cancel");
    expect(callAt(calls, 0).body).toEqual({ timing: "period_end" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-cancel");
  });

  it("posts the whole pause policy to the pause route", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.pause(
      "sub_1",
      {
        target: "subscription",
        effectiveTiming: "nextRenewal",
        resumeBillingPolicy: "startNewBillingPeriod",
      },
      "key-pause",
    );
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/pause");
    expect(callAt(calls, 0).body).toEqual({
      target: "subscription",
      effectiveTiming: "nextRenewal",
      resumeBillingPolicy: "startNewBillingPeriod",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-pause");
  });

  it("posts the whole resume policy to the resume route", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.resume("sub_1", {
      target: "paused_subscription",
      effectiveTiming: "scheduled",
      effectiveAt: "2026-02-01T00:00:00Z",
      billingPolicy: "continueExistingBillingPeriod",
    });
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/resume");
    expect(callAt(calls, 0).body).toEqual({
      target: "paused_subscription",
      effectiveTiming: "scheduled",
      effectiveAt: "2026-02-01T00:00:00Z",
      billingPolicy: "continueExistingBillingPeriod",
    });
  });

  it("cancels a scheduled change with no body", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.cancelScheduledChange("sub_1", "key-scheduled");
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/scheduled-change/cancel");
    expect(callAt(calls, 0).body).toBeUndefined();
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-scheduled");
  });

  it("opens a price migration under the subscription", async () => {
    const { client, calls } = harnessReturning({ id: "mig_1" });
    await client.subscriptions.createPriceMigration(
      "sub_1",
      {
        targetPriceId: "price_2",
        timing: { kind: "immediate" },
        prorationPolicy: "prorateImmediately",
        paymentFailurePolicy: "preventChange",
      },
      "key-migration",
    );
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscriptions/sub_1/price-migrations");
    expect(callAt(calls, 0).body).toEqual({
      targetPriceId: "price_2",
      timing: { kind: "immediate" },
      prorationPolicy: "prorateImmediately",
      paymentFailurePolicy: "preventChange",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-migration");
  });
});
