import { ErrorCode } from "./constants";
import { BuPaymentError } from "./errors";

export interface PublicError {
  status: number;
  code: ErrorCode;
  message: string;
}

const PAYMENT_FAILED = "The payment could not be completed.";
const REQUEST_FAILED = "The request could not be completed.";

const MERCHANT_SIDE_CODES = new Set<ErrorCode>([
  ErrorCode.CONFIGURATION_INVALID,
  ErrorCode.APPLICATION_AUTH_REQUIRED,
  ErrorCode.APPLICATION_AUTH_MALFORMED,
  ErrorCode.APPLICATION_AUTH_VERSION_UNSUPPORTED,
  ErrorCode.APPLICATION_AUTH_EXPIRED,
  ErrorCode.APPLICATION_AUTH_REPLAYED,
  ErrorCode.APPLICATION_AUTH_INVALID,
  ErrorCode.APPLICATION_AUTH_UNAVAILABLE,
  ErrorCode.APPLICATION_CAPABILITY_DENIED,
]);

export function publicError(error: unknown): PublicError {
  if (!(error instanceof BuPaymentError)) {
    return { status: 500, code: ErrorCode.OPERATION_FAILED, message: REQUEST_FAILED };
  }
  if (MERCHANT_SIDE_CODES.has(error.code)) {
    return { status: 502, code: ErrorCode.OPERATION_FAILED, message: PAYMENT_FAILED };
  }
  return { status: publicStatus(error.status), code: error.code, message: PAYMENT_FAILED };
}

function publicStatus(status: number | undefined): number {
  return status !== undefined && status >= 400 && status <= 599 ? status : 502;
}
