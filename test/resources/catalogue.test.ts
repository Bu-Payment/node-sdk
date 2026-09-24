import { describe, expect, it } from "vitest";
import { harnessOf, harnessReturning, json, pathOf, queryOf } from "./harness";

describe("catalogue resources", () => {
  it("lists products with the active filter on the wire", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.products.list({ limit: 25, active: false });
    expect(pathOf(calls[0] as never)).toBe("/v1/products");
    expect(queryOf(calls[0] as never)).toBe("?limit=25&active=false");
  });

  it("percent-encodes a product identifier into the path", async () => {
    const { client, calls } = harnessReturning({ id: "prod/1" });
    await client.products.get("prod/1");
    expect(calls[0]?.url).toContain("/v1/products/prod%2F1");
  });

  it("walks every product page carrying the original filter", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "prod_1" }], nextCursor: "cur_2" },
      { data: [{ id: "prod_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const product of client.products.listAll({ active: true })) {
      collected.push(product.id);
    }
    expect(collected).toEqual(["prod_1", "prod_2"]);
    expect(queryOf(calls[0] as never)).toBe("?active=true");
    expect(queryOf(calls[1] as never)).toBe("?active=true&cursor=cur_2");
  });

  it("stops when the API repeats the cursor it was given", async () => {
    const { client, calls } = harnessOf(() =>
      json({ data: [{ id: "prod_1" }], nextCursor: "cur" }),
    );
    const collected: string[] = [];
    for await (const product of client.products.listAll({ cursor: "cur" })) {
      collected.push(product.id);
    }
    expect(collected).toEqual(["prod_1"]);
    expect(calls).toHaveLength(1);
  });

  it("reads cross-sells and entitlements under the product", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null },
      { productId: "prod_1", entitlements: [] },
    );
    await client.products.listCrossSells("prod_1", { limit: 10 });
    await client.products.entitlements("prod_1");
    expect(pathOf(calls[0] as never)).toBe("/v1/products/prod_1/cross-sells");
    expect(pathOf(calls[1] as never)).toBe("/v1/products/prod_1/entitlements");
  });

  it("walks every cross-sell page for one product", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "cs_1" }], nextCursor: "cur_2" },
      { data: [{ id: "cs_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const crossSell of client.products.listAllCrossSells("prod_1")) {
      collected.push(crossSell.id);
    }
    expect(collected).toEqual(["cs_1", "cs_2"]);
    expect(queryOf(calls[1] as never)).toBe("?cursor=cur_2");
  });

  it("lists and reads prices", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null }, { id: "price_1" });
    await client.prices.list({ productId: "prod_1", lookupKey: "gold" });
    await client.prices.get("price_1");
    expect(queryOf(calls[0] as never)).toBe("?productId=prod_1&lookupKey=gold");
    expect(pathOf(calls[1] as never)).toBe("/v1/prices/price_1");
  });

  it("walks every price page", async () => {
    const { client } = harnessReturning(
      { data: [{ id: "price_1" }], nextCursor: "cur_2" },
      { data: [{ id: "price_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const price of client.prices.listAll()) {
      collected.push(price.id);
    }
    expect(collected).toEqual(["price_1", "price_2"]);
  });

  it("leaves catalogue reads without an idempotency key", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.products.list();
    expect(calls[0]?.headers["Idempotency-Key"]).toBeUndefined();
  });
});
