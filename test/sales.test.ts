import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { callAt, json } from "./support/harness";
import {
  current,
  displayed,
  email,
  emailTaken,
  failureOf,
  notFound,
  priceChanged,
  routeOf,
  saleOf,
  shop,
  stallingAt,
  upstreamDown,
} from "./support/sales";

describe("sales", () => {
  it("charges an existing customer at the displayed price", async () => {
    const { client, calls } = shop();
    const sale = await saleOf(client).reference("sku_1").description("One mug").charge();
    expect(sale).toEqual({ outcome: "paid", payment: { id: "pay_1", status: "succeeded" } });
    expect(calls.map(routeOf)).toEqual(["GET /v1/customers", "POST /v1/payments"]);
    const lookup = new URL(callAt(calls, 0).url).searchParams;
    expect(lookup.get("email")).toBe(email);
    expect(lookup.get("limit")).toBe("1");
    expect(callAt(calls, 1).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      expectedPrice: displayed,
      reference: "sku_1",
      description: "One mug",
    });
  });

  it("creates the customer when no record carries the email", async () => {
    const { client, calls } = shop({ existing: false });
    await saleOf(client).charge();
    expect(calls.map(routeOf)).toEqual([
      "GET /v1/customers",
      "POST /v1/customers",
      "POST /v1/payments",
    ]);
    expect(callAt(calls, 1).body).toEqual({ email });
    expect(callAt(calls, 2).body).toMatchObject({ customerId: "cus_new" });
  });

  it("charges the customer a concurrent sale created first", async () => {
    const { client, calls } = shop({
      lookup: (attempt) =>
        json({ data: attempt === 1 ? [] : [{ id: "cus_7", email }], nextCursor: null }),
      signUp: () => json(emailTaken, 409),
    });
    expect((await saleOf(client).charge()).outcome).toBe("paid");
    expect(calls.map(routeOf)).toEqual([
      "GET /v1/customers",
      "POST /v1/customers",
      "GET /v1/customers",
      "POST /v1/payments",
    ]);
    expect(callAt(calls, 3).body).toMatchObject({ customerId: "cus_7" });
  });

  it.each([
    ["the email conflict leaves no customer to find", emailTaken],
    ["the creation fails for another reason", upstreamDown],
  ])("throws when %s", async (_label, refusal) => {
    const { client, calls } = shop({ existing: false, signUp: () => json(refusal, 409) });
    const failure = await failureOf(saleOf(client).charge());
    expect(failure).toBeInstanceOf(BuPaymentError);
    expect(calls.map(routeOf)).not.toContain("POST /v1/payments");
  });

  it("charges a known customer without looking it up", async () => {
    const { client, calls } = shop();
    await client.sales
      .draft()
      .priceId("price_1")
      .displayedPrice(displayed)
      .customerId("cus_9")
      .idempotencyKey("order-9")
      .charge();
    expect(calls.map(routeOf)).toEqual(["POST /v1/payments"]);
    expect(callAt(calls, 0).body).toMatchObject({ customerId: "cus_9" });
  });

  it("keeps only the amount and currency of the displayed price", async () => {
    const { client, calls } = shop({ payment: () => json(priceChanged, 409) });
    const sale = await saleOf(client)
      .displayedPrice({ ...current, unitAmount: 1_500 })
      .charge();
    expect(callAt(calls, 1).body).toMatchObject({ expectedPrice: displayed });
    expect(sale).toMatchObject({ shown: displayed });
  });

  it("reports a payment that did not succeed as unpaid", async () => {
    const { client } = shop({ payment: () => json({ id: "pay_1", status: "pending" }) });
    expect(await saleOf(client).charge()).toEqual({
      outcome: "unpaid",
      payment: { id: "pay_1", status: "pending" },
    });
  });

  it("answers a changed price with the shown and the current price", async () => {
    const { client } = shop({ payment: () => json(priceChanged, 409) });
    expect(await saleOf(client).charge()).toEqual({
      outcome: "price_changed",
      shown: displayed,
      current,
    });
  });

  it("answers a changed price without a current price as null", async () => {
    const { client } = shop({ payment: () => json({ ...priceChanged, price: undefined }, 409) });
    expect(await saleOf(client).charge()).toEqual({
      outcome: "price_changed",
      shown: displayed,
      current: null,
    });
  });

  it("rethrows a refusal the API gave for the payment", async () => {
    const { client } = shop({ payment: () => json(notFound, 404) });
    const failure = await failureOf(saleOf(client).charge());
    expect((failure as BuPaymentError).code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });

  it.each([
    ["a server failure", () => json(upstreamDown, 503), ErrorCode.OPERATION_FAILED],
    ["a malformed answer", () => new Response("not json"), ErrorCode.RESPONSE_INVALID],
  ])("answers %s on the payment as unconfirmed", async (_label, payment, code) => {
    const { client } = shop({ payment });
    const sale = await saleOf(client).charge();
    expect(sale.outcome).toBe("unconfirmed");
    expect(sale.outcome === "unconfirmed" && sale.error.code).toBe(code);
  });

  it("sends the idempotency key with the payment only", async () => {
    const { client, calls } = shop({ existing: false });
    await saleOf(client).charge();
    expect(callAt(calls, 1).headers["Idempotency-Key"]).not.toBe("order-1");
    expect(callAt(calls, 2).headers["Idempotency-Key"]).toBe("order-1");
  });

  it.each([
    "GET /v1/customers",
    "POST /v1/customers",
  ])("throws a cancellation while %s is in flight", async (stalled) => {
    const controller = new AbortController();
    const { client, calls } = stallingAt(stalled, () => controller.abort());
    const failure = await failureOf(saleOf(client).signal(controller.signal).charge());
    expect((failure as BuPaymentError).code).toBe(ErrorCode.REQUEST_CANCELLED);
    expect(routeOf(callAt(calls, calls.length - 1))).toBe(stalled);
  });

  it.each([
    "GET /v1/customers",
    "POST /v1/customers",
  ])("throws a timeout while %s is in flight", async (stalled) => {
    const { client, calls } = stallingAt(stalled, () => undefined);
    const failure = await failureOf(saleOf(client).timeoutMs(5).charge());
    expect((failure as BuPaymentError).metadata).toEqual({ timeoutMs: 5 });
    expect(routeOf(callAt(calls, calls.length - 1))).toBe(stalled);
  });

  it("answers a cancelled or timed out payment as unconfirmed", async () => {
    const controller = new AbortController();
    const cancelled = stallingAt("POST /v1/payments", () => controller.abort());
    const timedOut = stallingAt("POST /v1/payments", () => undefined);
    const first = await saleOf(cancelled.client).signal(controller.signal).charge();
    const second = await saleOf(timedOut.client).timeoutMs(5).charge();
    expect(first.outcome === "unconfirmed" && first.error.code).toBe(ErrorCode.REQUEST_CANCELLED);
    expect(second.outcome === "unconfirmed" && second.error.metadata).toEqual({ timeoutMs: 5 });
  });

  it("leaves an earlier sale unchanged when a later one adds a field", async () => {
    const { client, calls } = shop();
    const base = saleOf(client);
    const referenced = base.reference("sku_1");
    await base.charge();
    await referenced.charge();
    expect(callAt(calls, 1).body).not.toHaveProperty("reference");
    expect(callAt(calls, 3).body).toMatchObject({ reference: "sku_1" });
  });
});
