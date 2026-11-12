import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import type { VerifiedWebhookDelivery, WebhookEvent } from "../src/webhooks/types";
import catalogueEvents from "./fixtures/catalogue-events.json";
import { BODY, bodyOf, gate, incoming, isSettled, TIMESTAMP } from "./support/webhook-handling";

describe("webhook delivery handle", () => {
  it("answers 200 once the handler has received the verified event", async () => {
    const received: [WebhookEvent, VerifiedWebhookDelivery][] = [];
    const outcome = await incoming().handle((event, delivery) => {
      received.push([event, delivery]);
    });
    expect(outcome).toEqual({ status: 200 });
    expect(received).toHaveLength(1);
    expect(received[0]?.[0]).toEqual(JSON.parse(BODY));
    expect(received[0]?.[1].deliveryId).toBe("whd_1");
  });

  it("answers 200 only after an asynchronous handler resolves", async () => {
    const work = gate();
    let finished = false;
    const outcome = incoming().handle(async () => {
      await work.opened;
      finished = true;
    });
    expect(await isSettled(outcome)).toBe(false);
    work.open();
    expect(await outcome).toEqual({ status: 200 });
    expect(finished).toBe(true);
  });

  it.each([
    ["a forged signature", { signature: "0".repeat(64) }, ErrorCode.WEBHOOK_SIGNATURE_INVALID],
    [
      "a stale timestamp",
      { now: Number(TIMESTAMP) + 300_001 },
      ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED,
    ],
    ["a body that is not JSON", { body: "not json" }, ErrorCode.WEBHOOK_PAYLOAD_INVALID],
  ])("answers 400 for %s without calling the handler", async (_name, signing, code) => {
    let calls = 0;
    const outcome = await incoming(signing).handle(() => {
      calls += 1;
    });
    expect(outcome.status).toBe(400);
    expect(outcome.status === 400 && outcome.error.code).toBe(code);
    expect(calls).toBe(0);
  });

  it("answers 400 for a delivery missing its signature header", async () => {
    const outcome = await incoming()
      .headers({ "x-webhook-id": "whd_1", "x-webhook-timestamp": TIMESTAMP })
      .handle(() => {
        throw new Error("the handler must not run");
      });
    expect(outcome.status === 400 && outcome.error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_MISSING);
  });

  it("propagates the error a handler throws, so the application answers 500", async () => {
    const failure = new Error("database unavailable");
    await expect(
      incoming().handle(() => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(incoming().handle(() => Promise.reject(failure))).rejects.toBe(failure);
  });

  it("propagates a deployment fault instead of answering it as a bad delivery", async () => {
    let calls = 0;
    const handled = incoming({ secret: "bup_sec_not_a_webhook_secret" }).handle(() => {
      calls += 1;
    });
    await expect(handled).rejects.toMatchObject({ code: ErrorCode.CONFIGURATION_INVALID });
    expect(calls).toBe(0);
  });

  it.each([
    [
      "an unsupported version",
      { ...catalogueEvents[0], version: 2 },
      ErrorCode.WEBHOOK_EVENT_VERSION_UNSUPPORTED,
    ],
    [
      "data that does not match its type",
      { ...catalogueEvents[0], data: {} },
      ErrorCode.WEBHOOK_EVENT_INVALID,
    ],
  ])("propagates an authentic delivery with %s", async (_name, envelope, code) => {
    const handled = incoming({ body: bodyOf(envelope) }).handle(() => undefined);
    await expect(handled).rejects.toBeInstanceOf(BuPaymentError);
    await expect(handled).rejects.toMatchObject({ code });
  });
});
