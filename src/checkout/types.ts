export type CouponDuration = "once" | "forever" | "repeating";

export interface CouponEvaluation {
  valid: boolean;
  couponId: string;
  promotionCodeId: string;
  unitAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  productId: string | null;
  duration: CouponDuration;
  durationInMonths: number | null;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  promotionCodeId: string | null;
  reference: string;
  unitAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  productId: string | null;
  redeemedAt: string;
  duration: CouponDuration;
  durationInMonths: number | null;
}

export interface TaxRate {
  id: string;
  displayName: string;
  description: string | null;
  percentage: string;
  inclusive: boolean;
  country: string | null;
  state: string | null;
  jurisdiction: string | null;
  taxType: string | null;
  appliesToAllProducts: boolean;
  productIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaxCalculation {
  taxRateId: string;
  inclusive: boolean;
  percentage: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  rounding: "half_up_per_calculation";
}

export type ShippingTaxBehavior = "inclusive" | "exclusive" | "unspecified";

export type DeliveryEstimateUnit = "hour" | "day" | "business_day" | "week";

export interface DeliveryEstimate {
  unit: DeliveryEstimateUnit;
  minimum?: number;
  maximum?: number;
}

export interface ShippingRate {
  id: string;
  name: string;
  fixedAmount: number;
  currency: string;
  taxBehavior: ShippingTaxBehavior;
  deliveryEstimate: DeliveryEstimate | null;
  productIds: string[];
  destinationCountries: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}
