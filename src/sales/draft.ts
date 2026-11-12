import { pinExpectedPrice } from "../catalogue/expected-price";
import type { ExpectedPrice } from "../catalogue/types";
import type { RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods } from "../core/builder";
import type { SaleReservation, SaleResult } from "./types";

export interface SaleState extends RequestScope {
  priceId?: string;
  displayedUnitAmount?: number;
  displayedCurrency?: string;
  customerId?: string;
  customerEmail?: string;
  reference?: string;
  description?: string;
  reservation?: SaleReservation;
  idempotencyKey?: string;
}

export type SaleCustomer = { customerId: string } | { customerEmail: string };

export type CompleteSale = SaleState & {
  priceId: string;
  displayedPrice: ExpectedPrice;
  customer: SaleCustomer;
  idempotencyKey: string;
};

interface SaleCore<TState extends SaleState> extends ScopeMethods<SaleDraft<TState>> {
  priceId(priceId: string): SaleDraft<TState & { priceId: string }>;
  displayedUnitAmount(unitAmount: number): SaleDraft<TState & { displayedUnitAmount: number }>;
  reference(reference: string): SaleDraft<TState>;
  description(description: string): SaleDraft<TState>;
  reservation(reservation: SaleReservation): SaleDraft<TState>;
  idempotencyKey(idempotencyKey: string): SaleDraft<TState & { idempotencyKey: string }>;
}

interface DisplayedCurrency<TState extends SaleState> {
  displayedCurrency(currency: string): SaleDraft<TState & { displayedCurrency: string }>;
}

interface CustomerNaming<TState extends SaleState> {
  customerEmail(email: string): SaleDraft<TState & { customerEmail: string }>;
  customerId(customerId: string): SaleDraft<TState & { customerId: string }>;
}

export interface ChargeableSale {
  charge(): Promise<SaleResult>;
}

type Named<TState extends SaleState> = TState extends { customerId: string }
  ? true
  : TState extends { customerEmail: string }
    ? true
    : false;

type ReadyToCharge = {
  priceId: string;
  displayedUnitAmount: number;
  displayedCurrency: string;
  idempotencyKey: string;
};

export type SaleDraft<TState extends SaleState = SaleState> = SaleCore<TState> &
  (TState extends { displayedUnitAmount: number } ? DisplayedCurrency<TState> : object) &
  (Named<TState> extends true ? object : CustomerNaming<TState>) &
  (TState extends ReadyToCharge ? (Named<TState> extends true ? ChargeableSale : object) : object);

export type SaleCharger = (sale: CompleteSale) => Promise<SaleResult>;

export function saleDraft<TState extends SaleState>(
  charge: SaleCharger,
  state: TState,
): SaleDraft<TState> {
  const next = (update: Partial<SaleState>) => saleDraft(charge, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    priceId: (priceId: string) => next({ priceId }),
    displayedUnitAmount: (displayedUnitAmount: number) => next({ displayedUnitAmount }),
    reference: (reference: string) => next({ reference }),
    description: (description: string) => next({ description }),
    reservation: (reservation: SaleReservation) =>
      next({
        reservation: Object.freeze({
          reserve: reservation.reserve.bind(reservation),
          release: reservation.release.bind(reservation),
        }),
      }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if ("displayedUnitAmount" in state) {
    builder.displayedCurrency = (displayedCurrency: string) => next({ displayedCurrency });
  }
  if (state.customerId === undefined && state.customerEmail === undefined) {
    builder.customerEmail = (customerEmail: string) => next({ customerEmail });
    builder.customerId = (customerId: string) => next({ customerId });
  }
  const complete = completeSale(state);
  if (complete !== undefined) {
    builder.charge = () => charge(complete);
  }
  return Object.freeze(builder) as SaleDraft<TState>;
}

function completeSale(state: SaleState): CompleteSale | undefined {
  const customer = customerOf(state);
  const { priceId, displayedUnitAmount, displayedCurrency, idempotencyKey } = state;
  if (
    priceId === undefined ||
    displayedUnitAmount === undefined ||
    displayedCurrency === undefined ||
    idempotencyKey === undefined ||
    customer === undefined
  ) {
    return undefined;
  }
  const displayedPrice = pinExpectedPrice({
    unitAmount: displayedUnitAmount,
    currency: displayedCurrency,
  });
  return { ...state, priceId, displayedPrice, idempotencyKey, customer };
}

function customerOf(state: SaleState): SaleCustomer | undefined {
  if (state.customerId !== undefined) {
    return { customerId: state.customerId };
  }
  return state.customerEmail === undefined ? undefined : { customerEmail: state.customerEmail };
}
