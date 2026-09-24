import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type { CreatePaymentBody } from "../models/payments";

export function assertPricingSource(body: CreatePaymentBody): void {
  const canonical = body.priceId !== undefined;
  const adHoc = body.amount !== undefined || body.currency !== undefined;
  if (canonical && adHoc) {
    throw pricingSourceInvalid(
      "A payment takes either a canonical priceId or an ad hoc amount and currency, never both",
    );
  }
  if (!canonical && !adHoc) {
    throw pricingSourceInvalid("A payment requires a priceId or an amount with a currency");
  }
  if (adHoc && (body.amount === undefined || body.currency === undefined)) {
    throw pricingSourceInvalid("An ad hoc payment requires both an amount and a currency");
  }
  if (body.allocations !== undefined && body.paymentMethodId === undefined) {
    throw pricingSourceInvalid("Payment allocations require a paymentMethodId");
  }
}

function pricingSourceInvalid(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.REQUEST_INVALID });
}
