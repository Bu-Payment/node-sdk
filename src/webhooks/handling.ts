import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

const REJECTED_DELIVERY_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ErrorCode.WEBHOOK_SIGNATURE_MISSING,
  ErrorCode.WEBHOOK_SIGNATURE_INVALID,
  ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED,
  ErrorCode.WEBHOOK_PAYLOAD_INVALID,
]);

export function isRejectedDelivery(error: unknown): error is BuPaymentError {
  return error instanceof BuPaymentError && REJECTED_DELIVERY_CODES.has(error.code);
}
