import { describe, expect, it } from "vitest";
import { webhookDelivery } from "../src/webhooks/verification";
import fixture from "./fixtures/webhook-delivery.json";

const HEADERS = {
  "x-webhook-id": fixture.deliveryId,
  "x-webhook-timestamp": fixture.timestamp,
  "x-webhook-signature": fixture.signature,
};

describe("webhook delivery builder contract", () => {
  it("freezes every builder and returns a new one from each method", () => {
    const empty = webhookDelivery();
    const withSecret = empty.secret(fixture.secret);
    const withBody = withSecret.body(fixture.body);
    const complete = withBody.headers(HEADERS);
    const tolerant = complete.toleranceSeconds(10);
    const clocked = tolerant.clock(() => Number(fixture.timestamp));
    for (const builder of [empty, withSecret, withBody, complete, tolerant, clocked]) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
    expect(new Set([empty, withSecret, withBody, complete, tolerant, clocked]).size).toBe(6);
  });

  it("leaves an earlier builder unchanged when a later one is configured", () => {
    const verifier = webhookDelivery()
      .secret(fixture.secret)
      .clock(() => Number(fixture.timestamp));
    const tampered = verifier.body(`${fixture.body} `).headers(HEADERS);
    const authentic = verifier.body(fixture.body).headers(HEADERS);
    expect(() => tampered.verify()).toThrow();
    expect(authentic.verify().deliveryId).toBe(fixture.deliveryId);
  });

  it("offers verify only once the secret, body and headers are set", () => {
    const incomplete: object[] = [
      webhookDelivery(),
      webhookDelivery().secret(fixture.secret).body(fixture.body),
      webhookDelivery().secret(fixture.secret).headers(HEADERS),
      webhookDelivery().body(fixture.body).headers(HEADERS),
    ];
    for (const builder of incomplete) {
      expect("verify" in builder).toBe(false);
    }
    expect(
      "verify" in webhookDelivery().secret(fixture.secret).body(fixture.body).headers(HEADERS),
    ).toBe(true);
  });

  it("rejects a malformed configuration in verify, not while configuring", () => {
    const configured = webhookDelivery()
      .secret("not-a-secret")
      .toleranceSeconds(-1)
      .body(fixture.body)
      .headers({});
    expect(() => configured.verify()).toThrow();
  });

  it("offers handle only once the secret, body and headers are set", () => {
    const incomplete: object[] = [
      webhookDelivery(),
      webhookDelivery().secret(fixture.secret).body(fixture.body),
      webhookDelivery().secret(fixture.secret).headers(HEADERS),
      webhookDelivery().body(fixture.body).headers(HEADERS),
    ];
    for (const builder of incomplete) {
      expect("handle" in builder).toBe(false);
    }
    const complete = webhookDelivery().secret(fixture.secret).body(fixture.body).headers(HEADERS);
    expect("handle" in complete).toBe(true);
  });

  it("calls the handler only once handle is called", async () => {
    let calls = 0;
    const handler = () => {
      calls += 1;
    };
    const ready = webhookDelivery()
      .secret(fixture.secret)
      .body(fixture.body)
      .headers(HEADERS)
      .clock(() => Number(fixture.timestamp));
    expect(calls).toBe(0);
    expect(await ready.handle(handler)).toEqual({ status: 200 });
    expect(calls).toBe(1);
  });

  it("rejects a malformed configuration from the awaited handle, never synchronously", async () => {
    const configured = webhookDelivery().secret("not-a-secret").body(fixture.body).headers(HEADERS);
    let handled: Promise<unknown> | undefined;
    expect(() => {
      handled = configured.handle(() => {});
    }).not.toThrow();
    await expect(handled).rejects.toThrow();
  });
});
