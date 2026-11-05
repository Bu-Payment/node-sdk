import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import {
  callAt,
  harnessOf,
  harnessReturning,
  harnessStalling,
  json,
  pathOf,
  queryOf,
} from "./support/harness";

type Client = ReturnType<typeof harnessReturning>["client"];
type Collecting = { collect(): Promise<unknown[]> };

const notFoundCode = ErrorCode.RESOURCE_NOT_FOUND;

const twoPages = [
  { data: [{ id: "a" }], nextCursor: "cur_2", hasMore: true },
  { data: [{ id: "b" }], nextCursor: null, hasMore: false },
];

const paginatedLists: Record<string, (client: Client) => Collecting> = {
  products: (client) => client.catalogue.products(),
  prices: (client) => client.catalogue.prices(),
  crossSells: (client) => client.catalogue.crossSells("prod_1"),
  customers: (client) => client.customers.list(),
  payments: (client) => client.payments.list(),
  invoices: (client) => client.invoices.list(),
  subscriptions: (client) => client.subscriptions.list(),
  refunds: (client) => client.refunds.list(),
  events: (client) => client.events.list(),
  priceMigrations: (client) => client.priceMigrations.list(),
  shippingRates: (client) =>
    client.checkout.shippingRates().currency("EUR").destinationCountry("PT").product("prod_1"),
};

const records = {
  product: (client: Client) => client.catalogue.product("rec_1"),
  price: (client: Client) => client.catalogue.price("rec_1"),
};

describe("collect on every paginated list", () => {
  it.each(Object.keys(paginatedLists))("%s walks every page only once called", async (name) => {
    const { client, calls } = harnessReturning(...twoPages);
    const list = (paginatedLists[name] as (client: Client) => Collecting)(client);
    expect(calls).toHaveLength(0);
    expect(await list.collect()).toEqual([{ id: "a" }, { id: "b" }]);
    expect(calls).toHaveLength(2);
  });

  it("walks again from the start each time the same builder is collected", async () => {
    const { client, calls } = harnessReturning(...twoPages, {
      data: [{ id: "c" }],
      nextCursor: null,
    });
    const list = client.customers.list();
    expect(await list.collect()).toEqual([{ id: "a" }, { id: "b" }]);
    expect(await list.collect()).toEqual([{ id: "c" }]);
    expect(calls).toHaveLength(3);
  });

  it("leaves the builder it branched from untouched", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null },
      { data: [], nextCursor: null },
    );
    const base = client.customers.list();
    await base.limit(5).collect();
    await base.collect();
    expect(queryOf(callAt(calls, 0))).toBe("?limit=5");
    expect(queryOf(callAt(calls, 1))).toBe("");
  });

  it("starts from the cursor and keeps the limit the builder was given", async () => {
    const { client, calls } = harnessReturning(...twoPages);
    await client.customers.list().cursor("cur_1").limit(10).collect();
    expect(queryOf(callAt(calls, 0))).toContain("cursor=cur_1");
    expect(queryOf(callAt(calls, 0))).toContain("limit=10");
    expect(queryOf(callAt(calls, 1))).toContain("cursor=cur_2");
    expect(queryOf(callAt(calls, 1))).toContain("limit=10");
  });

  it("treats the limit as the page size, never the total", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "a" }], nextCursor: "cur_2" },
      { data: [{ id: "b" }], nextCursor: "cur_3" },
      { data: [{ id: "c" }], nextCursor: null },
    );
    const customers = await client.customers.list().limit(1).collect();
    expect(customers).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(calls).toHaveLength(3);
  });

  it("stops at the abort signal the builder was given", async () => {
    const { client, calls } = harnessStalling();
    const controller = new AbortController();
    controller.abort();
    await expect(client.customers.list().signal(controller.signal).collect()).rejects.toMatchObject(
      { code: ErrorCode.REQUEST_CANCELLED },
    );
    expect(calls).toHaveLength(1);
  });

  it("rejects with no partial array when a later page fails", async () => {
    let served = 0;
    const { client } = harnessOf(() => {
      served += 1;
      return served === 1
        ? json({ data: [{ id: "a" }], nextCursor: "cur_2" })
        : json({ error: "operation_failed" }, 503);
    });
    await expect(client.customers.list().collect()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
      status: 503,
    });
  });

  it("does not exist on shipping rates until the quote is complete", () => {
    const { client } = harnessReturning();
    const rates = client.checkout.shippingRates();
    expect("collect" in rates.currency("EUR").destinationCountry("PT")).toBe(false);
    expect("collect" in rates.destinationCountry("PT").product("prod_1")).toBe(false);
    expect("collect" in rates.currency("EUR").product("prod_1")).toBe(false);
  });
});

describe.each(Object.keys(records))("find on a catalogue %s", (name) => {
  const record = records[name as keyof typeof records];
  const pathPart = name === "product" ? "/products/rec_1" : "/prices/rec_1";

  it("reads its own path only once called", async () => {
    const { client, calls } = harnessReturning({ id: "rec_1" });
    const builder = record(client);
    expect(calls).toHaveLength(0);
    expect(await builder.find()).toEqual({ id: "rec_1" });
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toContain(pathPart);
  });

  it.each([
    ["an unavailable API", json({ error: "operation_failed" }, 503), "operation_failed", 503],
    [
      "refused credentials",
      json({ error: "application_auth_invalid" }, 401),
      "application_auth_invalid",
      401,
    ],
    [
      "a denied capability",
      json({ error: "application_capability_denied" }, 403),
      "application_capability_denied",
      403,
    ],
    [
      "a 404 page from a proxy",
      new Response("<html>nginx</html>", { status: 404 }),
      notFoundCode,
      404,
    ],
    ["an empty 404", new Response("", { status: 404 }), notFoundCode, 404],
    ["a JSON 404 with no error", json({ message: "no route" }, 404), notFoundCode, 404],
    ["a 404 whose error is not text", json({ error: 123 }, 404), notFoundCode, 404],
    [
      "an unmatched route on a framework",
      json({ statusCode: 404, message: "Cannot GET /x", error: "Not Found" }, 404),
      notFoundCode,
      404,
    ],
    ["a 404 with an unknown code", json({ error: "route_missing" }, 404), notFoundCode, 404],
    ["a 404 with an empty code", json({ error: "" }, 404), notFoundCode, 404],
  ])("throws on %s unchanged", async (_case, response, code, status) => {
    const { client, calls } = harnessOf(() => response.clone());
    const failure = await record(client)
      .find()
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BuPaymentError);
    expect(failure).toMatchObject({ code, status });
    expect(calls).toHaveLength(1);
  });

  it.each([404, 503])("marks a %i with no API code as read from the status", async (status) => {
    const { client } = harnessOf(() => new Response("<html>nginx</html>", { status }));
    await expect(record(client).get()).rejects.toMatchObject({
      status,
      metadata: { codeFromStatus: true },
    });
  });

  it("does not mark a failure the API named", async () => {
    const { client } = harnessOf(() => json({ error: "operation_failed" }, 503));
    const failure = await record(client)
      .get()
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ status: 503 });
    expect((failure as BuPaymentError).metadata).toBeUndefined();
  });

  it.each([
    "not_found",
    "resource_not_found",
  ])("resolves to null when the API answers %s", async (code) => {
    const { client } = harnessOf(() => json({ error: code }, 404));
    expect(await record(client).find()).toBeNull();
  });
});
