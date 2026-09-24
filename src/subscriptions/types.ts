export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface SubscriptionProviderBinding {
  id: string;
  provider: string;
  providerSubscriptionId: string;
  providerSyncedAt: string | null;
}

export interface Subscription {
  id: string;
  name: string;
  status: string;
  priceId: string | null;
  productId: string | null;
  quantity: number;
  customerId: string;
  provider: string | null;
  providerSubscriptionId: string | null;
  canonicalPriceId: string | null;
  acceptedCurrency: string | null;
  acceptedUnitAmount: number | null;
  acceptedInterval: string | null;
  acceptedIntervalCount: number | null;
  acceptedQuantity: number | null;
  collectionResponsibility: "platform" | "provider";
  creationSource: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  endsAt: string | null;
  scheduledChangeAction: "pause" | "resume" | null;
  scheduledChangeEffectiveAt: string | null;
  scheduledResumeAt: string | null;
  resumeBillingPolicy: string | null;
  paymentCollectionPauseBehavior: string | null;
  paymentCollectionResumesAt: string | null;
  createdAt: string;
  updatedAt: string;
  bindings?: SubscriptionProviderBinding[];
}

export interface SubscriptionProviderOperation {
  provider: string;
  bindingId: string;
  available: boolean;
  capabilities: Record<string, unknown> | null;
}

export interface SubscriptionCapabilities {
  local: { retrieve: true };
  providerAttachment: { managedBy: "platform" };
  providerOperations: SubscriptionProviderOperation[];
}

export interface SubscriptionDetail {
  subscription: Subscription;
  capabilities: SubscriptionCapabilities;
}

export type ResumeBillingPolicy = "startNewBillingPeriod" | "continueExistingBillingPeriod";

export type PaymentCollectionBehavior = "keepAsDraft" | "markUncollectible" | "void";
