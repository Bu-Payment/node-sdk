import { ErrorCode } from "../constants";
import {
  type CursorScope,
  pageMethods,
  pageQuery,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
} from "../core/builder";
import type { Page } from "../core/pagination";
import { BuPaymentError } from "../errors";
import type { ShippingRate } from "./types";

export interface ShippingState extends CursorScope {
  currency?: string;
  destinationCountry?: string;
  products?: string[];
}

interface ShippingMethods<TState extends ShippingState>
  extends ScopeMethods<ShippingRatesBuilder<TState>> {
  currency(currency: string): ShippingRatesBuilder<TState & { currency: string }>;
  destinationCountry(
    destinationCountry: string,
  ): ShippingRatesBuilder<TState & { destinationCountry: string }>;
  product(productId: string): ShippingRatesBuilder<TState & { products: string[] }>;
  cursor(cursor: string): ShippingRatesBuilder<TState>;
  limit(limit: number): ShippingRatesBuilder<TState>;
}

export interface ResolvableShippingRates {
  get(): Promise<Page<ShippingRate>>;
  all(): AsyncGenerator<ShippingRate, void, undefined>;
}

export type ShippingRatesBuilder<TState extends ShippingState = ShippingState> =
  ShippingMethods<TState> &
    (TState extends { currency: string; destinationCountry: string; products: string[] }
      ? ResolvableShippingRates
      : object);

export function shippingRatesBuilder<TState extends ShippingState>(
  send: Sender,
  state: TState,
): ShippingRatesBuilder<TState> {
  const next = (update: Partial<ShippingState>) =>
    shippingRatesBuilder(send, { ...state, ...update });
  const read = async (page: ShippingState) =>
    await send<Page<ShippingRate>>(readRequest("/v1/shipping-rates", page, wireQuery(page)));
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    currency: (currency: string) => next({ currency }),
    destinationCountry: (destinationCountry: string) => next({ destinationCountry }),
    product: (productId: string) => next({ products: [...(state.products ?? []), productId] }),
    cursor: (cursor: string) => next({ cursor }),
    limit: (limit: number) => next({ limit }),
  };
  if (isResolvable(state)) {
    const { get, all } = pageMethods(state, next, read);
    builder.get = get;
    builder.all = all;
  }
  return Object.freeze(builder) as ShippingRatesBuilder<TState>;
}

function isResolvable(state: ShippingState): boolean {
  return (
    state.currency !== undefined &&
    state.destinationCountry !== undefined &&
    (state.products?.length ?? 0) > 0
  );
}

function wireQuery(state: ShippingState) {
  const products = state.products ?? [];
  if (products.some((productId) => productId.includes(","))) {
    throw new BuPaymentError("A product identifier must not contain a comma", {
      code: ErrorCode.REQUEST_INVALID,
    });
  }
  return pageQuery(state, {
    currency: state.currency as string,
    destinationCountry: state.destinationCountry as string,
    productIds: products.join(","),
  });
}
