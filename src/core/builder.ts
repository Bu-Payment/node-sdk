import type { TransportRequest } from "./http";
import { type Page, paginate } from "./pagination";
import type { QueryInput } from "./request-target";

export interface RequestScope {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CursorScope extends RequestScope {
  cursor?: string;
  limit?: number;
}

export interface ScopeMethods<TBuilder> {
  signal(signal: AbortSignal): TBuilder;
  timeoutMs(timeoutMs: number): TBuilder;
}

export interface PageMethods<TBuilder, TItem> extends ScopeMethods<TBuilder> {
  cursor(cursor: string): TBuilder;
  limit(limit: number): TBuilder;
  get(): Promise<Page<TItem>>;
  all(): AsyncGenerator<TItem, void, undefined>;
}

export type Sender = <T>(request: TransportRequest) => Promise<T>;

export function scopeMethods<TBuilder>(
  next: (update: Partial<RequestScope>) => TBuilder,
): ScopeMethods<TBuilder> {
  return {
    signal: (signal: AbortSignal) => next({ signal }),
    timeoutMs: (timeoutMs: number) => next({ timeoutMs }),
  };
}

export function pageMethods<TState extends CursorScope, TItem, TBuilder>(
  state: TState,
  next: (update: Partial<CursorScope>) => TBuilder,
  read: (state: TState) => Promise<Page<TItem>>,
): PageMethods<TBuilder, TItem> {
  return {
    ...scopeMethods<TBuilder>(next),
    cursor: (cursor: string) => next({ cursor }),
    limit: (limit: number) => next({ limit }),
    get: () => read(state),
    all: () => paginate((page: TState) => read(page), state),
  };
}

export function readRequest(path: string, state: RequestScope, query?: QueryInput) {
  return { method: "GET", path, ...(query === undefined ? {} : { query }), ...scopeOf(state) };
}

export function writeRequest(
  method: string,
  path: string,
  state: RequestScope & { idempotencyKey?: string },
  body?: unknown,
) {
  return {
    method,
    path,
    ...(body === undefined ? {} : { body }),
    ...(state.idempotencyKey === undefined ? {} : { idempotencyKey: state.idempotencyKey }),
    ...scopeOf(state),
  };
}

function scopeOf(state: RequestScope): RequestScope {
  return {
    ...(state.signal === undefined ? {} : { signal: state.signal }),
    ...(state.timeoutMs === undefined ? {} : { timeoutMs: state.timeoutMs }),
  };
}

export function pageQuery(state: CursorScope, extra: QueryInput = {}): QueryInput {
  return {
    ...extra,
    ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
    ...(state.limit === undefined ? {} : { limit: state.limit }),
  };
}
