import { describe, expect, it } from "vitest";
import { type CheckoutCompletedEvent, paidAsExpected } from "../src/checkout/paid-as-expected";
import { COMPLETED_EVENT, deliver } from "./support/webhook-events";

function completed(): CheckoutCompletedEvent {
  return deliver(COMPLETED_EVENT).event as CheckoutCompletedEvent;
}

describe("paidAsExpected builder contract", () => {
  it("returns a new frozen builder and leaves the earlier one untouched", () => {
    const base = paidAsExpected(completed());
    const withAmount = base.amount(1250);
    const other = withAmount.amount(9999);
    expect(withAmount).not.toBe(base);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(withAmount)).toBe(true);
    expect(withAmount.currency("EUR").matches()).toBe(true);
    expect(other.currency("EUR").matches()).toBe(false);
  });

  it("offers currency only after an amount, and matches only after both", () => {
    const base = paidAsExpected(completed());
    const withAmount = base.amount(1250);
    expect("currency" in base).toBe(false);
    expect("matches" in base).toBe(false);
    expect("currency" in withAmount).toBe(true);
    expect("matches" in withAmount).toBe(false);
    expect("matches" in withAmount.currency("EUR")).toBe(true);
  });

  it("captures the event when the check is started", () => {
    const event = completed();
    const check = paidAsExpected(event).amount(1250).currency("EUR");
    (event.data as { amount: number | null }).amount = 1;
    expect(check.matches()).toBe(true);
  });

  it("refuses an invalid expectation in the terminal, not while configuring", () => {
    const check = paidAsExpected(completed()).amount(-1).currency("EURO");
    expect(() => check.matches()).toThrow();
  });
});
