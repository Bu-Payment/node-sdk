import {
  type CursorScope,
  type PageMethods,
  pageMethods,
  pageQuery,
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  writeRequest,
} from "../core/builder";
import type { PageWithMore } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import type { OwnedRefund, Refund } from "./types";

interface RefundState extends RequestScope {
  paymentId?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface RefundListBuilder
  extends PageMethods<RefundListBuilder, OwnedRefund, PageWithMore<OwnedRefund>> {}

export interface RefundBuilder extends ScopeMethods<RefundBuilder> {
  get(): Promise<OwnedRefund>;
}

interface DraftMethods<TState extends RefundState> extends ScopeMethods<RefundDraft<TState>> {
  paymentId(paymentId: string): RefundDraft<TState & { paymentId: string }>;
  amount(amount: number): RefundDraft<TState & { amount: number }>;
  currency(currency: string): RefundDraft<TState & { currency: string }>;
  reason(reason: string): RefundDraft<TState>;
  idempotencyKey(idempotencyKey: string): RefundDraft<TState>;
}

export interface CreatableRefund {
  create(): Promise<Refund>;
}

type Refundable<TState extends RefundState> = TState extends { paymentId: string }
  ? TState extends { amount: number }
    ? TState extends { currency: string }
      ? true
      : false
    : true
  : false;

export type RefundDraft<TState extends RefundState = RefundState> = DraftMethods<TState> &
  (Refundable<TState> extends true ? CreatableRefund : object);

export interface RefundsClient {
  list(): RefundListBuilder;
  refund(refundId: string): RefundBuilder;
  create(): RefundDraft<Record<never, never>>;
}

export function createRefundsClient(send: Sender): RefundsClient {
  return Object.freeze({
    list: () => refundList(send, {}),
    refund: (refundId: string) => singleRefund(send, refundId, {}),
    create: () => refundDraft(send, {}),
  });
}

function refundList(send: Sender, state: CursorScope): RefundListBuilder {
  const next = (update: Partial<CursorScope>) => refundList(send, { ...state, ...update });
  const read = (page: CursorScope) =>
    send<PageWithMore<OwnedRefund>>(readRequest("/v1/refunds", page, pageQuery(page)));
  return Object.freeze(pageMethods(state, next, read));
}

function singleRefund(send: Sender, refundId: string, state: RequestScope): RefundBuilder {
  const next = (update: Partial<RequestScope>) =>
    singleRefund(send, refundId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<OwnedRefund>(readRequest(`/v1/refunds/${encodePathSegment(refundId)}`, state)),
  });
}

function refundDraft<TState extends RefundState>(send: Sender, state: TState): RefundDraft<TState> {
  const next = (update: Partial<RefundState>) => refundDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    paymentId: (paymentId: string) => next({ paymentId }),
    amount: (amount: number) => next({ amount }),
    currency: (currency: string) => next({ currency }),
    reason: (reason: string) => next({ reason }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (isRefundable(state)) {
    builder.create = () => send<Refund>(writeRequest("POST", "/v1/refunds", state, bodyOf(state)));
  }
  return Object.freeze(builder) as RefundDraft<TState>;
}

function isRefundable(state: RefundState): boolean {
  if (state.paymentId === undefined) {
    return false;
  }
  return state.amount === undefined || state.currency !== undefined;
}

function bodyOf(state: RefundState): Record<string, unknown> {
  return {
    paymentId: state.paymentId,
    ...(state.amount === undefined ? {} : { amount: state.amount }),
    ...(state.currency === undefined ? {} : { currency: state.currency }),
    ...(state.reason === undefined ? {} : { reason: state.reason }),
  };
}
