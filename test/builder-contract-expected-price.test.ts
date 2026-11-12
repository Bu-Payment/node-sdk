import { describe, expect, it } from "vitest";
import { callAt, harnessReturning } from "./support/harness";

type Client = ReturnType<typeof harnessReturning>["client"];

interface Creatable {
  create(): Promise<unknown>;
}

interface Pinnable extends Creatable {
  expectedUnitAmount(unitAmount: number): {
    expectedCurrency(currency: string): Creatable;
  };
}

const builders: Array<[string, (client: Client) => Pinnable]> = [
  ["payment", (client) => client.payments.draft().customerId("cus_1").priceId("price_1")],
  [
    "subscription",
    (client) =>
      client.subscriptions.draft().customerId("cus_1").name("Gold").priceId("p").pending(),
  ],
  [
    "subscription checkout",
    (client) =>
      client.checkout
        .subscriptionSession()
        .name("Gold")
        .priceId("price_1")
        .customerId("cus_1")
        .customerEmail("buyer@example.test")
        .successUrl("https://shop.test/ok")
        .cancelUrl("https://shop.test/cancel"),
  ],
  [
    "checkout",
    (client) =>
      client.checkout
        .sessionDraft()
        .priceId("price_1")
        .customerId("cus_1")
        .destination("default")
        .idempotencyKey("order-1"),
  ],
  [
    "price migration",
    (client) =>
      client.subscriptions
        .subscription("sub_1")
        .priceMigration()
        .targetPriceId("price_2")
        .immediately()
        .prorationPolicy("none")
        .paymentFailurePolicy("preventChange"),
  ],
];

describe.each(builders)("expected price on a %s", (_label, open) => {
  it("returns a new frozen builder from each method and leaves the earlier one untouched", () => {
    const { client } = harnessReturning();
    const base = open(client);
    const withAmount = base.expectedUnitAmount(1_500);
    const pinned = withAmount.expectedCurrency("EUR");
    expect(withAmount).not.toBe(base);
    expect(pinned).not.toBe(withAmount);
    for (const builder of [base, withAmount, pinned]) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
    expect("expectedCurrency" in base).toBe(false);
    expect("create" in base).toBe(true);
  });

  it("offers the currency only after the amount, and the terminal only with both", () => {
    const { client } = harnessReturning();
    const base = open(client);
    expect("expectedPrice" in base).toBe(false);
    expect("expectedCurrency" in base).toBe(false);
    expect("create" in base.expectedUnitAmount(1_500)).toBe(false);
    expect("create" in base.expectedUnitAmount(1_500).expectedCurrency("EUR")).toBe(true);
  });

  it.each([
    ["no amount", undefined, "EUR"],
    ["no currency", 1_500, undefined],
  ])("keeps the terminal away when an untyped caller passes %s", (_label, amount, currency) => {
    const { client } = harnessReturning();
    const unset = open(client).expectedUnitAmount(amount as number);
    expect("expectedCurrency" in unset).toBe(true);
    expect("create" in unset).toBe(false);
    expect("create" in unset.expectedCurrency(currency as string)).toBe(false);
  });

  it("issues no request until the terminal is awaited", () => {
    const { client, calls } = harnessReturning();
    open(client).expectedUnitAmount(1_500).expectedCurrency("EUR");
    expect(calls).toHaveLength(0);
  });

  it("sends the assertion as one amount and currency, and none on an earlier branch", async () => {
    const { client, calls } = harnessReturning({}, {});
    const base = open(client);
    await base.expectedUnitAmount(1_500).expectedCurrency("USD").create();
    await base.create();
    const asserted = callAt(calls, 0).body as { expectedPrice: object };
    expect(asserted.expectedPrice).toEqual({ unitAmount: 1_500, currency: "USD" });
    expect(Object.keys(asserted.expectedPrice)).toEqual(["unitAmount", "currency"]);
    expect(callAt(calls, 1).body).not.toHaveProperty("expectedPrice");
  });
});

describe("displayed price on a sale", () => {
  const sale = (client: Client) =>
    client.sales.draft().priceId("price_1").customerId("cus_1").idempotencyKey("order-1");

  it("returns a new frozen builder from each method and leaves the earlier one untouched", () => {
    const { client } = harnessReturning();
    const base = sale(client);
    const withAmount = base.displayedUnitAmount(1_500);
    const pinned = withAmount.displayedCurrency("EUR");
    expect(withAmount).not.toBe(base);
    expect(pinned).not.toBe(withAmount);
    for (const builder of [base, withAmount, pinned]) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
    expect("displayedCurrency" in base).toBe(false);
  });

  it("offers the currency only after the amount, and charge only with both", () => {
    const { client } = harnessReturning();
    const base = sale(client);
    expect("displayedPrice" in base).toBe(false);
    expect("charge" in base).toBe(false);
    expect("charge" in base.displayedUnitAmount(1_500)).toBe(false);
    expect("charge" in base.displayedUnitAmount(1_500).displayedCurrency("EUR")).toBe(true);
  });

  it("issues no request until charge is awaited, then asserts the displayed price", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1", status: "succeeded" });
    const draft = sale(client).displayedUnitAmount(1_500).displayedCurrency("USD");
    expect(calls).toHaveLength(0);
    await draft.charge();
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      expectedPrice: { unitAmount: 1_500, currency: "USD" },
    });
  });
});
