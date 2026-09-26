import { describe, expect, it } from "vitest";
import type { Product, ProductConflict } from "../src/catalogue/types";
import { ErrorCode, Header } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { callAt, harnessOf, harnessReturning, json, pathOf } from "./support/harness";

const product: Product = {
  id: "prod_1",
  name: "Gold",
  description: null,
  lookupKey: "gold",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const UUID = /^[0-9a-f-]{36}$/u;

describe("catalogue writes", () => {
  it("creates a product with a generated idempotency key", async () => {
    const { client, calls } = harnessReturning(product);
    const created = await client.catalogue
      .createProduct()
      .name("Gold")
      .description("Gold plan")
      .lookupKey("gold")
      .create();
    expect(created).toEqual(product);
    expect(callAt(calls, 0).method).toBe("POST");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/products");
    expect(callAt(calls, 0).body).toEqual({
      name: "Gold",
      description: "Gold plan",
      lookupKey: "gold",
    });
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
  });

  it("reuses the generated key when the same builder is retried", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 0 ? json({ error: "operation_failed" }, 503) : json(product),
    );
    const draft = client.catalogue.createProduct().name("Gold");
    await expect(draft.create()).rejects.toBeInstanceOf(BuPaymentError);
    await draft.create();
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[0]).toMatch(UUID);
    expect(keys[1]).toBe(keys[0]);
  });

  it("gives a branched builder its own generated key", async () => {
    const { client, calls } = harnessReturning(product, product);
    const draft = client.catalogue.createProduct().name("Gold");
    await draft.create();
    await draft.lookupKey("gold").create();
    expect(callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY]).not.toBe(
      callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY],
    );
  });

  it("sends the caller's key unchanged", async () => {
    const { client, calls } = harnessReturning(product);
    await client.catalogue.createProduct().name("Gold").idempotencyKey("import-gold").create();
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toBe("import-gold");
  });

  it("updates a product conditionally, clearing nullable fields", async () => {
    const { client, calls } = harnessReturning(product);
    await client.catalogue
      .updateProduct("prod_1")
      .description(null)
      .lookupKey(null)
      .expectedUpdatedAt(product.updatedAt)
      .update();
    expect(callAt(calls, 0).method).toBe("PATCH");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/products/prod_1");
    expect(callAt(calls, 0).body).toEqual({
      description: null,
      lookupKey: null,
      expectedUpdatedAt: product.updatedAt,
    });
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
  });

  it("reuses the generated key when an update or archive is retried", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index % 2 === 0 ? json({ error: "operation_failed" }, 503) : json(product),
    );
    const update = client.catalogue.updateProduct("prod_1").name("Gold");
    const archive = client.catalogue.archivePrice("price_1");
    await expect(update.update()).rejects.toBeInstanceOf(BuPaymentError);
    await update.update();
    await expect(archive.archive()).rejects.toBeInstanceOf(BuPaymentError);
    await archive.archive();
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[3]).toBe(keys[2]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("reuses a price draft's key on retry and gives each branch its own", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 0 ? json({ error: "operation_failed" }, 503) : json({}),
    );
    const base = client.catalogue.createPrice("prod_1").unitAmount(1_000).currency("EUR");
    await expect(base.create()).rejects.toBeInstanceOf(BuPaymentError);
    await base.create();
    await base.interval("month").create();
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("keeps the generated key when only the signal or timeout changes", async () => {
    const { client, calls } = harnessReturning({}, {}, {}, {}, {}, {});
    const draft = client.catalogue.createProduct().name("Gold");
    const update = client.catalogue.updateProduct("prod_1").name("Gold");
    const archive = client.catalogue.archivePrice("price_1");
    await draft.create();
    await draft.signal(new AbortController().signal).create();
    await update.update();
    await update.timeoutMs(1_000).update();
    await archive.archive();
    await archive.signal(new AbortController().signal).archive();
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect([keys[1], keys[3], keys[5]]).toEqual([keys[0], keys[2], keys[4]]);
  });

  it("offers no terminal at runtime until the required input is set", () => {
    const { client } = harnessReturning();
    const price = client.catalogue.createPrice("prod_1") as Record<string, unknown>;
    const priced = client.catalogue.createPrice("prod_1").unitAmount(1).currency("EUR");
    expect("create" in client.catalogue.createProduct()).toBe(false);
    expect("update" in client.catalogue.updateProduct("prod_1").expectedUpdatedAt("x")).toBe(false);
    expect(
      ["create", "replace", "intervalCount", "transferLookupKey"].some((m) => m in price),
    ).toBe(false);
    expect("replace" in priced).toBe(false);
    expect("create" in priced.replacing("price_1")).toBe(false);
  });

  it("overwrites unconditionally when no version was observed", async () => {
    const { client, calls } = harnessReturning(product);
    await client.catalogue.updateProduct("prod_1").name("Gold").update();
    expect(callAt(calls, 0).body).toEqual({ name: "Gold" });
  });

  it("archives and reactivates products and prices", async () => {
    const { client, calls } = harnessReturning({}, {}, {}, {});
    await client.catalogue.archiveProduct("prod_1").expectedUpdatedAt(product.updatedAt).archive();
    await client.catalogue.reactivateProduct("prod_1").reactivate();
    await client.catalogue.archivePrice("price_1").archive();
    await client.catalogue
      .reactivatePrice("price_1")
      .expectedUpdatedAt(product.updatedAt)
      .idempotencyKey("reactivate-price_1")
      .reactivate();
    expect(calls.map((call) => `${call.method} ${pathOf(call)}`)).toEqual([
      "POST /v1/products/prod_1/archive",
      "POST /v1/products/prod_1/reactivate",
      "POST /v1/prices/price_1/archive",
      "POST /v1/prices/price_1/reactivate",
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      { expectedUpdatedAt: product.updatedAt },
      undefined,
      undefined,
      { expectedUpdatedAt: product.updatedAt },
    ]);
    expect(
      calls.slice(0, 3).every((call) => UUID.test(call.headers[Header.IDEMPOTENCY_KEY] ?? "")),
    ).toBe(true);
    expect(callAt(calls, 3).headers[Header.IDEMPOTENCY_KEY]).toBe("reactivate-price_1");
  });

  it("creates a recurring price that takes over a lookup key", async () => {
    const { client, calls } = harnessReturning({});
    await client.catalogue
      .createPrice("prod_1")
      .unitAmount(1_000)
      .currency("EUR")
      .description("Monthly")
      .interval("month")
      .intervalCount(3)
      .lookupKey("gold-monthly")
      .transferLookupKey()
      .create();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/products/prod_1/prices");
    expect(callAt(calls, 0).body).toEqual({
      unitAmount: 1_000,
      currency: "EUR",
      description: "Monthly",
      recurring: { interval: "month", intervalCount: 3 },
      lookupKey: "gold-monthly",
      transferLookupKey: true,
    });
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
  });

  it("rejects an empty identifier through the terminal without a request", async () => {
    const { client, calls } = harnessReturning();
    const update = client.catalogue.updateProduct("").name("Gold");
    await expect(update.update()).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    await expect(client.catalogue.archivePrice("").archive()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    expect(calls).toHaveLength(0);
  });

  it("carries the current product on a stale update", async () => {
    const { client } = harnessOf(() =>
      json({ error: "stale_resource", message: "stale", resource: product }, 409),
    );
    const error = await client.catalogue
      .updateProduct("prod_1")
      .name("Renamed")
      .expectedUpdatedAt("2026-01-01T00:00:00.000Z")
      .update()
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(BuPaymentError);
    const conflict = error as ProductConflict;
    expect(conflict.code).toBe(ErrorCode.STALE_RESOURCE);
    expect(conflict.resource).toEqual(product);
  });
});

