import { createHmac } from "node:crypto";
import { expect } from "vitest";
import { BuPaymentError } from "../../src/errors";
import { webhookDelivery } from "../../src/webhooks/verification";
import catalogueEvents from "../fixtures/catalogue-events.json";
import checkoutEvents from "../fixtures/checkout-events.json";
import fixture from "../fixtures/webhook-delivery.json";

const SECRET = fixture.secret;

export const TIMESTAMP = fixture.timestamp;

export type Envelope = Record<string, unknown>;

export const PRODUCT_EVENT = catalogueEvents[0] as Envelope;
export const PRICE_EVENT = catalogueEvents[7] as Envelope;

export const COMPLETED_EVENT = checkoutEvents[0] as Envelope;
export const CANCELLED_EVENT = checkoutEvents[3] as Envelope;

export interface Tampering {
  signature?: string;
  now?: number;
}

export function deliver(envelope: unknown, tampering: Tampering = {}) {
  const body = JSON.stringify(envelope);
  return webhookDelivery()
    .secret(SECRET)
    .body(body)
    .headers({
      "x-webhook-id": "whd_1",
      "x-webhook-timestamp": TIMESTAMP,
      "x-webhook-signature":
        tampering.signature ??
        createHmac("sha256", SECRET).update(`${TIMESTAMP}.${body}`).digest("hex"),
    })
    .clock(() => tampering.now ?? Number(TIMESTAMP))
    .verify();
}

export function failure(envelope: unknown, tampering: Tampering = {}): BuPaymentError {
  try {
    deliver(envelope, tampering);
  } catch (error) {
    expect(error).toBeInstanceOf(BuPaymentError);
    return error as BuPaymentError;
  }
  throw new Error("expected the event to be refused");
}

export function withData(envelope: Envelope, data: Record<string, unknown>): Envelope {
  return { ...envelope, data: { ...(envelope.data as object), ...data } };
}

export function withResource(envelope: Envelope, resource: Record<string, unknown>): Envelope {
  const data = envelope.data as { resource: object };
  return withData(envelope, { resource: { ...data.resource, ...resource } });
}
