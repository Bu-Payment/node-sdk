import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { Payment, PaymentAllocation } from "./types";

export interface PaymentState extends RequestScope {
  customerId?: string;
  priceId?: string;
  amount?: number;
  currency?: string;
  paymentMethodId?: string;
  allocations?: PaymentAllocation[];
  reference?: string;
  description?: string;
  idempotencyKey?: string;
}

interface PaymentCore<TState extends PaymentState> extends ScopeMethods<PaymentDraft<TState>> {
  customerId(customerId: string): PaymentDraft<TState & { customerId: string }>;
  paymentMethodId(paymentMethodId: string): PaymentDraft<TState & { paymentMethodId: string }>;
  reference(reference: string): PaymentDraft<TState>;
  description(description: string): PaymentDraft<TState>;
  idempotencyKey(idempotencyKey: string): PaymentDraft<TState>;
}

interface CanonicalPricing<TState extends PaymentState> {
  priceId(priceId: string): PaymentDraft<TState & { priceId: string }>;
}

interface AdHocPricing<TState extends PaymentState> {
  amount(amount: number): PaymentDraft<TState & { amount: number }>;
  currency(currency: string): PaymentDraft<TState & { currency: string }>;
}

interface Allocating<TState extends PaymentState> {
  allocation(
    reference: string,
    amount: number,
    currency: string,
  ): PaymentDraft<TState & { allocations: PaymentAllocation[] }>;
}

export interface CreatablePayment {
  create(): Promise<Payment>;
}

type Priced<TState extends PaymentState> = TState extends { priceId: string }
  ? true
  : TState extends { amount: number; currency: string }
    ? true
    : false;

export type PaymentDraft<TState extends PaymentState = PaymentState> = PaymentCore<TState> &
  (TState extends { amount: number } | { currency: string } ? object : CanonicalPricing<TState>) &
  (TState extends { priceId: string } ? object : AdHocPricing<TState>) &
  (TState extends { paymentMethodId: string } ? Allocating<TState> : object) &
  (TState extends { customerId: string }
    ? Priced<TState> extends true
      ? CreatablePayment
      : object
    : object);

export function paymentDraft<TState extends PaymentState>(
  send: DeferredSender,
  state: TState,
): PaymentDraft<TState> {
  const next = (update: Partial<PaymentState>) => paymentDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    customerId: (customerId: string) => next({ customerId }),
    paymentMethodId: (paymentMethodId: string) => next({ paymentMethodId }),
    reference: (reference: string) => next({ reference }),
    description: (description: string) => next({ description }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.amount === undefined && state.currency === undefined) {
    builder.priceId = (priceId: string) => next({ priceId });
  }
  if (state.priceId === undefined) {
    builder.amount = (amount: number) => next({ amount });
    builder.currency = (currency: string) => next({ currency });
  }
  if (state.paymentMethodId !== undefined) {
    builder.allocation = (reference: string, amount: number, currency: string) =>
      next({ allocations: [...(state.allocations ?? []), { reference, amount, currency }] });
  }
  if (isCreatable(state)) {
    builder.create = () =>
      send<Payment>(() => writeRequest("POST", "/v1/payments", state, bodyOf(state)));
  }
  return Object.freeze(builder) as PaymentDraft<TState>;
}

function isCreatable(state: PaymentState): boolean {
  if (state.customerId === undefined) {
    return false;
  }
  return (
    state.priceId !== undefined || (state.amount !== undefined && state.currency !== undefined)
  );
}

function bodyOf(state: PaymentState): Record<string, unknown> {
  return {
    customerId: state.customerId,
    ...(state.priceId === undefined ? {} : { priceId: state.priceId }),
    ...(state.amount === undefined ? {} : { amount: state.amount }),
    ...(state.currency === undefined ? {} : { currency: state.currency }),
    ...(state.paymentMethodId === undefined ? {} : { paymentMethodId: state.paymentMethodId }),
    ...(state.allocations === undefined ? {} : { allocations: state.allocations }),
    ...(state.reference === undefined ? {} : { reference: state.reference }),
    ...(state.description === undefined ? {} : { description: state.description }),
  };
}
