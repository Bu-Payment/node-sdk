import { deferSender, type Sender } from "../core/builder";
import { type CouponBuilder, couponBuilder } from "./coupons";
import {
  type CheckoutSessionDraft,
  type CheckoutSessionReader,
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

export interface CheckoutClient {
  coupon(code: string): CouponBuilder<{ code: string }>;
  taxRates(): TaxRateListBuilder<Record<never, never>>;
  taxRate(taxRateId: string): TaxRateBuilder<Record<never, never>>;
  shippingRates(): ShippingRatesBuilder<Record<never, never>>;
  subscriptionSession(): SubscriptionSessionBuilder<Record<never, never>>;
  sessionDraft(): CheckoutSessionDraft<Record<never, never>>;
  session(checkoutId: string): CheckoutSessionReader;
}

export function createCheckoutClient(dispatch: Sender): CheckoutClient {
  const send = deferSender(dispatch);
  return Object.freeze({
    coupon: (code: string) => couponBuilder(send, { code }),
    taxRates: () => taxRateList(send, {}),
    taxRate: (taxRateId: string) => taxRateBuilder(send, taxRateId, {}),
    shippingRates: () => shippingRatesBuilder(send, {}),
    subscriptionSession: () => subscriptionSession(send, {}),
    sessionDraft: () => checkoutSessionDraft(send, {}),
    session: (checkoutId: string) => checkoutSessionReader(send, checkoutId, {}),
  });
}
