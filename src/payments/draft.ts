import {
  type ExpectedCurrencyMethod,
  type ExpectedPriceSettled,
  type ExpectedPriceState,
  type ExpectedUnitAmountMethod,
  expectedPriceField,
  expectedPriceMethods,
  isExpectedPriceSettled,
} from "../catalogue/expected-price";
import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { Payment, PaymentAllocation } from "./types";

type OpenAllocation = Pick<PaymentAllocation, "reference"> | Omit<PaymentAllocation, "currency">;

export interface PaymentState extends RequestScope, ExpectedPriceState {
  customerId?: string;
  priceId?: string;
  amount?: number;
  currency?: string;
  paymentMethodId?: string;
  allocations?: PaymentAllocation[];
  openAllocation?: OpenAllocation;
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

interface AllocationOpening<TState extends PaymentState> {
  allocationReference(
    reference: string,
  ): PaymentDraft<TState & { openAllocation: Pick<PaymentAllocation, "reference"> }>;
}

interface AllocationAmount<TState extends PaymentState> {
  allocationAmount(
    amount: number,
  ): PaymentDraft<TState & { openAllocation: Omit<PaymentAllocation, "currency"> }>;
}

interface AllocationClosing<TState extends PaymentState> {
  allocationCurrency(
    currency: string,
  ): PaymentDraft<
    Omit<TState, "openAllocation"> & PaymentState & { allocations: PaymentAllocation[] }
  >;
}

type Allocating<TState extends PaymentState> = TState extends {
  openAllocation: { amount: number };
}
  ? AllocationClosing<TState>
  : TState extends { openAllocation: OpenAllocation }
    ? AllocationAmount<TState>
    : AllocationOpening<TState>;

export interface CreatablePayment {
  create(): Promise<Payment>;
}

type Priced<TState extends PaymentState> = TState extends { priceId: string }
  ? ExpectedPriceSettled<TState>
  : TState extends { amount: number; currency: string }
    ? true
    : false;

export type PaymentDraft<TState extends PaymentState = PaymentState> = PaymentCore<TState> &
  (TState extends { amount: number } | { currency: string } ? object : CanonicalPricing<TState>) &
  (TState extends { priceId: string }
    ? ExpectedUnitAmountMethod<PaymentDraft<TState & { expectedUnitAmount: number }>> &
        (TState extends { expectedUnitAmount: number }
          ? ExpectedCurrencyMethod<PaymentDraft<TState & { expectedCurrency: string }>>
          : object)
    : AdHocPricing<TState>) &
  (TState extends { paymentMethodId: string } ? Allocating<TState> : object) &
  (TState extends { customerId: string }
    ? [Priced<TState>, TState extends { openAllocation: OpenAllocation } ? false : true] extends [
        true,
        true,
      ]
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
  if (state.priceId !== undefined) {
    Object.assign(builder, expectedPriceMethods(state, next));
  }
  if (state.priceId === undefined) {
    builder.amount = (amount: number) => next({ amount });
    builder.currency = (currency: string) => next({ currency });
  }
  if (state.paymentMethodId !== undefined) {
    const { openAllocation, ...settled }: PaymentState = state;
    const close = (allocation: PaymentAllocation) =>
      paymentDraft(send, { ...settled, allocations: [...(state.allocations ?? []), allocation] });
    Object.assign(builder, allocationMethods(state, next, close));
  }
  if (isCreatable(state)) {
    builder.create = () =>
      send<Payment>(() => writeRequest("POST", "/v1/payments", state, bodyOf(state)));
  }
  return Object.freeze(builder) as PaymentDraft<TState>;
}

function allocationMethods(
  state: PaymentState,
  next: (update: Partial<PaymentState>) => unknown,
  close: (allocation: PaymentAllocation) => unknown,
): Record<string, unknown> {
  const open = state.openAllocation;
  if (open === undefined) {
    return {
      allocationReference: (reference: string) => next({ openAllocation: { reference } }),
    };
  }
  if (!("amount" in open)) {
    return {
      allocationAmount: (amount: number) =>
        next({ openAllocation: { reference: open.reference, amount } }),
    };
  }
  return {
    allocationCurrency: (currency: string) => {
      if (open.reference === undefined || open.amount === undefined || currency === undefined) {
        return next({});
      }
      return close({ reference: open.reference, amount: open.amount, currency });
    },
  };
}

function isCreatable(state: PaymentState): boolean {
  if (state.customerId === undefined || "openAllocation" in state) {
    return false;
  }
  if (state.priceId !== undefined) {
    return isExpectedPriceSettled(state);
  }
  return state.amount !== undefined && state.currency !== undefined;
}

function bodyOf(state: PaymentState): Record<string, unknown> {
  return {
    customerId: state.customerId,
    ...(state.priceId === undefined ? {} : { priceId: state.priceId }),
    ...expectedPriceField(state),
    ...(state.amount === undefined ? {} : { amount: state.amount }),
    ...(state.currency === undefined ? {} : { currency: state.currency }),
    ...(state.paymentMethodId === undefined ? {} : { paymentMethodId: state.paymentMethodId }),
    ...(state.allocations === undefined ? {} : { allocations: state.allocations }),
    ...(state.reference === undefined ? {} : { reference: state.reference }),
    ...(state.description === undefined ? {} : { description: state.description }),
  };
}
