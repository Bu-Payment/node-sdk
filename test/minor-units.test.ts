import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { minorUnits } from "../src/money/minor-units";

function refusal(convert: () => number): BuPaymentError {
  try {
    convert();
  } catch (error) {
    expect(error).toBeInstanceOf(BuPaymentError);
    expect((error as BuPaymentError).code).toBe(ErrorCode.REQUEST_INVALID);
    return error as BuPaymentError;
  }
  throw new Error("expected the conversion to be refused");
}

const euro = minorUnits().currency("EUR");

describe("minorUnits fromDecimal", () => {
  it.each<[string, number, number]>([
    ["EUR", 19.99, 1999],
    ["EUR", 0.1 + 0.2, 30],
    ["EUR", 1.15, 115],
    ["EUR", 0.01, 1],
    ["EUR", 121, 12100],
    ["JPY", 1500, 1500],
    ["CVE", 1234.5, 123450],
    ["BHD", 1.234, 1234],
    ["CLF", 1.2345, 12345],
  ])("converts %s %s to %s", (currency, amount, expected) => {
    expect(minorUnits().currency(currency).fromDecimal(amount)).toBe(expected);
  });

  it("absorbs the drift of summed decimals", () => {
    const total = Array.from({ length: 10 }, () => 0.1).reduce((sum, value) => sum + value, 0);
    expect(total).not.toBe(1);
    expect(euro.fromDecimal(total)).toBe(100);
  });

  it("round-trips every cent up to ten thousand euros", () => {
    const drifted: number[] = [];
    for (let cents = 1; cents <= 1_000_000; cents += 1) {
      const decimal = euro.toDecimal(cents);
      if (decimal !== Number((cents / 100).toFixed(2)) || euro.fromDecimal(decimal) !== cents) {
        drifted.push(cents);
      }
    }
    expect(drifted).toEqual([]);
  });

  it("reads the currency code in any case", () => {
    expect(minorUnits().currency("eur").fromDecimal(19.99)).toBe(1999);
  });
});

describe("minorUnits toDecimal", () => {
  it.each<[string, number, number]>([
    ["EUR", 1999, 19.99],
    ["EUR", 30, 0.3],
    ["JPY", 1500, 1500],
    ["CVE", 123450, 1234.5],
    ["BHD", 1234, 1.234],
    ["CLF", 12345, 1.2345],
  ])("converts %s %s to %s", (currency, units, expected) => {
    expect(minorUnits().currency(currency).toDecimal(units)).toBe(expected);
  });
});

describe("minorUnits refusals", () => {
  it.each([
    0,
    -1,
    -19.99,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("refuses %s as a decimal amount", (amount) => {
    expect(refusal(() => euro.fromDecimal(amount)).message).toBe(
      `Amount must be a positive finite number, got ${amount}`,
    );
  });

  it.each<[string, number, number]>([
    ["EUR", 19.999, 2],
    ["EUR", 0.001, 2],
    ["JPY", 1.5, 0],
    ["CVE", 10.005, 2],
    ["BHD", 1.2345, 3],
  ])("refuses %s %s for its %s decimal places", (currency, amount, exponent) => {
    expect(refusal(() => minorUnits().currency(currency).fromDecimal(amount)).message).toBe(
      `Amount ${amount} has more decimal places than ${currency} allows (${exponent})`,
    );
  });

  it("refuses an amount beyond the safe integer range", () => {
    expect(refusal(() => euro.fromDecimal(1e14)).message).toBe(
      "Amount 100000000000000 is too large to count in minor units",
    );
  });

  it.each([
    0,
    -100,
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 53,
  ])("refuses %s as minor units", (units) => {
    expect(refusal(() => euro.toDecimal(units)).message).toBe(
      `Minor units must be a positive safe integer, got ${units}`,
    );
  });

  it.each(["XYZ", "MGA", "MRU", "", "EURO"])("refuses the currency %j", (currency) => {
    const error = refusal(() => minorUnits().currency(currency).fromDecimal(1));
    expect(error.message).toBe(
      `"${currency}" is not an ISO 4217 currency with a decimal minor unit`,
    );
    expect(error.metadata).toEqual({ currency });
    expect(refusal(() => minorUnits().currency(currency).toDecimal(1)).message).toBe(error.message);
  });
});
