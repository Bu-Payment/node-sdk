import { createBuPaymentClientFromEnv } from "../../src/client";
import type { BuPaymentEnv } from "../../src/core/env";
import { readVectors } from "../conformance/vectors";
import { json, recordingFetch } from "./harness";

const vector = readVectors().success[0] as NonNullable<
  ReturnType<typeof readVectors>["success"][0]
>;

export const WEBHOOK_SECRET = "whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYX";

export const REQUIRED_ENV = Object.freeze({
  BU_PAYMENT_API_URL: "https://api.bupayment.test",
  BU_PAYMENT_APP_ID: vector.appId,
  BU_PAYMENT_KEY_ID: vector.keyId,
  BU_PAYMENT_SECRET: vector.confidentialSecret,
});

export function envClient(env: BuPaymentEnv) {
  const { fetch, calls } = recordingFetch(() => json({ id: "chk_1" }));
  return { client: createBuPaymentClientFromEnv(env, { fetch }), calls };
}
