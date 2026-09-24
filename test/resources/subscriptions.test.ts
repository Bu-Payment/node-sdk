import { describe, expect, it } from "vitest";
import { harnessReturning, pathOf, queryOf } from "./harness";

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
    expect(pathOf(calls[0] as never)).toBe("/v1/subscriptions");
    expect(calls[0]?.body).toEqual({
      customerId: "cus_1",
      name: "Gold",
      priceId: "price_1",
      activation: { state: "pending" },
    });
  });

  it("lists subscriptions by customer and status", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.subscriptions.list({ customerId: "cus_1", status: "active" });
    expect(queryOf(calls[0] as never)).toBe("?customerId=cus_1&status=active");
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
    expect(queryOf(calls[1] as never)).toBe("?status=active&cursor=cur_2");
  });

  it("reads one subscription", async () => {
    const { client, calls } = harnessReturning(detail);
    await client.subscriptions.get("sub_1");
    expect(pathOf(calls[0] as never)).toBe("/v1/subscriptions/sub_1");
  });

  it("drives the lifecycle operations on their own routes", async () => {
    const { client, calls } = harnessReturning(detail, detail, detail, detail);
    await client.subscriptions.cancel("sub_1", { timing: "period_end" });
    await client.subscriptions.pause("sub_1", {
      target: "payment_collection",
      behavior: "void",
    });
    await client.subscriptions.resume("sub_1", { target: "pending_cancellation" });
    await client.subscriptions.cancelScheduledChange("sub_1");
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscriptions/sub_1/cancel",
      "/v1/subscriptions/sub_1/pause",
      "/v1/subscriptions/sub_1/resume",
      "/v1/subscriptions/sub_1/scheduled-change/cancel",
    ]);
    expect(calls.every((call) => call.headers["Idempotency-Key"] !== undefined)).toBe(true);
  });

  it("opens a price migration under the subscription", async () => {
    const { client, calls } = harnessReturning({ id: "mig_1" });
    await client.subscriptions.createPriceMigration("sub_1", {
      targetPriceId: "price_2",
      timing: { kind: "immediate" },
      prorationPolicy: "prorateImmediately",
      paymentFailurePolicy: "preventChange",
    });
    expect(pathOf(calls[0] as never)).toBe("/v1/subscriptions/sub_1/price-migrations");
  });
});

describe("SubscriptionPriceMigrationsResource", () => {
  it("lists and reads migrations", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null, hasMore: false },
      { id: "mig_1" },
    );
    await client.subscriptionPriceMigrations.list({ subscriptionId: "sub_1", status: "applied" });
    await client.subscriptionPriceMigrations.get("mig_1");
    expect(pathOf(calls[0] as never)).toBe("/v1/subscription-price-migrations");
    expect(queryOf(calls[0] as never)).toBe("?subscriptionId=sub_1&status=applied");
    expect(pathOf(calls[1] as never)).toBe("/v1/subscription-price-migrations/mig_1");
  });

  it("walks every migration page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "mig_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "mig_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const migration of client.subscriptionPriceMigrations.listAll()) {
      collected.push(migration.id);
    }
    expect(collected).toEqual(["mig_1", "mig_2"]);
  });

  it("drives every migration mutation on its own route", async () => {
    const { client, calls } = harnessReturning({}, {}, {}, {});
    await client.subscriptionPriceMigrations.approve("mig_1");
    await client.subscriptionPriceMigrations.cancel("mig_1");
    await client.subscriptionPriceMigrations.retry("mig_1");
    await client.subscriptionPriceMigrations.settle("mig_1");
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscription-price-migrations/mig_1/approve",
      "/v1/subscription-price-migrations/mig_1/cancel",
      "/v1/subscription-price-migrations/mig_1/retry",
      "/v1/subscription-price-migrations/mig_1/settle",
    ]);
  });

  it("reads and retries a notification plan on the versioned channel route", async () => {
    const { client, calls } = harnessReturning({}, {}, {});
    await client.subscriptionPriceMigrations.notificationPlan("mig_1");
    await client.subscriptionPriceMigrations.retryNotification("mig_1", 3, "email");
    await client.subscriptionPriceMigrations.rescheduleNotification("mig_1", 3, {
      availableAt: "2026-01-01T00:00:00Z",
    });
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscription-price-migrations/mig_1/notification-plan",
      "/v1/subscription-price-migrations/mig_1/notification-plans/3/channels/email/retry",
      "/v1/subscription-price-migrations/mig_1/notification-plans/3/reschedule",
    ]);
    expect(calls[2]?.body).toEqual({ availableAt: "2026-01-01T00:00:00Z" });
  });
});
