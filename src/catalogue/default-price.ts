import {
  type DeferredSender,
  type RequestScope,
  type ScopeMethods,
  scopeMethods,
  stableIdempotencyKey,
  writeRequest,
} from "../core/builder";
import type { TransportRequest } from "../core/http";
import { encodePathSegment } from "../core/request-target";
import type { Product } from "./types";

type DefaultPriceState = RequestScope & {
  priceId?: string;
  expectedUpdatedAt?: string;
  idempotencyKey?: string;
};

interface DefaultPriceMethods<TState extends DefaultPriceState>
  extends ScopeMethods<DefaultPriceChange<TState>> {
  priceId(priceId: string): DefaultPriceChange<TState & { priceId: string }>;
  idempotencyKey(idempotencyKey: string): DefaultPriceChange<TState>;
}

interface Selected<TState extends DefaultPriceState> {
  expectedUpdatedAt(expectedUpdatedAt: string): DefaultPriceChange<TState>;
  update(): Promise<Product>;
}

export type DefaultPriceChange<TState extends DefaultPriceState = DefaultPriceState> =
  DefaultPriceMethods<TState> & (TState extends { priceId: string } ? Selected<TState> : object);

interface DefaultPriceBody {
  priceId: string;
  expectedUpdatedAt?: string;
}

export function defaultPriceRequest(
  productId: string,
  body: DefaultPriceBody,
  request: RequestScope & { idempotencyKey: string },
): TransportRequest {
  return writeRequest(
    "PUT",
    `/v1/products/${encodePathSegment(productId)}/default-price`,
    request,
    body,
  );
}

export function defaultPriceChange<TState extends DefaultPriceState>(
  send: DeferredSender,
  productId: string,
  state: TState,
  idempotencyKeyFor = stableIdempotencyKey(),
): DefaultPriceChange<TState> {
  const next = (update: Partial<DefaultPriceState>) =>
    defaultPriceChange(send, productId, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods((scope) =>
      defaultPriceChange(send, productId, { ...state, ...scope }, idempotencyKeyFor),
    ),
    priceId: (priceId: string) => next({ priceId }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  const priceId = state.priceId;
  if (priceId !== undefined) {
    builder.expectedUpdatedAt = (expectedUpdatedAt: string) => next({ expectedUpdatedAt });
    builder.update = async () =>
      await send<Product>(() =>
        defaultPriceRequest(
          productId,
          {
            priceId,
            ...(state.expectedUpdatedAt === undefined
              ? {}
              : { expectedUpdatedAt: state.expectedUpdatedAt }),
          },
          { ...state, idempotencyKey: idempotencyKeyFor(state.idempotencyKey) },
        ),
      );
  }
  return Object.freeze(builder) as DefaultPriceChange<TState>;
}
