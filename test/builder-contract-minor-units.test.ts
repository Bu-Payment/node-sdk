import { describe, expect, it } from "vitest";
import { minorUnits } from "../src/money/minor-units";

describe("minorUnits builder contract", () => {
  it("returns a new frozen builder and leaves the earlier one untouched", () => {
    const base = minorUnits();
    const euro = base.currency("EUR");
    const yen = euro.currency("JPY");
    expect(euro).not.toBe(base);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(euro)).toBe(true);
    expect(euro.fromDecimal(15)).toBe(1500);
    expect(yen.fromDecimal(15)).toBe(15);
  });

  it("offers the conversions only once a currency is set", () => {
    const base = minorUnits();
    expect("fromDecimal" in base).toBe(false);
    expect("toDecimal" in base).toBe(false);
    expect("fromDecimal" in base.currency("EUR")).toBe(true);
    expect("toDecimal" in base.currency("EUR")).toBe(true);
  });

  it("reuses one configured currency for many conversions", () => {
    const euro = minorUnits().currency("EUR");
    expect([19.99, 0.5, 100].map((amount) => euro.fromDecimal(amount))).toEqual([1999, 50, 10000]);
    expect(euro.toDecimal(euro.fromDecimal(19.99))).toBe(19.99);
  });

  it("refuses an unknown currency in the terminal, not while configuring", () => {
    const unknown = minorUnits().currency("XYZ");
    expect(() => unknown.fromDecimal(1)).toThrow();
  });
});
