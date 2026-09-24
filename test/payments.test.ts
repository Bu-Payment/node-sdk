import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./support/harness";

describe("payments, invoices and refunds", () => {
  it("charges against a canonical price", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments.create().customerId("cus_1").priceId("price_1").create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/payments");
    expect(callAt(calls, 0).body).toEqual({ customerId: "cus_1", priceId: "price_1" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("charges an ad hoc amount with its currency", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments
      .create()
      .customerId("cus_1")
      .amount(5_000)
      .currency("EUR")
      .idempotencyKey("order-1")
      .create();
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      amount: 5_000,
      currency: "EUR",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("order-1");
  });

  it("carries the accumulated allocations beside the payment method", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .paymentMethodId("pm_1")
      .allocation("line_1", 2_500, "EUR")
      .allocation("line_2", 2_500, "EUR")
      .create();
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      paymentMethodId: "pm_1",
      allocations: [
        { reference: "line_1", amount: 2_500, currency: "EUR" },
        { reference: "line_2", amount: 2_500, currency: "EUR" },
      ],
    });
  });

  it("lists and reads payments, answering the envelope the API sends", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "pay_1" }], nextCursor: "cur_2", hasMore: true },
      { id: "pay_1" },
    );
    const page = await client.payments.list().limit(10).cursor("cur_1").get();
    await client.payments.payment("pay_1").get();
    expect(queryOf(callAt(calls, 0))).toBe("?cursor=cur_1&limit=10");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("cur_2");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/payments/pay_1");
  });

  it("walks every payment page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "pay_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "pay_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const payment of client.payments.list().all()) {
      collected.push(payment.id);
    }
    expect(collected).toEqual(["pay_1", "pay_2"]);
  });

  it("lists refunds as a page as well as a walk", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    const page = await client.refunds.list().limit(5).get();
    expect(page.hasMore).toBe(false);
    expect(queryOf(callAt(calls, 0))).toBe("?limit=5");
  });

  it("lists invoices by subscription and status", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.invoices.list().subscriptionId("sub_1").status("open").get();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/invoices");
    expect(queryOf(callAt(calls, 0))).toBe("?subscriptionId=sub_1&status=open");
  });

  it("reads one invoice and one refund", async () => {
    const { client, calls } = harnessReturning({ id: "inv_1" }, { id: "ref_1" });
    await client.invoices.invoice("inv_1").get();
    await client.refunds.refund("ref_1").get();
    expect(calls.map((call) => pathOf(call))).toEqual(["/v1/invoices/inv_1", "/v1/refunds/ref_1"]);
  });

  it("walks every invoice page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "inv_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "inv_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const invoice of client.invoices.list().status("paid").all()) {
      collected.push(invoice.id);
    }
    expect(collected).toEqual(["inv_1", "inv_2"]);
  });

  it("creates a partial refund carrying its currency", async () => {
    const { client, calls } = harnessReturning({ id: "ref_1" });
    await client.refunds
      .create()
      .paymentId("pay_1")
      .amount(2_500)
      .currency("EUR")
      .idempotencyKey("refund-1")
      .create();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/refunds");
    expect(callAt(calls, 0).body).toEqual({
      paymentId: "pay_1",
      amount: 2_500,
      currency: "EUR",
    });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("refund-1");
  });

  it("refunds in full with no amount at all", async () => {
    const { client, calls } = harnessReturning({ id: "ref_1" });
    await client.refunds.create().paymentId("pay_1").create();
    expect(callAt(calls, 0).body).toEqual({ paymentId: "pay_1" });
  });

  it("walks every refund page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "ref_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "ref_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const refund of client.refunds.list().all()) {
      collected.push(refund.id);
    }
    expect(collected).toEqual(["ref_1", "ref_2"]);
  });
});
