import { deferSender, type Sender } from "../core/builder";
import { type CouponBuilder, couponBuilder } from "./coupons";
import {
  type CheckoutSessionDraft,
  type CheckoutSessionReader,
  type CheckoutSessionState,
  checkoutSessionDraft,
  checkoutSessionReader,
} from "./one-time";
import { type SubscriptionSessionBuilder, subscriptionSession } from "./sessions";
import { type ShippingRatesBuilder, shippingRatesBuilder } from "./shipping-rates";
import {
  type TaxRateBuilder,
  type TaxRateListBuilder,
  taxRateBuilder,
  taxRateList,
} from "./tax-rates";

export interface CheckoutClient<TSession extends CheckoutSessionState = Record<never, never>> {
  coupon(code: string): CouponBuilder<{ code: string }>;
  taxRates(): TaxRateListBuilder<Record<never, never>>;
  taxRate(taxRateId: string): TaxRateBuilder<Record<never, never>>;
  shippingRates(): ShippingRatesBuilder<Record<never, never>>;
  subscriptionSession(): SubscriptionSessionBuilder<Record<never, never>>;
  sessionDraft(): CheckoutSessionDraft<TSession>;
  session(checkoutId: string): CheckoutSessionReader;
}

export function createCheckoutClient(dispatch: Sender): CheckoutClient {
  return seededCheckoutClient(dispatch, {});
}

export function seededCheckoutClient<TSession extends CheckoutSessionState>(
  dispatch: Sender,
  session: CheckoutSessionState,
): CheckoutClient<TSession> {
  const send = deferSender(dispatch);
  return Object.freeze({
    coupon: (code: string) => couponBuilder(send, { code }),
    taxRates: () => taxRateList(send, {}),
    taxRate: (taxRateId: string) => taxRateBuilder(send, taxRateId, {}),
    shippingRates: () => shippingRatesBuilder(send, {}),
    subscriptionSession: () => subscriptionSession(send, {}),
    sessionDraft: () => checkoutSessionDraft(send, session as TSession),
    session: (checkoutId: string) => checkoutSessionReader(send, checkoutId, {}),
  });
}
