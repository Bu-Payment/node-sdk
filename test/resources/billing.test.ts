import { describe, expect, it } from "vitest";
import { harnessReturning, pathOf, queryOf } from "./harness";

describe("InvoicesResource", () => {
  it("lists invoices by subscription and status", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.invoices.list({ subscriptionId: "sub_1", status: "open" });
    expect(pathOf(calls[0] as never)).toBe("/v1/invoices");
    expect(queryOf(calls[0] as never)).toBe("?subscriptionId=sub_1&status=open");
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
    expect(queryOf(calls[1] as never)).toBe("?status=paid&cursor=cur_2");
  });

  it("reads one invoice", async () => {
    const { client, calls } = harnessReturning({ id: "inv_1" });
    await client.invoices.get("inv_1");
    expect(pathOf(calls[0] as never)).toBe("/v1/invoices/inv_1");
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
    expect(pathOf(calls[0] as never)).toBe("/v1/refunds");
    expect(pathOf(calls[1] as never)).toBe("/v1/refunds/ref_1");
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
    expect(calls[0]?.body).toEqual({ paymentId: "pay_1", amount: 500, currency: "EUR" });
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("key-1");
  });
});

describe("EventsResource", () => {
  it("lists events by type", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.events.list({ type: "payment.succeeded", limit: 10 });
    expect(queryOf(calls[0] as never)).toBe("?type=payment.succeeded&limit=10");
  });

  it("walks every event page keeping the type filter the cursor is bound to", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "evt_1" }], nextCursor: "cur_2" },
      { data: [{ id: "evt_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const event of client.events.listAll({ type: "payment.succeeded" })) {
      collected.push(event.id);
    }
    expect(collected).toEqual(["evt_1", "evt_2"]);
    expect(queryOf(calls[1] as never)).toBe("?type=payment.succeeded&cursor=cur_2");
  });

  it("reads one event", async () => {
    const { client, calls } = harnessReturning({ id: "evt_1" });
    await client.events.get("evt_1");
    expect(pathOf(calls[0] as never)).toBe("/v1/events/evt_1");
  });
});
