import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import checkoutEvents from "./fixtures/checkout-events.json";
import {
  CANCELLED_EVENT,
  COMPLETED_EVENT,
  deliver,
  type Envelope,
  failure,
  withData,
} from "./support/webhook-events";

describe("typed checkout events", () => {
  it.each(
    checkoutEvents.map((event) => [event.type, event] as const),
  )("returns %s as a typed checkout event", (_type, envelope) => {
    expect(deliver(envelope).event).toEqual(envelope);
  });

  it("narrows a completed checkout to its payment and reference", () => {
    const { event } = deliver(COMPLETED_EVENT);
    if (event.type !== "checkout.completed") {
      throw new Error("expected a completed checkout");
    }
    expect(event.data.status).toBe("completed");
    expect(event.data.paymentId).toBe("payment_123");
    expect(event.data.reference).toBe("order-1042");
  });

  it("accepts a completed checkout that had expired", () => {
    const late = withData(COMPLETED_EVENT, { previousStatus: "expired" });
    expect(deliver(late).event.data).toEqual(late.data);
  });

  it("keeps the callback steps unknown", () => {
    const callback = {
      ...COMPLETED_EVENT,
      type: "checkout.callback.received",
      data: { callbackId: "cb_1" },
    };
    expect(deliver(callback).event).toMatchObject({
      type: "unknown",
      receivedType: "checkout.callback.received",
    });
  });
});

describe("checkout event validation", () => {
  it.each<[string, Envelope, string]>([
    ["data that is not an object", { ...COMPLETED_EVENT, data: null }, "data"],
    ["no checkoutId", withData(COMPLETED_EVENT, { checkoutId: "" }), "data.checkoutId"],
    ["a status of another type", withData(COMPLETED_EVENT, { status: "failed" }), "data.status"],
    [
      "an unknown previousStatus",
      withData(COMPLETED_EVENT, { previousStatus: "paid" }),
      "data.previousStatus",
    ],
    ["a numeric reference", withData(COMPLETED_EVENT, { reference: 1 }), "data.reference"],
    ["no paymentId", withData(COMPLETED_EVENT, { paymentId: undefined }), "data.paymentId"],
    ["a fractional amount", withData(COMPLETED_EVENT, { amount: 12.5 }), "data.amount"],
    [
      "a negative charged amount",
      withData(COMPLETED_EVENT, { chargedAmount: -1 }),
      "data.chargedAmount",
    ],
    ["a numeric currency", withData(COMPLETED_EVENT, { currency: 978 }), "data.currency"],
    ["a zero quantity", withData(COMPLETED_EVENT, { quantity: 0 }), "data.quantity"],
    ["no customerId", withData(COMPLETED_EVENT, { customerId: null }), "data.customerId"],
    [
      "a cancellation without a checkoutId",
      withData(CANCELLED_EVENT, { checkoutId: undefined }),
      "data.checkoutId",
    ],
    [
      "a cancellation from an unknown status",
      withData(CANCELLED_EVENT, { previousStatus: "open" }),
      "data.previousStatus",
    ],
    [
      "a cancellation with a numeric provider",
      withData(CANCELLED_EVENT, { provider: 1 }),
      "data.provider",
    ],
  ])("refuses %s", (_label, envelope, field) => {
    expect(failure(envelope)).toMatchObject({
      code: ErrorCode.WEBHOOK_EVENT_INVALID,
      metadata: { field },
    });
  });
});
