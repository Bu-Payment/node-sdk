import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { callAt, harnessOf, harnessReturning, json, pathOf, queryOf } from "./support/harness";

describe("catalogue", () => {
  it("lists products with the filter on the wire", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.catalogue.products().active(false).limit(25).get();
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/products");
    expect(queryOf(callAt(calls, 0))).toBe("?active=false&limit=25");
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBeUndefined();
  });

  it("percent-encodes an identifier into the path", async () => {
    const { client, calls } = harnessReturning({ id: "prod/1" });
    await client.catalogue.product("prod/1").get();
    expect(callAt(calls, 0).url).toContain("/v1/products/prod%2F1");
  });

  it("walks every product page keeping the filter the cursor is bound to", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "prod_1" }], nextCursor: "cur_2" },
      { data: [{ id: "prod_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const product of client.catalogue.products().active(true).all()) {
      collected.push(product.id);
    }
    expect(collected).toEqual(["prod_1", "prod_2"]);
    expect(queryOf(callAt(calls, 0))).toBe("?active=true");
    expect(queryOf(callAt(calls, 1))).toBe("?active=true&cursor=cur_2");
  });

  it("refuses to walk on when the API repeats a cursor", async () => {
    const { client, calls } = harnessOf(() =>
      json({ data: [{ id: "prod_1" }], nextCursor: "cur" }),
    );
    const walk = async () => {
      for await (const product of client.catalogue.products().cursor("cur").all()) {
        expect(product.id).toBe("prod_1");
      }
    };
    await expect(walk()).rejects.toMatchObject({ code: ErrorCode.RESPONSE_INVALID });
    expect(calls).toHaveLength(1);
  });

  it("lists prices filtered by product and lookup key", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.catalogue.prices().productId("prod_1").lookupKey("gold").get();
    expect(pathOf(callAt(calls, 0))).toBe("/v1/prices");
    expect(queryOf(callAt(calls, 0))).toBe("?productId=prod_1&lookupKey=gold");
  });

  it("reads one price, the cross-sells and the entitlements", async () => {
    const { client, calls } = harnessReturning({}, { data: [], nextCursor: null }, {});
    await client.catalogue.price("price_1").get();
    await client.catalogue.crossSells("prod_1").limit(10).get();
    await client.catalogue.entitlements("prod_1").get();
    expect(calls.map((call) => pathOf(call))).toEqual([
      "/v1/prices/price_1",
      "/v1/products/prod_1/cross-sells",
      "/v1/products/prod_1/entitlements",
    ]);
  });
});
