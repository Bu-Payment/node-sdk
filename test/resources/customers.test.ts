import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

describe("CustomersResource", () => {
  it("lists customers by email", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.customers.list({ email: "buyer@example.test", limit: 10 });
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers");
    expect(queryOf(callAt(calls, 0))).toBe("?email=buyer%40example.test&limit=10");
  });

  it("walks every customer page", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "cus_1" }], nextCursor: "cur_2" },
      { data: [{ id: "cus_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const customer of client.customers.listAll({ email: "buyer@example.test" })) {
      collected.push(customer.id);
    }
    expect(collected).toEqual(["cus_1", "cus_2"]);
    expect(queryOf(callAt(calls, 1))).toBe("?email=buyer%40example.test&cursor=cur_2");
  });

  it("reads one customer", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await client.customers.get("cus_1");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1");
  });

  it("creates a customer with a generated idempotency key", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await client.customers.create({ email: "buyer@example.test", name: "Buyer" });
    expect(callAt(calls, 0).method).toBe("POST");
    expect(callAt(calls, 0).body).toEqual({ email: "buyer@example.test", name: "Buyer" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("replays a caller-supplied idempotency key on creation", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await client.customers.create({ email: "buyer@example.test" }, "key-1");
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-1");
  });

  it("updates a customer with a PATCH", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await client.customers.update("cus_1", { name: null }, "key-2");
    expect(callAt(calls, 0).method).toBe("PATCH");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers/cus_1");
    expect(callAt(calls, 0).body).toEqual({ name: null });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("key-2");
  });
});
