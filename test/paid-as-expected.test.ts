import { describe, expect, it } from "vitest";
import { type CheckoutCompletedEvent, paidAsExpected } from "../src/checkout/paid-as-expected";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import checkoutEvents from "./fixtures/checkout-events.json";
import { COMPLETED_EVENT, deliver, withData } from "./support/webhook-events";

function completed(data: Record<string, unknown> = {}): CheckoutCompletedEvent {
  return deliver(withData(COMPLETED_EVENT, data)).event as CheckoutCompletedEvent;
}

function refusal(check: () => boolean): BuPaymentError {
  try {
    check();
  } catch (error) {
    expect(error).toBeInstanceOf(BuPaymentError);
    expect((error as BuPaymentError).code).toBe(ErrorCode.REQUEST_INVALID);
    return error as BuPaymentError;
  }
  throw new Error("expected the expectation to be refused");
}

describe("paidAsExpected", () => {
  it("matches the canonical amount and currency of a completed checkout", () => {
    expect(paidAsExpected(completed()).amount(1250).currency("EUR").matches()).toBe(true);
  });

  it("matches the total for a quantity above one", () => {
    const event = completed({ quantity: 2, amount: 24200 });
    expect(paidAsExpected(event).amount(24200).currency("EUR").matches()).toBe(true);
    expect(paidAsExpected(event).amount(12100).currency("EUR").matches()).toBe(false);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a different amount", { amount: 1249 }],
    ["a different currency", { currency: "USD" }],
    ["no amount", { amount: null }],
    ["no currency", { currency: null }],
  ])("does not match %s", (_case, data) => {
    expect(paidAsExpected(completed(data)).amount(1250).currency("EUR").matches()).toBe(false);
  });

  it("compares the canonical amount, not the converted charge", () => {
    const event = completed({ chargedAmount: 1400, chargedCurrency: "USD" });
    expect(paidAsExpected(event).amount(1250).currency("EUR").matches()).toBe(true);
    expect(paidAsExpected(event).amount(1400).currency("USD").matches()).toBe(false);
  });

  it("reads the expected currency in any case", () => {
    expect(paidAsExpected(completed()).amount(1250).currency("eur").matches()).toBe(true);
  });

  it("does not match an event that is not a completed checkout", () => {
    const failed = deliver(checkoutEvents[1]).event as unknown as CheckoutCompletedEvent;
    expect(paidAsExpected(failed).amount(2900).currency("EUR").matches()).toBe(false);
  });

  it.each([12.5, -1, Number.NaN, 2 ** 53])("refuses the expected amount %s", (amount) => {
    const check = paidAsExpected(completed()).amount(amount).currency("EUR");
    expect(refusal(() => check.matches()).message).toBe(
      `Expected amount must be a non-negative integer in minor units, got ${amount}`,
    );
  });

  it.each(["EURO", "", "E1R"])("refuses the expected currency %j", (currency) => {
    const check = paidAsExpected(completed()).amount(1250).currency(currency);
    expect(refusal(() => check.matches()).message).toBe(
      `Expected currency must be a three-letter ISO 4217 code, got "${currency}"`,
    );
  });
});
