import { createHash } from "node:crypto";
import { ErrorCode, SIGNATURE_ALGORITHM } from "../constants";
import { BuPaymentError } from "../errors";

export interface CanonicalRequestInput {
  applicationId: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  rawPath: string;
  rawQuery?: string;
  body?: Uint8Array;
}

const UNRESERVED = new Set<number>([
  ...Buffer.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"),
]);
const METHOD_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]+$/u;
const DECIMAL_TIMESTAMP = /^(0|[1-9][0-9]*)$/u;
const LOWERCASE_NONCE = /^[0-9a-f]{32}$/u;

export function buildCanonicalRequest(input: CanonicalRequestInput): string {
  assertSignableComponents(input);
  return [
    SIGNATURE_ALGORITHM,
    input.applicationId,
    input.keyId,
    input.timestamp,
    input.nonce,
    canonicalizeMethod(input.method),
    canonicalizePath(input.rawPath),
    canonicalizeQuery(input.rawQuery),
    sha256Hex(input.body),
  ].join("\n");
}

export function canonicalizeMethod(method: string): string {
  if (!METHOD_TOKEN.test(method)) {
    throw malformed("HTTP method is not a valid token");
  }
  return method.toUpperCase();
}

export function canonicalizePath(rawPath: string): string {
  if (!rawPath.startsWith("/")) {
    throw malformed("Request path must start with a slash");
  }
  return rawPath.split("/").map(canonicalizeComponent).join("/");
}

export function canonicalizeQuery(rawQuery?: string): string {
  if (!rawQuery) {
    return "";
  }
  if (rawQuery.startsWith("?")) {
    throw malformed("Request query must not include a question mark");
  }
  const pairs = rawQuery.split("&").map((rawPair) => {
    const separator = rawPair.indexOf("=");
    const rawName = separator === -1 ? rawPair : rawPair.slice(0, separator);
    const rawValue = separator === -1 ? "" : rawPair.slice(separator + 1);
    return [canonicalizeComponent(rawName), canonicalizeComponent(rawValue)] as const;
  });
  pairs.sort(
    ([leftName, leftValue], [rightName, rightValue]) =>
      compareAscii(leftName, rightName) || compareAscii(leftValue, rightValue),
  );
  return pairs.map(([name, value]) => `${name}=${value}`).join("&");
}

export function sha256Hex(body?: Uint8Array): string {
  return createHash("sha256")
    .update(body ?? new Uint8Array(0))
    .digest("hex");
}

function assertSignableComponents(input: CanonicalRequestInput): void {
  if (!OPAQUE_IDENTIFIER.test(input.applicationId) || !OPAQUE_IDENTIFIER.test(input.keyId)) {
    throw malformed("Application ID and key ID must be opaque identifiers");
  }
  if (!DECIMAL_TIMESTAMP.test(input.timestamp)) {
    throw malformed("Timestamp must be unsigned, unpadded epoch seconds");
  }
  if (!LOWERCASE_NONCE.test(input.nonce)) {
    throw malformed("Nonce must be 32 lowercase hexadecimal characters");
  }
}

function canonicalizeComponent(rawComponent: string): string {
  return percentEncode(percentDecode(rawComponent));
}

function percentDecode(value: string): Uint8Array {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < value.length; ) {
    if (value[offset] === "%") {
      const encodedByte = value.slice(offset + 1, offset + 3);
      if (!/^[0-9A-Fa-f]{2}$/u.test(encodedByte)) {
        throw malformed("Request path or query has invalid percent encoding");
      }
      chunks.push(Buffer.from([Number.parseInt(encodedByte, 16)]));
      offset += 3;
      continue;
    }
    const codePoint = value.codePointAt(offset);
    if (codePoint === undefined || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw malformed("Request path or query has an invalid Unicode scalar value");
    }
    const character = String.fromCodePoint(codePoint);
    chunks.push(Buffer.from(character, "utf8"));
    offset += character.length;
  }
  return Buffer.concat(chunks);
}

function percentEncode(bytes: Uint8Array): string {
  let encoded = "";
  for (const byte of bytes) {
    encoded += UNRESERVED.has(byte)
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function malformed(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.APPLICATION_AUTH_MALFORMED });
}
