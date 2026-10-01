import { describe, expect, it } from "vitest";
import { harnessReturning } from "./support/harness";

describe("sales builder contract", () => {
  it("offers one way to name the customer of a sale", () => {
    const { client } = harnessReturning();
    const byEmail = client.sales.draft().customerEmail("buyer@example.test");
    const byId = client.sales.draft().customerId("cus_1");
    expect("customerId" in byEmail).toBe(false);
    expect("customerEmail" in byId).toBe(false);
  });

  it("offers charge only once a sale carries every required field", () => {
    const { client } = harnessReturning();
    const complete = client.sales
      .draft()
      .priceId("price_1")
      .displayedPrice({ unitAmount: 1, currency: "EUR" })
      .customerId("cus_1")
      .idempotencyKey("order-1");
    const incomplete: object[] = [
      client.sales
        .draft()
        .displayedPrice({ unitAmount: 1, currency: "EUR" })
        .customerId("cus_1")
        .idempotencyKey("order-1"),
      client.sales.draft().priceId("price_1").customerId("cus_1").idempotencyKey("order-1"),
      client.sales
        .draft()
        .priceId("price_1")
        .displayedPrice({ unitAmount: 1, currency: "EUR" })
        .idempotencyKey("order-1"),
      client.sales
        .draft()
        .priceId("price_1")
        .displayedPrice({ unitAmount: 1, currency: "EUR" })
        .customerId("cus_1"),
    ];
    expect("charge" in complete).toBe(true);
    for (const draft of incomplete) {
      expect("charge" in draft).toBe(false);
    }
  });
});
