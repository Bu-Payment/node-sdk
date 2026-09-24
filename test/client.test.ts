import { describe, expect, it } from "vitest";
import { BuPaymentClient } from "../src/client";
import { ErrorCode, Header } from "../src/constants";
import type { FetchLike } from "../src/core/http";
import { readVectors } from "./conformance/vectors";

const vector = readVectors().success[0] as NonNullable<
  ReturnType<typeof readVectors>["success"][0]
>;

function clientOf(): { client: BuPaymentClient; headers: Record<string, string>[] } {
  const headers: Record<string, string>[] = [];
  const stub: FetchLike = async (_url, init) => {
    headers.push(init.headers as Record<string, string>);
    return new Response(JSON.stringify({ id: "obj_1" }), { status: 200 });
  };
  return {
    client: new BuPaymentClient(
      {
        applicationId: vector.appId,
        keyId: vector.keyId,
        secret: vector.confidentialSecret,
        apiBaseUrl: "https://api.bupayment.test",
      },
      { fetch: stub },
    ),
    headers,
  };
}

describe("BuPaymentClient", () => {
  it("exposes the authenticated application and its environment", () => {
    const { client } = clientOf();
    expect(client.applicationId).toBe(vector.appId);
    expect(client.environment).toBe("test");
  });

  it("generates an idempotency key for every mutation", async () => {
    const { client, headers } = clientOf();
    await client.request({ method: "POST", path: "/v1/payments", body: {} });
    await client.request({ method: "POST", path: "/v1/payments", body: {} });
    const [first, second] = headers;
    expect(first?.[Header.IDEMPOTENCY_KEY]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(second?.[Header.IDEMPOTENCY_KEY]).not.toBe(first?.[Header.IDEMPOTENCY_KEY]);
  });

  it("replays a caller-supplied idempotency key unchanged", async () => {
    const { client, headers } = clientOf();
    await client.request({ method: "POST", path: "/v1/payments", body: {}, idempotencyKey: "k-1" });
    await client.request({ method: "POST", path: "/v1/payments", body: {}, idempotencyKey: "k-1" });
    expect(headers.map((header) => header[Header.IDEMPOTENCY_KEY])).toEqual(["k-1", "k-1"]);
  });

  it("leaves reads without an idempotency key", async () => {
    const { client, headers } = clientOf();
    await client.request({ method: "GET", path: "/v1/products" });
    expect(headers[0]?.[Header.IDEMPOTENCY_KEY]).toBeUndefined();
  });

  it("rejects an idempotency key the API would refuse", async () => {
    const { client } = clientOf();
    await expect(
      client.request({ method: "POST", path: "/v1/payments", body: {}, idempotencyKey: " k " }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
  });
});
