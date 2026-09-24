import { describe, expect, it } from "vitest";
import { ErrorCode, Header } from "../../src/constants";
import { callAt, harnessOf, harnessReturning, json } from "./harness";

describe("app-scoped isolation", () => {
  it("signs every commerce request with the confidential credential", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null }, { id: "pay_1" });
    await client.products.list();
    await client.payments.create({ customerId: "cus_1", priceId: "price_1" });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers[Header.SIGNATURE]).toMatch(/^[0-9a-f]{64}$/u);
      expect(call.headers[Header.APP_ID]).toBe(client.applicationId);
      expect(call.headers[Header.KEY_ID]).toBeDefined();
      expect(call.headers[Header.NONCE]).toBeDefined();
    }
  });

  it("surfaces another App's resource as an opaque not-found", async () => {
    const { client } = harnessOf(() =>
      json({ error: "not_found", message: "Payment not found" }, 404),
    );
    await expect(client.payments.get("pay_owned_by_another_app")).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
      status: 404,
    });
  });

  it("surfaces a missing capability as a capability denial", async () => {
    const { client } = harnessOf(() =>
      json({ error: "application_capability_denied", message: "refunds:write is required" }, 403),
    );
    await expect(client.refunds.create({ paymentId: "pay_1" })).rejects.toMatchObject({
      code: ErrorCode.APPLICATION_CAPABILITY_DENIED,
      status: 403,
    });
  });

  it("surfaces a cursor rebound to another filter as an invalid request", async () => {
    const { client } = harnessOf(() =>
      json({ error: "invalid_request", message: "Product cursor is invalid" }, 400),
    );
    await expect(
      client.products.list({ cursor: "cursor-from-another-filter" }),
    ).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
      status: 400,
      metadata: { apiError: "invalid_request" },
    });
  });

  it("refuses a body that tries to widen the authenticated scope", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await expect(
      client.request({
        method: "POST",
        path: "/v1/customers",
        body: { email: "buyer@example.test", appId: "app_other" },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("refuses a provider override on a payment", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await expect(
      client.request({
        method: "POST",
        path: "/v1/payments",
        body: { customerId: "cus_1", priceId: "price_1", provider: "stripe" },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("refuses a scope override smuggled through the query string", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await expect(
      client.subscriptions.list({ limit: 5, appId: "app_other" } as never),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("refuses a scope override a body only reveals when it is serialized", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    const draft = {
      email: "buyer@example.test",
      toJSON: () => ({ email: "buyer@example.test", appId: "app_other" }),
    };
    await expect(
      client.request({ method: "POST", path: "/v1/customers", body: draft }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("never sends the environment as request data", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.events.list({ type: "payment.succeeded" });
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).url).toBe(
      "https://api.bupayment.test/v1/events?type=payment.succeeded",
    );
    expect(callAt(calls, 0).body).toBeUndefined();
  });
});
