import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

describe("WebhookEndpointsResource", () => {
  it("creates an endpoint and surfaces the signing secret once", async () => {
    const { client, calls } = harnessReturning({ id: "whe_1", secret: "whsec_abc" });
    const endpoint = await client.webhookEndpoints.create(
      { url: "https://shop.test/hooks", enabledEvents: ["payment.succeeded"] },
      "key-create",
    );
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/webhook-endpoints");
    expect(callAt(calls, 0).body).toEqual({
      url: "https://shop.test/hooks",
      enabledEvents: ["payment.succeeded"],
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-create");
    expect(endpoint.secret).toBe("whsec_abc");
  });

  it("lists endpoints as a plain collection without a cursor", async () => {
    const { client, calls } = harnessReturning([{ id: "whe_1" }]);
    const endpoints = await client.webhookEndpoints.list();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/webhook-endpoints");
    expect(queryOf(callAt(calls, 0))).toBe("");
    expect(endpoints).toHaveLength(1);
  });

  it("reads, updates and deletes one endpoint", async () => {
    const { client, calls } = harnessReturning({}, {}, { id: "whe_1", deleted: true });
    await client.webhookEndpoints.get("whe_1");
    await client.webhookEndpoints.update("whe_1", { status: "disabled" }, "key-update");
    await client.webhookEndpoints.remove("whe_1", "key-remove");
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH", "DELETE"]);
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/webhook-endpoints/whe_1",
      "/v1/webhook-endpoints/whe_1",
      "/v1/webhook-endpoints/whe_1",
    ]);
    expect(callAt(calls, 1).body).toEqual({ status: "disabled" });
    expect(callAt(calls, 1).headers["Idempotency-Key"]).toBe("key-update");
    expect(callAt(calls, 2).headers["Idempotency-Key"]).toBe("key-remove");
  });
});

describe("WebhookDeliveriesResource", () => {
  it("lists deliveries filtered by status", async () => {
    const { client, calls } = harnessReturning([]);
    await client.webhookDeliveries.list({ status: "failed" });
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/webhook-deliveries");
    expect(queryOf(callAt(calls, 0))).toBe("?status=failed");
  });

  it("reads and retries one delivery", async () => {
    const { client, calls } = harnessReturning({}, { id: "whd_1", status: "pending" });
    await client.webhookDeliveries.get("whd_1");
    const retry = await client.webhookDeliveries.retry("whd_1", "key-retry");
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(pathOf(callAt(calls, 1))).toBe("/v1/webhook-deliveries/whd_1/retry");
    expect(callAt(calls, 1).headers["Idempotency-Key"]).toBe("key-retry");
    expect(retry.status).toBe("pending");
  });
});
