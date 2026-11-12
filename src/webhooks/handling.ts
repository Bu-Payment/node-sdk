import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type { VerifiedWebhookDelivery, WebhookEventHandler, WebhookOutcome } from "./types";

const REJECTED_DELIVERY_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ErrorCode.WEBHOOK_SIGNATURE_MISSING,
  ErrorCode.WEBHOOK_SIGNATURE_INVALID,
  ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED,
  ErrorCode.WEBHOOK_PAYLOAD_INVALID,
]);

export function isRejectedDelivery(error: unknown): error is BuPaymentError {
  return error instanceof BuPaymentError && REJECTED_DELIVERY_CODES.has(error.code);
}

export async function handleDelivery(
  verify: () => VerifiedWebhookDelivery,
  handler: WebhookEventHandler,
): Promise<WebhookOutcome> {
  let delivery: VerifiedWebhookDelivery;
  try {
    delivery = verify();
  } catch (error) {
    if (isRejectedDelivery(error)) {
      return { status: 400, error };
    }
    throw error;
  }
  await handler(delivery.event, delivery);
  return { status: 200 };
}
