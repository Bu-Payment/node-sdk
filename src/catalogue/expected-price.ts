import type { ExpectedPrice } from "./types";

export function pinExpectedPrice(expected: ExpectedPrice): Readonly<ExpectedPrice> {
  return Object.freeze({ unitAmount: expected.unitAmount, currency: expected.currency });
}

export function expectedPriceField(expected: ExpectedPrice | undefined): {
  expectedPrice?: ExpectedPrice;
} {
  return expected === undefined ? {} : { expectedPrice: expected };
}
