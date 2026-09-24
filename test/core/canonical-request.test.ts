import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import {
  buildCanonicalRequest,
  canonicalizeMethod,
  canonicalizeQuery,
} from "../../src/core/canonical-request";
import type { BuPaymentError } from "../../src/errors";

const signable = {
  applicationId: "app_123",
  keyId: "bup_ck_test_A12345678901234567890123",
  timestamp: "1722513600",
  nonce: "0123456789abcdef0123456789abcdef",
  method: "GET",
  rawPath: "/v1/items",
};

function codeOf(build: () => unknown): string | undefined {
  try {
    build();
    return undefined;
  } catch (caught) {
    return (caught as BuPaymentError).code;
  }
}

describe("canonicalizeMethod", () => {
  it("uppercases a valid token", () => {
    expect(canonicalizeMethod("post")).toBe("POST");
  });

  it("refuses a method that is not a token", () => {
    expect(codeOf(() => canonicalizeMethod("GET POST"))).toBe(ErrorCode.APPLICATION_AUTH_MALFORMED);
  });
});

describe("canonicalizeQuery", () => {
  it("treats an absent query as an empty line", () => {
    expect(canonicalizeQuery()).toBe("");
  });

  it("refuses a query that still carries its question mark", () => {
    expect(codeOf(() => canonicalizeQuery("?a=1"))).toBe(ErrorCode.APPLICATION_AUTH_MALFORMED);
  });
});

describe("buildCanonicalRequest", () => {
  it("refuses a path that does not start with a slash", () => {
    expect(codeOf(() => buildCanonicalRequest({ ...signable, rawPath: "v1/items" }))).toBe(
      ErrorCode.APPLICATION_AUTH_MALFORMED,
    );
  });

  it("refuses an unpaired surrogate in the path", () => {
    expect(codeOf(() => buildCanonicalRequest({ ...signable, rawPath: "/\ud800" }))).toBe(
      ErrorCode.APPLICATION_AUTH_MALFORMED,
    );
  });

  it.each([
    ["an application ID that is not opaque", { applicationId: "app 123" }],
    ["a key ID that is not opaque", { keyId: "bup ck" }],
    ["a padded timestamp", { timestamp: "01722513600" }],
    ["a negative timestamp", { timestamp: "-1" }],
    ["an uppercase nonce", { nonce: "0123456789ABCDEF0123456789ABCDEF" }],
    ["a short nonce", { nonce: "0123456789abcdef" }],
  ])("refuses %s", (_name, override) => {
    expect(codeOf(() => buildCanonicalRequest({ ...signable, ...override }))).toBe(
      ErrorCode.APPLICATION_AUTH_MALFORMED,
    );
  });

  it("accepts the zero timestamp the protocol allows", () => {
    expect(buildCanonicalRequest({ ...signable, timestamp: "0" })).toContain("\n0\n");
  });
});
