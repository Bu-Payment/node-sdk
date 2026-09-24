import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { generateIdempotencyKey, parseIdempotencyKey } from "../../src/core/idempotency";
import { generateNonce } from "../../src/core/nonce";

describe("generateNonce", () => {
  it("produces 32 lowercase hexadecimal characters", () => {
    expect(generateNonce()).toMatch(/^[0-9a-f]{32}$/u);
  });

  it("produces a fresh value for every attempt", () => {
    const values = new Set(Array.from({ length: 64 }, generateNonce));
    expect(values.size).toBe(64);
  });
});

describe("generateIdempotencyKey", () => {
  it("produces a unique key the API accepts", () => {
    const key = generateIdempotencyKey();
    expect(parseIdempotencyKey(key)).toBe(key);
    expect(generateIdempotencyKey()).not.toBe(key);
  });
});

describe("parseIdempotencyKey", () => {
  it("keeps a valid key unchanged", () => {
    expect(parseIdempotencyKey("order-2026-09-24")).toBe("order-2026-09-24");
  });

  it.each([
    ["an empty key", ""],
    ["a key with surrounding whitespace", " key "],
    ["a key longer than 255 characters", "k".repeat(256)],
    ["a lone surrogate", "\ud800"],
  ])("refuses %s", (_name, value) => {
    expect(() => parseIdempotencyKey(value)).toThrowError();
    try {
      parseIdempotencyKey(value);
    } catch (caught) {
      expect((caught as { code: string }).code).toBe(ErrorCode.REQUEST_INVALID);
    }
  });

  it("accepts 255 characters and a valid surrogate pair", () => {
    expect(parseIdempotencyKey("k".repeat(255))).toHaveLength(255);
    expect(parseIdempotencyKey("order-\u{1F9FE}")).toBe("order-\u{1F9FE}");
  });
});
