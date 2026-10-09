import type { CheckoutStatus } from "../checkout/types";
import {
  integerField,
  isKey,
  nullableIntegerField,
  nullableTextField,
  objectField,
  type RejectField,
  requiredTextField,
} from "./fields";
import type { CheckoutEventType, CheckoutTerminalStatus } from "./types";

const PREFIX = "data.";

const CHECKOUT_STATUSES: Readonly<Record<CheckoutStatus, true>> = {
  pending: true,
  processing: true,
  completed: true,
  failed: true,
  expired: true,
  cancelled: true,
};

export const CHECKOUT_EVENT_STATUSES: {
  readonly [TType in CheckoutEventType]: CheckoutTerminalStatus | "cancelled";
} = {
  "checkout.completed": "completed",
  "checkout.failed": "failed",
  "checkout.expired": "expired",
  "checkout.cancelled": "cancelled",
};

export function assertCheckoutData(
  value: unknown,
  type: CheckoutEventType,
  rejectField: RejectField,
): void {
  const data = objectField(value, "data", rejectField);
  requiredTextField(data, "checkoutId", PREFIX, rejectField);
  nullableTextField(data, "reference", PREFIX, rejectField);
  nullableTextField(data, "provider", PREFIX, rejectField);
  nullableTextField(data, "providerCheckoutId", PREFIX, rejectField);
  if (!isKey(CHECKOUT_STATUSES, data.previousStatus)) {
    rejectField(`${PREFIX}previousStatus`);
  }
  const status = CHECKOUT_EVENT_STATUSES[type];
  if (status === "cancelled") {
    return;
  }
  if (data.status !== status) {
    rejectField(`${PREFIX}status`);
  }
  nullableTextField(data, "paymentId", PREFIX, rejectField);
  nullableIntegerField(data, "amount", 0, PREFIX, rejectField);
  nullableTextField(data, "currency", PREFIX, rejectField);
  nullableIntegerField(data, "chargedAmount", 0, PREFIX, rejectField);
  nullableTextField(data, "chargedCurrency", PREFIX, rejectField);
  integerField(data, "quantity", 1, PREFIX, rejectField);
  requiredTextField(data, "customerId", PREFIX, rejectField);
}
