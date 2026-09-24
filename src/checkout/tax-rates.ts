import type { RequestScope, ScopeMethods, Sender } from "../core/builder";
import { readRequest, scopeMethods, writeRequest } from "../core/builder";
import type { Collection } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import type { TaxCalculation, TaxRate } from "./types";

interface PlaceState extends RequestScope {
  productId?: string;
  country?: string;
  state?: string;
}

interface TaxRateListMethods<TState extends PlaceState>
  extends ScopeMethods<TaxRateListBuilder<TState>> {
  productId(productId: string): TaxRateListBuilder<TState & { productId: string }>;
  country(country: string): TaxRateListBuilder<TState & { country: string }>;
  state(
    state: string,
  ): TState extends { country: string } ? TaxRateListBuilder<TState & { state: string }> : never;
}

export interface ReadableTaxRates {
  get(): Promise<Collection<TaxRate>>;
}

export type TaxRateListBuilder<TState extends PlaceState = PlaceState> =
  TaxRateListMethods<TState> & (TState extends { productId: string } ? ReadableTaxRates : object);

interface CalculationState extends PlaceState {
  amount?: number;
  idempotencyKey?: string;
}

interface TaxRateMethods<TState extends CalculationState>
  extends ScopeMethods<TaxRateBuilder<TState>> {
  amount(amount: number): TaxRateBuilder<TState & { amount: number }>;
  productId(productId: string): TaxRateBuilder<TState & { productId: string }>;
  country(country: string): TaxRateBuilder<TState & { country: string }>;
  state(
    state: string,
  ): TState extends { country: string } ? TaxRateBuilder<TState & { state: string }> : never;
  idempotencyKey(idempotencyKey: string): TaxRateBuilder<TState>;
}

export interface CalculableTaxRate {
  calculate(): Promise<TaxCalculation>;
}

export type TaxRateBuilder<TState extends CalculationState = CalculationState> =
  TaxRateMethods<TState> &
    (TState extends { amount: number; productId: string } ? CalculableTaxRate : object);

export function taxRateList<TState extends PlaceState>(
  send: Sender,
  state: TState,
): TaxRateListBuilder<TState> {
  const next = (update: Partial<PlaceState>) => taxRateList(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    productId: (productId: string) => next({ productId }),
    country: (country: string) => next({ country }),
    state: (place: string) => next({ state: place }),
  };
  if (state.productId !== undefined) {
    builder.get = () =>
      send<Collection<TaxRate>>(readRequest("/v1/tax-rates", state, placeQuery(state)));
  }
  return Object.freeze(builder) as TaxRateListBuilder<TState>;
}

export function taxRateBuilder<TState extends CalculationState>(
  send: Sender,
  taxRateId: string,
  state: TState,
): TaxRateBuilder<TState> {
  const next = (update: Partial<CalculationState>) =>
    taxRateBuilder(send, taxRateId, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    amount: (amount: number) => next({ amount }),
    productId: (productId: string) => next({ productId }),
    country: (country: string) => next({ country }),
    state: (place: string) => next({ state: place }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.amount !== undefined && state.productId !== undefined) {
    builder.calculate = () =>
      send<TaxCalculation>(
        writeRequest("POST", `/v1/tax-rates/${encodePathSegment(taxRateId)}/calculate`, state, {
          amount: state.amount,
          ...placeQuery(state),
        }),
      );
  }
  return Object.freeze(builder) as TaxRateBuilder<TState>;
}

function placeQuery(state: PlaceState) {
  return {
    ...(state.productId === undefined ? {} : { productId: state.productId }),
    ...(state.country === undefined ? {} : { country: state.country }),
    ...(state.state === undefined ? {} : { state: state.state }),
  };
}
