import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { ConfidentialSecret } from "../../src/core/secret";
import { BuPaymentError } from "../../src/errors";

const VALID = "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const VALID_KEY_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

describe("ConfidentialSecret.parse", () => {
  it("decodes the Base64URL suffix to the 32 HMAC key bytes", () => {
    const secret = ConfidentialSecret.parse(VALID);
    expect(Buffer.from(secret.keyBytes()).toString("hex")).toBe(VALID_KEY_HEX);
  });

  it("returns a defensive copy of the key bytes", () => {
    const secret = ConfidentialSecret.parse(VALID);
    secret.keyBytes().fill(0);
    expect(Buffer.from(secret.keyBytes()).toString("hex")).toBe(VALID_KEY_HEX);
  });

  it.each([
    ["a missing prefix", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"],
    ["a different prefix", "bup_pk_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"],
    ["Base64 padding", "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="],
    ["non-Base64URL characters", "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh+"],
    ["a non-canonical encoding", "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh9"],
    ["fewer than 32 decoded bytes", "bup_sec_AAECAwQFBgcICQoLDA0ODw"],
    ["more than 32 decoded bytes", "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8g"],
  ])("rejects %s", (_name, value) => {
    expect(() => ConfidentialSecret.parse(value)).toThrowError(BuPaymentError);
    try {
      ConfidentialSecret.parse(value);
    } catch (error) {
      expect((error as BuPaymentError).code).toBe(ErrorCode.CONFIGURATION_INVALID);
      expect((error as BuPaymentError).message).not.toContain(value);
    }
  });
});

describe("ConfidentialSecret redaction", () => {
  const secret = ConfidentialSecret.parse(VALID);

  it("never renders the secret through string conversion, JSON, or inspect", () => {
    expect(String(secret)).toBe("[redacted]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[redacted]"}');
    expect(inspect(secret)).toBe("ConfidentialSecret [redacted]");
    expect(inspect({ secret }, { depth: 10 })).not.toContain("AAECAw");
    expect(Object.keys(secret)).toEqual([]);
  });
});
