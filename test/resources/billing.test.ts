import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

describe("InvoicesResource", () => {
  it("lists invoices by subscription and status", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.invoices.list({ subscriptionId: "sub_1", status: "open" });
    expect(pathOf(callAt(calls, 0))).toBe("/v1/invoices");
    expect(queryOf(callAt(calls, 0))).toBe("?subscriptionId=sub_1&status=open");
  });

  it("walks every invoice page keeping the status filter", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "inv_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "inv_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const invoice of client.invoices.listAll({ status: "paid" })) {
      collected.push(invoice.id);
    }
    expect(collected).toEqual(["inv_1", "inv_2"]);
    expect(queryOf(callAt(calls, 1))).toBe("?status=paid&cursor=cur_2");
  });

  it("reads one invoice", async () => {
    const { client, calls } = harnessReturning({ id: "inv_1" });
    await client.invoices.get("inv_1");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/invoices/inv_1");
  });
});

describe("RefundsResource", () => {
  it("lists and reads refunds", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null, hasMore: false },
      { id: "ref_1" },
    );
    await client.refunds.list({ limit: 10 });
    await client.refunds.get("ref_1");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/refunds");
    expect(pathOf(callAt(calls, 1))).toBe("/v1/refunds/ref_1");
  });

  it("walks every refund page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "ref_1" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "ref_2" }], nextCursor: null, hasMore: false },
    );
    const collected: string[] = [];
    for await (const refund of client.refunds.listAll()) {
      collected.push(refund.id);
    }
    expect(collected).toEqual(["ref_1", "ref_2"]);
  });

  it("creates a partial refund carrying its currency", async () => {
    const { client, calls } = harnessReturning({ id: "ref_1" });
    await client.refunds.create({ paymentId: "pay_1", amount: 500, currency: "EUR" }, "key-1");
    expect(callAt(calls, 0).body).toEqual({ paymentId: "pay_1", amount: 500, currency: "EUR" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-1");
  });
});
