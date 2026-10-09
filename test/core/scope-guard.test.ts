import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { assertNoScopeOverrides, routeBodyFields } from "../../src/core/scope-guard";
import { BuPaymentError } from "../../src/errors";

describe("assertNoScopeOverrides", () => {
  it("accepts a body the credential scope does not contradict", () => {
    expect(() =>
      assertNoScopeOverrides({ customerId: "cus_1", amount: 100, currency: "EUR" }),
    ).not.toThrow();
  });

  it("accepts an absent body", () => {
    expect(() => assertNoScopeOverrides(undefined)).not.toThrow();
  });

  it.each([
    "workspace",
    "workspaceId",
    "environment",
    "environmentId",
    "application",
    "applicationId",
    "app",
    "appId",
    "tenant",
    "tenantId",
    "provider",
    "providerAccountId",
    "providerAccountVersion",
  ])("refuses a body carrying %s", (field) => {
    expect(() => assertNoScopeOverrides({ [field]: "forced" })).toThrow(BuPaymentError);
  });

  it.each([
    "WorkspaceID",
    "workspace_id",
    "WORKSPACE-ID",
    "app_id",
    "Environment_Id",
  ])("refuses %s whatever the casing or separator", (field) => {
    expect(() => assertNoScopeOverrides({ [field]: "forced" })).toThrow(BuPaymentError);
  });

  it("refuses a scope key nested inside an array element", () => {
    expect(() =>
      assertNoScopeOverrides({ allocations: [{ reference: "line_1", provider: "stripe" }] }),
    ).toThrow(BuPaymentError);
  });

  it("refuses a scope key however deeply it is nested", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { appId: "app_other" } } } } } } } };
    expect(() => assertNoScopeOverrides(deep)).toThrow(BuPaymentError);
  });

  it("lets an allowed key through at the top of the body", () => {
    expect(() =>
      assertNoScopeOverrides({ priceId: "price_1", provider: "sisp" }, new Set(["provider"])),
    ).not.toThrow();
  });

  it("refuses an allowed key once it is nested", () => {
    expect(() =>
      assertNoScopeOverrides({ customer: { provider: "sisp" } }, new Set(["provider"])),
    ).toThrow(BuPaymentError);
  });

  it("refuses every other scope key beside an allowed one", () => {
    expect(() =>
      assertNoScopeOverrides(
        { provider: "sisp", providerAccountId: "pa_1" },
        new Set(["provider"]),
      ),
    ).toThrow(BuPaymentError);
  });

  it.each([
    ["POST", "/v1/checkouts", true],
    ["post", "/v1/checkouts", true],
    ["POST", "/v1/payments", false],
    ["GET", "/v1/checkouts", false],
    ["POST", "/v1/checkouts/extra", false],
  ])("allows provider on %s %s: %s", (method, path, allowed) => {
    expect(routeBodyFields(method, path).has("provider")).toBe(allowed);
  });

  it("names the offending field on the error", () => {
    try {
      assertNoScopeOverrides({ appId: "app_other" });
      expect.unreachable("the guard should have refused the body");
    } catch (error) {
      expect(error).toMatchObject({
        code: ErrorCode.REQUEST_INVALID,
        metadata: { field: "appId" },
      });
    }
  });

  it("terminates on a self-referential body", () => {
    const body: Record<string, unknown> = { email: "buyer@example.test" };
    body.self = body;
    expect(() => assertNoScopeOverrides(body)).not.toThrow();
  });
});
