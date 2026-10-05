import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import type { WebhookHeaders } from "../src/webhooks/types";
import { webhookDelivery } from "../src/webhooks/verification";
import fixture from "./fixtures/webhook-delivery.json";

const { secret: SECRET, timestamp: TIMESTAMP, body: BODY, signature: SIGNATURE } = fixture;

interface Delivery {
  body: string | Uint8Array;
  headers: WebhookHeaders;
  secret: string;
  toleranceSeconds?: number;
  clock: () => number;
}

function verify(overrides: Partial<Delivery> = {}) {
  const input: Delivery = {
    body: BODY,
    headers: headers(),
    secret: SECRET,
    clock: () => Number(TIMESTAMP),
    ...overrides,
  };
  const builder = webhookDelivery()
    .secret(input.secret)
    .body(input.body)
    .headers(input.headers)
    .clock(input.clock);
  return (
    input.toleranceSeconds === undefined
      ? builder
      : builder.toleranceSeconds(input.toleranceSeconds)
  ).verify();
}

function failure(run: () => unknown): BuPaymentError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BuPaymentError);
    return error as BuPaymentError;
  }
  throw new Error("expected verification to fail");
}

function signed(timestamp: string, body = BODY): string {
  return createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
}

function headers(overrides: Record<string, string | undefined> = {}) {
  return {
    "x-webhook-id": fixture.deliveryId,
    "x-webhook-timestamp": TIMESTAMP,
    "x-webhook-signature": SIGNATURE,
    ...overrides,
  };
}

