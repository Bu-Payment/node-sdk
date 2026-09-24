import { type BuPaymentClient, createBuPaymentClient } from "../../src/client";
import type { FetchLike } from "../../src/core/http";
import { readVectors } from "../conformance/vectors";

const vector = readVectors().success[0] as NonNullable<
  ReturnType<typeof readVectors>["success"][0]
>;

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Harness {
  client: BuPaymentClient;
  calls: Call[];
}

export function harnessOf(respond: (call: Call, index: number) => Response): Harness {
  const calls: Call[] = [];
  const stub: FetchLike = async (url, init) => {
    const call: Call = {
      method: init.method ?? "GET",
      url,
      headers: init.headers as Record<string, string>,
      body: decodeBody(init.body),
    };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  return {
    client: createBuPaymentClient(
      {
        applicationId: vector.appId,
        keyId: vector.keyId,
        secret: vector.confidentialSecret,
        apiBaseUrl: "https://api.bupayment.test",
      },
      { fetch: stub },
    ),
    calls,
  };
}

export function harnessReturning(...bodies: unknown[]): Harness {
  return harnessOf((_call, index) => json(bodies[index] ?? {}));
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function callAt(calls: Call[], index: number): Call {
  const call = calls[index];
  if (call === undefined) {
    throw new Error(`no request was issued at index ${index}`);
  }
  return call;
}

export function pathOf(call: Call): string {
  return new URL(call.url).pathname;
}

export function queryOf(call: Call): string {
  return new URL(call.url).search;
}

function decodeBody(body: RequestInit["body"]): unknown {
  if (body === undefined || body === null) {
    return undefined;
  }
  return JSON.parse(Buffer.from(body as Uint8Array).toString("utf8"));
}
