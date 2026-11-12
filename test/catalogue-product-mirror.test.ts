import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import type { Call } from "./support/harness";
import { routeOf } from "./support/price-replacement";
import { fakeMirrorCatalogue, keyOf, productOf, writesOf } from "./support/product-mirror";

type Client = ReturnType<typeof fakeMirrorCatalogue>["client"];

const mirror = (client: Client, name = "Gold") =>
  client.catalogue.productMirror("sku-1").name(name).idempotencyKey("mirror-sku-1");

const requested = (calls: Call[]) =>
  calls.map((call) => `${routeOf(call)}${new URL(call.url).search}`);

const lookups = [
  "GET /v1/products?active=true&lookupKey=sku-1",
  "GET /v1/products?active=false&lookupKey=sku-1",
];

describe("product mirror locating the product", () => {
  it("answers the product read by its known id when nothing changed", async () => {
    const stored = productOf({ id: "prod_1" });
    const catalogue = fakeMirrorCatalogue({ products: [stored] });
    const result = await mirror(catalogue.client).knownId("prod_1").active(true).ensure();
    expect(result).toEqual({ product: stored, outcome: "found", changes: [] });
    expect(requested(catalogue.calls)).toEqual(["GET /v1/products/prod_1"]);
  });

  it("recovers the product by its lookup key when the known id is not found", async () => {
    const stored = productOf({ id: "prod_1" });
    const catalogue = fakeMirrorCatalogue({ products: [stored] });
    const result = await mirror(catalogue.client).knownId("prod_gone").ensure();
    expect(result).toEqual({ product: stored, outcome: "recovered", changes: [] });
    expect(requested(catalogue.calls)).toEqual(["GET /v1/products/prod_gone", lookups[0]]);
  });

  it("recovers by lookup key, leaving the other product alone, when the known id holds another key", async () => {
    const other = productOf({ id: "prod_2", lookupKey: "sku-2", name: "Silver" });
    const catalogue = fakeMirrorCatalogue({ products: [productOf({ id: "prod_1" }), other] });
    const result = await mirror(catalogue.client).knownId("prod_2").active(false).ensure();
    expect(result).toMatchObject({ outcome: "recovered", product: { id: "prod_1" } });
    expect(writesOf(catalogue.calls).map(routeOf)).toEqual(["POST /v1/products/prod_1/archive"]);
    expect(catalogue.products.get("prod_2")).toEqual(other);
  });

  it("rejects without a lookup or a write when the known id cannot be read", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1" })],
      refused: (call) => routeOf(call) === "GET /v1/products/prod_1",
    });
    await expect(mirror(catalogue.client).knownId("prod_1").ensure()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
    });
    expect(catalogue.calls).toHaveLength(1);
  });

  it("finds an archived product and reactivates it under the version it read", async () => {
    const stored = productOf({ id: "prod_1", active: false, updatedAt: "v7" });
    const catalogue = fakeMirrorCatalogue({ products: [stored] });
    const result = await mirror(catalogue.client).active(true).ensure();
    expect(result.outcome).toBe("found");
    expect(result.changes).toEqual(["reactivated"]);
    expect(result.product).toMatchObject({ id: "prod_1", active: true });
    expect(requested(catalogue.calls)).toEqual([...lookups, "POST /v1/products/prod_1/reactivate"]);
    expect(catalogue.calls[2]?.body).toEqual({ expectedUpdatedAt: "v7" });
  });

  it("leaves an archived product archived when no state was asked for", async () => {
    const stored = productOf({ id: "prod_1", active: false });
    const catalogue = fakeMirrorCatalogue({ products: [stored] });
    const result = await mirror(catalogue.client).ensure();
    expect(result).toEqual({ product: stored, outcome: "found", changes: [] });
  });
});

describe("product mirror meeting another holder of the lookup key", () => {
  const holder = productOf({ id: "prod_9" });

  it.each([
    ["found", undefined],
    ["recovered", "prod_gone"],
  ])("takes the holder as %s when another writer created it first", async (outcome, knownId) => {
    const catalogue = fakeMirrorCatalogue({ products: [holder], unlisted: ["prod_9"] });
    const base = mirror(catalogue.client);
    const result = await (knownId === undefined ? base : base.knownId(knownId)).ensure();
    expect(result).toEqual({ product: holder, outcome, changes: [] });
    expect(writesOf(catalogue.calls).map(routeOf)).toEqual(["POST /v1/products"]);
  });

  it.each([
    ["carries no holder", null],
    ["names a holder of another lookup key", productOf({ id: "prod_9", lookupKey: "sku-9" })],
  ])("rejects a lookup key conflict that %s", async (_case, conflictResource) => {
    const catalogue = fakeMirrorCatalogue({ conflictResource });
    await expect(mirror(catalogue.client, "Platinum").ensure()).rejects.toMatchObject({
      code: ErrorCode.LOOKUP_KEY_CONFLICT,
    });
    expect(writesOf(catalogue.calls).map(routeOf)).toEqual(["POST /v1/products"]);
  });
});

describe("product mirror creating the product", () => {
  it("creates the product with its lookup key and no price", async () => {
    const catalogue = fakeMirrorCatalogue();
    const result = await mirror(catalogue.client).ensure();
    expect(result).toEqual({
      product: productOf({ id: "prod_1", createdAt: "v1", updatedAt: "v1" }),
      outcome: "created",
      changes: [],
    });
    const [creation] = writesOf(catalogue.calls);
    expect(creation?.body).toEqual({ name: "Gold", lookupKey: "sku-1" });
    expect(keyOf(creation as Call)).toMatch(/^mirror-sku-1:create-product:[\w-]{43}$/u);
    expect(catalogue.prices).toHaveLength(0);
  });

  it("creates the default price and answers the product as it was read again", async () => {
    const catalogue = fakeMirrorCatalogue();
    const result = await mirror(catalogue.client)
      .defaultUnitAmount(100)
      .defaultCurrency("EUR")
      .ensure();
    expect(result.outcome).toBe("created");
    expect(result.changes).toEqual(["priced"]);
    expect(result.product).toMatchObject({ defaultPriceId: "price_1", updatedAt: "v2" });
    expect(requested(catalogue.calls)).toEqual([
      ...lookups,
      "POST /v1/products",
      "GET /v1/prices?productId=prod_1&active=true&limit=1",
      "GET /v1/prices?productId=prod_1&active=false&limit=1",
      "POST /v1/products/prod_1/prices",
      "GET /v1/products/prod_1",
    ]);
    expect(catalogue.calls[5]?.body).toEqual({ unitAmount: 100, currency: "EUR" });
    expect(keyOf(catalogue.calls[5] as Call)).toMatch(/^mirror-sku-1:create-price:[\w-]{43}$/u);
  });

  it("prices the product before archiving it under the version the price left", async () => {
    const catalogue = fakeMirrorCatalogue();
    const result = await mirror(catalogue.client)
      .active(false)
      .defaultUnitAmount(100)
      .defaultCurrency("EUR")
      .ensure();
    expect(result).toMatchObject({ outcome: "created", changes: ["priced", "archived"] });
    expect(result.product).toMatchObject({ active: false, defaultPriceId: "price_1" });
    const writes = writesOf(catalogue.calls);
    expect(writes.map(routeOf)).toEqual([
      "POST /v1/products",
      "POST /v1/products/prod_1/prices",
      "POST /v1/products/prod_1/archive",
    ]);
    expect(writes[2]?.body).toEqual({ expectedUpdatedAt: "v2" });
  });
});
