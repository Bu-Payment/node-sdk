import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { BuPaymentError } from "../../src/errors";
import type { CreatePaymentBody } from "../../src/models/payments";
import { harnessReturning, pathOf, queryOf } from "./harness";

describe("PaymentsResource", () => {
  it("charges against a canonical price", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments.create({ customerId: "cus_1", priceId: "price_1" });
    expect(pathOf(calls[0] as never)).toBe("/v1/payments");
    expect(calls[0]?.body).toEqual({ customerId: "cus_1", priceId: "price_1" });
    expect(calls[0]?.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("charges an ad hoc amount when no canonical price applies", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments.create({ customerId: "cus_1", amount: 1500, currency: "EUR" }, "key-1");
    expect(calls[0]?.body).toEqual({ customerId: "cus_1", amount: 1500, currency: "EUR" });
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("key-1");
  });

  it("refuses an amount that would override the canonical price", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    const body = { customerId: "cus_1", priceId: "price_1", amount: 1 } as CreatePaymentBody;
    await expect(client.payments.create(body)).rejects.toBeInstanceOf(BuPaymentError);
    expect(calls).toHaveLength(0);
  });

  it("refuses a payment with no pricing source at all", async () => {
    const { client } = harnessReturning({});
    const body = { customerId: "cus_1" } as CreatePaymentBody;
    await expect(client.payments.create(body)).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
  });

  it("refuses an ad hoc amount without a currency", async () => {
    const { client } = harnessReturning({});
    const body = { customerId: "cus_1", amount: 1500 } as CreatePaymentBody;
    await expect(client.payments.create(body)).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
  });

  it("refuses allocations without a payment method", async () => {
    const { client } = harnessReturning({});
    const body = {
      customerId: "cus_1",
      priceId: "price_1",
      allocations: [{ reference: "line_1", amount: 100, currency: "EUR" }],
    } as CreatePaymentBody;
    await expect(client.payments.create(body)).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
  });

  it("accepts allocations alongside a payment method", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments.create({
      customerId: "cus_1",
      priceId: "price_1",
      paymentMethodId: "pm_1",
      allocations: [{ reference: "line_1", amount: 100, currency: "EUR" }],
    });
    expect(calls).toHaveLength(1);
  });

  it("lists and reads payments", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null, hasMore: false },
      { id: "pay_1" },
    );
    await client.payments.list({ limit: 10 });
    await client.payments.get("pay_1");
    expect(queryOf(calls[0] as never)).toBe("?limit=10");
    expect(pathOf(calls[1] as never)).toBe("/v1/payments/pay_1");
  });

  it("walks every payment page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "pay_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "pay_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const payment of client.payments.listAll()) {
      collected.push(payment.id);
    }
    expect(collected).toEqual(["pay_1", "pay_2"]);
  });
});