describe("webhookDelivery", () => {
  it("accepts a delivery signed the way the platform signs it", () => {
    const delivery = webhookDelivery()
      .secret(SECRET)
      .body(BODY)
      .headers(headers())
      .clock(() => Number(TIMESTAMP))
      .verify();

    expect(delivery.deliveryId).toBe("whd_1");
    expect(delivery.signature).toBe(SIGNATURE);
    expect(delivery.timestamp.getTime()).toBe(Number(TIMESTAMP));
    expect(delivery.event).toEqual(JSON.parse(BODY));
  });

  it.each([
    ["a Buffer", Buffer.from(BODY, "utf8")],
    ["a Uint8Array", new Uint8Array(Buffer.from(BODY, "utf8"))],
  ])("verifies the raw body given as %s", (_name, body) => {
    expect(verify({ body }).event.id).toBe("evt_02");
  });

  it.each([
    ["a tampered body", { body: BODY.replace("Bilhete", "Bilhetes") }],
    ["a tampered signature", { headers: headers({ "x-webhook-signature": "0".repeat(64) }) }],
    ["a signature of the wrong length", { headers: headers({ "x-webhook-signature": "abc" }) }],
    ["a wrong secret", { secret: "whsec_BBECAwQFBgcICQoLDA0ODxAREhMUFRYX" }],
  ])("rejects %s as an invalid signature", (_name, overrides) => {
    expect(failure(() => verify(overrides)).code).toBe(ErrorCode.WEBHOOK_SIGNATURE_INVALID);
  });

  it("accepts a delivery at the edge of the default five-minute window", () => {
    expect(verify({ clock: () => Number(TIMESTAMP) + 300_000 }).deliveryId).toBe("whd_1");
    expect(verify({ clock: () => Number(TIMESTAMP) - 300_000 }).deliveryId).toBe("whd_1");
  });

  it.each([
    ["older", 300_001],
    ["newer", -300_001],
  ])("rejects an authentic delivery %s than the default window", (_name, offset) => {
    const error = failure(() => verify({ clock: () => Number(TIMESTAMP) + offset }));
    expect(error.code).toBe(ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED);
    expect(error.metadata).toEqual({ toleranceSeconds: 300 });
  });

  it("applies a configured tolerance", () => {
    const later = () => Number(TIMESTAMP) + 11_000;
    expect(failure(() => verify({ toleranceSeconds: 10, clock: later })).code).toBe(
      ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED,
    );
    expect(verify({ toleranceSeconds: 20, clock: later }).deliveryId).toBe("whd_1");
  });

  it("checks the signature before the window, so a forged stale delivery is a forgery", () => {
    const error = failure(() =>
      verify({
        headers: headers({ "x-webhook-signature": "0".repeat(64) }),
        clock: () => Number(TIMESTAMP) + 3_600_000,
      }),
    );
    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_INVALID);
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("refuses a tolerance of %s as a configuration error", (toleranceSeconds) => {
    expect(failure(() => verify({ toleranceSeconds })).code).toBe(ErrorCode.CONFIGURATION_INVALID);
  });

  it.each([
    "x-webhook-id",
    "x-webhook-timestamp",
    "x-webhook-signature",
  ])("rejects a delivery missing %s", (name) => {
    const error = failure(() => verify({ headers: headers({ [name]: undefined }) }));
    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_MISSING);
  });

  it("treats an empty header as missing", () => {
    const error = failure(() => verify({ headers: headers({ "x-webhook-timestamp": "" }) }));
    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_MISSING);
  });

  it("rejects a header sent twice rather than choosing one", () => {
    const error = failure(() =>
      verify({ headers: { ...headers(), "x-webhook-signature": [SIGNATURE, SIGNATURE] } }),
    );
    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_MISSING);
  });

  it.each([
    "1790000000000.5",
    "-1790000000000",
    "1e12",
    " 1790000000000",
  ])("rejects the timestamp %j even when it was signed as sent", (timestamp) => {
    const error = failure(() =>
      verify({
        headers: headers({
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": signed(timestamp),
        }),
        clock: () => Number(timestamp),
      }),
    );
    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_INVALID);
  });

  it("rejects an uppercase signature, since the platform sends lowercase hex", () => {
    const error = failure(() =>
      verify({ headers: headers({ "x-webhook-signature": SIGNATURE.toUpperCase() }) }),
    );
    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_INVALID);
  });

  it("accepts a header given as an array of one value", () => {
    const delivery = verify({ headers: { ...headers(), "x-webhook-signature": [SIGNATURE] } });
    expect(delivery.signature).toBe(SIGNATURE);
  });

  it.each([
    ["joined by Node", { ...headers(), "x-webhook-id": "whd_1, whd_2" }],
    ["joined by a Fetch Headers object", appended("x-webhook-id", "whd_2")],
    ["a signature joined by a Fetch Headers object", appended("x-webhook-signature", SIGNATURE)],
  ])("refuses a header sent twice and %s", (_name, duplicated) => {
    expect(failure(() => verify({ headers: duplicated })).code).toBe(
      ErrorCode.WEBHOOK_SIGNATURE_MISSING,
    );
  });

  it("reads a Headers object from another realm or a polyfill", () => {
    const native = new Headers(headers());
    const foreign = { get: (name: string) => native.get(name) };
    expect(verify({ headers: foreign }).deliveryId).toBe("whd_1");
  });

  it("reads header names in any casing", () => {
    const delivery = verify({
      headers: {
        "X-Webhook-Id": "whd_1",
        "X-WEBHOOK-TIMESTAMP": TIMESTAMP,
        "x-Webhook-Signature": SIGNATURE,
      },
    });
    expect(delivery.deliveryId).toBe("whd_1");
  });

  it("measures the window against the system clock by default", () => {
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", SECRET).update(`${timestamp}.${BODY}`).digest("hex");
    const delivery = webhookDelivery()
      .secret(SECRET)
      .body(BODY)
      .headers(headers({ "x-webhook-timestamp": timestamp, "x-webhook-signature": signature }))
      .verify();
    expect(delivery.timestamp.getTime()).toBe(Number(timestamp));
  });

  it("rejects a Fetch API Headers object missing a header", () => {
    const incomplete = new Headers(headers());
    incomplete.delete("x-webhook-signature");
    expect(failure(() => verify({ headers: incomplete })).code).toBe(
      ErrorCode.WEBHOOK_SIGNATURE_MISSING,
    );
  });

  it("reads a Fetch API Headers object", () => {
    expect(verify({ headers: new Headers(headers()) }).deliveryId).toBe("whd_1");
  });

  it("refuses an already-parsed body and says to pass the raw one", () => {
    const parsed: unknown = JSON.parse(BODY);
    const error = failure(() => verify({ body: parsed as string }));
    expect(error.code).toBe(ErrorCode.WEBHOOK_PAYLOAD_INVALID);
    expect(error.message).toContain("raw request body");
  });

  it.each([
    ["not JSON", "not json"],
    ["a JSON array", "[]"],
    ["JSON null", "null"],
  ])("rejects an authentic body that is %s", (_name, body) => {
    const signature = createHmac("sha256", SECRET).update(`${TIMESTAMP}.${body}`).digest("hex");
    const error = failure(() =>
      verify({ body, headers: headers({ "x-webhook-signature": signature }) }),
    );
    expect(error.code).toBe(ErrorCode.WEBHOOK_PAYLOAD_INVALID);
  });

  it.each([
    ["an empty secret", ""],
    ["a secret without the whsec_ prefix", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYX"],
    ["the confidential API secret", "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"],
    ["the bare prefix", "whsec_"],
    ["a truncated secret", "whsec_AAECAwQFBgcICQoL"],
  ])("refuses %s as a configuration error without echoing it", (_name, secret) => {
    const error = failure(() => verify({ secret }));
    expect(error.code).toBe(ErrorCode.CONFIGURATION_INVALID);
    if (secret.length > "whsec_".length) {
      expect(error.message).not.toContain(secret);
    }
  });
});

describe("webhookDelivery secret handling", () => {
  const SECRET_MATERIAL = SECRET.slice("whsec_".length);

  it.each<[string, Partial<Delivery>]>([
    ["an invalid signature", { body: `${BODY} ` }],
    ["a missing header", { headers: headers({ "x-webhook-id": undefined }) }],
    ["an expired timestamp", { clock: () => 0 }],
    ["a malformed body", { body: {} as string }],
    ["a bad tolerance", { toleranceSeconds: -1 }],
  ])("keeps the endpoint secret out of %s", (_name, overrides) => {
    const error = failure(() => verify(overrides));
    const rendered = [
      error.message,
      error.stack ?? "",
      JSON.stringify(error),
      inspect(error, { depth: 10 }),
      String(error.cause ?? ""),
    ].join("\n");
    expect(rendered).not.toContain(SECRET_MATERIAL);
  });
});

function appended(name: string, value: string): Headers {
  const duplicated = new Headers(headers());
  duplicated.append(name, value);
  return duplicated;
}
