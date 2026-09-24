import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

describe("checkout resources", () => {
  it("evaluates a coupon and lets the caller pin the key", async () => {
    const { client, calls } = harnessReturning({ valid: true });
    await client.coupons.evaluate(
      { code: "WELCOME", unitAmount: 1000, currency: "EUR" },
      "key-evaluate",
    );
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/coupons/evaluate");
    expect(callAt(calls, 0).body).toEqual({
      code: "WELCOME",
      unitAmount: 1000,
      currency: "EUR",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-evaluate");
  });

  it("redeems a coupon against a reference", async () => {
    const { client, calls } = harnessReturning({ id: "redemption_1" });
    await client.coupons.redeem(
      { code: "WELCOME", unitAmount: 1000, currency: "EUR", reference: "order_1" },
      "key-1",
    );
    expect(pathOf(callAt(calls, 0))).toBe("/v1/coupons/redeem");
    expect(callAt(calls, 0).body).toEqual({
      code: "WELCOME",
      unitAmount: 1000,
      currency: "EUR",
      reference: "order_1",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-1");
  });

  it("lists the tax rates applicable to a product", async () => {
    const { client, calls } = harnessReturning({ data: [] });
    await client.taxRates.list({ productId: "prod_1", country: "PT" });
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/tax-rates");
    expect(queryOf(callAt(calls, 0))).toBe("?productId=prod_1&country=PT");
  });

  it("calculates tax on one rate", async () => {
    const { client, calls } = harnessReturning({ taxRateId: "txr_1" });
    await client.taxRates.calculate(
      "txr_1",
      { amount: 1000, productId: "prod_1" },
      "key-calculate",
    );
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/tax-rates/txr_1/calculate");
    expect(callAt(calls, 0).body).toEqual({ amount: 1000, productId: "prod_1" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-calculate");
  });

  it("sends shipping product identifiers as one comma-separated parameter", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.shippingRates.list({
      currency: "EUR",
      destinationCountry: "PT",
      productIds: ["prod_1", "prod_2"],
      limit: 10,
    });
    expect(calls).toHaveLength(1);
    expect(queryOf(callAt(calls, 0))).toBe(
      "?currency=EUR&destinationCountry=PT&productIds=prod_1%2Cprod_2&limit=10",
    );
  });

  it("refuses a shipping resolution with no product rather than sending an empty parameter", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await expect(
      client.shippingRates.list({ currency: "EUR", destinationCountry: "PT", productIds: [] }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("refuses a product identifier that would split into two on the wire", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await expect(
      client.shippingRates.list({
        currency: "EUR",
        destinationCountry: "PT",
        productIds: ["prod_1,prod_2"],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("walks every shipping rate page keeping the resolved destination", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "ship_1" }], nextCursor: "cur_2" },
      { data: [{ id: "ship_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const rate of client.shippingRates.listAll({
      currency: "EUR",
      destinationCountry: "PT",
      productIds: ["prod_1"],
    })) {
      collected.push(rate.id);
    }
    expect(collected).toEqual(["ship_1", "ship_2"]);
    expect(queryOf(callAt(calls, 1))).toBe(
      "?currency=EUR&destinationCountry=PT&productIds=prod_1&cursor=cur_2",
    );
  });

  it("opens a subscription checkout session carrying the whole body", async () => {
    const { client, calls } = harnessReturning({ id: "cs_1", url: "https://checkout.test/cs_1" });
    const session = await client.subscriptionCheckouts.create(
      {
        name: "Gold",
        priceId: "price_1",
        customer: { id: "cus_1", email: "buyer@example.test" },
        successUrl: "https://shop.test/ok",
        cancelUrl: "https://shop.test/no",
      },
      "key-checkout",
    );
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/subscription-checkouts");
    expect(callAt(calls, 0).body).toEqual({
      name: "Gold",
      priceId: "price_1",
      customer: { id: "cus_1", email: "buyer@example.test" },
      successUrl: "https://shop.test/ok",
      cancelUrl: "https://shop.test/no",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-checkout");
    expect(session.url).toBe("https://checkout.test/cs_1");
  });
});