describe("catalogue write scope", () => {
  it("refuses a catalogue write body that carries a scope key", async () => {
    const { client, calls } = harnessReturning(product);
    await expect(
      client.request({
        method: "POST",
        path: "/v1/products",
        body: { name: "Gold", workspaceId: "ws_1" },
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
      metadata: { field: "workspaceId" },
    });
    expect(calls).toHaveLength(0);
  });

  it("sends builder bodies carrying only the contract's fields", async () => {
    const { client, calls } = harnessReturning({}, {}, {});
    await client.catalogue.createProduct().name("environment").lookupKey("tenant").create();
    await client.catalogue
      .updateProduct("prod_1")
      .name("provider")
      .description("workspace")
      .lookupKey("app")
      .expectedUpdatedAt(product.updatedAt)
      .update();
    await client.catalogue
      .createPrice("prod_1")
      .unitAmount(1)
      .currency("EUR")
      .interval("month")
      .lookupKey("workspace")
      .transferLookupKey()
      .description("tenant")
      .create();
    const allowed = new Set([
      "name",
      "description",
      "lookupKey",
      "expectedUpdatedAt",
      "unitAmount",
      "currency",
      "recurring",
      "transferLookupKey",
    ]);
    for (const call of calls) {
      expect(Object.keys(call.body as object).filter((key) => !allowed.has(key))).toEqual([]);
    }
  });
});
