import type { Price, PriceInterval } from "./types";

export interface PriceTerms {
  readonly currency: string;
  readonly type: Price["type"];
  readonly interval: PriceInterval | null;
  readonly intervalCount: number | null;
}

export type PricedTerms = Pick<Price, "currency" | "type" | "recurring">;

export function priceTerms(price: PricedTerms): PriceTerms {
  return Object.freeze({
    currency: price.currency,
    type: price.type,
    interval: price.recurring?.interval ?? null,
    intervalCount: price.recurring?.intervalCount ?? null,
  });
}

export function sameTerms(
  first: PricedTerms | PriceTerms,
  second: PricedTerms | PriceTerms,
): boolean {
  const a = termsOf(first);
  const b = termsOf(second);
  return (
    a.currency === b.currency &&
    a.type === b.type &&
    a.interval === b.interval &&
    a.intervalCount === b.intervalCount
  );
}

function termsOf(value: PricedTerms | PriceTerms): PriceTerms {
  return "recurring" in value ? priceTerms(value) : value;
}
