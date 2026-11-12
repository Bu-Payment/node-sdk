import { type BuPaymentClient, createBuPaymentClientFromEnv } from "../src/client";
import { isConfigured } from "../src/core/env";
import { webhookDelivery } from "../src/webhooks/verification";

const fromEnv: BuPaymentClient = createBuPaymentClientFromEnv(process.env);

const verifier = webhookDelivery().secret(fromEnv.webhookSecret);
void verifier;

// @ts-expect-error the environment is read, never rewritten
fromEnv.webhookSecret = "whsec_x";

const configured: boolean = isConfigured(process.env) && isConfigured();
void configured;

// @ts-expect-error an environment holds strings only
isConfigured({ BU_PAYMENT_APP_ID: 1 });
