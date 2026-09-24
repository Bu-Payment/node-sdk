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
