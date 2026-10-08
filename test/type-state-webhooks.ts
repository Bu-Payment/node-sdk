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
