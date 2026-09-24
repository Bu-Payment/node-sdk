import { describe, expect, it } from "vitest";
import type { BillingCapabilities, BillingChangeCapabilities } from "../src/billing/types";
import { ErrorCode, Header } from "../src/constants";
import { callAt, harnessReturning, harnessStalling, pathOf, queryOf } from "./support/harness";

const noChanges: BillingChangeCapabilities = {
  preview: false,
  effectiveTimings: [],
  prorationPolicies: [],
  paymentFailurePolicies: [],
  supportsCurrencyChange: false,
  supportsBillingPeriodChange: false,
};

const unconfigured: BillingCapabilities = {
  configured: false,
  customers: { create: true, update: true, synchronize: false },
  subscriptions: {
    itemIdentity: "none",
    create: { checkout: false, direct: false },
    changePrice: noChanges,
    changeQuantity: noChanges,
    cancel: { immediately: false, atPeriodEnd: false },
    pause: {
      subscription: { effectiveTimings: [], scheduledResume: false, resumeBillingPolicies: [] },
      paymentCollection: { behaviors: [], scheduledResume: false },
    },
    resume: {
      pendingCancellation: false,
      pausedSubscription: { effectiveTimings: [], billingPolicies: [] },
      paymentCollection: false,
    },
    scheduledChange: { cancel: false },
  },
};

describe("billing capabilities", () => {
  it("reads the environment's billing capabilities", async () => {
    const { client, calls } = harnessReturning(unconfigured);
    const capabilities = await client.billing.capabilities().get();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/billing/capabilities");
    expect(queryOf(callAt(calls, 0))).toBe("");
    expect(callAt(calls, 0).body).toBeUndefined();
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toBeUndefined();
    expect(capabilities).toEqual(unconfigured);
  });

  it("carries the timeout into the capabilities read", async () => {
    const { client, calls } = harnessStalling();
    await expect(client.billing.capabilities().timeoutMs(5).get()).rejects.toMatchObject({
      code: ErrorCode.NETWORK_UNAVAILABLE,
      metadata: { timeoutMs: 5 },
    });
    expect(calls).toHaveLength(1);
  });
});
