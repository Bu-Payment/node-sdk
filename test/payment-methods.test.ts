import { describe, expect, expectTypeOf, it } from "vitest";
import { ErrorCode, Header } from "../src/constants";
import type {
  PaymentMethod,
  PaymentMethodSetup,
  PaymentMethodSetupConfirmAction,
  PaymentMethodSetupRedirect,
} from "../src/payment-methods/types";
import { callAt, harnessReturning, harnessStalling, pathOf, queryOf } from "./support/harness";

const consentAcceptedAt = "2026-09-24T10:00:00+01:00";
const returnUrl = "https://shop.example/payment-methods/return";

const activeMethod: PaymentMethod = {
  id: "pm_1",
  status: "active",
  brand: "visa",
  lastDigits: "4242",
  expiry: { month: 12, year: 2030 },
  createdAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
};

const setupRequiringAction = {
  id: "pms_1",
  status: "requires_action",
  expiresAt: "2026-09-24T10:30:00.000Z",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://provider.example/setup/pms_1" },
  actions: {
    status: { method: "GET", url: "/public/v1/payment-method-setups/pms_1" },
    confirm: { method: "POST", url: "/public/v1/payment-method-setups/pms_1/confirm" },
  },
};

const setupSucceeded = {
  id: "pms_2",
  status: "succeeded",
  expiresAt: "2026-09-24T10:30:00.000Z",
  actions: { status: { method: "GET", url: "/public/v1/payment-method-setups/pms_2" } },
  paymentMethod: activeMethod,
};

function readySetup(client: ReturnType<typeof harnessReturning>["client"]) {
  return client.paymentMethods
    .createSetup("cus_1")
    .currency("EUR")
    .returnUrl(returnUrl)
    .consentAcceptedAt(consentAcceptedAt);
}

describe("payment method setups", () => {
  it("posts the setup under the customer with the consent it was given", async () => {
    const { client, calls } = harnessReturning(setupRequiringAction);
    await readySetup(client).idempotencyKey("setup-cus_1-1").create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1/payment-methods/setups");
    expect(queryOf(callAt(calls, 0))).toBe("");
    expect(callAt(calls, 0).body).toEqual({
      currency: "EUR",
      returnUrl,
      consent: { type: "merchant_initiated_future_payments", acceptedAt: consentAcceptedAt },
    });
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toBe("setup-cus_1-1");
  });

  it("names the payment method a setup replaces", async () => {
    const { client, calls } = harnessReturning(setupRequiringAction);
    await readySetup(client).replacesPaymentMethodId("pm_old").create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).body).toEqual({
      currency: "EUR",
      returnUrl,
      replacesPaymentMethodId: "pm_old",
      consent: { type: "merchant_initiated_future_payments", acceptedAt: consentAcceptedAt },
    });
  });

  it("keys an unkeyed setup, since the route refuses one without a key", async () => {
    const { client, calls } = harnessReturning(setupRequiringAction);
    await readySetup(client).create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it("offers create only once currency, return url and consent are set", () => {
    const { client } = harnessReturning();
    const setup = client.paymentMethods.createSetup("cus_1");
    const withoutConsent = setup.currency("EUR").returnUrl(returnUrl);
    const withoutReturnUrl = setup.currency("EUR").consentAcceptedAt(consentAcceptedAt);
    const withoutCurrency = setup.returnUrl(returnUrl).consentAcceptedAt(consentAcceptedAt);
    expect("create" in withoutConsent).toBe(false);
    expect("create" in withoutReturnUrl).toBe(false);
    expect("create" in withoutCurrency).toBe(false);
    expect("create" in withoutConsent.consentAcceptedAt(consentAcceptedAt)).toBe(true);
  });

  it("exposes the redirect and the confirm action only on a setup requiring action", async () => {
    const { client } = harnessReturning(setupRequiringAction, setupSucceeded);
    const pending = await readySetup(client).create();
    const settled = await readySetup(client).create();
    if (pending.status !== "requires_action" || settled.status === "requires_action") {
      throw new Error("the setup statuses did not narrow");
    }
    expectTypeOf(pending.presentation).toEqualTypeOf<PaymentMethodSetupRedirect>();
    expectTypeOf(pending.actions.confirm).toEqualTypeOf<PaymentMethodSetupConfirmAction>();
    expectTypeOf(settled.presentation).toEqualTypeOf<undefined>();
    expectTypeOf(settled.actions.confirm).toEqualTypeOf<undefined>();
    expect(pending.presentation.url).toBe("https://provider.example/setup/pms_1");
    expect(pending.actions.confirm.url).toBe("/public/v1/payment-method-setups/pms_1/confirm");
    expect(settled.presentation).toBeUndefined();
    expect(settled.actions.confirm).toBeUndefined();
    expect(settled.paymentMethod).toEqual(activeMethod);
  });

  it("types the setup status as exactly the five contract states", () => {
    expectTypeOf<PaymentMethodSetup["status"]>().toEqualTypeOf<
      "requires_action" | "processing" | "succeeded" | "failed" | "expired"
    >();
  });
});

