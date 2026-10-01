import { pinExpectedPrice } from "../catalogue/expected-price";
import type { ExpectedPrice } from "../catalogue/types";
import type { RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods } from "../core/builder";
import type { SaleReservation, SaleResult } from "./types";

export interface SaleState extends RequestScope {
  priceId?: string;
  displayedPrice?: ExpectedPrice;
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
  displayedPrice(displayed: ExpectedPrice): SaleDraft<TState & { displayedPrice: ExpectedPrice }>;
  reference(reference: string): SaleDraft<TState>;
  description(description: string): SaleDraft<TState>;
  reservation(reservation: SaleReservation): SaleDraft<TState>;
  idempotencyKey(idempotencyKey: string): SaleDraft<TState & { idempotencyKey: string }>;
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

export type SaleDraft<TState extends SaleState = SaleState> = SaleCore<TState> &
  (Named<TState> extends true ? object : CustomerNaming<TState>) &
  (TState extends { priceId: string; displayedPrice: ExpectedPrice; idempotencyKey: string }
    ? Named<TState> extends true
      ? ChargeableSale
      : object
    : object);

export type SaleCharger = (sale: CompleteSale) => Promise<SaleResult>;

export function saleDraft<TState extends SaleState>(
  charge: SaleCharger,
  state: TState,
): SaleDraft<TState> {
  const next = (update: Partial<SaleState>) => saleDraft(charge, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    priceId: (priceId: string) => next({ priceId }),
    displayedPrice: (displayed: ExpectedPrice) =>
      next({ displayedPrice: pinExpectedPrice(displayed) }),
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
  const { priceId, displayedPrice, idempotencyKey } = state;
  if (
    priceId === undefined ||
    displayedPrice === undefined ||
    idempotencyKey === undefined ||
    customer === undefined
  ) {
    return undefined;
  }
  return { ...state, priceId, displayedPrice, idempotencyKey, customer };
}

function customerOf(state: SaleState): SaleCustomer | undefined {
  if (state.customerId !== undefined) {
    return { customerId: state.customerId };
  }
  return state.customerEmail === undefined ? undefined : { customerEmail: state.customerEmail };
}
