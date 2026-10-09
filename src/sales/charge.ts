import { ApiErrorCode } from "../constants";
import type { RequestScope, ScopeMethods } from "../core/builder";
import type { CustomersClient } from "../customers/client";
import { BuPaymentError, isOutcomeUncertain, isPriceChanged, needsReconciliation } from "../errors";
import type { PaymentsClient } from "../payments/client";
import type { Payment } from "../payments/types";
import type { CompleteSale } from "./draft";
import type { SaleResult } from "./types";

type PaymentFailure = "unconfirmed" | "needs_reconciliation" | "refused";

export async function chargeSale(
  customers: CustomersClient,
  payments: PaymentsClient,
  sale: CompleteSale,
): Promise<SaleResult> {
  const reservation = sale.reservation;
  if (reservation !== undefined && !(await reservation.reserve())) {
    return { outcome: "unavailable" };
  }
  const release = async () => {
    await reservation?.release();
  };
  let customerId: string;
  try {
    customerId = await customerIdOf(customers, sale);
  } catch (error) {
    await release();
    throw error;
  }
  let payment: Payment;
  try {
    payment = await pay(payments, customerId, sale);
  } catch (error) {
    if (error instanceof BuPaymentError) {
      const failure = paymentFailureOf(error);
      if (failure !== "refused") {
        return { outcome: failure, error };
      }
    }
    await release();
    if (isPriceChanged(error)) {
      return { outcome: "price_changed", shown: sale.displayedPrice, current: error.price ?? null };
    }
    throw error;
  }
  if (payment.status === "succeeded") {
    return { outcome: "paid", payment };
  }
  await release();
  return { outcome: "unpaid", payment };
}

function paymentFailureOf(error: BuPaymentError): PaymentFailure {
  if (!isOutcomeUncertain(error)) {
    return "refused";
  }
  return needsReconciliation(error) ? "needs_reconciliation" : "unconfirmed";
}

async function customerIdOf(customers: CustomersClient, sale: CompleteSale): Promise<string> {
  if ("customerId" in sale.customer) {
    return sale.customer.customerId;
  }
  return await customerIdByEmail(customers, sale.customer.customerEmail, sale);
}

async function customerIdByEmail(
  customers: CustomersClient,
  email: string,
  sale: CompleteSale,
): Promise<string> {
  const lookup = () => scoped(customers.list().email(email).limit(1), sale).get();
  const existing = (await lookup()).data[0];
  if (existing !== undefined) {
    return existing.id;
  }
  try {
    return (await scoped(customers.draft().email(email), sale).create()).id;
  } catch (error) {
    const concurrent = isEmailTaken(error) ? (await lookup()).data[0] : undefined;
    if (concurrent === undefined) {
      throw error;
    }
    return concurrent.id;
  }
}

function isEmailTaken(error: unknown): boolean {
  return (
    error instanceof BuPaymentError && error.apiError === ApiErrorCode.APP_CUSTOMER_EMAIL_CONFLICT
  );
}

async function pay(
  payments: PaymentsClient,
  customerId: string,
  sale: CompleteSale,
): Promise<Payment> {
  let draft = scoped(payments.draft().customerId(customerId).priceId(sale.priceId), sale)
    .expectedPrice(sale.displayedPrice)
    .idempotencyKey(sale.idempotencyKey);
  if (sale.reference !== undefined) {
    draft = draft.reference(sale.reference);
  }
  if (sale.description !== undefined) {
    draft = draft.description(sale.description);
  }
  return await draft.create();
}

function scoped<TBuilder extends ScopeMethods<TBuilder>>(
  builder: TBuilder,
  scope: RequestScope,
): TBuilder {
  const signalled = scope.signal === undefined ? builder : builder.signal(scope.signal);
  return scope.timeoutMs === undefined ? signalled : signalled.timeoutMs(scope.timeoutMs);
}