describe("stored payment methods", () => {
  it("lists a customer's payment methods without a query", async () => {
    const list = { data: [activeMethod], hasMore: false, nextCursor: null };
    const { client, calls } = harnessReturning(list);
    const listed = await client.paymentMethods.list("cus_1").get();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1/payment-methods");
    expect(queryOf(callAt(calls, 0))).toBe("");
    expect(callAt(calls, 0).body).toBeUndefined();
    expect(listed).toEqual(list);
  });

  it("offers no cursor, limit or walk over a list the API caps at 100", () => {
    const { client } = harnessReturning();
    const list = client.paymentMethods.list("cus_1");
    expect(["cursor", "limit", "all"].filter((method) => method in list)).toEqual([]);
    expectTypeOf<Awaited<ReturnType<typeof list.get>>["hasMore"]>().toEqualTypeOf<false>();
    expectTypeOf<Awaited<ReturnType<typeof list.get>>["nextCursor"]>().toEqualTypeOf<null>();
  });

  it("reads one payment method under its customer", async () => {
    const { client, calls } = harnessReturning(activeMethod);
    const method = await client.paymentMethods.paymentMethod("cus_1", "pm_1").get();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1/payment-methods/pm_1");
    expect(method).toEqual(activeMethod);
  });

  it("encodes every identifier as a single path segment", async () => {
    const { client, calls } = harnessReturning(
      activeMethod,
      { data: [], hasMore: false, nextCursor: null },
      setupRequiringAction,
    );
    await client.paymentMethods.paymentMethod("cus/1", "pm?1").get();
    await client.paymentMethods.list("cus/1").get();
    await client.paymentMethods
      .createSetup("cus/1")
      .currency("EUR")
      .returnUrl(returnUrl)
      .consentAcceptedAt(consentAcceptedAt)
      .create();
    expect(calls).toHaveLength(3);
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus%2F1/payment-methods/pm%3F1");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/customers/cus%2F1/payment-methods");
    expect(pathOf(callAt(calls, 2))).toBe("/v1/customers/cus%2F1/payment-methods/setups");
    expect(calls.map(queryOf)).toEqual(["", "", ""]);
  });

  it("refuses an empty identifier before anything is signed", async () => {
    const { client, calls } = harnessReturning(activeMethod);
    await expect(client.paymentMethods.paymentMethod("cus_1", "").get()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    const emptyCustomerSetup = client.paymentMethods
      .createSetup("")
      .currency("EUR")
      .returnUrl(returnUrl)
      .consentAcceptedAt(consentAcceptedAt);
    await expect(emptyCustomerSetup.create()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("payment method revocation", () => {
  it("deletes the payment method with the caller's idempotency key", async () => {
    const revoked = { id: "pm_1", status: "revoked", createdAt: "a", updatedAt: "b" };
    const { client, calls } = harnessReturning(revoked);
    const method = await client.paymentMethods
      .paymentMethod("cus_1", "pm_1")
      .idempotencyKey("revoke-pm_1")
      .revoke();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("DELETE");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1/payment-methods/pm_1");
    expect(callAt(calls, 0).body).toBeUndefined();
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toBe("revoke-pm_1");
    expect(method).toEqual(revoked);
  });

  it("answers an already invalid payment method unchanged instead of failing", async () => {
    const invalid = { id: "pm_1", status: "permanently_invalid", createdAt: "a", updatedAt: "b" };
    const { client, calls } = harnessReturning(invalid);
    const method = await client.paymentMethods.paymentMethod("cus_1", "pm_1").revoke();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("DELETE");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1/payment-methods/pm_1");
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(method.status).toBe("permanently_invalid");
  });
});

describe("payment method request scope", () => {
  it("carries the timeout into a list read and a single read", async () => {
    const { client, calls } = harnessStalling();
    const timedOut = { code: ErrorCode.NETWORK_UNAVAILABLE, metadata: { timeoutMs: 5 } };
    await expect(client.paymentMethods.list("cus_1").timeoutMs(5).get()).rejects.toMatchObject(
      timedOut,
    );
    await expect(
      client.paymentMethods.paymentMethod("cus_1", "pm_1").timeoutMs(5).get(),
    ).rejects.toMatchObject(timedOut);
    expect(calls).toHaveLength(2);
  });

  it("carries the abort signal into a setup and a revocation", async () => {
    const { client, calls } = harnessStalling();
    const controller = new AbortController();
    controller.abort();
    await expect(readySetup(client).signal(controller.signal).create()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_CANCELLED,
    });
    await expect(
      client.paymentMethods.paymentMethod("cus_1", "pm_1").signal(controller.signal).revoke(),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
    expect(calls).toHaveLength(2);
  });
});

describe("payment allocations through the typed surface", () => {
  it("charges allocations against a payment method read from the customer", async () => {
    const { client, calls } = harnessReturning(
      { data: [activeMethod], hasMore: false, nextCursor: null },
      { id: "pay_1" },
    );
    const { data } = await client.paymentMethods.list("cus_1").get();
    const method = data.find((candidate) => candidate.status === "active");
    if (method === undefined) {
      throw new Error("no active payment method was listed");
    }
    await client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .paymentMethodId(method.id)
      .allocation("line_1", 5_000, "EUR")
      .create();
    expect(calls).toHaveLength(2);
    expect(pathOf(callAt(calls, 1))).toBe("/v1/payments");
    expect(callAt(calls, 1).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      paymentMethodId: "pm_1",
      allocations: [{ reference: "line_1", amount: 5_000, currency: "EUR" }],
    });
  });
});
