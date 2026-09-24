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
} from "../core/builder";
import type { PageWithMore } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import { type PaymentDraft, paymentDraft } from "./draft";
import type { Payment } from "./types";

export interface PaymentListBuilder
  extends PageMethods<PaymentListBuilder, Payment, PageWithMore<Payment>> {}

export interface PaymentBuilder extends ScopeMethods<PaymentBuilder> {
  get(): Promise<Payment>;
}

export interface PaymentsClient {
  list(): PaymentListBuilder;
  payment(paymentId: string): PaymentBuilder;
  create(): PaymentDraft<Record<never, never>>;
}

export function createPaymentsClient(send: Sender): PaymentsClient {
  return Object.freeze({
    list: () => paymentList(send, {}),
    payment: (paymentId: string) => singlePayment(send, paymentId, {}),
    create: () => paymentDraft(send, {}),
  });
}

function paymentList(send: Sender, state: CursorScope): PaymentListBuilder {
  const next = (update: Partial<CursorScope>) => paymentList(send, { ...state, ...update });
  const read = (page: CursorScope) =>
    send<PageWithMore<Payment>>(readRequest("/v1/payments", page, pageQuery(page)));
  return Object.freeze(pageMethods(state, next, read));
}

function singlePayment(send: Sender, paymentId: string, state: RequestScope): PaymentBuilder {
  const next = (update: Partial<RequestScope>) =>
    singlePayment(send, paymentId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<Payment>(readRequest(`/v1/payments/${encodePathSegment(paymentId)}`, state)),
  });
}
