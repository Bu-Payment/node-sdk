import {
  type ExpectedCurrencyMethod,
  type ExpectedPriceSettled,
  type ExpectedPriceState,
  type ExpectedUnitAmountMethod,
  expectedPriceMethods,
  isExpectedPriceSettled,
} from "../catalogue/expected-price";
import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { readRequest, scopeMethods, writeRequest } from "../core/builder";
import { encodePathSegment } from "../core/request-target";
import { checkoutBody } from "./session-body";
import type { Checkout } from "./types";

export interface CheckoutSessionState extends RequestScope, ExpectedPriceState {
  priceId?: string;
  quantity?: number;
  amount?: number;
  currency?: string;
  description?: string;
  productId?: string;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  destination?: string;
  unconfiguredDestination?: true;
  provider?: string;
  reference?: string;
  idempotencyKey?: string;
}

interface DraftCore<TState extends CheckoutSessionState>
  extends ScopeMethods<CheckoutSessionDraft<TState>> {
  destination(destination: string): CheckoutSessionDraft<TState & { destination: string }>;
  provider(provider: string): CheckoutSessionDraft<TState>;
  reference(reference: string): CheckoutSessionDraft<TState>;
  idempotencyKey(idempotencyKey: string): CheckoutSessionDraft<TState & { idempotencyKey: string }>;
}

interface CataloguePricing<TState extends CheckoutSessionState> {
  priceId(priceId: string): CheckoutSessionDraft<TState & { priceId: string }>;
  quantity(quantity: number): CheckoutSessionDraft<TState & { quantity: number }>;
}

type CatalogueMethods<TState extends CheckoutSessionState> = CataloguePricing<TState> &
  ExpectedUnitAmountMethod<CheckoutSessionDraft<TState & { expectedUnitAmount: number }>> &
  (TState extends { expectedUnitAmount: number }
    ? ExpectedCurrencyMethod<CheckoutSessionDraft<TState & { expectedCurrency: string }>>
    : object);

interface AppAmountEntry<TState extends CheckoutSessionState> {
  amount(amount: number): CheckoutSessionDraft<TState & { amount: number }>;
}

interface AppAmountDetails<TState extends CheckoutSessionState> {
  currency(currency: string): CheckoutSessionDraft<TState & { currency: string }>;
  productId(productId: string): CheckoutSessionDraft<TState & { productId: string }>;
}

interface AppAmountDescription<TState extends CheckoutSessionState> {
  description(description: string): CheckoutSessionDraft<TState & { description: string }>;
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

type CatalogueChosen<TState> = TState extends { priceId: string }
  ? true
  : TState extends { quantity: number }
    ? true
    : TState extends { expectedUnitAmount: number }
      ? true
      : false;

type Priced<TState> = TState extends { priceId: string }
  ? ExpectedPriceSettled<TState>
  : TState extends { amount: number; currency: string; description: string }
    ? true
    : false;

type Creatable<TState> = TState extends { destination: string; idempotencyKey: string }
  ? [Named<TState>, Priced<TState>] extends [true, true]
    ? true
    : false
  : false;

export type CheckoutSessionDraft<TState extends CheckoutSessionState = CheckoutSessionState> =
  DraftCore<TState> &
    (TState extends { amount: number } ? AppAmountDetails<TState> : CatalogueMethods<TState>) &
    (CatalogueChosen<TState> extends true ? object : AppAmountEntry<TState>) &
    (TState extends { currency: string } ? AppAmountDescription<TState> : object) &
    (Named<TState> extends true ? object : BuyerNaming<TState>) &
    (TState extends { customerEmail: string } ? BuyerName<TState> : object) &
    (Creatable<TState> extends true ? CreatableCheckoutSession : object);

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
    ...pricingMethods(state, next),
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

function pricingMethods(
  state: CheckoutSessionState,
  next: (update: Partial<CheckoutSessionState>) => unknown,
): Record<string, unknown> {
  if ("amount" in state) {
    return {
      amount: (amount: number) => next({ amount }),
      currency: (currency: string) => next({ currency }),
      productId: (productId: string) => next({ productId }),
      ...("currency" in state
        ? { description: (description: string) => next({ description }) }
        : {}),
    };
  }
  const catalogueChosen =
    "priceId" in state || "quantity" in state || "expectedUnitAmount" in state;
  return {
    priceId: (priceId: string) => next({ priceId }),
    quantity: (quantity: number) => next({ quantity }),
    ...expectedPriceMethods(state, next),
    ...(catalogueChosen ? {} : { amount: (amount: number) => next({ amount }) }),
  };
}

function isCreatable(state: CheckoutSessionState): boolean {
  return (
    (state.destination !== undefined || state.unconfiguredDestination === true) &&
    state.idempotencyKey !== undefined &&
    (state.customerId !== undefined || state.customerEmail !== undefined) &&
    isPriced(state)
  );
}

function isPriced(state: CheckoutSessionState): boolean {
  if (state.priceId !== undefined) {
    return isExpectedPriceSettled(state);
  }
  return (
    state.amount !== undefined && state.currency !== undefined && state.description !== undefined
  );
}
