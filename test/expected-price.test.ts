import { describe, expect, it } from "vitest";
import type { Price } from "../src/catalogue/types";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { callAt, harnessOf, harnessReturning, json } from "./support/harness";

const displayed = { unitAmount: 1_500, currency: "EUR" };

const current = {
  id: "price_1",
  unitAmount: 1_900,
  currency: "EUR",
  active: true,
  updatedAt: "2026-09-26T12:00:00.000Z",
};

const priceChanged = {
  error: "price_changed",
  message: "The price no longer matches the amount the caller displayed",
  price: current,
  statusCode: 409,
  requestId: "req_1",
  timestamp: "2026-09-26T12:00:01.000Z",
};

async function refusal(pending: Promise<unknown>): Promise<BuPaymentError> {
  const failure = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(failure instanceof BuPaymentError)) {
    throw new Error("the request was not refused with a BuPaymentError");
  }
  return failure;
}

describe("expected price on the builders that resolve a canonical price", () => {
  it("asserts the displayed price on a canonically priced payment", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .expectedPrice(displayed)
      .create();
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      expectedPrice: { unitAmount: 1_500, currency: "EUR" },
    });
  });

  it("asserts the displayed price on a subscription", async () => {
    const { client, calls } = harnessReturning({ id: "sub_1" });
    await client.subscriptions
      .create()
      .customerId("cus_1")
      .name("Gold")
      .priceId("price_1")
      .expectedPrice(displayed)
      .pending()
      .create();
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      name: "Gold",
      priceId: "price_1",
      expectedPrice: { unitAmount: 1_500, currency: "EUR" },
      activation: { state: "pending" },
    });
  });

  it("asserts the displayed price on a subscription checkout", async () => {
    const { client, calls } = harnessReturning({ id: "cs_1" });
    await client.checkout
      .subscriptionSession()
      .name("Gold")
      .priceId("price_1")
      .expectedPrice(displayed)
      .customerId("cus_1")
      .customerEmail("buyer@example.test")
      .successUrl("https://shop.test/ok")
      .cancelUrl("https://shop.test/cancel")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({
      priceId: "price_1",
      expectedPrice: { unitAmount: 1_500, currency: "EUR" },
    });
  });

  it("asserts the displayed target price on a price migration", async () => {
    const { client, calls } = harnessReturning({ id: "mig_1" });
    await client.subscriptions
      .subscription("sub_1")
      .priceMigration()
      .targetPriceId("price_2")
      .expectedPrice(displayed)
      .immediately()
      .prorationPolicy("none")
      .paymentFailurePolicy("preventChange")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({
      targetPriceId: "price_2",
      expectedPrice: { unitAmount: 1_500, currency: "EUR" },
    });
  });

  it("sends no assertion when none is set", async () => {
    const { client, calls } = harnessReturning({}, {}, {}, {});
    await client.payments.create().customerId("cus_1").priceId("price_1").create();
    await client.subscriptions
      .create()
      .customerId("cus_1")
      .name("Gold")
      .priceId("price_1")
      .pending()
      .create();
    await client.checkout
      .subscriptionSession()
      .name("Gold")
      .priceId("price_1")
      .customerId("cus_1")
      .customerEmail("buyer@example.test")
      .successUrl("https://shop.test/ok")
      .cancelUrl("https://shop.test/cancel")
      .create();
    await client.subscriptions
      .subscription("sub_1")
      .priceMigration()
      .targetPriceId("price_2")
      .immediately()
      .prorationPolicy("none")
      .paymentFailurePolicy("preventChange")
      .create();
    for (const index of [0, 1, 2, 3]) {
      expect(callAt(calls, index).body).not.toHaveProperty("expectedPrice");
    }
  });

  it("sends only the amount and currency of a catalogue price it is given", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    const price: Price = {
      id: "price_1",
      productId: "prod_1",
      unitAmount: 1_500,
      currency: "EUR",
      type: "one_time",
      recurring: null,
      description: null,
      lookupKey: null,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await client.payments
      .create()
      .customerId("cus_1")
      .priceId(price.id)
      .expectedPrice(price)
      .create();
    expect(callAt(calls, 0).body).toMatchObject({
      expectedPrice: { unitAmount: 1_500, currency: "EUR" },
    });
    expect(Object.keys((callAt(calls, 0).body as { expectedPrice: object }).expectedPrice)).toEqual(
      ["unitAmount", "currency"],
    );
  });

  it("keeps the price it was given when the caller's object changes afterwards", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    const shown = { unitAmount: 1_500, currency: "EUR" };
    const draft = client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .expectedPrice(shown);
    shown.unitAmount = 9_999;
    await draft.create();
    expect(callAt(calls, 0).body).toMatchObject({
      expectedPrice: { unitAmount: 1_500, currency: "EUR" },
    });
  });
});

