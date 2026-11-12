import { describe, expect, it } from "vitest";
import { checkoutOutcome, isPayableCheckout, laterCheckoutStatus } from "../src/checkout/outcome";
import type { CheckoutStatus } from "../src/checkout/types";
import type { CheckoutOutcomeEvent } from "../src/webhooks/types";
import checkoutEvents from "./fixtures/checkout-events.json";
import { deliver } from "./support/webhook-events";

const ASCENDING: readonly CheckoutStatus[] = [
  "pending",
  "processing",
  "expired",
  "cancelled",
  "failed",
  "completed",
];

const PAIRS = ASCENDING.flatMap((current, currentRank) =>
  ASCENDING.map(
    (incoming, incomingRank) =>
      [current, incoming, incomingRank > currentRank ? incoming : current] as const,
  ),
);

const [COMPLETED, FAILED, EXPIRED, CANCELLED] = checkoutEvents.map(
  (envelope) => deliver(envelope).event as CheckoutOutcomeEvent,
);

describe("laterCheckoutStatus", () => {
  it.each(PAIRS)("keeps %s against %s as %s", (current, incoming, expected) => {
    expect(laterCheckoutStatus(current, incoming)).toBe(expected);
  });

  it("lets a late payment win over an expiry, in either arrival order", () => {
    expect(laterCheckoutStatus("expired", "completed")).toBe("completed");
    expect(laterCheckoutStatus("completed", "expired")).toBe("completed");
  });
});

describe("isPayableCheckout", () => {
  it.each<[CheckoutStatus, boolean]>([
    ["pending", true],
    ["processing", true],
    ["completed", false],
    ["failed", false],
    ["expired", false],
    ["cancelled", false],
  ])("answers %s with %s", (status, payable) => {
    expect(isPayableCheckout(status)).toBe(payable);
  });
});

describe("checkoutOutcome", () => {
  it("reads a completed checkout with its payment and canonical amount", () => {
    expect(checkoutOutcome(COMPLETED as CheckoutOutcomeEvent)).toEqual({
      checkoutId: "checkout_123",
      reference: "order-1042",
      status: "completed",
      paymentId: "payment_123",
      amount: 1250,
      currency: "EUR",
      chargedAmount: null,
      chargedCurrency: null,
    });
  });

  it("keeps the converted charge of a failed checkout", () => {
    expect(checkoutOutcome(FAILED as CheckoutOutcomeEvent)).toMatchObject({
      status: "failed",
      reference: null,
      paymentId: null,
      amount: 2900,
      currency: "EUR",
      chargedAmount: 3300,
      chargedCurrency: "USD",
    });
  });

  it("reads an expired checkout with no amount as nulls", () => {
    expect(checkoutOutcome(EXPIRED as CheckoutOutcomeEvent)).toMatchObject({
      status: "expired",
      amount: null,
      currency: null,
    });
  });

  it("fills the fields a cancellation does not carry with null", () => {
    const outcome = checkoutOutcome(CANCELLED as CheckoutOutcomeEvent);
    expect(outcome).toEqual({
      checkoutId: "checkout_126",
      reference: "order-1044",
      status: "cancelled",
      paymentId: null,
      amount: null,
      currency: null,
      chargedAmount: null,
      chargedCurrency: null,
    });
    expect(Object.values(outcome)).not.toContain(undefined);
  });

  it("gives every event the same keys and freezes the result", () => {
    const outcomes = [COMPLETED, FAILED, EXPIRED, CANCELLED].map((event) =>
      checkoutOutcome(event as CheckoutOutcomeEvent),
    );
    const keys = Object.keys(outcomes[0] as object).sort();
    for (const outcome of outcomes) {
      expect(Object.keys(outcome).sort()).toEqual(keys);
      expect(Object.isFrozen(outcome)).toBe(true);
    }
  });

  it("leaves out the provider, quantity and customer", () => {
    expect(checkoutOutcome(COMPLETED as CheckoutOutcomeEvent)).not.toHaveProperty("provider");
    expect(checkoutOutcome(COMPLETED as CheckoutOutcomeEvent)).not.toHaveProperty("quantity");
    expect(checkoutOutcome(COMPLETED as CheckoutOutcomeEvent)).not.toHaveProperty("customerId");
  });
});
