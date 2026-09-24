import { describe, expect, it } from "vitest";
import { harnessReturning, pathOf, queryOf } from "./harness";

describe("WebhookEndpointsResource", () => {
  it("creates an endpoint and surfaces the signing secret once", async () => {
    const { client, calls } = harnessReturning({ id: "whe_1", secret: "whsec_abc" });
    const endpoint = await client.webhookEndpoints.create({
      url: "https://shop.test/hooks",
      enabledEvents: ["payment.succeeded"],
    });
    expect(pathOf(calls[0] as never)).toBe("/v1/webhook-endpoints");
    expect(endpoint.secret).toBe("whsec_abc");
  });

  it("lists endpoints as a plain collection without a cursor", async () => {
    const { client, calls } = harnessReturning([{ id: "whe_1" }]);
    const endpoints = await client.webhookEndpoints.list();
    expect(pathOf(calls[0] as never)).toBe("/v1/webhook-endpoints");
    expect(queryOf(calls[0] as never)).toBe("");
    expect(endpoints).toHaveLength(1);
  });

  it("reads, updates and deletes one endpoint", async () => {
    const { client, calls } = harnessReturning({}, {}, { id: "whe_1", deleted: true });
    await client.webhookEndpoints.get("whe_1");
    await client.webhookEndpoints.update("whe_1", { status: "disabled" });
    await client.webhookEndpoints.remove("whe_1");
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH", "DELETE"]);
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/webhook-endpoints/whe_1",
      "/v1/webhook-endpoints/whe_1",
      "/v1/webhook-endpoints/whe_1",
    ]);
    expect(calls[2]?.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
  });
});

describe("WebhookDeliveriesResource", () => {
  it("lists deliveries filtered by status", async () => {
    const { client, calls } = harnessReturning([]);
    await client.webhookDeliveries.list({ status: "failed" });
    expect(pathOf(calls[0] as never)).toBe("/v1/webhook-deliveries");
    expect(queryOf(calls[0] as never)).toBe("?status=failed");
  });

  it("reads and retries one delivery", async () => {
    const { client, calls } = harnessReturning({}, { id: "whd_1", status: "pending" });
    await client.webhookDeliveries.get("whd_1");
    const retry = await client.webhookDeliveries.retry("whd_1");
    expect(pathOf(calls[1] as never)).toBe("/v1/webhook-deliveries/whd_1/retry");
    expect(retry.status).toBe("pending");
  });
});
