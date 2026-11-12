import { describe, expect, it } from "vitest";
import { harnessReturning } from "./support/harness";

const draft = () =>
  harnessReturning().client.checkout.sessionDraft().customerId("customer_1").destination("d");

describe("checkout amount builder contract", () => {
  it("returns a new frozen builder at every step and leaves the earlier one untouched", () => {
    const base = draft();
    const withAmount = base.amount(12_100);
    const withCurrency = withAmount.currency("EUR");
    const described = withCurrency.description("Room 12");
    for (const builder of [base, withAmount, withCurrency, described]) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
    expect(withAmount).not.toBe(base);
    expect("currency" in base).toBe(false);
    expect("description" in withAmount).toBe(false);
    expect("create" in described).toBe(false);
    expect("create" in described.idempotencyKey("order-1")).toBe(true);
  });

  it("offers create only once the amount, currency and description are all set", () => {
    const keyed = draft().idempotencyKey("order-1");
    expect("create" in keyed.amount(12_100)).toBe(false);
    expect("create" in keyed.amount(12_100).currency("EUR")).toBe(false);
    expect("create" in keyed.amount(12_100).productId("prod_1").currency("EUR")).toBe(false);
    expect("create" in keyed.amount(12_100).currency("EUR").description("Room 12")).toBe(true);
  });

  it("keeps two drafts branched from one base independent", async () => {
    const { client, calls } = harnessReturning();
    const base = client.checkout
      .sessionDraft()
      .amount(12_100)
      .currency("EUR")
      .customerId("customer_1")
      .destination("d")
      .idempotencyKey("order-1");
    await base.description("Room 12").create();
    await base.amount(9_900).description("Room 9").create();
    await base.description("Room 12").create();
    expect(calls.map((call) => call.body)).toEqual([
      expect.objectContaining({ amount: 12_100, description: "Room 12" }),
      expect.objectContaining({ amount: 9_900, description: "Room 9" }),
      expect.objectContaining({ amount: 12_100, description: "Room 12" }),
    ]);
  });

  it("closes the catalogue methods once an amount is set", () => {
    const withAmount = draft().amount(12_100);
    for (const method of ["priceId", "quantity", "expectedUnitAmount", "expectedCurrency"]) {
      expect(method in withAmount).toBe(false);
    }
    expect("productId" in withAmount).toBe(true);
  });

  it.each([
    ["priceId", draft().priceId("price_1")],
    ["quantity", draft().quantity(2)],
    ["expectedUnitAmount", draft().expectedUnitAmount(2_900)],
  ])("closes the amount methods once %s is set", (_method, catalogue) => {
    for (const method of ["amount", "currency", "description", "productId"]) {
      expect(method in catalogue).toBe(false);
    }
  });

  it("offers both paths before either is chosen", () => {
    const fresh = draft();
    expect("priceId" in fresh).toBe(true);
    expect("amount" in fresh).toBe(true);
    expect("productId" in fresh).toBe(false);
  });

  it("issues no request until create is awaited", () => {
    const { client, calls } = harnessReturning();
    const ready = client.checkout
      .sessionDraft()
      .amount(0)
      .currency("eur")
      .description(" ")
      .customerId("customer_1")
      .destination("d")
      .idempotencyKey("order-1");
    expect("create" in ready).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
