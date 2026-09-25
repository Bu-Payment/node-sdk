import {
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  writeRequest,
} from "../core/builder";
import { encodePathSegment } from "../core/request-target";
import { type PaymentMethodSetupDraft, paymentMethodSetupDraft } from "./setup-draft";
import type { PaymentMethod, PaymentMethodList } from "./types";

type PaymentMethodState = RequestScope & { idempotencyKey?: string };

export interface PaymentMethodListBuilder extends ScopeMethods<PaymentMethodListBuilder> {
  get(): Promise<PaymentMethodList>;
}

export interface PaymentMethodBuilder extends ScopeMethods<PaymentMethodBuilder> {
  idempotencyKey(idempotencyKey: string): PaymentMethodBuilder;
  get(): Promise<PaymentMethod>;
  revoke(): Promise<PaymentMethod>;
}

export interface PaymentMethodsClient {
  list(customerId: string): PaymentMethodListBuilder;
  paymentMethod(customerId: string, paymentMethodId: string): PaymentMethodBuilder;
  createSetup(customerId: string): PaymentMethodSetupDraft<Record<never, never>>;
}

export function createPaymentMethodsClient(send: Sender): PaymentMethodsClient {
  return Object.freeze({
    list: (customerId: string) => paymentMethodList(send, customerId, {}),
    paymentMethod: (customerId: string, paymentMethodId: string) =>
      singlePaymentMethod(send, customerId, paymentMethodId, {}),
    createSetup: (customerId: string) =>
      paymentMethodSetupDraft(send, () => `${customerPaymentMethodsPath(customerId)}/setups`, {}),
  });
}

function paymentMethodList(
  send: Sender,
  customerId: string,
  state: RequestScope,
): PaymentMethodListBuilder {
  const next = (update: Partial<RequestScope>) =>
    paymentMethodList(send, customerId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<PaymentMethodList>(readRequest(customerPaymentMethodsPath(customerId), state)),
  });
}

function singlePaymentMethod(
  send: Sender,
  customerId: string,
  paymentMethodId: string,
  state: PaymentMethodState,
): PaymentMethodBuilder {
  const path = () =>
    `${customerPaymentMethodsPath(customerId)}/${encodePathSegment(paymentMethodId)}`;
  const next = (update: Partial<PaymentMethodState>) =>
    singlePaymentMethod(send, customerId, paymentMethodId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () => send<PaymentMethod>(readRequest(path(), state)),
    revoke: () => send<PaymentMethod>(writeRequest("DELETE", path(), state)),
  });
}

function customerPaymentMethodsPath(customerId: string): string {
  return `/v1/customers/${encodePathSegment(customerId)}/payment-methods`;
}
