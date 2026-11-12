import { describe, expect, it } from "vitest";
import { callAt, harnessReturning } from "./support/harness";

type Client = ReturnType<typeof harnessReturning>["client"];

const withMethod = (client: Client) =>
  client.payments.draft().customerId("cus_1").priceId("price_1").paymentMethodId("pm_1");

describe("payment allocation builder contract", () => {
  it("returns a new frozen builder from each step and leaves the earlier one untouched", () => {
    const { client } = harnessReturning();
    const base = withMethod(client);
    const referenced = base.allocationReference("line_1");
    const amounted = referenced.allocationAmount(100);
    const closed = amounted.allocationCurrency("EUR");
    const steps = [base, referenced, amounted, closed];
    expect(new Set(steps).size).toBe(4);
    for (const builder of steps) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
    expect("allocationAmount" in base).toBe(false);
  });

  it("offers each step only after the one before, and create only once it is closed", () => {
    const { client } = harnessReturning();
    const base = withMethod(client);
    const referenced = base.allocationReference("line_1");
    const amounted = referenced.allocationAmount(100);
    const closed = amounted.allocationCurrency("EUR");
    expect("allocation" in base).toBe(false);
    expect("allocationReference" in client.payments.draft().priceId("price_1")).toBe(false);
    expect(["allocationAmount", "allocationCurrency"].some((step) => step in base)).toBe(false);
    expect(
      ["allocationReference", "allocationCurrency", "create"].some((m) => m in referenced),
    ).toBe(false);
    expect(["allocationReference", "allocationAmount", "create"].some((m) => m in amounted)).toBe(
      false,
    );
    expect(["allocationReference", "create"].every((method) => method in closed)).toBe(true);
    expect(["allocationAmount", "allocationCurrency"].some((step) => step in closed)).toBe(false);
  });

  it("issues no request until create is awaited, then sends the allocations in order", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    const draft = withMethod(client)
      .allocationReference("line_1")
      .allocationAmount(100)
      .allocationCurrency("EUR")
      .allocationReference("line_2")
      .allocationAmount(0)
      .allocationCurrency("USD");
    expect(calls).toHaveLength(0);
    await draft.create();
    expect(callAt(calls, 0).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      paymentMethodId: "pm_1",
      allocations: [
        { reference: "line_1", amount: 100, currency: "EUR" },
        { reference: "line_2", amount: 0, currency: "USD" },
      ],
    });
  });

  it.each([
    ["reference", undefined, 100, "EUR"],
    ["amount", "line_1", undefined, "EUR"],
    ["currency", "line_1", 100, undefined],
  ])("keeps the allocation open when an untyped caller passes no %s", (_l, ref, amount, cur) => {
    const { client } = harnessReturning();
    const closed = withMethod(client)
      .allocationReference(ref as string)
      .allocationAmount(amount as number)
      .allocationCurrency(cur as string);
    expect("create" in closed).toBe(false);
    expect("allocationReference" in closed).toBe(false);
  });

  it("does not let one branch of an accumulating builder reach another", async () => {
    const { client, calls } = harnessReturning({}, {});
    const base = withMethod(client)
      .allocationReference("line_1")
      .allocationAmount(100)
      .allocationCurrency("EUR");
    await base
      .allocationReference("line_2")
      .allocationAmount(200)
      .allocationCurrency("EUR")
      .create();
    await base
      .allocationReference("line_3")
      .allocationAmount(300)
      .allocationCurrency("EUR")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({
      allocations: [
        { reference: "line_1", amount: 100, currency: "EUR" },
        { reference: "line_2", amount: 200, currency: "EUR" },
      ],
    });
    expect(callAt(calls, 1).body).toMatchObject({
      allocations: [
        { reference: "line_1", amount: 100, currency: "EUR" },
        { reference: "line_3", amount: 300, currency: "EUR" },
      ],
    });
  });
});
