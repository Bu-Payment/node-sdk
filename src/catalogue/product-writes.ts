import {
  type RequestScope,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  stableIdempotencyKey,
  writeRequest,
} from "../core/builder";
import type { Product } from "./types";

interface ProductFields {
  name?: string;
  description?: string | null;
  lookupKey?: string | null;
}

type ProductWriteState = ProductFields &
  RequestScope & { idempotencyKey?: string; expectedUpdatedAt?: string };

interface ProductDraftMethods<TState extends ProductWriteState>
  extends ScopeMethods<ProductDraft<TState>> {
  name(name: string): ProductDraft<TState & { name: string }>;
  description(description: string): ProductDraft<TState>;
  lookupKey(lookupKey: string): ProductDraft<TState>;
  idempotencyKey(idempotencyKey: string): ProductDraft<TState>;
}

export interface CreatableProduct {
  create(): Promise<Product>;
}

export type ProductDraft<TState extends ProductWriteState = ProductWriteState> =
  ProductDraftMethods<TState> & (TState extends { name: string } ? CreatableProduct : object);

interface ProductUpdateMethods<TState extends ProductWriteState>
  extends ScopeMethods<ProductUpdate<TState>> {
  name(name: string): ProductUpdate<TState & { name: string }>;
  description(description: string | null): ProductUpdate<TState & { description: string | null }>;
  lookupKey(lookupKey: string | null): ProductUpdate<TState & { lookupKey: string | null }>;
  expectedUpdatedAt(expectedUpdatedAt: string): ProductUpdate<TState>;
  idempotencyKey(idempotencyKey: string): ProductUpdate<TState>;
}

export interface UpdatableProduct {
  update(): Promise<Product>;
}

export type ProductUpdate<TState extends ProductWriteState = ProductWriteState> =
  ProductUpdateMethods<TState> &
    (TState extends { name: string } | { description: string | null } | { lookupKey: string | null }
      ? UpdatableProduct
      : object);

export function productDraft<TState extends ProductWriteState>(
  send: Sender,
  state: TState,
): ProductDraft<TState> {
  const idempotencyKeyFor = stableIdempotencyKey();
  const next = (update: Partial<ProductWriteState>) => productDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    name: (name: string) => next({ name }),
    description: (description: string) => next({ description }),
    lookupKey: (lookupKey: string) => next({ lookupKey }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.name !== undefined) {
    builder.create = async () =>
      await send<Product>(
        writeRequest(
          "POST",
          "/v1/products",
          { ...state, idempotencyKey: idempotencyKeyFor(state.idempotencyKey) },
          fieldsOf(state),
        ),
      );
  }
  return Object.freeze(builder) as ProductDraft<TState>;
}

export function productUpdate<TState extends ProductWriteState>(
  send: Sender,
  path: () => string,
  state: TState,
): ProductUpdate<TState> {
  const idempotencyKeyFor = stableIdempotencyKey();
  const next = (update: Partial<ProductWriteState>) =>
    productUpdate(send, path, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    name: (name: string) => next({ name }),
    description: (description: string | null) => next({ description }),
    lookupKey: (lookupKey: string | null) => next({ lookupKey }),
    expectedUpdatedAt: (expectedUpdatedAt: string) => next({ expectedUpdatedAt }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (Object.keys(fieldsOf(state)).length > 0) {
    builder.update = async () =>
      await send<Product>(
        writeRequest(
          "PATCH",
          path(),
          { ...state, idempotencyKey: idempotencyKeyFor(state.idempotencyKey) },
          {
            ...fieldsOf(state),
            ...(state.expectedUpdatedAt === undefined
              ? {}
              : { expectedUpdatedAt: state.expectedUpdatedAt }),
          },
        ),
      );
  }
  return Object.freeze(builder) as ProductUpdate<TState>;
}

function fieldsOf(state: ProductFields): ProductFields {
  return {
    ...(state.name === undefined ? {} : { name: state.name }),
    ...(state.description === undefined ? {} : { description: state.description }),
    ...(state.lookupKey === undefined ? {} : { lookupKey: state.lookupKey }),
  };
}
