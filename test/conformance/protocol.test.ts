import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalRequest,
  canonicalizePath,
  canonicalizeQuery,
  sha256Hex,
} from "../../src/core/canonical-request";
import { ConfidentialSecret } from "../../src/core/secret";
import { signCanonicalRequest } from "../../src/core/signature";
import { bodyOf, readManifest, readVectorBytes, readVectors } from "./vectors";

const vectors = readVectors();

describe("conformance manifest", () => {
  it("carries the shared vectors byte for byte", () => {
    const entry = readManifest().files.find((file) => file.path === "v1/conformance-vectors.json");
    const digest = createHash("sha256").update(readVectorBytes()).digest("hex");
    expect(entry?.sha256).toBe(digest);
  });

  it("targets the protocol this SDK implements", () => {
    expect(vectors.protocol).toBe("BUPAYMENT-HMAC-SHA256-V1");
  });
});

describe.each(vectors.success)("success vector: $name", (vector) => {
  const body = bodyOf(vector);

  it("canonicalizes the path", () => {
    expect(canonicalizePath(vector.rawPath)).toBe(vector.canonicalPath);
  });

  it("canonicalizes the query", () => {
    expect(canonicalizeQuery(vector.rawQuery)).toBe(vector.canonicalQuery);
  });

  it("hashes the exact body bytes", () => {
    expect(sha256Hex(body)).toBe(vector.bodySha256);
  });

  it("builds the canonical request", () => {
    expect(
      buildCanonicalRequest({
        applicationId: vector.appId,
        keyId: vector.keyId,
        timestamp: vector.timestamp,
        nonce: vector.nonce,
        method: vector.method,
        rawPath: vector.rawPath,
        rawQuery: vector.rawQuery,
        ...(body === undefined ? {} : { body }),
      }),
    ).toBe(vector.canonicalRequest);
  });

  it("signs the canonical request", () => {
    const secret = ConfidentialSecret.parse(vector.confidentialSecret);
    expect(Buffer.from(secret.keyBytes()).toString("hex")).toBe(vector.secretHex);
    expect(signCanonicalRequest(secret, vector.canonicalRequest)).toBe(vector.signature);
  });
});

describe("invalid vectors", () => {
  it("rejects an invalid percent encoding in the path", () => {
    const vector = vectors.invalid.find((candidate) => candidate.rawPath !== undefined);
    expect(vector?.error).toBe("application_auth_malformed");
    expect(() => canonicalizePath(vector?.rawPath as string)).toThrowError(
      /invalid percent encoding/iu,
    );
  });

  it("refuses to sign an uppercase nonce", () => {
    const vector = vectors.invalid.find((candidate) => candidate.header === "Bu-Payment-Nonce") as {
      value: string;
      error: string;
    };
    expect(vector.error).toBe("application_auth_malformed");
    expect(() => signableWithNonce(vector.value)).toThrowError(/nonce/iu);
  });

  it("refuses a signature version other than 1", () => {
    const vector = vectors.invalid.find(
      (candidate) => candidate.header === "Bu-Payment-Signature-Version",
    );
    expect(vector?.value).not.toBe("1");
    expect(vector?.error).toBe("application_auth_version_unsupported");
  });
});

function signableWithNonce(nonce: string): string {
  const reference = vectors.success[0] as (typeof vectors.success)[number];
  return buildCanonicalRequest({
    applicationId: reference.appId,
    keyId: reference.keyId,
    timestamp: reference.timestamp,
    nonce,
    method: reference.method,
    rawPath: reference.rawPath,
  });
}
