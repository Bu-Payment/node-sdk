import type { ExpectedPrice } from "./types";

export interface ExpectedPriceState {
  expectedUnitAmount?: number;
  expectedCurrency?: string;
}

export interface ExpectedUnitAmountMethod<TNext> {
  expectedUnitAmount(unitAmount: number): TNext;
}

export interface ExpectedCurrencyMethod<TNext> {
  expectedCurrency(currency: string): TNext;
}

export type ExpectedPriceSettled<TState> = TState extends { expectedUnitAmount: number }
  ? TState extends { expectedCurrency: string }
    ? true
    : false
  : true;

export function pinExpectedPrice(expected: ExpectedPrice): Readonly<ExpectedPrice> {
  return Object.freeze({ unitAmount: expected.unitAmount, currency: expected.currency });
}

export function expectedPriceMethods(
  state: ExpectedPriceState,
  next: (update: ExpectedPriceState) => unknown,
): Record<string, unknown> {
  return {
    expectedUnitAmount: (expectedUnitAmount: number) => next({ expectedUnitAmount }),
    ...("expectedUnitAmount" in state
      ? { expectedCurrency: (expectedCurrency: string) => next({ expectedCurrency }) }
      : {}),
  };
}

export function isExpectedPriceSettled(state: ExpectedPriceState): boolean {
  if (!("expectedUnitAmount" in state)) {
    return true;
  }
  return state.expectedUnitAmount !== undefined && state.expectedCurrency !== undefined;
}

export function expectedPriceField(state: ExpectedPriceState): {
  expectedPrice?: ExpectedPrice;
} {
  const { expectedUnitAmount, expectedCurrency } = state;
  return expectedUnitAmount === undefined || expectedCurrency === undefined
    ? {}
    : { expectedPrice: { unitAmount: expectedUnitAmount, currency: expectedCurrency } };
}
