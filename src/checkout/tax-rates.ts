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
}

interface SubdividableTaxRates<TState extends PlaceState> {
  state(state: string): TaxRateListBuilder<TState & { state: string }>;
}

export interface ReadableTaxRates {
  get(): Promise<Collection<TaxRate>>;
}

export type TaxRateListBuilder<TState extends PlaceState = PlaceState> =
  TaxRateListMethods<TState> &
    (TState extends { country: string } ? SubdividableTaxRates<TState> : object) &
    (TState extends { productId: string } ? ReadableTaxRates : object);

interface CalculationState extends PlaceState {
  amount?: number;
  idempotencyKey?: string;
}

interface TaxRateMethods<TState extends CalculationState>
  extends ScopeMethods<TaxRateBuilder<TState>> {
  amount(amount: number): TaxRateBuilder<TState & { amount: number }>;
  productId(productId: string): TaxRateBuilder<TState & { productId: string }>;
  country(country: string): TaxRateBuilder<TState & { country: string }>;
  idempotencyKey(idempotencyKey: string): TaxRateBuilder<TState>;
}

interface SubdividableTaxRate<TState extends CalculationState> {
  state(state: string): TaxRateBuilder<TState & { state: string }>;
}

export interface CalculableTaxRate {
  calculate(): Promise<TaxCalculation>;
}

export type TaxRateBuilder<TState extends CalculationState = CalculationState> =
  TaxRateMethods<TState> &
    (TState extends { country: string } ? SubdividableTaxRate<TState> : object) &
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
  };
  if (state.country !== undefined) {
    builder.state = (place: string) => next({ state: place });
  }
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
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.country !== undefined) {
    builder.state = (place: string) => next({ state: place });
  }
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
