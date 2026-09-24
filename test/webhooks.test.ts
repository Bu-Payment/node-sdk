import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./support/harness";

describe("events", () => {
  it("lists events by type", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.events.list().type("payment.succeeded").limit(10).get();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/events");
    expect(queryOf(callAt(calls, 0))).toBe("?type=payment.succeeded&limit=10");
  });

  it("walks every event page keeping the type the cursor is bound to", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "evt_1" }], nextCursor: "cur_2" },
      { data: [{ id: "evt_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const event of client.events.list().type("payment.succeeded").all()) {
      collected.push(event.id);
    }
    expect(collected).toEqual(["evt_1", "evt_2"]);
    expect(queryOf(callAt(calls, 1))).toBe("?type=payment.succeeded&cursor=cur_2");
  });

  it("reads one event", async () => {
    const { client, calls } = harnessReturning({ id: "evt_1" });
    await client.events.event("evt_1").get();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/events/evt_1");
  });
});

describe("webhooks", () => {
  it("creates an endpoint with the accumulated event types", async () => {
    const { client, calls } = harnessReturning({ id: "whe_1", secret: "whsec_abc" });
    const endpoint = await client.webhooks
      .createEndpoint()
      .url("https://shop.test/hooks")
      .event("payment.succeeded")
      .event("payment.failed")
      .idempotencyKey("hook-1")
      .create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(callAt(calls, 0).body).toEqual({
      url: "https://shop.test/hooks",
      enabledEvents: ["payment.succeeded", "payment.failed"],
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("hook-1");
    expect(endpoint.secret).toBe("whsec_abc");
  });

  it("lists endpoints as a plain collection with no cursor", async () => {
    const { client, calls } = harnessReturning([{ id: "whe_1" }]);
    const endpoints = await client.webhooks.endpoints().get();
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toBe("/v1/webhook-endpoints");
    expect(queryOf(callAt(calls, 0))).toBe("");
    expect(endpoints).toHaveLength(1);
  });

  it("reads, updates and removes one endpoint", async () => {
    const { client, calls } = harnessReturning({}, {}, { id: "whe_1", deleted: true });
    await client.webhooks.endpoint("whe_1").get();
    await client.webhooks.endpoint("whe_1").status("disabled").update();
    await client.webhooks.endpoint("whe_1").idempotencyKey("drop-1").remove();
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH", "DELETE"]);
    expect(callAt(calls, 1).body).toEqual({ status: "disabled" });
    expect(callAt(calls, 2).headers["Idempotency-Key"]).toBe("drop-1");
  });

  it("lists deliveries filtered by status and retries one", async () => {
    const { client, calls } = harnessReturning([], { id: "whd_1", status: "pending" });
    await client.webhooks.deliveries().status("failed").limit(100).get();
    const retry = await client.webhooks.delivery("whd_1").retry();
    expect(queryOf(callAt(calls, 0))).toBe("?status=failed&limit=100");
    expect(callAt(calls, 1).method).toBe("POST");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/webhook-deliveries/whd_1/retry");
    expect(retry.status).toBe("pending");
  });
});
