import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type {
  VerifiedWebhookDelivery,
  WebhookEventHandler,
  WebhookEventStore,
  WebhookOutcome,
} from "./types";

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
  store: WebhookEventStore | undefined,
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
  if (store === undefined) {
    await handler(delivery.event, delivery);
    return { status: 200 };
  }
  if (!(await claim(store, delivery.event.id))) {
    return { status: 200 };
  }
  try {
    await handler(delivery.event, delivery);
  } catch (error) {
    return release(store, delivery.event.id, error);
  }
  return { status: 200 };
}

async function claim(store: WebhookEventStore, eventId: string): Promise<boolean> {
  const claimed: unknown = await store.claim(eventId);
  if (typeof claimed !== "boolean") {
    throw new BuPaymentError("Webhook event store claim must resolve to true or false", {
      code: ErrorCode.CONFIGURATION_INVALID,
    });
  }
  return claimed;
}

async function release(
  store: WebhookEventStore,
  eventId: string,
  handlerError: unknown,
): Promise<never> {
  try {
    await store.release(eventId);
  } catch (releaseError) {
    throw new AggregateError(
      [handlerError, releaseError],
      "Webhook handler failed and its event claim could not be released",
    );
  }
  throw handlerError;
}
