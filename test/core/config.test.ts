import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import type { ClientConfigInput } from "../../src/core/config";
import { parseClientConfig } from "../../src/core/config";
import { BuPaymentError } from "../../src/errors";

const SECRET = "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

function input(overrides: Partial<ClientConfigInput> = {}): ClientConfigInput {
  return {
    applicationId: "app_123",
    keyId: "bup_ck_test_A12345678901234567890123",
    secret: SECRET,
    apiBaseUrl: "https://api.bupayment.test",
    ...overrides,
  };
}

describe("parseClientConfig", () => {
  it("derives the environment from the key ID and normalises the base URL", () => {
    const config = parseClientConfig(input({ apiBaseUrl: "https://api.bupayment.test/gateway" }));
    expect(config.environment).toBe("test");
    expect(config.applicationId).toBe("app_123");
    expect(config.apiBaseUrl.href).toBe("https://api.bupayment.test/gateway/");
  });

  it("accepts a live key ID", () => {
    const config = parseClientConfig(
      input({ keyId: "bup_ck_live_A12345678901234567890123", environment: "live" }),
    );
    expect(config.environment).toBe("live");
  });

  it("trims surrounding whitespace on credentials", () => {
    const config = parseClientConfig(
      input({ applicationId: "  app_123  ", secret: `  ${SECRET}  ` }),
    );
    expect(config.applicationId).toBe("app_123");
  });

  it("accepts loopback HTTP for local development", () => {
    expect(parseClientConfig(input({ apiBaseUrl: "http://localhost:3000" })).apiBaseUrl.href).toBe(
      "http://localhost:3000/",
    );
  });

  it.each([
    ["an application ID without the app_ prefix", { applicationId: "123" }],
    ["a key ID without an environment", { keyId: "bup_ck_A12345678901234567890123" }],
    ["an environment that contradicts the key ID", { environment: "live" as const }],
    ["a relative base URL", { apiBaseUrl: "/v1" }],
    ["a non-HTTP base URL", { apiBaseUrl: "ftp://api.bupayment.test" }],
    ["plaintext HTTP outside loopback", { apiBaseUrl: "http://api.bupayment.test" }],
    ["a base URL carrying credentials", { apiBaseUrl: "https://a:b@api.bupayment.test" }],
    ["a base URL carrying a query", { apiBaseUrl: "https://api.bupayment.test?a=1" }],
  ])("rejects %s", (_name, overrides) => {
    let thrown: unknown;
    try {
      parseClientConfig(input(overrides));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BuPaymentError);
    expect((thrown as BuPaymentError).code).toBe(ErrorCode.CONFIGURATION_INVALID);
  });

  it("keeps the secret out of configuration serialisation", () => {
    const config = parseClientConfig(input());
    expect(JSON.stringify(config)).not.toContain("AAECAw");
  });
});
