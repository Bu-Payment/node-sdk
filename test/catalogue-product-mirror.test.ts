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
    expect(requested(catalogue.calls)).toEqual([
      "GET /v1/products/prod_gone",
      "GET /v1/products?active=true&lookupKey=sku-1",
    ]);
  });

  it("finds an archived product and reactivates it under the version it read", async () => {
    const stored = productOf({ id: "prod_1", active: false, updatedAt: "v7" });
    const catalogue = fakeMirrorCatalogue({ products: [stored] });
    const result = await mirror(catalogue.client).active(true).ensure();
    expect(result.outcome).toBe("found");
    expect(result.changes).toEqual(["reactivated"]);
    expect(result.product).toMatchObject({ id: "prod_1", active: true });
    expect(requested(catalogue.calls)).toEqual([
      "GET /v1/products?active=true&lookupKey=sku-1",
      "GET /v1/products?active=false&lookupKey=sku-1",
      "POST /v1/products/prod_1/reactivate",
    ]);
    expect(catalogue.calls[2]?.body).toEqual({ expectedUpdatedAt: "v7" });
  });

  it("leaves an archived product archived when no state was asked for", async () => {
    const stored = productOf({ id: "prod_1", active: false });
    const catalogue = fakeMirrorCatalogue({ products: [stored] });
    const result = await mirror(catalogue.client).ensure();
    expect(result).toEqual({ product: stored, outcome: "found", changes: [] });
  });

  it("takes the holder of the lookup key when another writer created it first", async () => {
    const holder = productOf({ id: "prod_9" });
    const catalogue = fakeMirrorCatalogue({ products: [holder], unlisted: ["prod_9"] });
    const result = await mirror(catalogue.client).knownId("prod_gone").ensure();
    expect(result).toEqual({ product: holder, outcome: "recovered", changes: [] });
    expect(writesOf(catalogue.calls).map(routeOf)).toEqual(["POST /v1/products"]);
  });

  it("rejects a lookup key conflict that names no holder", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [{ ...productOf({ id: "prod_9" }), updatedAt: undefined as unknown as string }],
      unlisted: ["prod_9"],
    });
    await expect(mirror(catalogue.client).ensure()).rejects.toMatchObject({
      code: ErrorCode.LOOKUP_KEY_CONFLICT,
      resource: undefined,
    });
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
    expect(keyOf(creation as Call)).toBe("mirror-sku-1:create-product");
    expect(catalogue.prices).toHaveLength(0);
  });

  it("creates the default price and answers the product that now carries it", async () => {
    const catalogue = fakeMirrorCatalogue();
    const result = await mirror(catalogue.client)
      .defaultUnitAmount(100)
      .defaultCurrency("EUR")
      .ensure();
    expect(result.outcome).toBe("created");
    expect(result.changes).toEqual(["priced"]);
    expect(result.product).toMatchObject({ id: "prod_1", defaultPriceId: "price_1" });
    expect(requested(catalogue.calls)).toEqual([
      "GET /v1/products?active=true&lookupKey=sku-1",
      "GET /v1/products?active=false&lookupKey=sku-1",
      "POST /v1/products",
      "GET /v1/prices?productId=prod_1&limit=1",
      "POST /v1/products/prod_1/prices",
      "GET /v1/products/prod_1",
    ]);
    expect(catalogue.calls[4]?.body).toEqual({ unitAmount: 100, currency: "EUR" });
    expect(keyOf(catalogue.calls[4] as Call)).toMatch(/^mirror-sku-1:create-price:[\w-]{43}$/u);
  });

  it("creates the product active and archives it when it is mirrored archived", async () => {
    const catalogue = fakeMirrorCatalogue();
    const result = await mirror(catalogue.client).active(false).ensure();
    expect(result.outcome).toBe("created");
    expect(result.changes).toEqual(["archived"]);
    expect(result.product.active).toBe(false);
    expect(writesOf(catalogue.calls).map(routeOf)).toEqual([
      "POST /v1/products",
      "POST /v1/products/prod_1/archive",
    ]);
  });

  it("adds no price to a product that already holds one of the App's prices", async () => {
    const catalogue = fakeMirrorCatalogue({ products: [productOf({ id: "prod_1" })] });
    await mirror(catalogue.client).defaultUnitAmount(100).defaultCurrency("EUR").ensure();
    const priced = await mirror(catalogue.client)
      .defaultUnitAmount(100)
      .defaultCurrency("EUR")
      .ensure();
    expect(catalogue.prices).toHaveLength(1);
    expect(priced.changes).toEqual([]);
  });
});

describe("product mirror changing the product", () => {
  it("renames the product under the version it read", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1", updatedAt: "v4" })],
    });
    const result = await mirror(catalogue.client, "Platinum").knownId("prod_1").ensure();
    expect(result.changes).toEqual(["renamed"]);
    expect(result.product.name).toBe("Platinum");
    const [rename] = writesOf(catalogue.calls);
    expect(routeOf(rename as Call)).toBe("PATCH /v1/products/prod_1");
    expect(rename?.body).toEqual({ name: "Platinum", expectedUpdatedAt: "v4" });
    expect(keyOf(rename as Call)).toMatch(/^mirror-sku-1:rename:[\w-]{43}$/u);
  });

  it("archives the product asserting the version the rename left", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1", updatedAt: "v4" })],
    });
    const result = await mirror(catalogue.client, "Platinum").active(false).ensure();
    expect(result.changes).toEqual(["renamed", "archived"]);
    const [, archive] = writesOf(catalogue.calls);
    expect(routeOf(archive as Call)).toBe("POST /v1/products/prod_1/archive");
    expect(archive?.body).toEqual({ expectedUpdatedAt: "v1" });
    expect(result.product).toMatchObject({ name: "Platinum", active: false, updatedAt: "v2" });
  });

  it("archives an unchanged product asserting the version it read", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1", updatedAt: "v4" })],
    });
    const result = await mirror(catalogue.client).active(false).ensure();
    expect(result.changes).toEqual(["archived"]);
    expect(writesOf(catalogue.calls)[0]?.body).toEqual({ expectedUpdatedAt: "v4" });
  });

  it("rejects with the current product when another writer changed it after the read", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1", updatedAt: "v4" })],
      answered: (call) => {
        if (routeOf(call) === "GET /v1/products/prod_1") {
          catalogue.products.set("prod_1", productOf({ id: "prod_1", updatedAt: "v5" }));
        }
      },
    });
    await expect(
      mirror(catalogue.client, "Platinum").knownId("prod_1").ensure(),
    ).rejects.toMatchObject({ code: ErrorCode.STALE_RESOURCE, resource: { updatedAt: "v5" } });
  });
});
