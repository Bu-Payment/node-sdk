import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import type { Call } from "./support/harness";
import { routeOf } from "./support/price-replacement";
import { fakeMirrorCatalogue, keyOf, productOf, writesOf } from "./support/product-mirror";

type Client = ReturnType<typeof fakeMirrorCatalogue>["client"];

const priced = (client: Client, idempotencyKey = "mirror-sku-1") =>
  client.catalogue
    .productMirror("sku-1")
    .name("Gold")
    .defaultUnitAmount(100)
    .defaultCurrency("EUR")
    .idempotencyKey(idempotencyKey);

const firstOf = (route: string) => {
  let seen = false;
  return (call: Call) => {
    if (seen || routeOf(call) !== route) {
      return false;
    }
    seen = true;
    return true;
  };
};

const writeKeys = (calls: Call[], route: string) =>
  writesOf(calls)
    .filter((call) => routeOf(call) === route)
    .map(keyOf);

describe("product mirror retried after a failure midway", () => {
  it("creates the missing price under the same key after the price request failed", async () => {
    const catalogue = fakeMirrorCatalogue({
      refused: firstOf("POST /v1/products/prod_1/prices"),
    });
    await expect(priced(catalogue.client).ensure()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
    });
    const result = await priced(catalogue.client).ensure();
    expect(result.outcome).toBe("found");
    expect(result.changes).toEqual(["priced"]);
    expect(catalogue.products.size).toBe(1);
    expect(catalogue.prices).toHaveLength(1);
    const [first, retried] = writeKeys(catalogue.calls, "POST /v1/products/prod_1/prices");
    expect(retried).toBe(first);
  });

  it("creates no second price when the price was stored but its answer was lost", async () => {
    const catalogue = fakeMirrorCatalogue({
      lostResponse: firstOf("POST /v1/products/prod_1/prices"),
    });
    const mirroring = priced(catalogue.client);
    await expect(mirroring.ensure()).rejects.toMatchObject({ code: ErrorCode.OPERATION_FAILED });
    const result = await mirroring.ensure();
    expect(result).toMatchObject({ outcome: "found", changes: [] });
    expect(result.product.defaultPriceId).toBe("price_1");
    expect(catalogue.prices).toHaveLength(1);
  });

  it("finds the product it created when the creation's answer was lost", async () => {
    const catalogue = fakeMirrorCatalogue({ lostResponse: firstOf("POST /v1/products") });
    await expect(priced(catalogue.client).ensure()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
    });
    const result = await priced(catalogue.client).ensure();
    expect(result).toMatchObject({ outcome: "found", changes: ["priced"] });
    expect(catalogue.products.size).toBe(1);
    expect(writeKeys(catalogue.calls, "POST /v1/products")).toEqual([
      "mirror-sku-1:create-product",
    ]);
  });

  it("replays the creation under the same key when the lookup cannot see it yet", async () => {
    const catalogue = fakeMirrorCatalogue({
      lostResponse: firstOf("POST /v1/products"),
      unlisted: ["prod_1"],
    });
    await expect(priced(catalogue.client).ensure()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
    });
    const result = await priced(catalogue.client).ensure();
    expect(result).toMatchObject({ outcome: "created", changes: ["priced"] });
    expect(catalogue.products.size).toBe(1);
    expect(writeKeys(catalogue.calls, "POST /v1/products")).toEqual([
      "mirror-sku-1:create-product",
      "mirror-sku-1:create-product",
    ]);
  });
});

describe("product mirror keys across syncs", () => {
  const rename = (client: Client, name: string) =>
    client.catalogue
      .productMirror("sku-1")
      .knownId("prod_1")
      .name(name)
      .idempotencyKey("mirror-sku-1")
      .ensure();

  it("renames again under a new key once the product moved on", async () => {
    const catalogue = fakeMirrorCatalogue({ products: [productOf({ id: "prod_1" })] });
    await rename(catalogue.client, "Platinum");
    await rename(catalogue.client, "Gold");
    const result = await rename(catalogue.client, "Platinum");
    expect(result.changes).toEqual(["renamed"]);
    const keys = writeKeys(catalogue.calls, "PATCH /v1/products/prod_1");
    expect(new Set(keys).size).toBe(3);
  });

  it("archives and reactivates again under new keys once the product moved on", async () => {
    const catalogue = fakeMirrorCatalogue({ products: [productOf({ id: "prod_1" })] });
    const state = (active: boolean) =>
      catalogue.client.catalogue
        .productMirror("sku-1")
        .knownId("prod_1")
        .name("Gold")
        .active(active)
        .idempotencyKey("mirror-sku-1")
        .ensure();
    for (const active of [false, true, false, true]) {
      expect((await state(active)).product.active).toBe(active);
    }
    const keys = writesOf(catalogue.calls).map(keyOf);
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toMatch(/^mirror-sku-1:archive:[\w-]{43}$/u);
    expect(keys[1]).toMatch(/^mirror-sku-1:reactivate:[\w-]{43}$/u);
  });

  it("keeps every derived key within the header limit for a long base key", async () => {
    const catalogue = fakeMirrorCatalogue();
    const base = "m".repeat(255);
    await priced(catalogue.client, base).ensure();
    const keys = writesOf(catalogue.calls).map((call) => keyOf(call) ?? "");
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect([...key].length).toBeLessThanOrEqual(255);
      expect(key).toMatch(/^[\w-]{43}:create-(product|price)/u);
    }
  });
});
