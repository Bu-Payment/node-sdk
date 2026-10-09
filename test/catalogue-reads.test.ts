import { describe, expect, it } from "vitest";
import { priceTerms, sameTerms } from "../src/catalogue/price-terms";
import type { Price } from "../src/catalogue/types";
import { ErrorCode } from "../src/constants";
import { isStale } from "../src/core/freshness";
import * as sdk from "../src/index";
import { callAt, harnessOf, harnessReturning, json, queryOf } from "./support/harness";

const monthly: Price = {
  id: "price_1",
  productId: "prod_1",
  unitAmount: 1_900,
  currency: "EUR",
  type: "recurring",
  recurring: { interval: "month", intervalCount: 1 },
  description: null,
  lookupKey: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const once: Price = { ...monthly, id: "price_2", type: "one_time", recurring: null };

describe("collect", () => {
  it("reads every page into one array, keeping the filter the cursor is bound to", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "prod_1" }], nextCursor: "cur_2" },
      { data: [{ id: "prod_2" }], nextCursor: null },
    );
    const products = await client.catalogue.products().active(false).collect();
    expect(products.map((product) => product.id)).toEqual(["prod_1", "prod_2"]);
    expect(queryOf(callAt(calls, 0))).toBe("?active=false");
    expect(queryOf(callAt(calls, 1))).toBe("?active=false&cursor=cur_2");
  });

  it("resolves an empty list to an empty array", async () => {
    const { client } = harnessReturning({ data: [], nextCursor: null });
    expect(await client.catalogue.prices().collect()).toEqual([]);
  });

  it("rejects with the walk's own refusal and returns no partial array", async () => {
    const { client } = harnessOf(() => json({ data: [{ id: "prod_1" }], nextCursor: "cur" }));
    await expect(client.catalogue.products().cursor("cur").collect()).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });

  it("issues no request until it is called", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    const query = client.customers.list().limit(10);
    expect(calls).toHaveLength(0);
    await query.collect();
    expect(calls).toHaveLength(1);
  });

  it("reads the shipping rates once the quote is complete", async () => {
    const { client } = harnessReturning({ data: [{ id: "rate_1" }], nextCursor: null });
    const rates = await client.checkout
      .shippingRates()
      .currency("EUR")
      .destinationCountry("PT")
      .product("prod_1")
      .collect();
    expect(rates).toEqual([{ id: "rate_1" }]);
  });
});

describe("find", () => {
  it("resolves to the product, archived or not", async () => {
    const archived = { id: "prod_1", active: false };
    const { client } = harnessReturning(archived);
    expect(await client.catalogue.product("prod_1").find()).toEqual(archived);
  });

  it("resolves to null when the product is unknown to the App", async () => {
    const { client } = harnessOf(() => json({ error: "not_found", message: "missing" }, 404));
    expect(await client.catalogue.product("prod_1").find()).toBeNull();
  });

  it("resolves to null when the price is unknown to the App", async () => {
    const { client, calls } = harnessOf(() => json({ error: "not_found" }, 404));
    expect(await client.catalogue.price("price_1").find()).toBeNull();
    expect(callAt(calls, 0).method).toBe("GET");
  });

  it("throws any other failure unchanged", async () => {
    const { client } = harnessOf(() => json({ error: "operation_failed" }, 503));
    await expect(client.catalogue.price("price_1").find()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
      status: 503,
    });
  });
});

describe("isStale", () => {
  it.each([
    ["an older stamp", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z", true],
    ["an unparsable stamp", "yesterday", "2026-01-02T00:00:00.000Z", true],
    ["the same stamp", "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z", false],
    ["a newer stamp", "2026-01-03T00:00:00.000Z", "2026-01-02T00:00:00.000Z", false],
    ["a newer stamp over an unparsable one", "2026-01-03T00:00:00.000Z", "never", false],
  ])("answers %s", (_label, candidate, stored, stale) => {
    expect(isStale(candidate, stored)).toBe(stale);
  });

  it("reads updatedAt from a resource", () => {
    expect(isStale(monthly, { updatedAt: "2026-01-03T00:00:00.000Z" })).toBe(true);
    expect(isStale({ updatedAt: "2026-01-03T00:00:00.000Z" }, monthly)).toBe(false);
  });

  it("compares instants rather than text across offsets", () => {
    expect(isStale("2026-01-02T01:00:00+02:00", "2026-01-01T23:30:00.000Z")).toBe(true);
  });
});

describe("priceTerms", () => {
  it("names the currency, type and recurrence of a price", () => {
    expect(priceTerms(monthly)).toEqual({
      currency: "EUR",
      type: "recurring",
      interval: "month",
      intervalCount: 1,
    });
    expect(priceTerms(once)).toEqual({
      currency: "EUR",
      type: "one_time",
      interval: null,
      intervalCount: null,
    });
  });

  it("answers a frozen value", () => {
    expect(Object.isFrozen(priceTerms(monthly))).toBe(true);
  });
});

describe("sameTerms", () => {
  it("is true for prices that differ only in amount and identity", () => {
    const repriced: Price = { ...monthly, id: "price_9", unitAmount: 2_900 };
    expect(sameTerms(monthly, repriced)).toBe(true);
  });

  it.each([
    ["the currency", { ...monthly, currency: "USD" }],
    ["the type", once],
    ["the interval", { ...monthly, recurring: { interval: "year", intervalCount: 1 } }],
    ["the interval count", { ...monthly, recurring: { interval: "month", intervalCount: 3 } }],
  ] as [string, Price][])("is false when %s differs", (_label, other) => {
    expect(sameTerms(monthly, other)).toBe(false);
  });

  it("compares stored terms with a price", () => {
    expect(sameTerms(priceTerms(monthly), monthly)).toBe(true);
  });
});

describe("the package entry point", () => {
  it("exports the catalogue read helpers", () => {
    expect(sdk.isStale).toBe(isStale);
    expect(sdk.priceTerms).toBe(priceTerms);
    expect(sdk.sameTerms).toBe(sameTerms);
  });
});
