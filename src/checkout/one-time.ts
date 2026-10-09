import { expectedPriceField, pinExpectedPrice } from "../catalogue/expected-price";
import type { ExpectedPrice } from "../catalogue/types";
import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { readRequest, scopeMethods, writeRequest } from "../core/builder";
import { encodePathSegment } from "../core/request-target";
import type { Checkout } from "./types";

export interface CheckoutSessionState extends RequestScope {
  priceId?: string;
  expectedPrice?: ExpectedPrice;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  quantity?: number;
  destination?: string;
  provider?: string;
  reference?: string;
  idempotencyKey?: string;
}

interface DraftCore<TState extends CheckoutSessionState>
  extends ScopeMethods<CheckoutSessionDraft<TState>> {
  priceId(priceId: string): CheckoutSessionDraft<TState & { priceId: string }>;
  expectedPrice(expected: ExpectedPrice): CheckoutSessionDraft<TState>;
  quantity(quantity: number): CheckoutSessionDraft<TState>;
  destination(destination: string): CheckoutSessionDraft<TState & { destination: string }>;
  provider(provider: string): CheckoutSessionDraft<TState>;
  reference(reference: string): CheckoutSessionDraft<TState>;
  idempotencyKey(idempotencyKey: string): CheckoutSessionDraft<TState & { idempotencyKey: string }>;
}

interface BuyerNaming<TState extends CheckoutSessionState> {
  customerEmail(email: string): CheckoutSessionDraft<TState & { customerEmail: string }>;
  customerId(customerId: string): CheckoutSessionDraft<TState & { customerId: string }>;
}

interface BuyerName<TState extends CheckoutSessionState> {
  customerName(name: string): CheckoutSessionDraft<TState>;
}

export interface CreatableCheckoutSession {
  create(): Promise<Checkout>;
}

type Named<TState> = TState extends { customerId: string }
  ? true
  : TState extends { customerEmail: string }
    ? true
    : false;

export type CheckoutSessionDraft<TState extends CheckoutSessionState = CheckoutSessionState> =
  DraftCore<TState> &
    (Named<TState> extends true ? object : BuyerNaming<TState>) &
    (TState extends { customerEmail: string } ? BuyerName<TState> : object) &
    (TState extends { priceId: string; destination: string; idempotencyKey: string }
      ? Named<TState> extends true
        ? CreatableCheckoutSession
        : object
      : object);

export interface CheckoutSessionReader extends ScopeMethods<CheckoutSessionReader> {
  get(): Promise<Checkout>;
}

export function checkoutSessionDraft<TState extends CheckoutSessionState>(
  send: DeferredSender,
  state: TState,
): CheckoutSessionDraft<TState> {
  const next = (update: Partial<CheckoutSessionState>) =>
    checkoutSessionDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    priceId: (priceId: string) => next({ priceId }),
    expectedPrice: (expected: ExpectedPrice) => next({ expectedPrice: pinExpectedPrice(expected) }),
    quantity: (quantity: number) => next({ quantity }),
    destination: (destination: string) => next({ destination }),
    provider: (provider: string) => next({ provider }),
    reference: (reference: string) => next({ reference }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.customerId === undefined && state.customerEmail === undefined) {
    builder.customerEmail = (customerEmail: string) => next({ customerEmail });
    builder.customerId = (customerId: string) => next({ customerId });
  }
  if (state.customerEmail !== undefined) {
    builder.customerName = (customerName: string) => next({ customerName });
  }
  if (isCreatable(state)) {
    builder.create = () =>
      send<Checkout>(() => writeRequest("POST", "/v1/checkouts", state, checkoutBody(state)));
  }
  return Object.freeze(builder) as CheckoutSessionDraft<TState>;
}

export function checkoutSessionReader(
  send: DeferredSender,
  checkoutId: string,
  state: RequestScope,
): CheckoutSessionReader {
  const next = (update: Partial<RequestScope>) =>
    checkoutSessionReader(send, checkoutId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () =>
      send<Checkout>(() => readRequest(`/v1/checkouts/${encodePathSegment(checkoutId)}`, state)),
  });
}

function isCreatable(state: CheckoutSessionState): boolean {
  return (
    state.priceId !== undefined &&
    state.destination !== undefined &&
    state.idempotencyKey !== undefined &&
    (state.customerId !== undefined || state.customerEmail !== undefined)
  );
}

function checkoutBody(state: CheckoutSessionState): Record<string, unknown> {
  return {
    priceId: state.priceId,
    ...expectedPriceField(state.expectedPrice),
    ...buyerField(state),
    ...(state.quantity === undefined ? {} : { quantity: state.quantity }),
    destinationKey: state.destination,
    ...(state.provider === undefined ? {} : { provider: state.provider }),
    ...(state.reference === undefined ? {} : { reference: state.reference }),
  };
}

function buyerField(state: CheckoutSessionState): Record<string, unknown> {
  if (state.customerId !== undefined) {
    return { customerId: state.customerId };
  }
  return {
    customer: {
      email: state.customerEmail,
      ...(state.customerName === undefined ? {} : { name: state.customerName }),
    },
  };
}
