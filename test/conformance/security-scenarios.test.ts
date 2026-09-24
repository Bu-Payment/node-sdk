import { timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/constants";
import { buildCanonicalRequest } from "../../src/core/canonical-request";
import { parseClientConfig } from "../../src/core/config";
import { type FetchLike, SignedTransport } from "../../src/core/http";
import { ConfidentialSecret } from "../../src/core/secret";
import { signCanonicalRequest } from "../../src/core/signature";
import type { BuPaymentError } from "../../src/errors";
import { bodyOf, type CredentialFixture, readVectors, type SuccessVector } from "./vectors";

const API_BASE_URL = "https://api.bupayment.test";
const MAX_SKEW_SECONDS = 300;

const vectors = readVectors();

interface ServerState {
  serverTimeSeconds: number;
  credentials: Record<string, CredentialFixture>;
  claimedNonces: Set<string>;
}

describe.each(vectors.securityScenarios)("security scenario: $id", (scenario) => {
  const fixture = vectors.securityStateFixtures[scenario.setup.stateFixture];
  const credential = fixture?.credentials[scenario.signedInput.credential] as CredentialFixture;
  const reference = vectors.success.find(
    (candidate) => candidate.name === scenario.signedInput.referenceSuccess,
  ) as SuccessVector;

  const state: ServerState = {
    serverTimeSeconds: Math.floor(Date.parse(scenario.setup.serverTime) / 1000),
    credentials: fixture?.credentials ?? {},
    claimedNonces: new Set(
      scenario.setup.nonceClaims.map((claim) => {
        const claimed = fixture?.credentials[claim.credential] as CredentialFixture;
        return `${claimed.id}:${claim.nonce}`;
      }),
    ),
  };

  const transport = new SignedTransport(
    parseClientConfig({
      applicationId: credential.appId,
      keyId: credential.keyId,
      secret: credential.confidentialSecret,
      apiBaseUrl: API_BASE_URL,
    }),
    {
      fetch: serverStub(state, reference),
      now: () => Number(scenario.signedInput.timestamp) * 1000,
      nonce: () => scenario.signedInput.nonce,
    },
  );

  it(scenario.name, async () => {
    const send = transport.send({ method: reference.method, path: reference.rawPath });
    if (scenario.expected.error === null) {
      await expect(send).resolves.toMatchObject({ accepted: true });
      return;
    }
    const error = (await send.catch((caught: BuPaymentError) => caught)) as BuPaymentError;
    expect(error.code).toBe(scenario.expected.error);
    expect(error.status).toBe(scenario.expected.status);
  });
});

function serverStub(state: ServerState, reference: SuccessVector): FetchLike {
  return async (_url, init) => {
    const headers = init.headers as Record<string, string>;
    const credential = Object.values(state.credentials).find(
      (candidate) =>
        candidate.appId === headers[Header.APP_ID] && candidate.keyId === headers[Header.KEY_ID],
    );
    if (credential === undefined) {
      return failure(401, "application_auth_invalid");
    }
    const timestamp = Number(headers[Header.TIMESTAMP]);
    if (Math.abs(state.serverTimeSeconds - timestamp) > MAX_SKEW_SECONDS) {
      return failure(401, "application_auth_expired");
    }
    if (!hasValidSignature(credential, headers, reference)) {
      return failure(401, "application_auth_invalid");
    }
    const expiresAt = credential.expiresAt;
    if (expiresAt !== null && state.serverTimeSeconds > Math.floor(Date.parse(expiresAt) / 1000)) {
      return failure(401, "application_auth_invalid");
    }
    const claim = `${credential.id}:${headers[Header.NONCE]}`;
    if (state.claimedNonces.has(claim)) {
      return failure(401, "application_auth_replayed");
    }
    state.claimedNonces.add(claim);
    return new Response(JSON.stringify({ accepted: true }), { status: 200 });
  };
}

function hasValidSignature(
  credential: CredentialFixture,
  headers: Record<string, string>,
  reference: SuccessVector,
): boolean {
  const body = bodyOf(reference);
  const expected = signCanonicalRequest(
    ConfidentialSecret.parse(credential.confidentialSecret),
    buildCanonicalRequest({
      applicationId: headers[Header.APP_ID] as string,
      keyId: headers[Header.KEY_ID] as string,
      timestamp: headers[Header.TIMESTAMP] as string,
      nonce: headers[Header.NONCE] as string,
      method: reference.method,
      rawPath: reference.rawPath,
      rawQuery: reference.rawQuery,
      ...(body === undefined ? {} : { body }),
    }),
  );
  const presented = Buffer.from(headers[Header.SIGNATURE] as string, "hex");
  const computed = Buffer.from(expected, "hex");
  return presented.length === computed.length && timingSafeEqual(presented, computed);
}

function failure(status: number, error: string): Response {
  return new Response(JSON.stringify({ error, message: error }), { status });
}
