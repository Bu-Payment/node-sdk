import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { assertNoScopeOverrides } from "../../src/core/scope-guard";
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
    "workspaceId",
    "environmentId",
    "applicationId",
    "appId",
    "tenantId",
    "provider",
    "providerAccountId",
    "providerAccountVersion",
  ])("refuses a body carrying %s", (field) => {
    expect(() => assertNoScopeOverrides({ [field]: "forced" })).toThrow(BuPaymentError);
  });

  it("refuses a scope key whatever its casing", () => {
    expect(() => assertNoScopeOverrides({ WorkspaceID: "forced" })).toThrow(BuPaymentError);
  });

  it("refuses a scope key nested inside an array element", () => {
    expect(() =>
      assertNoScopeOverrides({ allocations: [{ reference: "line_1", provider: "stripe" }] }),
    ).toThrow(BuPaymentError);
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

  it("stops descending past the supported nesting depth", () => {
    const deep = { a: { b: { c: { d: { e: { f: { appId: "app_other" } } } } } } };
    expect(() => assertNoScopeOverrides(deep)).not.toThrow();
  });
});
