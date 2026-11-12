import type { Checkout } from "../src/checkout/types";
import {
  type BuPaymentClient,
  createBuPaymentClient,
  createBuPaymentClientFromEnv,
  type DefaultDestination,
} from "../src/client";
import { isConfigured } from "../src/core/env";
import { webhookDelivery } from "../src/webhooks/verification";

const fromEnv: BuPaymentClient<DefaultDestination> = createBuPaymentClientFromEnv(process.env);
const asPlain: BuPaymentClient = fromEnv;
void asPlain;

const defaulted: Promise<Checkout> = fromEnv.checkout
  .sessionDraft()
  .priceId("p")
  .customerId("c")
  .idempotencyKey("o")
  .create();
void defaulted;

const explicit: Promise<Checkout> = fromEnv.checkout
  .sessionDraft()
  .destination("partner")
  .priceId("p")
  .customerId("c")
  .idempotencyKey("o")
  .create();
void explicit;

// @ts-expect-error a default destination does not stand in for the idempotency key
fromEnv.checkout.sessionDraft().priceId("p").customerId("c").create();

const base = { applicationId: "a", keyId: "k", secret: "s", apiBaseUrl: "u" };

const withDestination = createBuPaymentClient({ ...base, destinationKey: "store" });
withDestination.checkout.sessionDraft().priceId("p").customerId("c").idempotencyKey("o").create();

const withoutDestination = createBuPaymentClient(base).checkout.sessionDraft().priceId("p");
// @ts-expect-error without a configured destination the draft still needs destination()
withoutDestination.customerId("c").idempotencyKey("o").create();

const verifier = webhookDelivery().secret(fromEnv.webhookSecret);
void verifier;

// @ts-expect-error the environment is read, never rewritten
fromEnv.webhookSecret = "whsec_x";

const configured: boolean = isConfigured(process.env) && isConfigured();
void configured;

// @ts-expect-error an environment holds strings only
isConfigured({ BU_PAYMENT_APP_ID: 1 });