describe("price_changed", () => {
  it("surfaces as its own code carrying the current price", async () => {
    const { client } = harnessOf(() => json(priceChanged, 409));
    const conflict = await refusal(
      client.payments
        .create()
        .customerId("cus_1")
        .priceId("price_1")
        .expectedPrice(displayed)
        .create(),
    );
    expect(conflict.code).toBe(ErrorCode.PRICE_CHANGED);
    expect(conflict.status).toBe(409);
    expect(conflict.price).toEqual(current);
    expect(conflict.resource).toBeUndefined();
    expect(conflict.metadata).toBeUndefined();
  });

  it("serializes the current price and nothing the API did not send", async () => {
    const { client } = harnessOf(() => json(priceChanged, 409));
    const error = await refusal(
      client.subscriptions
        .create()
        .customerId("cus_1")
        .name("Gold")
        .priceId("price_1")
        .expectedPrice(displayed)
        .pending()
        .create(),
    );
    expect(error.toJSON()).toEqual({
      name: "BuPaymentError",
      code: ErrorCode.PRICE_CHANGED,
      status: 409,
      requestId: "req_1",
      price: current,
    });
  });

  it("keeps only the documented fields of the current price", async () => {
    const { client } = harnessOf(() =>
      json({ ...priceChanged, price: { ...current, productId: "prod_1" } }, 409),
    );
    const error = await refusal(
      client.payments.create().customerId("cus_1").priceId("price_1").create(),
    );
    expect(error.price).toEqual(current);
  });

  it.each([
    ["no price", { ...priceChanged, price: undefined }],
    ["a price without an amount", { ...priceChanged, price: { ...current, unitAmount: "1900" } }],
    ["a price without its state", { ...priceChanged, price: { ...current, active: undefined } }],
    ["a price as a list", { ...priceChanged, price: [current] }],
  ])("keeps the code but no price when the body carries %s", async (_label, body) => {
    const { client } = harnessOf(() => json(body, 409));
    const error = await refusal(
      client.payments.create().customerId("cus_1").priceId("price_1").create(),
    );
    expect(error.code).toBe(ErrorCode.PRICE_CHANGED);
    expect(error.price).toBeUndefined();
  });

  it("reads no price from another conflict", async () => {
    const { client } = harnessOf(() =>
      json({ error: "idempotency_conflict", message: "conflict", price: current }, 409),
    );
    const error = await refusal(
      client.payments.create().customerId("cus_1").priceId("price_1").create(),
    );
    expect(error.code).toBe(ErrorCode.IDEMPOTENCY_CONFLICT);
    expect(error.price).toBeUndefined();
  });

  it("retries under the same idempotency key once the customer confirms the current price", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 0 ? json(priceChanged, 409) : json({ id: "pay_1" }),
    );
    const draft = client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .idempotencyKey("order-1");
    const refused = await refusal(draft.expectedPrice(displayed).create());
    const confirmed = refused.price;
    if (confirmed === undefined) {
      throw new Error("price_changed carried no current price");
    }
    const payment = await draft.expectedPrice(confirmed).create();
    expect(payment).toEqual({ id: "pay_1" });
    expect(calls).toHaveLength(2);
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("order-1");
    expect(callAt(calls, 1).headers["Idempotency-Key"]).toBe("order-1");
    expect(callAt(calls, 0).body).toMatchObject({ expectedPrice: displayed });
    expect(callAt(calls, 1).body).toMatchObject({
      expectedPrice: { unitAmount: 1_900, currency: "EUR" },
    });
  });
});
