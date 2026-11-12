import { createBuPaymentClientFromEnv } from "../../src/client";
import type { BuPaymentEnv } from "../../src/core/env";
import type { FetchLike } from "../../src/core/http";
import { readVectors } from "../conformance/vectors";
import { type Call, json } from "./harness";

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
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      method: init.method ?? "GET",
      url,
      headers: init.headers as Record<string, string>,
      body: init.body
        ? JSON.parse(Buffer.from(init.body as Uint8Array).toString("utf8"))
        : undefined,
    });
    return json({ id: "chk_1" });
  };
  return { client: createBuPaymentClientFromEnv(env, { fetch }), calls };
}
