import type { WebhookOutcome } from "../src/webhooks/types";
import { webhookDelivery } from "../src/webhooks/verification";

const headers = {};

// @ts-expect-error a delivery cannot be verified before its secret is set
webhookDelivery().body("{}").headers(headers).verify();

// @ts-expect-error a delivery cannot be verified before its raw body is set
webhookDelivery().secret("whsec_x").headers(headers).verify();

// @ts-expect-error a delivery cannot be verified before its headers are set
webhookDelivery().secret("whsec_x").body("{}").verify();

webhookDelivery()
  .secret("whsec_x")
  // @ts-expect-error a parsed body cannot be verified; the raw bytes were signed
  .body({ resourceId: "prod_1" });

const verifier = webhookDelivery().secret("whsec_x").toleranceSeconds(60);
void verifier.body(new Uint8Array()).headers(new Headers()).verify().event;

const handler = () => {};

// @ts-expect-error a delivery cannot be handled before its secret is set
void webhookDelivery().body("{}").headers(headers).handle(handler);

// @ts-expect-error a delivery cannot be handled before its raw body is set
void webhookDelivery().secret("whsec_x").headers(headers).handle(handler);

// @ts-expect-error a delivery cannot be handled before its headers are set
void webhookDelivery().secret("whsec_x").body("{}").handle(handler);

const outcome: Promise<WebhookOutcome> = verifier
  .body("{}")
  .headers(headers)
  .handle(async (event, delivery) => {
    void event.id;
    void delivery.signature;
  });

void outcome.then((answer) => {
  const status: 200 | 400 = answer.status;
  // @ts-expect-error only a rejected delivery carries the error that rejected it
  void answer.error;
  if (answer.status === 400) {
    void answer.error.code;
  }
  return status;
});
