import type { RequestScope, ScopeMethods, Sender } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { CouponEvaluation, CouponRedemption } from "./types";

export interface CouponState extends RequestScope {
  code: string;
  unitAmount?: number;
  currency?: string;
  productId?: string;
  at?: string;
  reference?: string;
  idempotencyKey?: string;
}

interface CouponMethods<TState extends CouponState> extends ScopeMethods<CouponBuilder<TState>> {
  unitAmount(unitAmount: number): CouponBuilder<TState & { unitAmount: number }>;
  currency(currency: string): CouponBuilder<TState & { currency: string }>;
  productId(productId: string): CouponBuilder<TState>;
  at(at: string): CouponBuilder<TState>;
  reference(reference: string): CouponBuilder<TState & { reference: string }>;
  idempotencyKey(idempotencyKey: string): CouponBuilder<TState>;
}

export interface EvaluableCoupon {
  evaluate(): Promise<CouponEvaluation>;
}

export interface RedeemableCoupon {
  redeem(): Promise<CouponRedemption>;
}

type Priced<TState extends CouponState> = TState extends {
  unitAmount: number;
  currency: string;
}
  ? true
  : false;

export type CouponBuilder<TState extends CouponState = CouponState> = CouponMethods<TState> &
  (Priced<TState> extends true ? EvaluableCoupon : object) &
  (Priced<TState> extends true
    ? TState extends { reference: string }
      ? RedeemableCoupon
      : object
    : object);

export function couponBuilder<TState extends CouponState>(
  send: Sender,
  state: TState,
): CouponBuilder<TState> {
  const next = (update: Partial<CouponState>) => couponBuilder(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    unitAmount: (unitAmount: number) => next({ unitAmount }),
    currency: (currency: string) => next({ currency }),
    productId: (productId: string) => next({ productId }),
    at: (at: string) => next({ at }),
    reference: (reference: string) => next({ reference }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.unitAmount !== undefined && state.currency !== undefined) {
    builder.evaluate = () =>
      send<CouponEvaluation>(
        writeRequest("POST", "/v1/coupons/evaluate", state, evaluationBody(state)),
      );
    if (state.reference !== undefined) {
      builder.redeem = () =>
        send<CouponRedemption>(
          writeRequest("POST", "/v1/coupons/redeem", state, {
            ...evaluationBody(state),
            reference: state.reference,
          }),
        );
    }
  }
  return Object.freeze(builder) as CouponBuilder<TState>;
}

function evaluationBody(state: CouponState): Record<string, unknown> {
  return {
    code: state.code,
    unitAmount: state.unitAmount,
    currency: state.currency,
    ...(state.productId === undefined ? {} : { productId: state.productId }),
    ...(state.at === undefined ? {} : { at: state.at }),
  };
}
