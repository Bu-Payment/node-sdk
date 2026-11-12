import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { isRejectedDelivery } from "../src/webhooks/handling";
import catalogueEvents from "./fixtures/catalogue-events.json";
import { bodyOf, incoming, TIMESTAMP } from "./support/webhook-handling";

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected verification to fail");
}

const REJECTIONS: [string, () => unknown][] = [
  [
    "a missing signature header",
    () => incoming().headers({ "x-webhook-timestamp": TIMESTAMP }).verify(),
  ],
  ["a forged signature", () => incoming({ signature: "0".repeat(64) }).verify()],
  ["a stale timestamp", () => incoming({ now: Number(TIMESTAMP) + 300_001 }).verify()],
  ["a body that is not JSON", () => incoming({ body: "[]" }).verify()],
  [
    "a parsed body",
    () =>
      incoming()
        .body({} as unknown as string)
        .verify(),
  ],
];

const FAULTS: [string, () => unknown][] = [
  ["a malformed secret", () => incoming({ secret: "whsec_short" }).verify()],
  ["a malformed tolerance", () => incoming().toleranceSeconds(0).verify()],
  [
    "an unsupported event version",
    () => incoming({ body: bodyOf({ ...catalogueEvents[0], version: 2 }) }).verify(),
  ],
  [
    "an event whose data does not match its type",
    () => incoming({ body: bodyOf({ ...catalogueEvents[0], data: {} }) }).verify(),
  ],
];

describe("isRejectedDelivery", () => {
  it.each(REJECTIONS)("recognises %s as a rejected delivery", (_name, run) => {
    expect(isRejectedDelivery(thrownBy(run))).toBe(true);
  });

  it.each(FAULTS)("leaves %s to the application as a failure", (_name, run) => {
    const error = thrownBy(run);
    expect(error).toBeInstanceOf(BuPaymentError);
    expect(isRejectedDelivery(error)).toBe(false);
  });

  it("covers exactly the codes the verification answers as a bad delivery", () => {
    const rejected = REJECTIONS.map(([, run]) => (thrownBy(run) as BuPaymentError).code);
    const guarded = Object.values(ErrorCode).filter((code) =>
      isRejectedDelivery(new BuPaymentError("probe", { code })),
    );
    expect(new Set(rejected)).toEqual(new Set(guarded));
    expect(guarded).toHaveLength(4);
  });

  it("refuses anything that is not a BuPaymentError", () => {
    expect(isRejectedDelivery(new Error(ErrorCode.WEBHOOK_SIGNATURE_INVALID))).toBe(false);
    expect(isRejectedDelivery({ code: ErrorCode.WEBHOOK_SIGNATURE_INVALID })).toBe(false);
    expect(isRejectedDelivery(undefined)).toBe(false);
  });
});
