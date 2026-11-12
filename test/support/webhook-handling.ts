import { createHmac } from "node:crypto";
import { webhookDelivery } from "../../src/webhooks/verification";
import fixture from "../fixtures/webhook-delivery.json";

export const { secret: SECRET, timestamp: TIMESTAMP, body: BODY } = fixture;

export interface Signing {
  body?: string;
  signature?: string;
  secret?: string;
  now?: number;
}

export function incoming(signing: Signing = {}) {
  const body = signing.body ?? BODY;
  return webhookDelivery()
    .secret(signing.secret ?? SECRET)
    .clock(() => signing.now ?? Number(TIMESTAMP))
    .body(body)
    .headers({
      "x-webhook-id": "whd_1",
      "x-webhook-timestamp": TIMESTAMP,
      "x-webhook-signature":
        signing.signature ??
        createHmac("sha256", SECRET).update(`${TIMESTAMP}.${body}`).digest("hex"),
    });
}

export function bodyOf(envelope: unknown): string {
  return JSON.stringify(envelope);
}

export interface Gate {
  readonly opened: Promise<void>;
  open(): void;
}

export function gate(): Gate {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

export async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  const mark = () => {
    settled = true;
  };
  promise.then(mark, mark);
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}
