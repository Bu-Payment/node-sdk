import { createHash, randomUUID } from "node:crypto";
import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export function generateIdempotencyKey(): string {
  return randomUUID();
}

export function idempotencyDigest(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function parseIdempotencyKey(value: string): string {
  if (!isWellFormedUnicode(value)) {
    throw invalidKey("Idempotency key must be well-formed Unicode");
  }
  if (value.trim() !== value) {
    throw invalidKey("Idempotency key must not have leading or trailing whitespace");
  }
  const length = [...value].length;
  if (length === 0 || length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw invalidKey(`Idempotency key must be 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
  }
  return value;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function invalidKey(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.REQUEST_INVALID });
}
