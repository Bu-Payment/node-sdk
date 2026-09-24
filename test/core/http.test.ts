import { describe, expect, it } from "vitest";
import { ErrorCode, Header } from "../../src/constants";
import { parseClientConfig } from "../../src/core/config";
import { type FetchLike, SignedTransport, type TransportOptions } from "../../src/core/http";
import { BuPaymentError } from "../../src/errors";
import { readVectors } from "../conformance/vectors";

const vector = readVectors().success[0] as NonNullable<
  ReturnType<typeof readVectors>["success"][0]
>;

const config = parseClientConfig({
  applicationId: vector.appId,
  keyId: vector.keyId,
  secret: vector.confidentialSecret,
  apiBaseUrl: "https://api.bupayment.test",
});

interface Capture {
  url: string;
  init: RequestInit;
}

function transportOf(
  respond: (capture: Capture) => Response | Promise<Response>,
  options: Omit<TransportOptions, "fetch"> = {},
): { transport: SignedTransport; captures: Capture[] } {
  const captures: Capture[] = [];
  const stub: FetchLike = async (url, init) => {
    captures.push({ url, init });
    return await respond({ url, init });
  };
  return {
    transport: new SignedTransport(config, {
      fetch: stub,
      now: () => Number(vector.timestamp) * 1000,
      nonce: () => vector.nonce,
      ...options,
    }),
    captures,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function headersOf(capture: Capture): Record<string, string> {
  return capture.init.headers as Record<string, string>;
}

describe("SignedTransport", () => {
  it("signs a request exactly as the shared vector does", async () => {
    const { transport, captures } = transportOf(() => jsonResponse({ ok: true }));
    await transport.send({ method: "GET", path: "/v1/items" });
    const headers = headersOf(captures[0] as Capture);
    expect(headers[Header.SIGNATURE]).toBe(vector.signature);
    expect(headers[Header.SIGNATURE_VERSION]).toBe("1");
    expect(headers[Header.APP_ID]).toBe(vector.appId);
    expect(headers[Header.KEY_ID]).toBe(vector.keyId);
    expect(headers[Header.TIMESTAMP]).toBe(vector.timestamp);
    expect(headers[Header.NONCE]).toBe(vector.nonce);
    expect(captures[0]?.url).toBe("https://api.bupayment.test/v1/items");
  });

  it("signs the exact transmitted body bytes", async () => {
    const { transport, captures } = transportOf(() => jsonResponse({ ok: true }));
    await transport.send({ method: "POST", path: "/v1/payments", body: { amount: 10 } });
    const sent = captures[0]?.init.body as Uint8Array;
    expect(Buffer.from(sent).toString("utf8")).toBe('{"amount":10}');
    expect(headersOf(captures[0] as Capture)["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
  });

  it("encodes query values without reserialising the signed target", async () => {
    const { transport, captures } = transportOf(() => jsonResponse({ data: [] }));
    await transport.send({
      method: "GET",
      path: "/v1/products",
      query: { search: "hello world", tag: ["b", "a"], limit: 10, active: true, cursor: undefined },
    });
    expect(captures[0]?.url).toBe(
      "https://api.bupayment.test/v1/products?search=hello%20world&tag=b&tag=a&limit=10&active=true",
    );
  });

  it("sends the idempotency key when the caller supplies one", async () => {
    const { transport, captures } = transportOf(() => jsonResponse({ ok: true }));
    await transport.send({
      method: "POST",
      path: "/v1/payments",
      body: {},
      idempotencyKey: "key-1",
    });
    expect(headersOf(captures[0] as Capture)[Header.IDEMPOTENCY_KEY]).toBe("key-1");
  });

  it("returns undefined for an empty success body", async () => {
    const { transport } = transportOf(() => new Response(null, { status: 204 }));
    await expect(
      transport.send({ method: "DELETE", path: "/v1/webhook-endpoints/wh_1" }),
    ).resolves.toBeUndefined();
  });

  it("fails when a success body is not JSON", async () => {
    const { transport } = transportOf(() => new Response("not json", { status: 200 }));
    await expect(transport.send({ method: "GET", path: "/v1/items" })).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });
});

describe("SignedTransport error mapping", () => {
  it.each([
    ["application_auth_expired", 401, ErrorCode.APPLICATION_AUTH_EXPIRED],
    ["application_auth_replayed", 401, ErrorCode.APPLICATION_AUTH_REPLAYED],
    ["application_auth_invalid", 401, ErrorCode.APPLICATION_AUTH_INVALID],
    ["application_capability_denied", 403, ErrorCode.APPLICATION_CAPABILITY_DENIED],
    ["too_many_requests", 429, ErrorCode.TOO_MANY_REQUESTS],
    ["application_auth_unavailable", 503, ErrorCode.APPLICATION_AUTH_UNAVAILABLE],
  ])("maps %s to a typed error", async (serverCode, status, expected) => {
    const { transport } = transportOf(() =>
      jsonResponse({ error: serverCode, message: "denied", requestId: "req_1" }, { status }),
    );
    await expect(transport.send({ method: "GET", path: "/v1/items" })).rejects.toMatchObject({
      code: expected,
      status,
      requestId: "req_1",
      message: "denied",
    });
  });

  it.each([
    [400, ErrorCode.REQUEST_INVALID],
    [404, ErrorCode.RESOURCE_NOT_FOUND],
    [409, ErrorCode.RESOURCE_CONFLICT],
    [500, ErrorCode.OPERATION_FAILED],
  ])("maps status %i without a known code", async (status, expected) => {
    const { transport } = transportOf(() =>
      jsonResponse({ error: "unmapped_code", message: "nope" }, { status }),
    );
    const error = await transport
      .send({ method: "GET", path: "/v1/items" })
      .catch((caught: BuPaymentError) => caught);
    expect(error).toBeInstanceOf(BuPaymentError);
    expect((error as BuPaymentError).code).toBe(expected);
    expect((error as BuPaymentError).metadata?.apiError).toBe("unmapped_code");
  });

  it("keeps the throttling hint from the rate-limit response", async () => {
    const { transport } = transportOf(
      () =>
        new Response(JSON.stringify({ error: "too_many_requests" }), {
          status: 429,
          headers: { [Header.RETRY_AFTER]: "30" },
        }),
    );
    await expect(transport.send({ method: "GET", path: "/v1/items" })).rejects.toMatchObject({
      code: ErrorCode.TOO_MANY_REQUESTS,
      metadata: { retryAfter: "30" },
    });
  });

  it("falls back to the response header for the request id", async () => {
    const { transport } = transportOf(
      () =>
        new Response(JSON.stringify({ error: "application_auth_invalid" }), {
          status: 401,
          headers: { [Header.REQUEST_ID]: "req_header" },
        }),
    );
    await expect(transport.send({ method: "GET", path: "/v1/items" })).rejects.toMatchObject({
      requestId: "req_header",
    });
  });

  it("reports an unreachable API as a network failure", async () => {
    const { transport } = transportOf(() => {
      throw new TypeError("fetch failed");
    });
    await expect(transport.send({ method: "GET", path: "/v1/items" })).rejects.toMatchObject({
      code: ErrorCode.NETWORK_UNAVAILABLE,
    });
  });
});

describe("SignedTransport cancellation", () => {
  it("reports a caller abort as a cancellation", async () => {
    const controller = new AbortController();
    const { transport } = transportOf(async ({ init }) => {
      controller.abort();
      init.signal?.throwIfAborted();
      return jsonResponse({});
    });
    await expect(
      transport.send({ method: "GET", path: "/v1/items", signal: controller.signal }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
  });

  it("aborts before dispatch when the caller signal is already aborted", async () => {
    const { transport } = transportOf(async ({ init }) => {
      init.signal?.throwIfAborted();
      return jsonResponse({});
    });
    await expect(
      transport.send({
        method: "GET",
        path: "/v1/items",
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
  });

  it("reports its own timeout as a network failure", async () => {
    const { transport } = transportOf(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    await expect(
      transport.send({ method: "GET", path: "/v1/items", timeoutMs: 5 }),
    ).rejects.toMatchObject({
      code: ErrorCode.NETWORK_UNAVAILABLE,
      metadata: { timeoutMs: 5 },
    });
  });
});

describe("SignedTransport secrecy", () => {
  it("never puts the secret in a request header or a thrown error", async () => {
    const { transport, captures } = transportOf(() =>
      jsonResponse({ error: "application_auth_invalid", message: "denied" }, { status: 401 }),
    );
    const error = await transport
      .send({ method: "POST", path: "/v1/payments", body: { amount: 1 } })
      .catch((caught: BuPaymentError) => caught);
    const serialised = `${JSON.stringify(headersOf(captures[0] as Capture))}${JSON.stringify(
      (error as BuPaymentError).toJSON(),
    )}${(error as BuPaymentError).stack ?? ""}`;
    expect(serialised).not.toContain(vector.confidentialSecret);
    expect(serialised).not.toContain(vector.secretHex);
  });
});
