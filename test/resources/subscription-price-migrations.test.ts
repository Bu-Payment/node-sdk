import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

describe("SubscriptionPriceMigrationsResource", () => {
  it("lists and reads migrations", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null, hasMore: false },
      { id: "mig_1" },
    );
    await client.subscriptionPriceMigrations.list({ subscriptionId: "sub_1", status: "applied" });
    await client.subscriptionPriceMigrations.get("mig_1");
    expect(calls).toHaveLength(2);
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscription-price-migrations");
    expect(queryOf(callAt(calls, 0))).toBe("?subscriptionId=sub_1&status=applied");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/subscription-price-migrations/mig_1");
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

  it("posts every migration mutation to its own route with the caller's key", async () => {
    const { client, calls } = harnessReturning({}, {}, {}, {});
    await client.subscriptionPriceMigrations.approve("mig_1", "key-approve");
    await client.subscriptionPriceMigrations.cancel("mig_1", "key-cancel");
    await client.subscriptionPriceMigrations.retry("mig_1", "key-retry");
    await client.subscriptionPriceMigrations.settle("mig_1", "key-settle");
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "POST", "POST"]);
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscription-price-migrations/mig_1/approve",
      "/v1/subscription-price-migrations/mig_1/cancel",
      "/v1/subscription-price-migrations/mig_1/retry",
      "/v1/subscription-price-migrations/mig_1/settle",
    ]);
    expect(calls.map((call) => call.headers["Idempotency-Key"])).toEqual([
      "key-approve",
      "key-cancel",
      "key-retry",
      "key-settle",
    ]);
  });

  it("reads and drives a notification plan on the versioned channel routes", async () => {
    const { client, calls } = harnessReturning({}, {}, {});
    await client.subscriptionPriceMigrations.notificationPlan("mig_1");
    await client.subscriptionPriceMigrations.retryNotification("mig_1", 3, "email", "key-retry");
    await client.subscriptionPriceMigrations.rescheduleNotification(
      "mig_1",
      3,
      { availableAt: "2026-01-01T00:00:00Z" },
      "key-reschedule",
    );
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "POST"]);
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/subscription-price-migrations/mig_1/notification-plan",
      "/v1/subscription-price-migrations/mig_1/notification-plans/3/channels/email/retry",
      "/v1/subscription-price-migrations/mig_1/notification-plans/3/reschedule",
    ]);
    expect(callAt(calls, 1).headers["Idempotency-Key"]).toBe("key-retry");
    expect(callAt(calls, 2).body).toEqual({ availableAt: "2026-01-01T00:00:00Z" });
    expect(callAt(calls, 2).headers["Idempotency-Key"]).toBe("key-reschedule");
  });

  it("encodes a channel name that is not a bare identifier", async () => {
    const { client, calls } = harnessReturning({});
    await client.subscriptionPriceMigrations.retryNotification("mig_1", 3, "in app");
    expect(callAt(calls, 0).url).toContain("/channels/in%20app/retry");
  });
});
