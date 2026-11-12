import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { envClient, REQUIRED_ENV } from "./support/env";
import { callAt, harnessReturning, pathOf } from "./support/harness";

const created = {
  id: "checkout_1",
  status: "pending",
  provider: "sisp",
  checkoutUrl: "https://api.bupayment.test/public/v1/checkouts/pay/tok_1",
  reference: "booking-7",
  amountSource: "app_amount",
  amount: 12_100,
  currency: "EUR",
  description: "Room 12, 3 nights",
  productId: null,
  priceId: null,
  chargedAmount: null,
  chargedCurrency: null,
  quantity: 1,
  customerId: "customer_1",
  expiresAt: "2026-11-12T12:30:00.000Z",
  createdAt: "2026-11-12T12:00:00.000Z",
  updatedAt: "2026-11-12T12:00:00.000Z",
};

function amountDraft(amount: number, currency: string, description: string) {
  const harness = harnessReturning(created);
  const ready = harness.client.checkout
    .sessionDraft()
    .amount(amount)
    .currency(currency)
    .description(description)
    .customerId("customer_1")
    .destination("default")
    .idempotencyKey("booking-7");
  return { ...harness, ready };
}

describe("one-time checkout for an amount the App calculated", () => {
  it("sends the amount, currency, description and product, never a price", async () => {
    const { client, calls } = harnessReturning(created);
    const checkout = await client.checkout
      .sessionDraft()
      .amount(12_100)
      .currency("EUR")
      .description("Room 12, 3 nights")
      .productId("prod_rooms")
      .customerEmail("buyer@example.test")
      .customerName("Ana")
      .destination("default")
      .provider("sisp")
      .reference("booking-7")
      .idempotencyKey("booking-7")
      .create();
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/checkouts");
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("booking-7");
    expect(callAt(calls, 0).body).toEqual({
      amount: 12_100,
      currency: "EUR",
      description: "Room 12, 3 nights",
      productId: "prod_rooms",
      customer: { email: "buyer@example.test", name: "Ana" },
      destinationKey: "default",
      provider: "sisp",
      reference: "booking-7",
    });
    expect(checkout).toEqual(created);
  });

  it("sends only what was set when no product is named", async () => {
    const { ready, calls } = amountDraft(12_100, "EUR", "  Room 12, 3 nights  ");
    await ready.create();
    expect(callAt(calls, 0).body).toEqual({
      amount: 12_100,
      currency: "EUR",
      description: "Room 12, 3 nights",
      customerId: "customer_1",
      destinationKey: "default",
    });
  });

  it("uses the destination configured on the client", async () => {
    const { client, calls } = envClient({ ...REQUIRED_ENV, BU_PAYMENT_DESTINATION_KEY: "store" });
    await client.checkout
      .sessionDraft()
      .amount(500)
      .currency("CVE")
      .description("Ferry ticket")
      .customerId("customer_1")
      .idempotencyKey("ticket-1")
      .create();
    expect(calls[0]?.body).toMatchObject({ amount: 500, destinationKey: "store" });
  });

  it("accepts the largest safe amount and a description of 255 characters", async () => {
    const description = "é".repeat(255);
    const { ready, calls } = amountDraft(Number.MAX_SAFE_INTEGER, "JPY", description);
    await ready.create();
    expect(callAt(calls, 0).body).toMatchObject({
      amount: Number.MAX_SAFE_INTEGER,
      currency: "JPY",
      description,
    });
  });

  it.each<[string, number, string, string, string]>([
    ["a zero amount", 0, "EUR", "Room", "amount"],
    ["a negative amount", -100, "EUR", "Room", "amount"],
    ["a fractional amount", 12.5, "EUR", "Room", "amount"],
    ["an amount beyond the safe integers", Number.MAX_SAFE_INTEGER + 1, "EUR", "Room", "amount"],
    ["a non-finite amount", Number.POSITIVE_INFINITY, "EUR", "Room", "amount"],
    ["a lowercase currency", 100, "eur", "Room", "currency"],
    ["a two-letter currency", 100, "EU", "Room", "currency"],
    ["a numeric currency", 100, "978", "Room", "currency"],
    ["an empty description", 100, "EUR", "", "description"],
    ["a blank description", 100, "EUR", "   ", "description"],
    ["a description of 256 characters", 100, "EUR", "a".repeat(256), "description"],
  ])("refuses %s when create is awaited, before sending", async (_label, amount, currency, description, field) => {
    const { ready, calls } = amountDraft(amount, currency, description);
    await expect(ready.create()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
      metadata: { field },
    });
    expect(calls).toHaveLength(0);
  });

  it("keeps the idempotency key on retry of the same draft", async () => {
    const { ready, calls } = amountDraft(12_100, "EUR", "Room 12");
    await ready.create();
    await ready.create();
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("booking-7");
    expect(callAt(calls, 1).headers["Idempotency-Key"]).toBe("booking-7");
    expect(callAt(calls, 1).body).toEqual(callAt(calls, 0).body);
  });
});
