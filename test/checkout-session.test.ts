import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { callAt, harnessOf, harnessReturning, json, pathOf } from "./support/harness";

describe("scope guard on the checkout route", () => {
  it("signs a checkout body carrying the provider", async () => {
    const { client, calls } = harnessReturning({ id: "checkout_1" });
    await client.request({
      method: "POST",
      path: "/v1/checkouts",
      body: { priceId: "price_1", provider: "trust-my-travel" },
      idempotencyKey: "order-1",
    });
    expect(callAt(calls, 0).body).toMatchObject({ provider: "trust-my-travel" });
  });

  it.each([
    ["another route", "/v1/payments", { provider: "sisp" }, "provider"],
    ["a nested provider", "/v1/checkouts", { customer: { provider: "sisp" } }, "provider"],
    ["a provider account", "/v1/checkouts", { providerAccountId: "pa_1" }, "providerAccountId"],
  ])("refuses %s before signing", async (_label, path, body, field) => {
    const { client, calls } = harnessReturning();
    await expect(
      client.request({ method: "POST", path, body, idempotencyKey: "order-1" }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID, metadata: { field } });
    expect(calls).toHaveLength(0);
  });

  it("refuses a provider in the query of the checkout route", async () => {
    const { client, calls } = harnessReturning();
    await expect(
      client.request({ method: "GET", path: "/v1/checkouts", query: { provider: "sisp" } }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });
});

const created = {
  id: "checkout_1",
  status: "pending",
  provider: "trust-my-travel",
  checkoutUrl: "https://api.bupayment.test/public/v1/checkouts/pay/tok_1",
  reference: "order-1",
  amount: 5800,
  currency: "EUR",
  chargedAmount: null,
  chargedCurrency: null,
  quantity: 2,
  customerId: "customer_1",
  expiresAt: "2026-10-09T12:30:00.000Z",
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
};

describe("one-time checkout", () => {
  it("creates a checkout for a buyer named by email", async () => {
    const { client, calls } = harnessReturning(created);
    const checkout = await client.checkout
      .sessionDraft()
      .priceId("price_1")
      .expectedPrice({ unitAmount: 2900, currency: "EUR" })
      .customerEmail("buyer@example.test")
      .customerName("Ana")
      .quantity(2)
      .destination("default")
      .provider("trust-my-travel")
      .reference("order-1")
      .idempotencyKey("order-1")
      .create();
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/checkouts");
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("order-1");
    expect(callAt(calls, 0).body).toEqual({
      priceId: "price_1",
      expectedPrice: { unitAmount: 2900, currency: "EUR" },
      customer: { email: "buyer@example.test", name: "Ana" },
      quantity: 2,
      destinationKey: "default",
      provider: "trust-my-travel",
      reference: "order-1",
    });
    expect(checkout).toEqual(created);
  });

  it("sends only what was set for an existing customer", async () => {
    const { client, calls } = harnessReturning(created);
    await client.checkout
      .sessionDraft()
      .priceId("price_1")
      .customerId("customer_1")
      .destination("default")
      .idempotencyKey("order-2")
      .create();
    expect(callAt(calls, 0).body).toEqual({
      priceId: "price_1",
      customerId: "customer_1",
      destinationKey: "default",
    });
  });

  it("sends an email customer without a name when none was set", async () => {
    const { client, calls } = harnessReturning(created);
    await client.checkout
      .sessionDraft()
      .priceId("price_1")
      .customerEmail("buyer@example.test")
      .destination("default")
      .idempotencyKey("order-3")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({ customer: { email: "buyer@example.test" } });
    expect((callAt(calls, 0).body as { customer: object }).customer).not.toHaveProperty("name");
  });

  it("reads a checkout by id", async () => {
    const { client, calls } = harnessReturning({
      ...created,
      status: "completed",
      paymentId: "pay_1",
    });
    const checkout = await client.checkout.session("checkout/1").get();
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/checkouts/checkout%2F1");
    expect(checkout.paymentId).toBe("pay_1");
  });

  it("rejects an empty id only when the read is awaited", async () => {
    const { client, calls } = harnessReturning();
    const reader = client.checkout.session("");
    await expect(reader.get()).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("surfaces a changed price with the current one", async () => {
    const current = {
      id: "price_1",
      unitAmount: 3100,
      currency: "EUR",
      active: true,
      updatedAt: "2026-10-09T12:00:00.000Z",
    };
    const { client } = harnessOf(() =>
      json({ error: "price_changed", message: "changed", price: current, statusCode: 409 }, 409),
    );
    await expect(
      client.checkout
        .sessionDraft()
        .priceId("price_1")
        .expectedPrice({ unitAmount: 2900, currency: "EUR" })
        .customerId("customer_1")
        .destination("default")
        .idempotencyKey("order-4")
        .create(),
    ).rejects.toMatchObject({ code: ErrorCode.PRICE_CHANGED, price: current });
  });

  it("surfaces a Live refusal with the API code", async () => {
    const { client } = harnessOf(() =>
      json({ error: "checkout_live_not_enabled", message: "Live", statusCode: 409 }, 409),
    );
    await expect(
      client.checkout
        .sessionDraft()
        .priceId("price_1")
        .customerId("customer_1")
        .destination("default")
        .idempotencyKey("order-5")
        .create(),
    ).rejects.toMatchObject({ status: 409, metadata: { apiError: "checkout_live_not_enabled" } });
  });
});
