import { afterEach, describe, expect, it, vi } from "vitest";
import { createBuPaymentClient, createBuPaymentClientFromEnv } from "../src/client";
import { ErrorCode } from "../src/constants";
import { isConfigured } from "../src/core/env";
import { BuPaymentError } from "../src/errors";
import { webhookDelivery } from "../src/webhooks/verification";
import { envClient, REQUIRED_ENV, WEBHOOK_SECRET } from "./support/env";

function failure(run: () => unknown): BuPaymentError {
  try {
    run();
  } catch (error) {
    if (error instanceof BuPaymentError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a BuPaymentError");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("client from the environment", () => {
  it("names every missing required variable in one error", () => {
    const error = failure(() => createBuPaymentClientFromEnv({}));
    expect(error.code).toBe(ErrorCode.CONFIGURATION_MISSING);
    expect(error.message).toBe(
      "Missing required environment variables: BU_PAYMENT_API_URL, BU_PAYMENT_APP_ID, BU_PAYMENT_KEY_ID, BU_PAYMENT_SECRET",
    );
    expect(error.metadata).toEqual({
      variables: "BU_PAYMENT_API_URL,BU_PAYMENT_APP_ID,BU_PAYMENT_KEY_ID,BU_PAYMENT_SECRET",
    });
  });

  it("names only the variables that are missing", () => {
    const { BU_PAYMENT_APP_ID: _app, BU_PAYMENT_SECRET: _secret, ...partial } = REQUIRED_ENV;
    const error = failure(() => createBuPaymentClientFromEnv(partial));
    expect(error.message).toBe(
      "Missing required environment variables: BU_PAYMENT_APP_ID, BU_PAYMENT_SECRET",
    );
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
  ])("treats an %s value as missing", (_label, value) => {
    const error = failure(() =>
      createBuPaymentClientFromEnv({ ...REQUIRED_ENV, BU_PAYMENT_KEY_ID: value }),
    );
    expect(error.code).toBe(ErrorCode.CONFIGURATION_MISSING);
    expect(error.message).toBe("Missing required environment variables: BU_PAYMENT_KEY_ID");
  });

  it("never carries a secret value in the error", () => {
    const env = {
      BU_PAYMENT_SECRET: REQUIRED_ENV.BU_PAYMENT_SECRET,
      BU_PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
    const missing = failure(() => createBuPaymentClientFromEnv(env));
    const invalid = failure(() =>
      createBuPaymentClientFromEnv({ ...REQUIRED_ENV, ...env, BU_PAYMENT_KEY_ID: "bup_ck_bad" }),
    );
    for (const error of [missing, invalid]) {
      const seen = `${error.message} ${JSON.stringify(error)}`;
      expect(seen).not.toContain(REQUIRED_ENV.BU_PAYMENT_SECRET);
      expect(seen).not.toContain(WEBHOOK_SECRET);
    }
    expect(invalid.code).toBe(ErrorCode.CONFIGURATION_INVALID);
  });

  it("signs requests for the configured application at the configured URL", async () => {
    const { client, calls } = envClient({
      ...REQUIRED_ENV,
      BU_PAYMENT_APP_ID: ` ${REQUIRED_ENV.BU_PAYMENT_APP_ID} `,
    });
    await client.request({ method: "GET", path: "/v1/products" });
    expect(client.applicationId).toBe(REQUIRED_ENV.BU_PAYMENT_APP_ID);
    expect(client.environment).toBe("test");
    expect(calls[0]?.url).toBe("https://api.bupayment.test/v1/products");
    expect(calls[0]?.headers["Bu-Payment-App-Id"]).toBe(REQUIRED_ENV.BU_PAYMENT_APP_ID);
  });

  it("reads process.env when no environment is given", () => {
    for (const [name, value] of Object.entries(REQUIRED_ENV)) {
      vi.stubEnv(name, value);
    }
    expect(createBuPaymentClientFromEnv().applicationId).toBe(REQUIRED_ENV.BU_PAYMENT_APP_ID);
    expect(isConfigured()).toBe(true);
  });
});

describe("isConfigured", () => {
  it("is true once every required variable holds a value", () => {
    expect(isConfigured(REQUIRED_ENV)).toBe(true);
  });

  it.each(Object.keys(REQUIRED_ENV))("is false without %s", (name) => {
    expect(isConfigured({ ...REQUIRED_ENV, [name]: undefined })).toBe(false);
    expect(isConfigured({ ...REQUIRED_ENV, [name]: " " })).toBe(false);
  });

  it("does not require the optional variables", () => {
    expect(isConfigured({ ...REQUIRED_ENV, BU_PAYMENT_WEBHOOK_SECRET: "" })).toBe(true);
  });
});

describe("webhook secret from the environment", () => {
  it("hands the configured secret to delivery verification", () => {
    const { client } = envClient({
      ...REQUIRED_ENV,
      BU_PAYMENT_WEBHOOK_SECRET: ` ${WEBHOOK_SECRET}`,
    });
    expect(client.webhookSecret).toBe(WEBHOOK_SECRET);
    expect(Object.isFrozen(webhookDelivery().secret(client.webhookSecret))).toBe(true);
  });

  it("keeps the secret out of the client's keys and serialization", () => {
    const { client } = envClient({ ...REQUIRED_ENV, BU_PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET });
    expect(Object.keys(client)).not.toContain("webhookSecret");
    expect(JSON.stringify(client)).not.toContain(WEBHOOK_SECRET);
  });

  it("hands over a webhook secret given directly, trimmed", () => {
    const client = createBuPaymentClient({
      applicationId: REQUIRED_ENV.BU_PAYMENT_APP_ID,
      keyId: REQUIRED_ENV.BU_PAYMENT_KEY_ID,
      secret: REQUIRED_ENV.BU_PAYMENT_SECRET,
      apiBaseUrl: REQUIRED_ENV.BU_PAYMENT_API_URL,
      webhookSecret: ` ${WEBHOOK_SECRET} `,
    });
    expect(client.webhookSecret).toBe(WEBHOOK_SECRET);
  });

  it("refuses an empty webhook secret given directly", () => {
    const error = failure(() =>
      createBuPaymentClient({
        applicationId: REQUIRED_ENV.BU_PAYMENT_APP_ID,
        keyId: REQUIRED_ENV.BU_PAYMENT_KEY_ID,
        secret: REQUIRED_ENV.BU_PAYMENT_SECRET,
        apiBaseUrl: REQUIRED_ENV.BU_PAYMENT_API_URL,
        webhookSecret: " ",
      }),
    );
    expect(error.code).toBe(ErrorCode.CONFIGURATION_INVALID);
  });

  it("names the variable when the secret was never configured", () => {
    const { client } = envClient({ ...REQUIRED_ENV, BU_PAYMENT_WEBHOOK_SECRET: "" });
    const error = failure(() => client.webhookSecret);
    expect(error.code).toBe(ErrorCode.CONFIGURATION_MISSING);
    expect(error.metadata).toEqual({ variables: "BU_PAYMENT_WEBHOOK_SECRET" });
  });
});
