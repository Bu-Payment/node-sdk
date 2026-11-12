import type { Checkout } from "../src/checkout/types";
import {
  type BuPaymentClient,
  createBuPaymentClient,
  createBuPaymentClientFromEnv,
  type DefaultDestination,
} from "../src/client";
import { isConfigured } from "../src/core/env";
import { webhookDelivery } from "../src/webhooks/verification";

const base = { applicationId: "a", keyId: "k", secret: "s", apiBaseUrl: "u" };

const fromEnv: BuPaymentClient<DefaultDestination> = createBuPaymentClientFromEnv(process.env);
const asPlain: BuPaymentClient = fromEnv;
void asPlain;

// @ts-expect-error a client without a destination cannot pass for one that has it
const pretending: BuPaymentClient<DefaultDestination> = createBuPaymentClient(base);
void pretending;

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

const withAmount = fromEnv.checkout
  .sessionDraft()
  .priceId("p")
  .customerId("c")
  .idempotencyKey("o")
  .expectedUnitAmount(1_500);
// @ts-expect-error a default destination does not settle an amount without its currency
withAmount.create();
const pinned: Promise<Checkout> = withAmount.expectedCurrency("EUR").create();
void pinned;

// @ts-expect-error a default destination does not stand in for the idempotency key
fromEnv.checkout.sessionDraft().priceId("p").customerId("c").create();

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
