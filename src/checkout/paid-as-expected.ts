import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type { CheckoutTerminalEvent } from "../webhooks/types";

export type CheckoutCompletedEvent = Extract<CheckoutTerminalEvent, { type: "checkout.completed" }>;

interface Expectation {
  amount?: number;
  currency?: string;
}

interface PaidSnapshot {
  completed: boolean;
  amount: number | null;
  currency: string | null;
}

interface AmountExpectation<TState extends Expectation> {
  amount(amount: number): PaidAsExpectedBuilder<TState & { amount: number }>;
}

interface CurrencyExpectation<TState extends Expectation> {
  currency(currency: string): PaidAsExpectedBuilder<TState & { currency: string }>;
}

export interface MatchablePayment {
  matches(): boolean;
}

export type PaidAsExpectedBuilder<TState extends Expectation = Expectation> =
  AmountExpectation<TState> &
    (TState extends { amount: number } ? CurrencyExpectation<TState> : object) &
    (TState extends { amount: number; currency: string } ? MatchablePayment : object);

const CURRENCY_CODE = /^[A-Za-z]{3}$/u;

export function paidAsExpected(
  event: CheckoutCompletedEvent,
): PaidAsExpectedBuilder<Record<never, never>> {
  return expectationBuilder(
    Object.freeze({
      completed: event.type === "checkout.completed" && event.data.status === "completed",
      amount: event.data.amount,
      currency: event.data.currency,
    }),
    {},
  );
}

function expectationBuilder<TState extends Expectation>(
  paid: Readonly<PaidSnapshot>,
  state: TState,
): PaidAsExpectedBuilder<TState> {
  const next = (update: Expectation) => expectationBuilder(paid, { ...state, ...update });
  const builder: Record<string, unknown> = {
    amount: (amount: number) => next({ amount }),
  };
  const { amount, currency } = state;
  if (amount !== undefined) {
    builder.currency = (expected: string) => next({ currency: expected });
  }
  if (amount !== undefined && currency !== undefined) {
    builder.matches = () => matches(paid, amount, currency);
  }
  return Object.freeze(builder) as PaidAsExpectedBuilder<TState>;
}

function matches(paid: Readonly<PaidSnapshot>, amount: number, currency: string): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw invalid(`Expected amount must be a non-negative integer in minor units, got ${amount}`);
  }
  if (!CURRENCY_CODE.test(currency)) {
    throw invalid(`Expected currency must be a three-letter ISO 4217 code, got "${currency}"`);
  }
  return paid.completed && paid.amount === amount && paid.currency === currency.toUpperCase();
}

function invalid(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.REQUEST_INVALID });
}
