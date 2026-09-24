import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./support/harness";

describe("customers", () => {
  it("lists customers by email", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.customers.list().email("buyer@example.test").limit(10).get();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers");
    expect(queryOf(callAt(calls, 0))).toBe("?email=buyer%40example.test&limit=10");
  });

  it("walks every customer page keeping the email filter", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "cus_1" }], nextCursor: "cur_2" },
      { data: [{ id: "cus_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const customer of client.customers.list().email("buyer@example.test").all()) {
      collected.push(customer.id);
    }
    expect(collected).toEqual(["cus_1", "cus_2"]);
    expect(queryOf(callAt(calls, 1))).toBe("?email=buyer%40example.test&cursor=cur_2");
  });

  it("creates a customer with a generated key", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await client.customers.create().email("buyer@example.test").name("Buyer").create();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/customers");
    expect(callAt(calls, 0).body).toEqual({ email: "buyer@example.test", name: "Buyer" });
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("replays the key the caller pinned", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" });
    await client.customers.create().email("buyer@example.test").idempotencyKey("order-1").create();
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("order-1");
  });

  it("reads and updates one customer", async () => {
    const { client, calls } = harnessReturning({ id: "cus_1" }, { id: "cus_1" });
    await client.customers.customer("cus_1").get();
    await client.customers.customer("cus_1").name(null).idempotencyKey("rename-1").update();
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH"]);
    expect(callAt(calls, 1).body).toEqual({ name: null });
    expect(callAt(calls, 1).headers["Idempotency-Key"]).toBe("rename-1");
  });
});
