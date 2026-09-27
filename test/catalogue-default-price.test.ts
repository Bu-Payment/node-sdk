import { describe, expect, it } from "vitest";
import type { Product, ProductConflict } from "../src/catalogue/types";
import { ErrorCode } from "../src/constants";
import machineProduct from "./fixtures/machine-product.json";
import { harnessOf, harnessReturning, json } from "./support/harness";

const product: Product = machineProduct;
const withoutDefault: Product = { ...machineProduct, defaultPriceId: null };

describe("default price on catalogue products", () => {
  it("reads the default price from a product page", async () => {
    const { client } = harnessReturning({ data: [product, withoutDefault], nextCursor: null });
    const page = await client.catalogue.products().get();
    expect(page.data.map((listed) => listed.defaultPriceId)).toEqual([
      "5f1e0000-0000-4000-8000-000000000002",
      null,
    ]);
  });

  it("reads the default price while walking every product", async () => {
    const { client } = harnessReturning({ data: [product], nextCursor: null });
    const collected: Array<string | null> = [];
    for await (const listed of client.catalogue.products().all()) {
      collected.push(listed.defaultPriceId);
    }
    expect(collected).toEqual(["5f1e0000-0000-4000-8000-000000000002"]);
  });

  it("reads the default price from a single product", async () => {
    const { client } = harnessReturning(withoutDefault);
    const read = await client.catalogue.product(product.id).get();
    expect(read).toEqual(withoutDefault);
    expect(read.defaultPriceId).toBeNull();
  });

  it("reads the default price from a product write", async () => {
    const { client } = harnessReturning(product, product, product);
    const created = await client.catalogue.createProduct().name("Gold").create();
    const updated = await client.catalogue.updateProduct(product.id).name("Gold").update();
    const archived = await client.catalogue.archiveProduct(product.id).archive();
    expect([created, updated, archived].map((written) => written.defaultPriceId)).toEqual([
      product.defaultPriceId,
      product.defaultPriceId,
      product.defaultPriceId,
    ]);
  });

  it("reads the default price from the product a stale write carries", async () => {
    const { client } = harnessOf(() =>
      json({ error: "stale_resource", message: "stale", resource: product }, 409),
    );
    const failure = await client.catalogue
      .updateProduct(product.id)
      .name("Renamed")
      .expectedUpdatedAt("2026-09-01T10:00:00.000Z")
      .update()
      .then(
        () => undefined,
        (error: unknown) => error as ProductConflict,
      );
    expect(failure?.code).toBe(ErrorCode.STALE_RESOURCE);
    expect(failure?.resource?.defaultPriceId).toBe(product.defaultPriceId);
  });
});
