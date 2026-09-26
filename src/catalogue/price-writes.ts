import {
  type DeferredSender,
  type RequestScope,
  type ScopeMethods,
  scopeMethods,
  stableIdempotencyKey,
  writeRequest,
} from "../core/builder";
import { encodePathSegment } from "../core/request-target";
import type { Price, PriceChange, PriceInterval } from "./types";

interface PriceFields {
  unitAmount?: number;
  currency?: string;
  description?: string;
  interval?: PriceInterval;
  intervalCount?: number;
  lookupKey?: string;
  transferLookupKey?: boolean;
}

type PriceDraftState = PriceFields &
  RequestScope & {
    previousPriceId?: string;
    expectedUpdatedAt?: string;
    idempotencyKey?: string;
  };

interface PriceDraftMethods<TState extends PriceDraftState>
  extends ScopeMethods<PriceDraft<TState>> {
  unitAmount(unitAmount: number): PriceDraft<TState & { unitAmount: number }>;
  currency(currency: string): PriceDraft<TState & { currency: string }>;
  description(description: string): PriceDraft<TState>;
  interval(interval: PriceInterval): PriceDraft<TState & { interval: PriceInterval }>;
  lookupKey(lookupKey: string): PriceDraft<TState & { lookupKey: string }>;
  replacing(priceId: string): PriceDraft<TState & { previousPriceId: string }>;
  idempotencyKey(idempotencyKey: string): PriceDraft<TState>;
}

interface Recurring<TState extends PriceDraftState> {
  intervalCount(intervalCount: number): PriceDraft<TState>;
}

interface Transferable<TState extends PriceDraftState> {
  transferLookupKey(): PriceDraft<TState>;
}

interface Replacing<TState extends PriceDraftState> {
  expectedUpdatedAt(expectedUpdatedAt: string): PriceDraft<TState>;
}

export interface CreatablePrice {
  create(): Promise<Price>;
}

export interface ReplaceablePrice {
  replace(): Promise<PriceChange>;
}

type PriceTerminal<TState extends PriceDraftState> = TState extends {
  unitAmount: number;
  currency: string;
}
  ? TState extends { previousPriceId: string }
    ? ReplaceablePrice
    : CreatablePrice
  : object;

export type PriceDraft<TState extends PriceDraftState = PriceDraftState> =
  PriceDraftMethods<TState> &
    (TState extends { interval: PriceInterval } ? Recurring<TState> : object) &
    (TState extends { lookupKey: string } ? Transferable<TState> : object) &
    (TState extends { previousPriceId: string } ? Replacing<TState> : object) &
    PriceTerminal<TState>;

interface ReplacementKeys {
  create: (supplied: string | undefined) => string;
  archive: (supplied: string | undefined) => string;
}

export function priceDraft<TState extends PriceDraftState>(
  send: DeferredSender,
  productId: string,
  state: TState,
  keys: ReplacementKeys = { create: stableIdempotencyKey(), archive: stableIdempotencyKey() },
): PriceDraft<TState> {
  const next = (update: Partial<PriceDraftState>) =>
    priceDraft(send, productId, { ...state, ...update });
  const createPath = () => `/v1/products/${encodePathSegment(productId)}/prices`;
  const create = (path: string, idempotencyKey: string) =>
    send<Price>(() => writeRequest("POST", path, { ...state, idempotencyKey }, bodyOf(state)));
  const builder: Record<string, unknown> = {
    ...scopeMethods((scope) => priceDraft(send, productId, { ...state, ...scope }, keys)),
    unitAmount: (unitAmount: number) => next({ unitAmount }),
    currency: (currency: string) => next({ currency }),
    description: (description: string) => next({ description }),
    interval: (interval: PriceInterval) => next({ interval }),
    lookupKey: (lookupKey: string) => next({ lookupKey }),
    replacing: (previousPriceId: string) => next({ previousPriceId }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.interval !== undefined) {
    builder.intervalCount = (intervalCount: number) => next({ intervalCount });
  }
  if (state.lookupKey !== undefined) {
    builder.transferLookupKey = () => next({ transferLookupKey: true });
  }
  const previousPriceId = state.previousPriceId;
  if (previousPriceId !== undefined) {
    builder.expectedUpdatedAt = (expectedUpdatedAt: string) =>
      priceDraft(
        send,
        productId,
        { ...state, expectedUpdatedAt },
        { create: keys.create, archive: stableIdempotencyKey() },
      );
  }
  if (state.unitAmount !== undefined && state.currency !== undefined) {
    if (previousPriceId === undefined) {
      builder.create = async () => await create(createPath(), keys.create(state.idempotencyKey));
    } else {
      builder.replace = async (): Promise<PriceChange> => {
        const replacementPath = createPath();
        const archivePath = `/v1/prices/${encodePathSegment(previousPriceId)}/archive`;
        const replacement = await create(replacementPath, keys.create(state.idempotencyKey));
        try {
          const archived = await send<Price>(() =>
            writeRequest(
              "POST",
              archivePath,
              { ...state, idempotencyKey: keys.archive(state.idempotencyKey) },
              state.expectedUpdatedAt === undefined
                ? undefined
                : { expectedUpdatedAt: state.expectedUpdatedAt },
            ),
          );
          return { outcome: "replaced", replacement, archived };
        } catch (error) {
          return { outcome: "archive_failed", replacement, previousPriceId, error };
        }
      };
    }
  }
  return Object.freeze(builder) as PriceDraft<TState>;
}

function bodyOf(state: PriceFields): Record<string, unknown> {
  return {
    unitAmount: state.unitAmount,
    currency: state.currency,
    ...(state.description === undefined ? {} : { description: state.description }),
    ...(state.interval === undefined
      ? {}
      : {
          recurring: {
            interval: state.interval,
            ...(state.intervalCount === undefined ? {} : { intervalCount: state.intervalCount }),
          },
        }),
    ...(state.lookupKey === undefined ? {} : { lookupKey: state.lookupKey }),
    ...(state.transferLookupKey === undefined
      ? {}
      : { transferLookupKey: state.transferLookupKey }),
  };
}
