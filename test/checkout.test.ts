import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { callAt, harnessReturning, pathOf, queryOf } from "./support/harness";

describe("checkout", () => {
  it("evaluates a coupon", async () => {
    const { client, calls } = harnessReturning({ valid: true });
    await client.checkout
      .coupon("WELCOME")
      .unitAmount(1_000)
      .currency("EUR")
      .productId("prod_1")
      .evaluate();
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toBe("/v1/coupons/evaluate");
    expect(callAt(calls, 0).body).toEqual({
      code: "WELCOME",
      unitAmount: 1_000,
      currency: "EUR",
      productId: "prod_1",
    });
  });

  it("redeems a coupon against a reference", async () => {
    const { client, calls } = harnessReturning({ id: "redemption_1" });
    await client.checkout
      .coupon("WELCOME")
      .unitAmount(1_000)
      .currency("EUR")
      .reference("order_1")
      .idempotencyKey("order_1")
      .redeem();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/coupons/redeem");
    expect(callAt(calls, 0).body).toEqual({
      code: "WELCOME",
      unitAmount: 1_000,
      currency: "EUR",
      reference: "order_1",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("order_1");
  });

  it("lists applicable tax rates and calculates on one", async () => {
    const { client, calls } = harnessReturning({ data: [] }, { taxRateId: "txr_1" });
    await client.checkout.taxRates().productId("prod_1").country("PT").get();
    await client.checkout.taxRate("txr_1").amount(1_000).productId("prod_1").calculate();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/tax-rates");
    expect(queryOf(callAt(calls, 0))).toBe("?productId=prod_1&country=PT");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/tax-rates/txr_1/calculate");
    expect(callAt(calls, 1).body).toEqual({ amount: 1_000, productId: "prod_1" });
  });

  it("sends the accumulated products as one comma-separated parameter", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.checkout
      .shippingRates()
      .currency("EUR")
      .destinationCountry("PT")
      .product("prod_1")
      .product("prod_2")
      .limit(10)
      .get();
    expect(queryOf(callAt(calls, 0))).toBe(
      "?currency=EUR&destinationCountry=PT&productIds=prod_1%2Cprod_2&limit=10",
    );
  });

  it("refuses a product identifier that would split in two on the wire", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await expect(
      client.checkout
        .shippingRates()
        .currency("EUR")
        .destinationCountry("PT")
        .product("prod_1,prod_2")
        .get(),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("opens a subscription checkout session", async () => {
    const { client, calls } = harnessReturning({ id: "cs_1", url: "https://checkout.test/cs_1" });
    const session = await client.checkout
      .subscriptionSession()
      .name("Gold")
      .priceId("price_1")
      .customerId("cus_1")
      .customerEmail("buyer@example.test")
      .successUrl("https://shop.test/ok")
      .cancelUrl("https://shop.test/no")
      .create();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscription-checkouts");
    expect(callAt(calls, 0).body).toEqual({
      name: "Gold",
      priceId: "price_1",
      customer: { id: "cus_1", email: "buyer@example.test" },
      successUrl: "https://shop.test/ok",
      cancelUrl: "https://shop.test/no",
    });
    expect(session.url).toBe("https://checkout.test/cs_1");
  });
});
