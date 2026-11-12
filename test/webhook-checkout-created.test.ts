import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import type { CheckoutCreatedEvent, WebhookEvent } from "../src/webhooks/types";
import checkoutEvents from "./fixtures/checkout-events.json";
import { deliver, type Envelope, failure, withData } from "./support/webhook-events";
import { bodyOf, incoming } from "./support/webhook-handling";

const FROM_AMOUNT = checkoutEvents[4] as Envelope;
const FROM_PRICE = checkoutEvents[5] as Envelope;

describe("checkout.created", () => {
  it.each([
    ["an amount the App calculated", FROM_AMOUNT],
    ["a catalogue price", FROM_PRICE],
  ])("returns a checkout created from %s as a typed event", (_label, envelope) => {
    expect(deliver(envelope).event).toEqual(envelope);
  });

  it("accepts an amount without a product", () => {
    const unfiled = withData(FROM_AMOUNT, { productId: null });
    expect(deliver(unfiled).event.data).toEqual(unfiled.data);
  });

  it("accepts a price without a reference", () => {
    const event = deliver(FROM_PRICE).event as CheckoutCreatedEvent;
    expect(event.data.amountSource).toBe("price");
    expect(event.data.priceId).toBe("price_1");
    expect(event.data.reference).toBeNull();
  });

  it("reaches the handler already typed", async () => {
    const received: WebhookEvent[] = [];
    const outcome = await incoming({ body: bodyOf(FROM_AMOUNT) }).handle((event) => {
      received.push(event);
    });
    expect(outcome).toEqual({ status: 200 });
    expect(received[0]?.type).toBe("checkout.created");
    expect(received[0]).toEqual(FROM_AMOUNT);
  });

  it.each<[string, Envelope, string]>([
    ["data that is not an object", { ...FROM_AMOUNT, data: [] }, "data"],
    ["no checkoutId", withData(FROM_AMOUNT, { checkoutId: "" }), "data.checkoutId"],
    ["a numeric reference", withData(FROM_AMOUNT, { reference: 7 }), "data.reference"],
    ["a null amount", withData(FROM_AMOUNT, { amount: null }), "data.amount"],
    ["a fractional amount", withData(FROM_AMOUNT, { amount: 121.5 }), "data.amount"],
    ["no currency", withData(FROM_AMOUNT, { currency: null }), "data.currency"],
    [
      "an unknown amount source",
      withData(FROM_AMOUNT, { amountSource: "custom" }),
      "data.amountSource",
    ],
    ["a numeric description", withData(FROM_AMOUNT, { description: 1 }), "data.description"],
    ["a numeric product", withData(FROM_AMOUNT, { productId: 1 }), "data.productId"],
    ["an amount that names a price", withData(FROM_AMOUNT, { priceId: "price_1" }), "data.priceId"],
    ["an amount with an empty price", withData(FROM_AMOUNT, { priceId: "" }), "data.priceId"],
    ["a price source without a price", withData(FROM_PRICE, { priceId: null }), "data.priceId"],
    ["a zero quantity", withData(FROM_PRICE, { quantity: 0 }), "data.quantity"],
    ["no customerId", withData(FROM_PRICE, { customerId: null }), "data.customerId"],
    ["no expiry", withData(FROM_PRICE, { expiresAt: null }), "data.expiresAt"],
    [
      "an expiry that is not a timestamp",
      withData(FROM_PRICE, { expiresAt: "soon" }),
      "data.expiresAt",
    ],
  ])("refuses %s", (_label, envelope, field) => {
    expect(failure(envelope)).toMatchObject({
      code: ErrorCode.WEBHOOK_EVENT_INVALID,
      metadata: { field },
    });
  });
});
