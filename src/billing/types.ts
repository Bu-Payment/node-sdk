import type {
  MigrationPaymentFailurePolicy,
  MigrationProrationPolicy,
  MigrationTiming,
} from "../price-migrations/types";
import type { PaymentCollectionBehavior, ResumeBillingPolicy } from "../subscriptions/types";

export type BillingEffectiveTiming = MigrationTiming["kind"];

export type BillingItemIdentity = "stable" | "price" | "none";

export interface BillingChangeCapabilities {
  preview: boolean;
  effectiveTimings: BillingEffectiveTiming[];
  prorationPolicies: MigrationProrationPolicy[];
  paymentFailurePolicies: MigrationPaymentFailurePolicy[];
  supportsCurrencyChange: boolean;
  supportsBillingPeriodChange: boolean;
}

export interface BillingPauseCapabilities {
  subscription: {
    effectiveTimings: BillingEffectiveTiming[];
    scheduledResume: boolean;
    resumeBillingPolicies: ResumeBillingPolicy[];
  };
  paymentCollection: {
    behaviors: PaymentCollectionBehavior[];
    scheduledResume: boolean;
  };
}

export interface BillingResumeCapabilities {
  pendingCancellation: boolean;
  pausedSubscription: {
    effectiveTimings: BillingEffectiveTiming[];
    billingPolicies: ResumeBillingPolicy[];
  };
  paymentCollection: boolean;
}

export interface BillingSubscriptionCapabilities {
  itemIdentity: BillingItemIdentity;
  create: { checkout: boolean; direct: boolean };
  changePrice: BillingChangeCapabilities;
  changeQuantity: BillingChangeCapabilities;
  cancel: { immediately: boolean; atPeriodEnd: boolean };
  pause: BillingPauseCapabilities;
  resume: BillingResumeCapabilities;
  scheduledChange: { cancel: boolean };
}

export interface BillingCustomerCapabilities {
  create: boolean;
  update: boolean;
  synchronize: boolean;
}

export interface BillingCapabilities {
  configured: boolean;
  customers: BillingCustomerCapabilities;
  subscriptions: BillingSubscriptionCapabilities;
}
