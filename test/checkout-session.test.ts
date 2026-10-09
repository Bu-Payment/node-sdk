import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { callAt, harnessReturning } from "./support/harness";

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
