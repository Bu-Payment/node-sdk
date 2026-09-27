import { describe, expect, it } from "vitest";
import type { Price } from "../src/catalogue/types";
import { ErrorCode, Header } from "../src/constants";
import type { BuPaymentError } from "../src/errors";
import { callAt, harnessOf, harnessReturning, json } from "./support/harness";
import {
  archived,
  change,
  fakeCatalogue,
  movedTo,
  productUpdatedAt,
  productVersion,
  replacement,
  routeOf,
  withDefault,
} from "./support/price-replacement";

const UUID = /^[0-9a-f-]{36}$/u;

describe("price replacement", () => {
  it("creates the replacement before archiving a price that is not the default", async () => {
    const { client, calls } = harnessReturning(withDefault("price_9"), replacement, archived);
    const result = await change(client).expectedUpdatedAt(productUpdatedAt).replace();
    expect(result).toEqual({
      outcome: "replaced",
      replacement,
      archived,
      product: withDefault("price_9"),
    });
    expect(calls.map(routeOf)).toEqual([
      "GET /v1/products/prod_1",
      "POST /v1/products/prod_1/prices",
      "POST /v1/prices/price_1/archive",
    ]);
    expect(callAt(calls, 1).body).toEqual({ unitAmount: 1_200, currency: "EUR" });
    expect(callAt(calls, 2).body).toEqual({ expectedUpdatedAt: productUpdatedAt });
    expect(callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
    expect(callAt(calls, 2).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
    expect(callAt(calls, 2).headers[Header.IDEMPOTENCY_KEY]).not.toBe(
      callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY],
    );
  });

  it("moves the default to the replacement before archiving the default price", async () => {
    const { client, calls } = fakeCatalogue({ defaultPriceId: "price_1" });
    const result = await change(client).replace();
    expect(result).toEqual({
      outcome: "replaced",
      replacement,
      archived,
      product: movedTo("price_2"),
    });
    expect(calls.map(routeOf)).toEqual([
      "GET /v1/products/prod_1",
      "POST /v1/products/prod_1/prices",
      "PUT /v1/products/prod_1/default-price",
      "POST /v1/prices/price_1/archive",
    ]);
    expect(callAt(calls, 2).body).toEqual({
      priceId: "price_2",
      expectedUpdatedAt: productVersion,
    });
    const keys = calls.slice(1).map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(new Set(keys).size).toBe(3);
  });

  it("archives the previous price without a body when no version was observed", async () => {
    const { client, calls } = harnessReturning(withDefault("price_9"), replacement, archived);
    await change(client).replace();
    expect(routeOf(callAt(calls, 2))).toBe("POST /v1/prices/price_1/archive");
    expect(callAt(calls, 2).body).toBeUndefined();
  });

  it("does not move a default the product does not hold for the previous price", async () => {
    const { client, calls } = fakeCatalogue({ defaultPriceId: null });
    expect(await change(client).replace()).toEqual({
      outcome: "replaced",
      replacement,
      archived,
      product: withDefault(null),
    });
    expect(calls.map(routeOf)).not.toContain("PUT /v1/products/prod_1/default-price");
  });

  it("reports a failed move with the replacement and leaves the previous price active", async () => {
    const { client, calls } = harnessOf((call) =>
      routeOf(call) === "PUT /v1/products/prod_1/default-price"
        ? json({ error: "default_price_not_owned" }, 409)
        : json(routeOf(call).startsWith("GET") ? withDefault("price_1") : replacement),
    );
    const result = await change(client).replace();
    expect(calls).toHaveLength(3);
    expect(result).toMatchObject({
      outcome: "default_failed",
      replacement,
      previousPriceId: "price_1",
      error: { code: ErrorCode.DEFAULT_PRICE_NOT_OWNED },
    });
  });

  it("reports a default that moved after the read as a failed move, not an overwrite", async () => {
    const current = withDefault("price_3");
    const { client } = harnessOf((call) =>
      routeOf(call).startsWith("PUT")
        ? json({ error: "stale_resource", resource: current }, 409)
        : json(routeOf(call).startsWith("GET") ? withDefault("price_1") : replacement),
    );
    expect(await change(client).replace()).toMatchObject({
      outcome: "default_failed",
      replacement,
      error: { code: ErrorCode.STALE_RESOURCE, resource: current },
    });
  });

  it("reports a price that became the default after the read as a failed archive", async () => {
    const { client } = harnessOf((call) =>
      routeOf(call).endsWith("/archive")
        ? json({ error: "default_price_in_use" }, 409)
        : json(routeOf(call).startsWith("GET") ? withDefault("price_9") : replacement),
    );
    expect(await change(client).replace()).toMatchObject({
      outcome: "archive_failed",
      replacement,
      product: withDefault("price_9"),
      error: { code: ErrorCode.DEFAULT_PRICE_IN_USE },
    });
  });

  it("reports a failed archive with the replacement it already created", async () => {
    const responses = [json(withDefault("price_9")), json(replacement)];
    const { client, calls } = harnessOf(
      (_call, index) =>
        responses[index] ?? json({ error: "stale_resource", resource: archived }, 409),
    );
    const result = await change(client).replace();
    expect(calls).toHaveLength(3);
    expect(routeOf(callAt(calls, 2))).toBe("POST /v1/prices/price_1/archive");
    expect(result.outcome).toBe("archive_failed");
    if (result.outcome !== "archive_failed") {
      return;
    }
    expect(result.replacement).toEqual(replacement);
    expect(result.previousPriceId).toBe("price_1");
    expect(result.product).toEqual(withDefault("price_9"));
    expect(result.error).toMatchObject({ code: ErrorCode.STALE_RESOURCE, resource: archived });
  });

  it("rejects without writing when the product cannot be read", async () => {
    const { client, calls } = harnessOf(() => json({ error: "not_found" }, 404));
    await expect(change(client).replace()).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
    });
    expect(calls.map(routeOf)).toEqual(["GET /v1/products/prod_1"]);
  });

  it("rejects without archiving when the replacement cannot be created", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 0 ? json(withDefault("price_1")) : json({ error: "request_invalid" }, 400),
    );
    await expect(change(client).replace()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    expect(calls).toHaveLength(2);
  });

  it("replays every step under the same keys when the same builder is retried", async () => {
    const { client, calls } = fakeCatalogue({ defaultPriceId: "price_1", failing: new Set([2]) });
    const replacing = change(client);
    const failed = await replacing.replace();
    const retried = await replacing.replace();
    expect(failed.outcome).toBe("default_failed");
    expect(retried).toEqual({
      outcome: "replaced",
      replacement,
      archived,
      product: movedTo("price_2"),
    });
    expect(calls.map(routeOf).slice(3)).toEqual([
      "GET /v1/products/prod_1",
      "POST /v1/products/prod_1/prices",
      "PUT /v1/products/prod_1/default-price",
      "POST /v1/prices/price_1/archive",
    ]);
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[4]).toBe(keys[1]);
    expect(keys[5]).toBe(keys[2]);
  });

  it("skips the move on a retry once the default already points at the replacement", async () => {
    const { client, calls } = fakeCatalogue({ defaultPriceId: "price_1", failing: new Set([3]) });
    const replacing = change(client);
    expect((await replacing.replace()).outcome).toBe("archive_failed");
    expect(await replacing.replace()).toEqual({
      outcome: "replaced",
      replacement,
      archived,
      product: withDefault("price_2"),
    });
    expect(calls.map(routeOf).slice(4)).toEqual([
      "GET /v1/products/prod_1",
      "POST /v1/products/prod_1/prices",
      "POST /v1/prices/price_1/archive",
    ]);
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[5]).toBe(keys[1]);
    expect(keys[6]).toBe(keys[3]);
  });

  it("keeps the replacement's and the move's keys when only the observed version changes", async () => {
    const { client, calls } = harnessOf((call) => {
      const route = routeOf(call);
      if (route.startsWith("GET")) {
        return json(withDefault("price_1"));
      }
      if (route.startsWith("PUT")) {
        return json(withDefault("price_2"));
      }
      if (route.endsWith("/archive") && calls.length === 4) {
        return json({ error: "stale_resource", resource: archived }, 409);
      }
      return json(route.endsWith("/archive") ? archived : replacement);
    });
    const replacing = change(client).expectedUpdatedAt("2026-01-01T00:00:00.000Z");
    const failed = await replacing.replace();
    if (failed.outcome !== "archive_failed") {
      throw new Error("expected the archive to fail");
    }
    const current = (failed.error as BuPaymentError<Price>).resource;
    await replacing.expectedUpdatedAt(current?.updatedAt ?? "").replace();
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[5]).toBe(keys[1]);
    expect(keys[6]).toBe(keys[2]);
    expect(keys[7]).not.toBe(keys[3]);
    expect(callAt(calls, 2).body).toEqual({
      priceId: "price_2",
      expectedUpdatedAt: productVersion,
    });
    expect(callAt(calls, 7).body).toEqual({ expectedUpdatedAt: productUpdatedAt });
  });

  it.each([
    [
      "move",
      2,
      [
        "POST /v1/products/prod_1/prices",
        "PUT /v1/products/prod_1/default-price",
        "POST /v1/products/prod_1/prices",
        "PUT /v1/products/prod_1/default-price",
        "POST /v1/prices/price_1/archive",
      ],
    ],
    [
      "archive",
      3,
      [
        "POST /v1/products/prod_1/prices",
        "PUT /v1/products/prod_1/default-price",
        "POST /v1/prices/price_1/archive",
        "POST /v1/products/prod_1/prices",
        "POST /v1/prices/price_1/archive",
      ],
    ],
  ])("resends the caller's key on every write when a new builder retries a failed %s", async (_step, failing, routes) => {
    const { client, calls } = fakeCatalogue({
      defaultPriceId: "price_1",
      failing: new Set([failing]),
    });
    await change(client).idempotencyKey("reprice-gold").replace();
    await change(client).idempotencyKey("reprice-gold").replace();
    const writes = calls.filter((call) => call.method !== "GET");
    expect(writes.map(routeOf)).toEqual(routes);
    expect(writes.map((call) => call.headers[Header.IDEMPOTENCY_KEY])).toEqual(
      Array(writes.length).fill("reprice-gold"),
    );
  });

  it("refuses an empty previous price before reading or creating anything", async () => {
    const { client, calls } = harnessReturning(replacement);
    await expect(
      client.catalogue.priceDraft("prod_1").unitAmount(1).currency("EUR").replacing("").replace(),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });
});
