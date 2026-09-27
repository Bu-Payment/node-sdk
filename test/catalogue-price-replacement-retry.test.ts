import { describe, expect, it } from "vitest";
import type { Product } from "../src/catalogue/types";
import { ErrorCode, Header } from "../src/constants";
import { harnessOf, json } from "./support/harness";
import { archived, change, replacement, routeOf } from "./support/price-replacement";

function catalogueLosingTheFirstMove() {
  const product = { defaultPriceId: "price_1", version: 1 };
  const moves = new Map<string, string>();
  const current = () =>
    ({
      id: "prod_1",
      defaultPriceId: product.defaultPriceId,
      updatedAt: `v${product.version}`,
    }) as Product;
  const harness = harnessOf((call) => {
    const route = routeOf(call);
    if (route === "GET /v1/products/prod_1") {
      return json(current());
    }
    if (route !== "PUT /v1/products/prod_1/default-price") {
      return json(route.endsWith("/archive") ? archived : replacement);
    }
    const key = call.headers[Header.IDEMPOTENCY_KEY] ?? "";
    const body = JSON.stringify(call.body);
    if (moves.has(key) && moves.get(key) !== body) {
      return json({ error: "idempotency_conflict" }, 409);
    }
    moves.set(key, body);
    product.defaultPriceId = (call.body as { priceId: string }).priceId;
    product.version += 1;
    return moves.size === 1 ? json({ error: "operation_failed" }, 503) : json(current());
  });
  const restorePreviousDefault = () => {
    product.defaultPriceId = "price_1";
    product.version += 1;
  };
  const moveBodies = () =>
    harness.calls.filter((call) => call.method === "PUT").map((call) => call.body);
  return { ...harness, product, restorePreviousDefault, moveBodies };
}

describe("price replacement retried after the default was restored", () => {
  it("moves the default again under a new key after another actor restored the previous price", async () => {
    const catalogue = catalogueLosingTheFirstMove();
    const replacing = change(catalogue.client);
    expect((await replacing.replace()).outcome).toBe("default_failed");
    catalogue.restorePreviousDefault();
    expect(await replacing.replace()).toEqual({
      outcome: "replaced",
      replacement,
      archived,
      product: { id: "prod_1", defaultPriceId: "price_2", updatedAt: "v4" },
    });
    expect(catalogue.moveBodies()).toEqual([
      { priceId: "price_2", expectedUpdatedAt: "v1" },
      { priceId: "price_2", expectedUpdatedAt: "v3" },
    ]);
    expect(catalogue.product).toEqual({ defaultPriceId: "price_2", version: 4 });
    const [first, second] = catalogue.calls
      .filter((call) => call.method === "PUT")
      .map((call) => call.headers[Header.IDEMPOTENCY_KEY] ?? "");
    expect(second).not.toBe(first);
    expect(second?.split(":")[0]).toBe(first?.split(":")[0]);
    expect(first?.split(":")[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("sends the caller's key unchanged and reports the conflict it meets", async () => {
    const catalogue = catalogueLosingTheFirstMove();
    const replacing = change(catalogue.client).idempotencyKey("reprice-gold");
    expect((await replacing.replace()).outcome).toBe("default_failed");
    catalogue.restorePreviousDefault();
    expect(await replacing.replace()).toMatchObject({
      outcome: "default_failed",
      error: { code: ErrorCode.IDEMPOTENCY_CONFLICT },
    });
    const moves = catalogue.calls.filter((call) => call.method === "PUT");
    expect(moves.map((call) => call.headers[Header.IDEMPOTENCY_KEY])).toEqual([
      "reprice-gold",
      "reprice-gold",
    ]);
  });

  it("keeps the generated key a valid header whatever version the product carries", async () => {
    const version = `${"9".repeat(300)}\r\nX-Injected: 1`;
    const { client, calls } = harnessOf((call) => {
      const route = routeOf(call);
      if (route.startsWith("GET")) {
        return json({ id: "prod_1", defaultPriceId: "price_1", updatedAt: version });
      }
      return json(route.endsWith("/archive") ? archived : replacement);
    });
    expect((await change(client).replace()).outcome).toBe("replaced");
    const move = calls.find((call) => call.method === "PUT");
    expect(move?.body).toEqual({ priceId: "price_2", expectedUpdatedAt: version });
    expect(move?.headers[Header.IDEMPOTENCY_KEY]).toMatch(/^[0-9a-f-]{36}:[\w-]{43}$/u);
  });
});
