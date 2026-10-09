import type { ApiErrorCode, ErrorCode } from "../src/constants";
import {
  BuPaymentError,
  type HostedCheckoutRequiredError,
  isNotFound,
  isOutcomeUncertain,
  type NotFoundError,
  requiresHostedCheckout,
} from "../src/errors";

declare const caught: unknown;
declare const failed: BuPaymentError;

const apiError: string | null = failed.apiError;
// @ts-expect-error the API code is read from the response, never assigned
failed.apiError = "checkout_unavailable";

if (isNotFound(caught)) {
  const refusal: NotFoundError = caught;
  const code: typeof ErrorCode.RESOURCE_NOT_FOUND = refusal.code;
  void code;
}

if (requiresHostedCheckout(caught)) {
  const refusal: HostedCheckoutRequiredError = caught;
  const code: typeof ApiErrorCode.PROVIDER_CAPABILITY_NOT_SUPPORTED = refusal.apiError;
  void code;
}

if (!isNotFound(failed) && !requiresHostedCheckout(failed) && !isOutcomeUncertain(failed)) {
  const stillAnError: BuPaymentError = failed;
  void stillAnError;
}

if (caught instanceof BuPaymentError && !isOutcomeUncertain(caught)) {
  const refused: BuPaymentError = caught;
  void refused;
}

void apiError;
