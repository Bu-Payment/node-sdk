import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import type { WebhookEventStore } from "../src/webhooks/types";
import { gate, incoming, memoryStore } from "./support/webhook-handling";

const EVENT_ID = "evt_02";

describe("webhook delivery deduplication", () => {
  it("claims the event id and runs the handler for the first delivery", async () => {
    const store = memoryStore();
    let calls = 0;
    const outcome = await incoming()
      .deduplicateWith(store)
      .handle(() => {
        calls += 1;
      });
    expect(outcome).toEqual({ status: 200 });
    expect(calls).toBe(1);
    expect(store.calls).toEqual([`claim ${EVENT_ID}`]);
  });

  it("answers 200 for an event already claimed without calling the handler", async () => {
    const store = memoryStore();
    store.claimed.add(EVENT_ID);
    let calls = 0;
    const outcome = await incoming()
      .deduplicateWith(store)
      .handle(() => {
        calls += 1;
      });
    expect(outcome).toEqual({ status: 200 });
    expect(calls).toBe(0);
  });

  it("runs the handler once for two simultaneous deliveries of one event", async () => {
    const store = memoryStore();
    const work = gate();
    let calls = 0;
    const handler = async () => {
      calls += 1;
      await work.opened;
    };
    const first = incoming().deduplicateWith(store).handle(handler);
    const second = incoming().deduplicateWith(store).handle(handler);
    work.open();
    expect(await Promise.all([first, second])).toEqual([{ status: 200 }, { status: 200 }]);
    expect(calls).toBe(1);
  });

  it("releases the claim when the handler fails, so the redelivery is handled", async () => {
    const store = memoryStore();
    const failure = new Error("database unavailable");
    const verifier = incoming().deduplicateWith(store);
    await expect(
      verifier.handle(() => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(store.claimed.has(EVENT_ID)).toBe(false);

    let calls = 0;
    const redelivered = await verifier.handle(() => {
      calls += 1;
    });
    expect(redelivered).toEqual({ status: 200 });
    expect(calls).toBe(1);
    expect(store.calls).toEqual([`claim ${EVENT_ID}`, `release ${EVENT_ID}`, `claim ${EVENT_ID}`]);
  });

  it("reports both failures when the claim cannot be released", async () => {
    const failure = new Error("handler failed");
    const unreleasable = new Error("store unavailable");
    const store: WebhookEventStore = {
      claim: async () => true,
      release: () => Promise.reject(unreleasable),
    };
    const handled = incoming()
      .deduplicateWith(store)
      .handle(() => {
        throw failure;
      });
    await expect(handled).rejects.toBeInstanceOf(AggregateError);
    await expect(handled).rejects.toMatchObject({ errors: [failure, unreleasable] });
  });

  it("answers 400 for a rejected delivery without touching the store", async () => {
    const store = memoryStore();
    const outcome = await incoming({ signature: "0".repeat(64) })
      .deduplicateWith(store)
      .handle(() => undefined);
    expect(outcome.status).toBe(400);
    expect(store.calls).toEqual([]);
  });

  it("propagates a failing claim without calling the handler", async () => {
    const unavailable = new Error("store unavailable");
    let calls = 0;
    const handled = incoming()
      .deduplicateWith({ claim: () => Promise.reject(unavailable), release: async () => {} })
      .handle(() => {
        calls += 1;
      });
    await expect(handled).rejects.toBe(unavailable);
    expect(calls).toBe(0);
  });

  it("refuses a claim that does not resolve to a boolean", async () => {
    let calls = 0;
    const careless = {
      claim: async () => undefined,
      release: async () => {},
    } as unknown as WebhookEventStore;
    const handled = incoming()
      .deduplicateWith(careless)
      .handle(() => {
        calls += 1;
      });
    await expect(handled).rejects.toMatchObject({ code: ErrorCode.CONFIGURATION_INVALID });
    expect(calls).toBe(0);
  });
});
