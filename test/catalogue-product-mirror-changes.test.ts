import { describe, expect, it } from "vitest";
import type { Price } from "../src/catalogue/types";
import { ErrorCode } from "../src/constants";
import type { Call } from "./support/harness";
import { routeOf } from "./support/price-replacement";
import { fakeMirrorCatalogue, keyOf, productOf, writesOf } from "./support/product-mirror";

type Client = ReturnType<typeof fakeMirrorCatalogue>["client"];

const mirror = (client: Client, name = "Gold") =>
  client.catalogue.productMirror("sku-1").name(name).idempotencyKey("mirror-sku-1");

const priced = (client: Client, name = "Gold") =>
  mirror(client, name).defaultUnitAmount(100).defaultCurrency("EUR");

const appPrice = (active: boolean) =>
  ({ id: "price_9", productId: "prod_1", unitAmount: 50, currency: "EUR", active }) as Price;

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

describe("product mirror default price", () => {
  it("renames after pricing, asserting the version the price left", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1", updatedAt: "v4" })],
    });
    const result = await priced(catalogue.client, "Platinum").ensure();
    expect(result).toMatchObject({ outcome: "found", changes: ["priced", "renamed"] });
    const writes = writesOf(catalogue.calls);
    expect(writes.map(routeOf)).toEqual([
      "POST /v1/products/prod_1/prices",
      "PATCH /v1/products/prod_1",
    ]);
    expect(writes[1]?.body).toEqual({ name: "Platinum", expectedUpdatedAt: "v1" });
  });

  it("adds no price to an archived product it was not asked to reactivate", async () => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1", active: false })],
    });
    const result = await priced(catalogue.client).ensure();
    expect(result.changes).toEqual([]);
    expect(catalogue.calls.some((call) => routeOf(call).includes("prices"))).toBe(false);
  });

  it.each([
    ["an active", true],
    ["an archived", false],
  ])("adds no price to a product holding %s price of the App", async (_case, active) => {
    const catalogue = fakeMirrorCatalogue({
      products: [productOf({ id: "prod_1" })],
      prices: [appPrice(active)],
    });
    const result = await priced(catalogue.client).ensure();
    expect(result.changes).toEqual([]);
    expect(writesOf(catalogue.calls)).toEqual([]);
  });
});
