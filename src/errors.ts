import type { CurrentPrice } from "./catalogue/types";
import { ApiErrorCode, ErrorCode } from "./constants";

export interface BuPaymentErrorOptions<TResource = unknown> {
  code: ErrorCode;
  status?: number;
  requestId?: string;
  cause?: unknown;
  metadata?: Readonly<Record<string, string | number | boolean>>;
  resource?: TResource;
  price?: CurrentPrice;
}

export class BuPaymentError<TResource = unknown> extends Error {
  readonly code: ErrorCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly metadata: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly resource: TResource | undefined;
  readonly price: CurrentPrice | undefined;

  constructor(message: string, options: BuPaymentErrorOptions<TResource>) {
    super(message, { cause: options.cause });
    this.name = "BuPaymentError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.metadata = options.metadata;
    this.resource = options.resource;
    this.price = options.price;
  }

  get apiError(): string | null {
    const apiError = this.metadata?.apiError;
    return typeof apiError === "string" ? apiError : null;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
      ...(this.metadata === undefined ? {} : { metadata: this.metadata }),
      ...(this.resource === undefined ? {} : { resource: this.resource }),
      ...(this.price === undefined ? {} : { price: this.price }),
    };
  }
}

export type PriceChangedError = BuPaymentError & {
  readonly code: typeof ErrorCode.PRICE_CHANGED;
};

export function isPriceChanged(error: unknown): error is PriceChangedError {
  return error instanceof BuPaymentError && error.code === ErrorCode.PRICE_CHANGED;
}

const UNCERTAIN_OUTCOMES = new Set<string>([
  ErrorCode.NETWORK_UNAVAILABLE,
  ErrorCode.REQUEST_CANCELLED,
  ErrorCode.RESPONSE_INVALID,
  ErrorCode.IDEMPOTENCY_CONFLICT,
  ApiErrorCode.IDEMPOTENCY_IN_PROGRESS,
  ApiErrorCode.IDEMPOTENCY_OUTCOME_UNKNOWN,
]);

const DEFINITE_REFUSALS = new Set<string>([ApiErrorCode.FINANCIAL_PREPARATION_FAILED]);

const RECONCILIATION_REQUIRED = new Set<string>([
  ErrorCode.IDEMPOTENCY_CONFLICT,
  ApiErrorCode.IDEMPOTENCY_OUTCOME_UNKNOWN,
]);

export function isOutcomeUncertain(error: unknown): boolean {
  if (!(error instanceof BuPaymentError)) {
    return false;
  }
  const apiError = error.apiError;
  if (apiError !== null && DEFINITE_REFUSALS.has(apiError)) {
    return false;
  }
  if (
    UNCERTAIN_OUTCOMES.has(error.code) ||
    (apiError !== null && UNCERTAIN_OUTCOMES.has(apiError))
  ) {
    return true;
  }
  return error.status !== undefined && (error.status < 400 || error.status > 499);
}

export function needsReconciliation(error: unknown): boolean {
  return (
    error instanceof BuPaymentError &&
    (RECONCILIATION_REQUIRED.has(error.code) || RECONCILIATION_REQUIRED.has(error.apiError ?? ""))
  );
}

export type HostedCheckoutRequiredError = BuPaymentError & {
  readonly apiError: typeof ApiErrorCode.PROVIDER_CAPABILITY_NOT_SUPPORTED;
};

export function requiresHostedCheckout(error: unknown): error is HostedCheckoutRequiredError {
  return (
    error instanceof BuPaymentError &&
    error.apiError === ApiErrorCode.PROVIDER_CAPABILITY_NOT_SUPPORTED
  );
}

export type NotFoundError = BuPaymentError & {
  readonly code: typeof ErrorCode.RESOURCE_NOT_FOUND;
};

export function isNotFound(error: unknown): error is NotFoundError {
  return error instanceof BuPaymentError && error.code === ErrorCode.RESOURCE_NOT_FOUND;
}
