import type {
  CheckoutCancelledEvent,
  CheckoutOutcomeEvent,
  CheckoutOutcomeEventType,
  CheckoutTerminalEvent,
  CheckoutTerminalStatus,
} from "../webhooks/types";
import type { CheckoutStatus } from "./types";

export type PayableCheckoutStatus = "pending" | "processing";

export type CheckoutOutcomeStatus = CheckoutTerminalStatus | "cancelled";

export interface CheckoutOutcome {
  readonly checkoutId: string;
  readonly reference: string | null;
  readonly status: CheckoutOutcomeStatus;
  readonly paymentId: string | null;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly chargedAmount: number | null;
  readonly chargedCurrency: string | null;
}

const STATUS_PRECEDENCE: Readonly<Record<CheckoutStatus, number>> = {
  pending: 0,
  processing: 1,
  expired: 2,
  cancelled: 3,
  failed: 4,
  completed: 5,
};

type OutcomeReaders = {
  readonly [TType in CheckoutOutcomeEventType]: (
    event: Extract<CheckoutOutcomeEvent, { type: TType }>,
  ) => CheckoutOutcome;
};

const OUTCOME_READERS: OutcomeReaders = {
  "checkout.completed": terminalOutcome,
  "checkout.failed": terminalOutcome,
  "checkout.expired": terminalOutcome,
  "checkout.cancelled": cancelledOutcome,
};

export function laterCheckoutStatus(
  current: CheckoutStatus,
  incoming: CheckoutStatus,
): CheckoutStatus {
  return STATUS_PRECEDENCE[incoming] > STATUS_PRECEDENCE[current] ? incoming : current;
}

export function isPayableCheckout(status: CheckoutStatus): status is PayableCheckoutStatus {
  return status === "pending" || status === "processing";
}

export function checkoutOutcome(event: CheckoutOutcomeEvent): CheckoutOutcome {
  const read = OUTCOME_READERS[event.type] as (event: CheckoutOutcomeEvent) => CheckoutOutcome;
  return Object.freeze(read(event));
}

function terminalOutcome(event: CheckoutTerminalEvent): CheckoutOutcome {
  const { data } = event;
  return {
    checkoutId: data.checkoutId,
    reference: data.reference,
    status: data.status,
    paymentId: data.paymentId,
    amount: data.amount,
    currency: data.currency,
    chargedAmount: data.chargedAmount,
    chargedCurrency: data.chargedCurrency,
  };
}

function cancelledOutcome(event: CheckoutCancelledEvent): CheckoutOutcome {
  return {
    checkoutId: event.data.checkoutId,
    reference: event.data.reference,
    status: "cancelled",
    paymentId: null,
    amount: null,
    currency: null,
    chargedAmount: null,
    chargedCurrency: null,
  };
}
