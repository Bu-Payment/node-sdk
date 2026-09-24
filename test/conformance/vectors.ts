import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface SuccessVector {
  name: string;
  secretHex: string;
  confidentialSecret: string;
  appId: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  rawPath: string;
  rawQuery: string;
  bodyBase64: string;
  canonicalPath: string;
  canonicalQuery: string;
  bodySha256: string;
  canonicalRequest: string;
  signature: string;
}

export interface InvalidVector {
  name: string;
  header?: string;
  value?: string;
  rawPath?: string;
  error: string;
}

export interface SecurityScenario {
  version: number;
  id: string;
  name: string;
  setup: {
    serverTime: string;
    stateFixture: string;
    nonceClaims: readonly { credential: string; nonce: string }[];
  };
  signedInput: {
    referenceSuccess: string;
    credential: string;
    timestamp: string;
    nonce: string;
  };
  expected: { status: number; error: string | null };
}

export interface ConformanceVectors {
  protocol: string;
  success: readonly SuccessVector[];
  invalid: readonly InvalidVector[];
  securityStateFixtures: Record<string, { credentials: Record<string, CredentialFixture> }>;
  securityScenarios: readonly SecurityScenario[];
}

export interface CredentialFixture {
  id: string;
  appId: string;
  keyId: string;
  confidentialSecret: string;
  status: string;
  expiresAt: string | null;
  rotationSuccessorId: string | null;
}

export interface ConformanceManifest {
  version: number;
  algorithm: string;
  copyPolicy: string;
  basePath: string;
  files: readonly { path: string; sha256: string }[];
}

export const VECTORS_PATH = fileURLToPath(
  new URL("../../conformance/v1/conformance-vectors.json", import.meta.url),
);

const MANIFEST_PATH = fileURLToPath(
  new URL("../../conformance/conformance-manifest.json", import.meta.url),
);

export function readVectorBytes(): Buffer {
  return readFileSync(VECTORS_PATH);
}

export function readVectors(): ConformanceVectors {
  return JSON.parse(readVectorBytes().toString("utf8")) as ConformanceVectors;
}

export function readManifest(): ConformanceManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ConformanceManifest;
}

export function bodyOf(vector: SuccessVector): Uint8Array | undefined {
  return vector.bodyBase64 === ""
    ? undefined
    : new Uint8Array(Buffer.from(vector.bodyBase64, "base64"));
}
