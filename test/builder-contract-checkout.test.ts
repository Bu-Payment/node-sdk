import { describe, expect, it } from "vitest";
import { harnessReturning } from "./support/harness";

describe("checkout session builder contract", () => {
  it("returns a new frozen builder and leaves the earlier one untouched", () => {
    const { client } = harnessReturning();
    const base = client.checkout.sessionDraft().priceId("price_1");
    const next = base.destination("default");
    expect(next).not.toBe(base);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(next)).toBe(true);
    expect("create" in base).toBe(false);
  });

  it("offers one way to name the buyer, and a name only after an email", () => {
    const { client } = harnessReturning();
    const draft = client.checkout.sessionDraft();
    const byEmail = draft.customerEmail("buyer@example.test");
    const byId = draft.customerId("customer_1");
    expect("customerName" in draft).toBe(false);
    expect("customerName" in byEmail).toBe(true);
    expect("customerName" in byId).toBe(false);
    expect("customerId" in byEmail).toBe(false);
    expect("customerEmail" in byId).toBe(false);
    expect("customerId" in byEmail.customerName("Ana")).toBe(false);
  });

  it("offers create only once price, buyer, destination and key are set", () => {
    const { client } = harnessReturning();
    const draft = () => client.checkout.sessionDraft();
    const complete = draft()
      .priceId("price_1")
      .customerId("customer_1")
      .destination("default")
      .idempotencyKey("order-1");
    const incomplete: object[] = [
      draft().customerId("customer_1").destination("default").idempotencyKey("order-1"),
      draft().priceId("price_1").destination("default").idempotencyKey("order-1"),
      draft().priceId("price_1").customerId("customer_1").idempotencyKey("order-1"),
      draft().priceId("price_1").customerId("customer_1").destination("default"),
    ];
    expect("create" in complete).toBe(true);
    for (const builder of incomplete) {
      expect("create" in builder).toBe(false);
    }
  });

  it("issues no request until a terminal is awaited", () => {
    const { client, calls } = harnessReturning();
    client.checkout
      .sessionDraft()
      .priceId("price_1")
      .customerId("customer_1")
      .destination("default")
      .idempotencyKey("order-1");
    client.checkout.session("checkout_1");
    expect(calls).toHaveLength(0);
  });
});
