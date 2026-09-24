import { timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/constants";
import { buildCanonicalRequest } from "../../src/core/canonical-request";
import { parseClientConfig } from "../../src/core/config";
import { type FetchLike, SignedTransport } from "../../src/core/http";
import { ConfidentialSecret } from "../../src/core/secret";
import { signCanonicalRequest } from "../../src/core/signature";
import type { BuPaymentError } from "../../src/errors";
import { type CredentialFixture, readVectors, type SuccessVector } from "./vectors";

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

describe("signed target", () => {
  it("refuses a request whose transmitted path is not the path that was signed", async () => {
    const fixture = vectors.securityStateFixtures["active-source"];
    const credential = fixture?.credentials.source as CredentialFixture;
    const reference = vectors.success[0] as SuccessVector;
    const stub = serverStub(
      {
        serverTimeSeconds: Number(reference.timestamp),
        credentials: fixture?.credentials ?? {},
        claimedNonces: new Set(),
      },
      reference,
    );
    const transport = new SignedTransport(
      parseClientConfig({
        applicationId: credential.appId,
        keyId: credential.keyId,
        secret: credential.confidentialSecret,
        apiBaseUrl: API_BASE_URL,
      }),
      {
        fetch: (url, init) => stub(url.replace(reference.rawPath, "/v1/other"), init),
        now: () => Number(reference.timestamp) * 1000,
        nonce: () => reference.nonce,
      },
    );

    await expect(
      transport.send({ method: reference.method, path: reference.rawPath }),
    ).rejects.toMatchObject({ code: "application_auth_invalid", status: 401 });
  });
});

function serverStub(state: ServerState, reference: SuccessVector): FetchLike {
  return async (url, init) => {
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
    if (!hasValidSignature(credential, headers, transmittedTarget(url), init, reference)) {
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

function transmittedTarget(url: string): { rawPath: string; rawQuery: string } {
  const target = url.slice(url.indexOf("/", url.indexOf("://") + "://".length));
  const separator = target.indexOf("?");
  return separator === -1
    ? { rawPath: target, rawQuery: "" }
    : { rawPath: target.slice(0, separator), rawQuery: target.slice(separator + 1) };
}

function hasValidSignature(
  credential: CredentialFixture,
  headers: Record<string, string>,
  target: { rawPath: string; rawQuery: string },
  init: RequestInit,
  reference: SuccessVector,
): boolean {
  const body = init.body === undefined ? undefined : new Uint8Array(init.body as Uint8Array);
  const expected = signCanonicalRequest(
    ConfidentialSecret.parse(credential.confidentialSecret),
    buildCanonicalRequest({
      applicationId: headers[Header.APP_ID] as string,
      keyId: headers[Header.KEY_ID] as string,
      timestamp: headers[Header.TIMESTAMP] as string,
      nonce: headers[Header.NONCE] as string,
      method: (init.method ?? reference.method) as string,
      rawPath: target.rawPath,
      rawQuery: target.rawQuery,
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
