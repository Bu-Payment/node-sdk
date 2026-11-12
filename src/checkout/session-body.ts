import { expectedPriceField } from "../catalogue/expected-price";
import { EnvVariable, ErrorCode } from "../constants";
import { configurationMissing } from "../core/env";
import { BuPaymentError } from "../errors";
import type { CheckoutSessionState } from "./one-time";

const CURRENCY_CODE = /^[A-Z]{3}$/u;
const DESCRIPTION_MAX_LENGTH = 255;

export function checkoutBody(state: CheckoutSessionState): Record<string, unknown> {
  return {
    ...(state.amount === undefined ? priceFields(state) : appAmountFields(state)),
    ...buyerField(state),
    ...(state.quantity === undefined ? {} : { quantity: state.quantity }),
    destinationKey: state.destination ?? missingDestination(),
    ...(state.provider === undefined ? {} : { provider: state.provider }),
    ...(state.reference === undefined ? {} : { reference: state.reference }),
  };
}

function priceFields(state: CheckoutSessionState): Record<string, unknown> {
  return { priceId: state.priceId, ...expectedPriceField(state) };
}

function appAmountFields(state: CheckoutSessionState): Record<string, unknown> {
  const { amount, currency, description, productId } = state;
  if (!Number.isSafeInteger(amount) || (amount as number) <= 0) {
    throw invalid("amount", "Checkout amount must be a positive integer in minor units");
  }
  if (typeof currency !== "string" || !CURRENCY_CODE.test(currency)) {
    throw invalid("currency", "Checkout currency must be an uppercase ISO 4217 code");
  }
  const text = typeof description === "string" ? description.trim() : "";
  const length = [...text].length;
  if (length === 0 || length > DESCRIPTION_MAX_LENGTH) {
    throw invalid(
      "description",
      `Checkout description must hold 1 to ${DESCRIPTION_MAX_LENGTH} characters once trimmed`,
    );
  }
  return {
    amount,
    currency,
    description: text,
    ...(productId === undefined ? {} : { productId }),
  };
}

function buyerField(state: CheckoutSessionState): Record<string, unknown> {
  if (state.customerId !== undefined) {
    return { customerId: state.customerId };
  }
  return {
    customer: {
      email: state.customerEmail,
      ...(state.customerName === undefined ? {} : { name: state.customerName }),
    },
  };
}

function missingDestination(): never {
  throw configurationMissing(
    "Checkout destination is not configured: call destination() or set BU_PAYMENT_DESTINATION_KEY",
    [EnvVariable.DESTINATION_KEY],
  );
}

function invalid(field: string, message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.REQUEST_INVALID, metadata: { field } });
}
