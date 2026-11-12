import { type RequestScope, type ScopeMethods, scopeMethods } from "../core/builder";
import { ensureMirror, type MirrorCatalogue, type MirrorState } from "./mirror-ensure";
import type { ProductMirrorResult } from "./types";

interface ProductMirrorMethods<TState extends MirrorState>
  extends ScopeMethods<ProductMirror<TState>> {
  knownId(productId: string): ProductMirror<TState>;
  name(name: string): ProductMirror<TState & { name: string }>;
  active(active: boolean): ProductMirror<TState>;
  defaultUnitAmount(unitAmount: number): ProductMirror<TState & { defaultUnitAmount: number }>;
  idempotencyKey(idempotencyKey: string): ProductMirror<TState & { idempotencyKey: string }>;
}

interface PricedMirror<TState extends MirrorState> {
  defaultCurrency(currency: string): ProductMirror<TState & { defaultCurrency: string }>;
}

export interface EnsurableProductMirror {
  ensure(): Promise<ProductMirrorResult>;
}

type CompleteDefaultPrice<TState extends MirrorState> = TState extends { defaultUnitAmount: number }
  ? TState extends { defaultCurrency: string }
    ? true
    : false
  : true;

type MirrorTerminal<TState extends MirrorState> = TState extends {
  name: string;
  idempotencyKey: string;
}
  ? CompleteDefaultPrice<TState> extends true
    ? EnsurableProductMirror
    : object
  : object;

export type ProductMirror<TState extends MirrorState = MirrorState> = ProductMirrorMethods<TState> &
  (TState extends { defaultUnitAmount: number } ? PricedMirror<TState> : object) &
  MirrorTerminal<TState>;

export function productMirror<TState extends MirrorState>(
  catalogue: MirrorCatalogue,
  lookupKey: string,
  state: TState,
): ProductMirror<TState> {
  const next = (update: Partial<MirrorState>) =>
    productMirror(catalogue, lookupKey, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods((scope: Partial<RequestScope>) => next(scope)),
    knownId: (knownId: string) => next({ knownId }),
    name: (name: string) => next({ name }),
    active: (active: boolean) => next({ active }),
    defaultUnitAmount: (defaultUnitAmount: number) => next({ defaultUnitAmount }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  const { name, idempotencyKey, defaultUnitAmount, defaultCurrency } = state;
  if (defaultUnitAmount !== undefined) {
    builder.defaultCurrency = (currency: string) => next({ defaultCurrency: currency });
  }
  const defaultPriceComplete = defaultUnitAmount === undefined || defaultCurrency !== undefined;
  if (name !== undefined && idempotencyKey !== undefined && defaultPriceComplete) {
    builder.ensure = async () =>
      await ensureMirror(catalogue, lookupKey, { ...state, name, idempotencyKey });
  }
  return Object.freeze(builder) as ProductMirror<TState>;
}
