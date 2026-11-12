import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import { currencyExponent } from "./currency-exponents";

const ROUNDING_TOLERANCE = Number.EPSILON * 8;

interface MinorUnitsState {
  currency?: string;
}

interface CurrencyChoice {
  currency(currency: string): MinorUnitsBuilder<{ currency: string }>;
}

export interface MinorUnitsConversion {
  fromDecimal(amount: number): number;
  toDecimal(minorUnits: number): number;
}

export type MinorUnitsBuilder<TState extends MinorUnitsState = MinorUnitsState> = CurrencyChoice &
  (TState extends { currency: string } ? MinorUnitsConversion : object);

export function minorUnits(): MinorUnitsBuilder<Record<never, never>> {
  return minorUnitsBuilder({});
}

function minorUnitsBuilder<TState extends MinorUnitsState>(
  state: TState,
): MinorUnitsBuilder<TState> {
  const builder: Record<string, unknown> = {
    currency: (currency: string) => minorUnitsBuilder({ currency }),
  };
  const { currency } = state;
  if (currency !== undefined) {
    builder.fromDecimal = (amount: number) => fromDecimal(currency, amount);
    builder.toDecimal = (units: number) => toDecimal(currency, units);
  }
  return Object.freeze(builder) as MinorUnitsBuilder<TState>;
}

function fromDecimal(currency: string, amount: number): number {
  const exponent = exponentOf(currency);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw invalid(`Amount must be a positive finite number, got ${amount}`, currency);
  }
  const scaled = amount * 10 ** exponent;
  const units = Math.round(scaled);
  if (Math.abs(scaled - units) > scaled * ROUNDING_TOLERANCE) {
    throw invalid(
      `Amount ${amount} has more decimal places than ${currency.toUpperCase()} allows (${exponent})`,
      currency,
    );
  }
  if (!Number.isSafeInteger(units)) {
    throw invalid(`Amount ${amount} is too large to count in minor units`, currency);
  }
  return units;
}

function toDecimal(currency: string, units: number): number {
  const exponent = exponentOf(currency);
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw invalid(`Minor units must be a positive safe integer, got ${units}`, currency);
  }
  return units / 10 ** exponent;
}

function exponentOf(currency: string): number {
  const exponent = currencyExponent(currency.toUpperCase());
  if (exponent === undefined) {
    throw invalid(`"${currency}" is not an ISO 4217 currency with a decimal minor unit`, currency);
  }
  return exponent;
}

function invalid(message: string, currency: string): BuPaymentError {
  return new BuPaymentError(message, {
    code: ErrorCode.REQUEST_INVALID,
    metadata: { currency },
  });
}
