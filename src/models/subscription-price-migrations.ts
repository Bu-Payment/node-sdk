export type MigrationTiming =
  | { kind: "immediate" }
  | { kind: "nextRenewal" }
  | { kind: "scheduled"; effectiveAt: string };

export type MigrationProrationPolicy =
  | "prorateImmediately"
  | "prorateAtNextRenewal"
  | "chargeFullImmediately"
  | "chargeFullAtNextRenewal"
  | "none";

export type MigrationPaymentFailurePolicy = "preventChange" | "applyChange";

export type MigrationStatus =
  | "previewed"
  | "scheduled"
  | "executing"
  | "pending_renewal"
  | "applied"
  | "failed"
  | "reconciliation_required"
  | "cancelled";

export interface MigrationPriceSnapshot {
  id: string;
  productId: string;
  amount: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
}

export interface MigrationItemSnapshot {
  id: string;
  priceId: string;
  quantity: number;
}

export interface SubscriptionPriceMigration {
  id: string;
  subscriptionId: string;
  primaryItemId: string;
  sourcePriceId: string;
  targetPriceId: string;
  sourcePrice: MigrationPriceSnapshot;
  targetPrice: MigrationPriceSnapshot;
  currentItems: MigrationItemSnapshot[];
  proposedItems: MigrationItemSnapshot[];
  effectiveTiming: MigrationTiming["kind"];
  effectiveAt: string | null;
  prorationPolicy: MigrationProrationPolicy;
  paymentFailurePolicy: MigrationPaymentFailurePolicy;
  immediateAdjustment: {
    direction: "charge" | "credit" | "none" | "unknown";
    amount: number | null;
    currency: string | null;
  };
  nextRenewal: { amount: number | null; currency: string | null; date: string | null };
  currentRenewalDate: string | null;
  warnings: string[];
  providerLimitations: string[];
  calculatedAt: string;
  expiresAt: string;
  status: MigrationStatus;
  attemptCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  scheduledAt: string | null;
  executionStartedAt: string | null;
  appliedAt: string | null;
  failedAt: string | null;
  reconciliationRequiredAt: string | null;
  reconciliationOutcome: "applied" | "not_applied" | null;
  reconciliationEvidenceReference: string | null;
  reconciliationResolvedAt: string | null;
  reconciliationObservationEvidenceReference: string | null;
  reconciliationObservedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionPriceMigrationBody {
  targetPriceId: string;
  itemId?: string;
  quantity?: number;
  timing: MigrationTiming;
  prorationPolicy: MigrationProrationPolicy;
  paymentFailurePolicy: MigrationPaymentFailurePolicy;
}

export type ListSubscriptionPriceMigrationsQuery = {
  limit?: number;
  cursor?: string;
  subscriptionId?: string;
  status?: MigrationStatus;
};

export interface MigrationNotificationChannel {
  channel: string;
  state: string;
  attempts: number;
  failureCategory: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

export interface MigrationNotificationPlan {
  planVersion: number;
  policyVersion: string;
  definitionVersion: string;
  gateState: string;
  required: boolean;
  channels: MigrationNotificationChannel[];
  requiredChannels: string[];
  minimumLeadTimeMilliseconds: number;
  effectiveAt: string | null;
  override: {
    actorType: string;
    reason: string;
    correlationId: string;
    createdAt: string;
  } | null;
  createdAt: string;
}

export interface RescheduleMigrationNotificationBody {
  availableAt: string;
}
