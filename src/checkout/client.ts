import { deferSender, type Sender } from "../core/builder";
import { type CouponBuilder, couponBuilder } from "./coupons";
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
}

export function createCheckoutClient(dispatch: Sender): CheckoutClient {
  const send = deferSender(dispatch);
  return Object.freeze({
    coupon: (code: string) => couponBuilder(send, { code }),
    taxRates: () => taxRateList(send, {}),
    taxRate: (taxRateId: string) => taxRateBuilder(send, taxRateId, {}),
    shippingRates: () => shippingRatesBuilder(send, {}),
    subscriptionSession: () => subscriptionSession(send, {}),
  });
}
