import type { CheckoutAmountSource, CheckoutStatus } from "../checkout/types";
import {
  integerField,
  isKey,
  type JsonObject,
  nullableIntegerField,
  nullableTextField,
  objectField,
  type RejectField,
  requiredTextField,
  timestampField,
} from "./fields";
import type { CheckoutEventType, CheckoutOutcomeEventType, CheckoutTerminalStatus } from "./types";

const PREFIX = "data.";

const CREATED = "checkout.created";

const CHECKOUT_STATUSES: Readonly<Record<CheckoutStatus, true>> = {
  pending: true,
  processing: true,
  completed: true,
  failed: true,
  expired: true,
  cancelled: true,
};

const AMOUNT_SOURCES: Readonly<Record<CheckoutAmountSource, true>> = {
  price: true,
  app_amount: true,
};

export const CHECKOUT_EVENT_STATUSES: {
  readonly [TType in CheckoutOutcomeEventType]: CheckoutTerminalStatus | "cancelled";
} = {
  "checkout.completed": "completed",
  "checkout.failed": "failed",
  "checkout.expired": "expired",
  "checkout.cancelled": "cancelled",
};

export function isCheckoutEventType(type: string): type is CheckoutEventType {
  return type === CREATED || isKey(CHECKOUT_EVENT_STATUSES, type);
}

export function assertCheckoutData(
  value: unknown,
  type: CheckoutEventType,
  rejectField: RejectField,
): void {
  const data = objectField(value, "data", rejectField);
  requiredTextField(data, "checkoutId", PREFIX, rejectField);
  nullableTextField(data, "reference", PREFIX, rejectField);
  if (type === CREATED) {
    assertCreatedData(data, rejectField);
    return;
  }
  assertOutcomeData(data, type, rejectField);
}

function assertCreatedData(data: JsonObject, rejectField: RejectField): void {
  integerField(data, "amount", 0, PREFIX, rejectField);
  requiredTextField(data, "currency", PREFIX, rejectField);
  if (!isKey(AMOUNT_SOURCES, data.amountSource)) {
    rejectField(`${PREFIX}amountSource`);
  }
  nullableTextField(data, "description", PREFIX, rejectField);
  nullableTextField(data, "productId", PREFIX, rejectField);
  assertPriceOfSource(data, rejectField);
  integerField(data, "quantity", 1, PREFIX, rejectField);
  requiredTextField(data, "customerId", PREFIX, rejectField);
  timestampField(data, "expiresAt", PREFIX, rejectField);
}

function assertPriceOfSource(data: JsonObject, rejectField: RejectField): void {
  if (data.amountSource === "price") {
    requiredTextField(data, "priceId", PREFIX, rejectField);
    return;
  }
  if (data.priceId !== null) {
    rejectField(`${PREFIX}priceId`);
  }
}

function assertOutcomeData(
  data: JsonObject,
  type: CheckoutOutcomeEventType,
  rejectField: RejectField,
): void {
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
